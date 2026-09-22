"""
X-CEED AI Core — LangGraph pipelines (port 8000).
Models: Jev (TypeSafe decisions) + DeepSeek (text/JSON).
"""
from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime, timedelta
from typing import Any, Optional, TypedDict
from urllib.parse import quote_plus

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from pydantic import BaseModel, Field
from pymongo import MongoClient
from typesafe_sdk import Choice, Noul, Score, TypeSafeClient

# ---------------------------------------------------------------------------
# Env
# ---------------------------------------------------------------------------
_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
load_dotenv(os.path.join(_ROOT, ".env.local"))
load_dotenv()

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
TYPESAFE_API_KEY = os.getenv("TYPESAFE_API_KEY", "")
MONGODB_URI = os.getenv("MONGODB_URI", "")
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3002")
TYPESAFE_URL = os.getenv("TYPESAFE_BASE_URL", "https://api.typesafe.ai/v1/systemone")
CACHE_TTL = timedelta(hours=24)

# ---------------------------------------------------------------------------
# Clients
# ---------------------------------------------------------------------------
deepseek = ChatOpenAI(
    model="deepseek-chat",
    base_url="https://api.deepseek.com",
    api_key=DEEPSEEK_API_KEY or "missing",
    temperature=0.1,
)

deepseek_json = ChatOpenAI(
    model="deepseek-chat",
    base_url="https://api.deepseek.com",
    api_key=DEEPSEEK_API_KEY or "missing",
    temperature=0.1,
    model_kwargs={"response_format": {"type": "json_object"}},
)

jev_client = TypeSafeClient(api_key=TYPESAFE_API_KEY) if TYPESAFE_API_KEY else None


def _jev_answers(resp) -> dict:
    return getattr(resp, "answers", None) or {}


def _jev_score(ans) -> Any:
    if ans is None:
        return 0
    if hasattr(ans, "score"):
        return ans.score
    if hasattr(ans, "choice"):
        return ans.choice
    if hasattr(ans, "noul"):
        return ans.noul
    if isinstance(ans, dict):
        return ans.get("score", ans.get("choice", ans.get("noul", 0)))
    return ans


def _jev_prob(ans) -> float:
    if ans is None:
        return 0.5
    if hasattr(ans, "noul"):
        return float(ans.noul)
    if hasattr(ans, "confidence"):
        return float(ans.confidence)
    if isinstance(ans, dict):
        return float(ans.get("noul", ans.get("probability", ans.get("confidence", 0.5))))
    try:
        return float(ans)
    except Exception:
        return 0.5


_mongo = None


def get_db():
    global _mongo
    if not MONGODB_URI:
        return None
    if _mongo is None:
        _mongo = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=8000)
    return _mongo.get_default_database() if "/" in MONGODB_URI else _mongo["x-ceed-db"]


def cache_collection():
    db = get_db()
    return db["ai_cache"] if db is not None else None


def cached_invoke(graph, inputs: dict, cache_prefix: str):
    col = cache_collection()
    cache_key = cache_prefix + ":" + hashlib.sha256(
        json.dumps(inputs, sort_keys=True, default=str).encode()
    ).hexdigest()
    if col is not None:
        cached = col.find_one({"_id": cache_key})
        if cached and cached.get("expires_at", datetime.min) > datetime.utcnow():
            return cached["result"]
    result = graph.invoke(inputs)
    # LangGraph may return non-JSON-serializable; normalize
    serializable = json.loads(json.dumps(result, default=str))
    if col is not None:
        col.update_one(
            {"_id": cache_key},
            {"$set": {
                "result": serializable,
                "created_at": datetime.utcnow(),
                "expires_at": datetime.utcnow() + CACHE_TTL,
            }},
            upsert=True,
        )
    return serializable


# ---------------------------------------------------------------------------
# Text helpers (Section 3 Layer 4)
# ---------------------------------------------------------------------------
def clean_resume_text(text: str) -> str:
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"Page \d+ of \d+", "", text)
    text = re.sub(r"^\s*[-–—]{3,}\s*$", "", text, flags=re.MULTILINE)
    return text.strip()


def extract_requirements_section(jd_text: str) -> str:
    patterns = [
        r"(?i)(requirements|qualifications|what you.?ll need|must have|skills).*?(?=\n\n(?:benefits|salary|about|equal|eeo)|$)",
    ]
    for pattern in patterns:
        match = re.search(pattern, jd_text, re.DOTALL)
        if match:
            return match.group(0).strip()
    return jd_text


def regex_fallback_extraction(text: str) -> dict:
    skills = sorted(set(re.findall(
        r"\b(Python|JavaScript|TypeScript|React|Node\.?js|AWS|Docker|Kubernetes|SQL|MongoDB|Java|Go|Rust|C\+\+)\b",
        text,
        re.I,
    )))
    return {
        "skills": [{"name": s, "level": "intermediate", "evidence": s} for s in skills],
        "experience": [],
        "education": [],
        "projects": [],
        "communication_profile": {"writing_quality": 3, "detail_level": "moderate", "clarity": 3},
    }


def _parse_json_content(content: str) -> dict:
    content = content.strip()
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*", "", content)
        content = re.sub(r"\s*```$", "", content)
    return json.loads(content)


SKILL_CRITERIA = [
    "Not mentioned anywhere in the resume",
    "Mentioned but no evidence of depth",
    "Some relevant experience shown",
    "Strong demonstrated experience",
    "Led or architected work in this area",
]

GAP_CRITERIA = {
    "missing": "requirement not present",
    "weak": "shallow or limited evidence",
    "under-evidenced": "mentioned without proof",
    "sufficient": "clear demonstrated evidence",
}

PRIORITY_CRITERIA = ["ignore", "low", "medium", "high", "critical"]


def _require_jev():
    if jev_client is None:
        raise RuntimeError("TYPESAFE_API_KEY missing")


# ---------------------------------------------------------------------------
# State schemas (Section 4.1)
# ---------------------------------------------------------------------------
class ResumeState(TypedDict, total=False):
    raw_text: str
    cleaned_text: str
    sections: dict
    skills: list
    experience: list
    education: list
    projects: list
    communication_profile: dict
    skill_levels: dict
    entities: dict
    errors: list
    retry_count: int


class MatchState(TypedDict, total=False):
    candidate_profile: dict
    job_requirements: dict
    weights: dict
    requirement_scores: dict
    semantic_comparison: str
    evidence: list
    explanation: str
    overall_score: float
    component_scores: dict
    confidence: float
    errors: list
    retry_count: int


class GapState(TypedDict, total=False):
    match_result: dict
    gaps: list
    prioritized_gaps: list
    errors: list


class CareerState(TypedDict, total=False):
    gaps: list
    target_role: str
    objectives: list
    study_plan: dict
    projects: list
    resources: list
    youtube_raw: list
    gap_videos: list
    modules: list
    errors: list
    retry_count: int


# ---------------------------------------------------------------------------
# Stable system prompts (DeepSeek cache)
# ---------------------------------------------------------------------------
RESUME_EXTRACTION_SYSTEM = """You are X-CEED's resume analysis engine.
Extract structured entities from the candidate resume below.
Return a JSON object with exactly these keys:

- skills: array of {name: string, level: "beginner"|"intermediate"|"advanced"|"expert", evidence: string}
- experience: array of {title: string, company: string, duration_months: int, description: string, technologies: string[]}
- education: array of {degree: string, institution: string, year: int, field: string}
- projects: array of {name: string, description: string, technologies: string[], impact: string}
- communication_profile: {writing_quality: 1-5, detail_level: "sparse"|"moderate"|"detailed", clarity: 1-5}

Rules:
- Only extract what is explicitly stated in the resume text.
- evidence must quote or closely paraphrase the resume text that supports the skill claim.
- If a field cannot be determined, use null.
- Return valid JSON only. No markdown fences. No explanatory text."""

SEMANTIC_COMPARE_SYSTEM = """You are X-CEED's semantic matching engine.
Compare the candidate profile against job requirements.
Return JSON: {comparison: string, aligned: string[], misaligned: string[], notes: string}.
Valid JSON only."""

EVIDENCE_SYSTEM = """You are X-CEED's evidence extractor.
Given candidate profile and job requirements, return JSON:
{evidence: [{requirement: string, resume_excerpt: string, strength: "weak"|"moderate"|"strong"}]}.

Rules:
- resume_excerpt MUST be a verbatim or near-verbatim quote from the resume/profile evidence fields — never invent quotes.
- If the candidate has NO evidence for a requirement, OMIT that requirement from the evidence array entirely (do not write "No mention of X").
- strength reflects how strongly the quote supports the requirement.
Valid JSON only."""

EXPLANATION_SYSTEM = """You are X-CEED's match explainer.
Write a clear, honest recruiter-facing explanation of fit.
Return JSON: {explanation: string, summary: string}.

Rules:
- Cite specific resume facts (companies, projects, years, technologies).
- If overall_score is below 35 OR most requirements are misaligned, state clearly that this is a poor fit / does not align — do NOT invent "transferable skills" spin for unrelated domains (e.g. mechanical engineering for a software role).
- Name concrete gaps and what would need to change for a better match.
- Valid JSON only. No markdown fences."""

OBJECTIVES_SYSTEM = """You are X-CEED's career coach.
From skill gaps, create learning objectives.
Return JSON: {objectives: [{objective: string, related_gaps: string[], timeline: string}]}.
Valid JSON only."""

STUDY_PLAN_SYSTEM = """You are X-CEED's study plan generator.
Create a phased study plan for the target role from objectives/gaps.
Return JSON: {phases: [{name: string, duration: string, topics: string[], milestones: string[]}]}.
Valid JSON only."""

PROJECTS_SYSTEM = """You are X-CEED's project recommender.
Suggest portfolio projects that address weak areas.
Return JSON: {projects: [{name: string, description: string, technologies: string[], addresses_gaps: string[]}]}.
Valid JSON only."""

MODULE_SEQUENCE_SYSTEM = """You are X-CEED's course sequencer.
Given a skill gap and a list of YouTube videos (title, url, channel), order them into a logical learning progression:
intro → concept → practice → project.
Return JSON only:
{videos: [{title, url, channel, order: int, description: string}]}.
description must be 1-2 sentences explaining what the learner will gain.
Keep only videos from the input list — do not invent URLs.
Order 1..N. Prefer 3-5 videos.
Valid JSON only."""


GAP_QUERY_TEMPLATES = {
    "missing": [
        "beginner tutorial {skill}",
        "{skill} crash course",
        "{skill} for beginners",
    ],
    "weak": [
        "{skill} advanced techniques",
        "{skill} best practices",
        "{skill} project tutorial",
    ],
    "under-evidenced": [
        "{skill} portfolio project",
        "build {skill} project",
        "{skill} hands-on tutorial",
    ],
}


def _normalize_gap_class(raw: str) -> str:
    s = (raw or "").lower().strip().replace(" ", "_").replace("-", "_")
    if "under" in s or "evidence" in s:
        return "under-evidenced"
    if "weak" in s or s in ("partial", "low"):
        return "weak"
    if "miss" in s or s in ("absent", "none", "skill_gap", ""):
        return "missing"
    return "missing"


class YouTubeQuotaExhausted(Exception):
    """YouTube Data API search.list quota / rate limit (HTTP 429)."""


# Related skill families → one search covers the group (quota saver)
_YT_SKILL_FAMILIES: list[dict] = [
    {"keys": ("node", "nodejs", "express", "nestjs", "fastify"), "label": "Node.js Express", "query": "Node.js Express tutorial"},
    {"keys": ("react", "next", "nextjs", "hooks", "jsx"), "label": "React Next.js", "query": "React Next.js tutorial"},
    {"keys": ("typescript", "javascript"), "label": "TypeScript JavaScript", "query": "TypeScript JavaScript tutorial"},
    {"keys": ("aws", "s3", "cloudfront", "lambda", "cloud"), "label": "AWS", "query": "AWS S3 CloudFront Lambda tutorial"},
    {"keys": ("docker", "kubernetes", "k8s", "container"), "label": "Docker", "query": "Docker tutorial for beginners"},
    {"keys": ("git", "github", "gitlab", "ci/cd", "cicd"), "label": "Git", "query": "Git GitHub tutorial for beginners"},
    {"keys": ("graphql", "apollo"), "label": "GraphQL", "query": "GraphQL Apollo tutorial"},
    {"keys": ("mongodb", "mongo", "mongoose"), "label": "MongoDB", "query": "MongoDB tutorial for beginners"},
    {"keys": ("python", "django", "flask", "fastapi"), "label": "Python", "query": "Python backend tutorial"},
    {"keys": ("sql", "postgres", "mysql", "database"), "label": "SQL", "query": "SQL database tutorial"},
]

_YT_FALLBACK_CHANNELS = (
    "freeCodeCamp.org",
    "Fireship",
    "Traversy Media",
    "The Net Ninja",
    "Web Dev Simplified",
)

# Evergreen watch URLs used when search quota is exhausted (better than empty modules)
_YT_FALLBACK_BY_FAMILY: dict[str, list[dict]] = {
    "React Next.js": [
        {"title": "React Course for Beginners – freeCodeCamp", "url": "https://www.youtube.com/watch?v=bMknfKXIFA8", "video_id": "bMknfKXIFA8", "channel": "freeCodeCamp.org"},
        {"title": "Next.js Tutorial for Beginners – The Net Ninja", "url": "https://www.youtube.com/watch?v=A63UxsQsEbU", "video_id": "A63UxsQsEbU", "channel": "The Net Ninja"},
        {"title": "React in 100 Seconds – Fireship", "url": "https://www.youtube.com/watch?v=Tn6-PIqc4UM", "video_id": "Tn6-PIqc4UM", "channel": "Fireship"},
    ],
    "Node.js Express": [
        {"title": "Node.js and Express.js – full course", "url": "https://www.youtube.com/watch?v=Oe421EPjeBE", "video_id": "Oe421EPjeBE", "channel": "freeCodeCamp.org"},
        {"title": "Node.js Crash Course – Traversy Media", "url": "https://www.youtube.com/watch?v=fBNz5xF-Kx4", "video_id": "fBNz5xF-Kx4", "channel": "Traversy Media"},
    ],
    "TypeScript JavaScript": [
        {"title": "TypeScript Course for Beginners – freeCodeCamp", "url": "https://www.youtube.com/watch?v=BwuLxPH8IDs", "video_id": "BwuLxPH8IDs", "channel": "freeCodeCamp.org"},
        {"title": "TypeScript – The Net Ninja", "url": "https://www.youtube.com/watch?v=2pZmKW9-I_k", "video_id": "2pZmKW9-I_k", "channel": "The Net Ninja"},
    ],
    "AWS": [
        {"title": "AWS Certified Cloud Practitioner – freeCodeCamp", "url": "https://www.youtube.com/watch?v=SOTamWNgDKc", "video_id": "SOTamWNgDKc", "channel": "freeCodeCamp.org"},
    ],
    "Docker": [
        {"title": "Docker Tutorial for Beginners – freeCodeCamp", "url": "https://www.youtube.com/watch?v=fqMOX6JJhGo", "video_id": "fqMOX6JJhGo", "channel": "freeCodeCamp.org"},
        {"title": "Docker in 100 Seconds – Fireship", "url": "https://www.youtube.com/watch?v=Gjnup-PuquQ", "video_id": "Gjnup-PuquQ", "channel": "Fireship"},
    ],
    "Git": [
        {"title": "Git and GitHub for Beginners – freeCodeCamp", "url": "https://www.youtube.com/watch?v=RGOj5yH7evk", "video_id": "RGOj5yH7evk", "channel": "freeCodeCamp.org"},
        {"title": "Git Tutorial for Beginners – Traversy Media", "url": "https://www.youtube.com/watch?v=SWYqp7iY_Tc", "video_id": "SWYqp7iY_Tc", "channel": "Traversy Media"},
    ],
    "GraphQL": [
        {"title": "GraphQL Full Course – freeCodeCamp", "url": "https://www.youtube.com/watch?v=ed8SzALpx1w", "video_id": "ed8SzALpx1w", "channel": "freeCodeCamp.org"},
    ],
    "MongoDB": [
        {"title": "MongoDB Crash Course – Traversy Media", "url": "https://www.youtube.com/watch?v=-56x56UppqQ", "video_id": "-56x56UppqQ", "channel": "Traversy Media"},
    ],
    "Python": [
        {"title": "Python for Beginners – freeCodeCamp", "url": "https://www.youtube.com/watch?v=rfscVS0vtbw", "video_id": "rfscVS0vtbw", "channel": "freeCodeCamp.org"},
    ],
    "SQL": [
        {"title": "SQL Tutorial – freeCodeCamp", "url": "https://www.youtube.com/watch?v=HXV3zeQKqGY", "video_id": "HXV3zeQKqGY", "channel": "freeCodeCamp.org"},
    ],
}


def _yt_family_for(skill: str) -> dict:
    s = (skill or "").lower()
    for fam in _YT_SKILL_FAMILIES:
        if any(k in s for k in fam["keys"]):
            return fam
    return {"keys": (), "label": skill or "General", "query": f"{skill} tutorial for beginners"}


def _yt_cache_id(skill: str, difficulty: str) -> str:
    # CURSOR_BIBLE: yt:{hash(skill + difficulty)}
    payload = f"{(skill or '').strip().lower()}|{(difficulty or 'missing').strip().lower()}"
    return "yt:" + hashlib.sha256(payload.encode()).hexdigest()


def _yt_cache_get(skill: str, difficulty: str) -> list | None:
    col = cache_collection()
    if col is None:
        return None
    try:
        doc = col.find_one({"_id": _yt_cache_id(skill, difficulty)})
        if doc and doc.get("expires_at", datetime.min) > datetime.utcnow():
            return doc.get("result") or []
    except Exception as e:
        print(f"yt cache read warn: {e}")
    return None


def _yt_cache_set(skill: str, difficulty: str, videos: list) -> None:
    col = cache_collection()
    if col is None:
        return
    try:
        col.update_one(
            {"_id": _yt_cache_id(skill, difficulty)},
            {
                "$set": {
                    "result": videos,
                    "skill": skill,
                    "difficulty": difficulty,
                    "created_at": datetime.utcnow(),
                    "expires_at": datetime.utcnow() + CACHE_TTL,
                }
            },
            upsert=True,
        )
    except Exception as e:
        print(f"yt cache write warn: {e}")


def _yt_fallback_videos(skill: str, level: str) -> list:
    """Static curated list when YouTube search quota is exhausted (HTTP 429)."""
    fam = _yt_family_for(skill)
    base = list(_YT_FALLBACK_BY_FAMILY.get(fam["label"]) or [])
    out = []
    for v in base:
        out.append({
            **v,
            "query": f"fallback:{fam['label']}",
            "skill": skill,
            "level": level,
            "fallback": True,
        })
    # Always append channel discovery links so UI isn't empty for obscure skills
    for ch in _YT_FALLBACK_CHANNELS:
        q = quote_plus(f"{skill} {ch}")
        out.append({
            "title": f"{skill} tutorials — {ch}",
            "url": f"https://www.youtube.com/results?search_query={q}",
            "video_id": None,
            "channel": ch,
            "query": f"fallback-channel:{ch}",
            "skill": skill,
            "level": level,
            "fallback": True,
        })
    print(f"WARNING: YouTube quota fallback used for skill={skill!r} level={level!r} ({len(out)} curated items)")
    return out


def _yt_search(query: str, max_results: int = 10) -> list:
    """YouTube search.list — costs 100 quota units regardless of maxResults. Default 10."""
    if not YOUTUBE_API_KEY:
        raise RuntimeError("YOUTUBE_API_KEY not configured")
    r = httpx.get(
        "https://www.googleapis.com/youtube/v3/search",
        params={
            "part": "snippet",
            "q": query,
            "type": "video",
            "maxResults": min(max(1, max_results), 10),
            "key": YOUTUBE_API_KEY,
        },
        timeout=25.0,
    )
    if r.status_code == 429:
        raise YouTubeQuotaExhausted(r.text[:300])
    r.raise_for_status()
    out = []
    for it in r.json().get("items", []):
        vid = (it.get("id") or {}).get("videoId")
        if not vid:
            continue
        sn = it.get("snippet") or {}
        out.append({
            "title": sn.get("title") or "",
            "url": f"https://www.youtube.com/watch?v={vid}",
            "video_id": vid,
            "channel": sn.get("channelTitle") or "",
            "thumbnail": ((sn.get("thumbnails") or {}).get("medium") or {}).get("url"),
            "query": query,
        })
    return out


def _group_gaps_for_yt(gaps: list) -> list[dict]:
    """
    Batch related gaps into one YouTube search.
    Returns [{family, query, gaps: [{skill, level, priority, raw}]}]
    """
    buckets: dict[str, dict] = {}
    for gap in gaps:
        if not isinstance(gap, dict):
            gap = {"requirement": str(gap), "classification": "missing", "priority": "medium"}
        skill = (gap.get("requirement") or gap.get("skill") or "").strip()
        if not skill:
            continue
        level = _normalize_gap_class(gap.get("classification") or gap.get("priority") or "")
        fam = _yt_family_for(skill)
        # One bucket per family + difficulty so cache keys stay coherent
        key = f"{fam['label']}|{level}"
        if key not in buckets:
            # Adapt query slightly by difficulty
            q = fam["query"]
            if level == "weak":
                q = f"{fam['label']} advanced tutorial best practices"
            elif level == "under-evidenced":
                q = f"{fam['label']} project tutorial portfolio"
            buckets[key] = {
                "family": fam["label"],
                "query": q,
                "level": level,
                "gaps": [],
            }
        buckets[key]["gaps"].append({
            "skill": skill,
            "level": level,
            "priority": gap.get("priority") or "medium",
            "raw": gap,
        })
    return list(buckets.values())


# ---------------------------------------------------------------------------
# Resume graph nodes
# ---------------------------------------------------------------------------
def extract_text(state: ResumeState) -> dict:
    raw = state.get("raw_text") or ""
    return {"cleaned_text": clean_resume_text(raw), "errors": [], "retry_count": 0}


def normalize_sections(state: ResumeState) -> dict:
    text = state.get("cleaned_text") or ""
    sections = {"full": text}
    for name in ("experience", "education", "skills", "projects"):
        m = re.search(rf"(?i)\b{name}\b[:\n](.*?)(?=\n\s*[A-Z][A-Za-z ]{2,30}\n|$)", text, re.DOTALL)
        if m:
            sections[name] = m.group(1).strip()[:2000]
    return {"sections": sections}


def extract_entities(state: ResumeState) -> dict:
    retry_count = state.get("retry_count") or 0
    try:
        response = deepseek_json.invoke([
            {"role": "system", "content": RESUME_EXTRACTION_SYSTEM},
            {"role": "user", "content": f"Resume text:\n\n{state.get('cleaned_text', '')}"},
        ])
        entities = _parse_json_content(response.content)
        for key in ("skills", "experience", "education", "projects"):
            if key not in entities:
                raise ValueError(f"Missing key: {key}")
        return {
            "entities": entities,
            "skills": entities.get("skills") or [],
            "experience": entities.get("experience") or [],
            "education": entities.get("education") or [],
            "projects": entities.get("projects") or [],
            "communication_profile": entities.get("communication_profile") or {},
            "errors": [],
            "retry_count": 0,
        }
    except Exception as e:
        if retry_count < 3:
            return {"errors": [f"Attempt {retry_count + 1}: {e}"], "retry_count": retry_count + 1}
        fb = regex_fallback_extraction(state.get("cleaned_text") or "")
        return {
            "entities": fb,
            "skills": fb["skills"],
            "experience": fb["experience"],
            "education": fb["education"],
            "projects": fb["projects"],
            "communication_profile": fb["communication_profile"],
            "errors": [f"Used regex fallback after {retry_count} LLM failures: {e}"],
            "retry_count": retry_count,
        }


def classify_skill_levels(state: ResumeState) -> dict:
    skills = state.get("skills") or []
    if not skills:
        return {"skill_levels": {}}
    questions = {}
    for i, sk in enumerate(skills[:12]):
        name = sk.get("name") if isinstance(sk, dict) else str(sk)
        questions[f"skill_{i}"] = Score(
            instructions=f"How strong is the candidate in {name} based on the resume?",
            criteria=SKILL_CRITERIA,
        )
    try:
        _require_jev()
        resp = jev_client.system_one(
            state={"resume_excerpt": (state.get("cleaned_text") or "")[:4000], "skills": skills[:12]},
            questions=questions,
        )
        answers = _jev_answers(resp)
        levels = {}
        for i, sk in enumerate(skills[:12]):
            name = sk.get("name") if isinstance(sk, dict) else str(sk)
            ans = answers.get(f"skill_{i}")
            levels[name] = {
                "score": _jev_score(ans),
                "probabilities": getattr(ans, "probabilities", None),
                "confidence": getattr(ans, "confidence", None),
            }
        return {"skill_levels": levels}
    except Exception as e:
        return {"skill_levels": {}, "errors": (state.get("errors") or []) + [f"Jev classify_skills: {e}"]}


def build_profile(state: ResumeState) -> dict:
    # profile assembled in state already; no-op enrichment
    return {
        "skills": state.get("skills") or [],
        "experience": state.get("experience") or [],
        "education": state.get("education") or [],
        "projects": state.get("projects") or [],
        "communication_profile": state.get("communication_profile") or {},
        "skill_levels": state.get("skill_levels") or {},
    }


# ---------------------------------------------------------------------------
# Match graph nodes
# ---------------------------------------------------------------------------
def semantic_compare(state: MatchState) -> dict:
    retry = state.get("retry_count") or 0
    try:
        response = deepseek_json.invoke([
            {"role": "system", "content": SEMANTIC_COMPARE_SYSTEM},
            {"role": "user", "content": json.dumps({
                "profile": state.get("candidate_profile"),
                "job": state.get("job_requirements"),
            }, default=str)[:12000]},
        ])
        data = _parse_json_content(response.content)
        return {"semantic_comparison": data.get("comparison") or json.dumps(data), "errors": [], "retry_count": 0}
    except Exception as e:
        if retry < 3:
            return {"errors": [str(e)], "retry_count": retry + 1}
        return {"semantic_comparison": "Comparison unavailable", "errors": [str(e)], "retry_count": retry}


def score_requirements(state: MatchState) -> dict:
    job = state.get("job_requirements") or {}
    reqs = job.get("requirements") if isinstance(job, dict) else None
    if not reqs:
        # flatten skills list or description bullets
        if isinstance(job, dict):
            reqs = job.get("skills") or job.get("required_skills") or []
            if not reqs and job.get("description"):
                reqs = [{"name": f"req_{i}", "description": line.strip()}
                        for i, line in enumerate(extract_requirements_section(job["description"]).split("\n")[:10])
                        if line.strip()]
        else:
            reqs = []
    normalized = []
    for i, r in enumerate(reqs[:15]):
        if isinstance(r, str):
            normalized.append({"name": r, "description": r})
        elif isinstance(r, dict):
            normalized.append({
                "name": r.get("name") or r.get("skill") or f"req_{i}",
                "description": r.get("description") or r.get("name") or str(r),
            })
    questions = {}
    for i, req in enumerate(normalized):
        questions[f"req_{i}_fit"] = Score(
            instructions=f"How well does the candidate demonstrate: {req['description']}?",
            criteria=SKILL_CRITERIA,
        )
        questions[f"req_{i}_must_have"] = Noul(
            instructions=f"Does the candidate meet the minimum bar for: {req['description']}?",
        )
    scores = {}
    if questions:
        try:
            _require_jev()
            resp = jev_client.system_one(
                state={"resume": state.get("candidate_profile"), "job": normalized},
                questions=questions,
            )
            answers = _jev_answers(resp)
            for i, req in enumerate(normalized):
                fit = answers.get(f"req_{i}_fit")
                must = answers.get(f"req_{i}_must_have")
                fit_score = _jev_score(fit)
                try:
                    fit_f = float(fit_score) / 4.0 if float(fit_score) > 1 else float(fit_score)
                except Exception:
                    fit_f = 0.5
                scores[req["name"]] = {
                    "fit_level": fit_score,
                    "fit_score": fit_f,
                    "fit_probabilities": getattr(fit, "probabilities", None),
                    "meets_minimum": _jev_prob(must),
                    "confidence": getattr(fit, "confidence", None),
                }
        except Exception as e:
            return {"requirement_scores": {}, "errors": (state.get("errors") or []) + [f"Jev score: {e}"]}
    return {"requirement_scores": scores, "job_requirements": {**(job if isinstance(job, dict) else {}), "_normalized": normalized}}


def compute_weighted_score(state: MatchState) -> dict:
    weights = state.get("weights") or {
        "skills": 0.35, "experience": 0.25, "education": 0.15, "projects": 0.15, "communication": 0.10,
    }
    req_scores = state.get("requirement_scores") or {}
    if req_scores:
        vals = [float(v.get("fit_score", 0.0) or 0.0) for v in req_scores.values()]
        skills_score = sum(vals) / max(len(vals), 1)
        # Fraction of requirements meeting a real bar — used to damp domain mismatches
        strong_frac = sum(1 for v in vals if v >= 0.55) / max(len(vals), 1)
        weak_frac = sum(1 for v in vals if v < 0.25) / max(len(vals), 1)
    else:
        skills_score = 0.0
        strong_frac = 0.0
        weak_frac = 1.0

    profile = state.get("candidate_profile") or {}
    job = state.get("job_requirements") or {}
    job_blob = " ".join(
        [
            str(job.get("title") or ""),
            str(job.get("description") or ""),
            " ".join(str(r) for r in (job.get("requirements") or [])),
        ]
    ).lower()
    soft_job = bool(
        re.search(r"software|engineer|developer|frontend|backend|full.?stack|react|node|python|typescript", job_blob)
    )

    # Experience: seniority + role relevance (not just number of bullets)
    exps = profile.get("experience") or []
    exp_text = " ".join(
        f"{e.get('title','')} {e.get('company','')} {e.get('description','')} {' '.join(e.get('technologies') or [])}"
        for e in exps
        if isinstance(e, dict)
    ).lower()
    months = 0
    for e in exps:
        if isinstance(e, dict):
            try:
                months += int(e.get("duration_months") or 0)
            except Exception:
                pass
    if months <= 0:
        # infer from free text years if analyze captured them poorly
        years_hit = re.findall(r"(\d+)\+?\s*years?", exp_text + " " + str(profile.get("summary") or "").lower())
        if years_hit:
            months = max(int(y) for y in years_hit) * 12
        else:
            months = max(12, len(exps) * 18)
    seniority = min(1.0, months / (72.0))  # 6 years ≈ full
    tech_hits = sum(
        1
        for kw in ("react", "typescript", "javascript", "node", "graphql", "next", "aws", "docker", "python", "api")
        if kw in exp_text
    )
    domain_hits = sum(
        1 for kw in ("mechanical", "autocad", "solidworks", "catia", "matlab", "automotive", "manufactur") if kw in exp_text
    )
    if soft_job and domain_hits >= 2 and tech_hits == 0:
        exp_relev = 0.05
    elif soft_job:
        exp_relev = min(1.0, 0.15 + 0.12 * tech_hits)
    else:
        exp_relev = 0.5
    exp_score = round(0.55 * seniority + 0.45 * exp_relev, 3)
    if soft_job and tech_hits == 0:
        exp_score = min(exp_score, 0.15)

    # Education: degree present × field relevance to job
    edus = profile.get("education") or []
    edu_text = " ".join(
        f"{e.get('degree','')} {e.get('field','')} {e.get('institution','')}" for e in edus if isinstance(e, dict)
    ).lower()
    if not edus:
        edu_score = 0.25
    elif soft_job and re.search(r"computer|software|information technology|\bit\b|cs\b", edu_text):
        edu_score = 0.85
    elif soft_job and re.search(r"mechanical|civil|chemical|electrical|automobile", edu_text):
        edu_score = 0.2
    elif edus:
        edu_score = 0.55
    else:
        edu_score = 0.4

    # Projects: count × tech overlap with job requirements
    projs = profile.get("projects") or []
    proj_text = " ".join(
        f"{p.get('name','')} {p.get('description','')} {' '.join(p.get('technologies') or [])}"
        for p in projs
        if isinstance(p, dict)
    ).lower()
    req_names = [str(r).lower() for r in (job.get("requirements") or [])]
    if not req_names and job.get("_normalized"):
        req_names = [str(r.get("name") or "").lower() for r in job["_normalized"]]
    overlap = sum(1 for r in req_names if r and r in proj_text)
    if soft_job and re.search(r"solidworks|autocad|fuel injection|emissions", proj_text) and overlap == 0:
        proj_score = 0.1
    else:
        proj_score = min(1.0, 0.2 + 0.15 * len(projs) + 0.1 * overlap)

    comm = profile.get("communication_profile") or {}
    try:
        wq = float(comm.get("writing_quality") or 3)
    except Exception:
        wq = 3.0
    # Don't let communication prop up a total domain mismatch
    comm_score = wq / 5.0
    if soft_job and weak_frac >= 0.7:
        comm_score = min(comm_score, 0.35)

    # Domain-mismatch clamp: almost no requirements fit AND no software signal in profile
    profile_blob = (
        json.dumps(profile.get("skills") or [])
        + " "
        + " ".join(
            f"{e.get('title','')} {e.get('description','')}" for e in exps if isinstance(e, dict)
        )
        + " "
        + proj_text
    ).lower()
    soft_signal = bool(
        re.search(r"\b(react|javascript|typescript|node|python|next\.?js|html|css|jquery)\b", profile_blob)
    )
    if soft_job and weak_frac >= 0.75 and strong_frac < 0.15 and not soft_signal:
        skills_score = min(skills_score, 0.12)
        exp_score = min(exp_score, 0.12)
        proj_score = min(proj_score, 0.12)

    component = {
        "skills": round(float(skills_score), 3),
        "experience": round(float(exp_score), 3),
        "education": round(float(edu_score), 3),
        "projects": round(float(proj_score), 3),
        "communication": round(float(comm_score), 3),
    }
    overall = sum(component[k] * float(weights.get(k, 0)) for k in component)
    # Extra penalty only for true domain mismatches (no software signal)
    if soft_job and weak_frac >= 0.75 and not soft_signal:
        overall = min(overall, 0.28)
    elif soft_job and soft_signal and skills_score < 0.35:
        # Partial software candidate: keep a junior/partial band (~25–45 typical)
        overall = max(overall, min(0.42, 0.18 + skills_score + 0.05 * tech_hits))
    confs = [v.get("confidence") for v in req_scores.values() if isinstance(v, dict) and v.get("confidence") is not None]
    confidence = sum(confs) / len(confs) if confs else 0.6
    return {
        "component_scores": component,
        "overall_score": round(overall * 100, 1),
        "confidence": confidence,
    }


def extract_evidence(state: MatchState) -> dict:
    try:
        response = deepseek_json.invoke([
            {"role": "system", "content": EVIDENCE_SYSTEM},
            {"role": "user", "content": json.dumps({
                "profile": state.get("candidate_profile"),
                "job": state.get("job_requirements"),
                "scores": state.get("requirement_scores"),
            }, default=str)[:12000]},
        ])
        data = _parse_json_content(response.content)
        raw = data.get("evidence") or []
        cleaned = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            excerpt = str(item.get("resume_excerpt") or item.get("excerpt") or "").strip()
            if not excerpt:
                continue
            if re.search(
                r"^\s*no (explicit )?(git )?evidence|no (explicit )?mention|not (found|mentioned|present)|n/?a\b|implies .+ usage",
                excerpt,
                re.I,
            ):
                continue
            cleaned.append(item)
        return {"evidence": cleaned}
    except Exception as e:
        return {"evidence": [], "errors": (state.get("errors") or []) + [str(e)]}


def generate_explanation(state: MatchState) -> dict:
    try:
        response = deepseek_json.invoke([
            {"role": "system", "content": EXPLANATION_SYSTEM},
            {"role": "user", "content": json.dumps({
                "overall_score": state.get("overall_score"),
                "component_scores": state.get("component_scores"),
                "semantic_comparison": state.get("semantic_comparison"),
                "evidence": state.get("evidence"),
            }, default=str)[:10000]},
        ])
        data = _parse_json_content(response.content)
        return {"explanation": data.get("explanation") or data.get("summary") or json.dumps(data)}
    except Exception as e:
        return {"explanation": f"Score {state.get('overall_score')}. Details unavailable.", "errors": (state.get("errors") or []) + [str(e)]}


# ---------------------------------------------------------------------------
# Gap graph
# ---------------------------------------------------------------------------
def classify_gaps(state: GapState) -> dict:
    match = state.get("match_result") or {}
    req_scores = match.get("requirement_scores") or {}
    questions = {}
    names = list(req_scores.keys())[:15]
    for i, name in enumerate(names):
        questions[f"gap_{i}"] = Choice(
            instructions=f"For requirement '{name}' with score data {req_scores[name]}, classify the gap.",
            criteria=GAP_CRITERIA,
        )
    gaps = []
    if questions:
        try:
            _require_jev()
            resp = jev_client.system_one(state={"match": match}, questions=questions)
            answers = _jev_answers(resp)
            for i, name in enumerate(names):
                ans = answers.get(f"gap_{i}")
                choice = getattr(ans, "choice", None) or _jev_score(ans) or "weak"
                if str(choice).lower() == "sufficient":
                    continue
                gaps.append({
                    "requirement": name,
                    "classification": str(choice),
                    "evidence": req_scores.get(name),
                })
        except Exception as e:
            # fallback from scores
            for name, sc in req_scores.items():
                fit = sc.get("fit_score", 0.5) if isinstance(sc, dict) else 0.5
                if fit < 0.35:
                    gaps.append({"requirement": name, "classification": "missing", "evidence": sc})
                elif fit < 0.6:
                    gaps.append({"requirement": name, "classification": "weak", "evidence": sc})
            return {"gaps": gaps, "errors": [str(e)]}
    if not gaps and not req_scores:
        gaps = [{"requirement": "general_fit", "classification": "weak", "evidence": match}]
    return {"gaps": gaps}


def prioritize_gaps(state: GapState) -> dict:
    gaps = state.get("gaps") or []
    if not gaps:
        return {"prioritized_gaps": []}
    questions = {}
    for i, g in enumerate(gaps[:15]):
        questions[f"prio_{i}"] = Score(
            instructions=f"Priority to fix gap '{g.get('requirement')}' classified as {g.get('classification')}?",
            criteria=PRIORITY_CRITERIA,
        )
    try:
        _require_jev()
        resp = jev_client.system_one(state={"gaps": gaps}, questions=questions)
        answers = _jev_answers(resp)
        out = []
        for i, g in enumerate(gaps[:15]):
            ans = answers.get(f"prio_{i}")
            level = _jev_score(ans)
            out.append({**g, "priority": level})
        out.sort(key=lambda x: float(x.get("priority") or 0) if str(x.get("priority")).replace(".", "", 1).isdigit() else 0, reverse=True)
        return {"prioritized_gaps": out}
    except Exception:
        order = {"missing": 3, "weak": 2, "under-evidenced": 1}
        out = sorted(gaps, key=lambda g: order.get(str(g.get("classification")), 0), reverse=True)
        for g in out:
            g["priority"] = g.get("classification")
        return {"prioritized_gaps": out}


# ---------------------------------------------------------------------------
# Career graph
# ---------------------------------------------------------------------------
def generate_objectives(state: CareerState) -> dict:
    try:
        response = deepseek_json.invoke([
            {"role": "system", "content": OBJECTIVES_SYSTEM},
            {"role": "user", "content": json.dumps({"gaps": state.get("gaps"), "target_role": state.get("target_role")}, default=str)},
        ])
        data = _parse_json_content(response.content)
        return {"objectives": data.get("objectives") or []}
    except Exception as e:
        return {"objectives": [], "errors": [str(e)]}


def create_study_plan(state: CareerState) -> dict:
    try:
        response = deepseek_json.invoke([
            {"role": "system", "content": STUDY_PLAN_SYSTEM},
            {"role": "user", "content": json.dumps({
                "objectives": state.get("objectives"),
                "gaps": state.get("gaps"),
                "target_role": state.get("target_role"),
            }, default=str)},
        ])
        data = _parse_json_content(response.content)
        return {"study_plan": data if "phases" in data else {"phases": data.get("phases") or []}}
    except Exception as e:
        return {"study_plan": {"phases": []}, "errors": (state.get("errors") or []) + [str(e)]}


def suggest_projects(state: CareerState) -> dict:
    try:
        response = deepseek_json.invoke([
            {"role": "system", "content": PROJECTS_SYSTEM},
            {"role": "user", "content": json.dumps({"gaps": state.get("gaps"), "target_role": state.get("target_role")}, default=str)},
        ])
        data = _parse_json_content(response.content)
        return {"projects": data.get("projects") or []}
    except Exception as e:
        return {"projects": [], "errors": (state.get("errors") or []) + [str(e)]}


def search_youtube_resources(state: CareerState) -> dict:
    """
    Per-gap YouTube search with:
    - Mongo yt:{hash(skill+difficulty)} cache (24h)
    - Batched searches for related skills (1 API call per family, not per gap×template)
    - maxResults=10
    - Curated channel/video fallback on HTTP 429
    """
    if not YOUTUBE_API_KEY:
        return {"gap_videos": [], "errors": (state.get("errors") or []) + ["YOUTUBE_API_KEY not configured"]}

    gaps = state.get("gaps") or []
    if not gaps:
        gaps = [{"requirement": state.get("target_role") or "software engineering", "classification": "missing", "priority": "high"}]

    errors = list(state.get("errors") or [])
    groups = _group_gaps_for_yt(gaps)
    gap_videos = []
    quota_dead = False

    for group in groups:
        level = group["level"]
        query = group["query"]
        members = group["gaps"]

        # 1) Prefer per-skill cache — if every member is warm, skip YouTube entirely
        cached_by_skill: dict[str, list] = {}
        need_fetch = []
        for m in members:
            cached = _yt_cache_get(m["skill"], m["level"])
            if cached is not None:
                cached_by_skill[m["skill"]] = cached
            else:
                need_fetch.append(m)

        shared: list = []
        used_fallback = False
        if need_fetch and not quota_dead:
            try:
                # 2) One batched search for the related group (not N template searches)
                shared = _yt_search(query, max_results=10)
                for m in need_fetch:
                    tagged = [{**v, "skill": m["skill"], "level": m["level"]} for v in shared]
                    _yt_cache_set(m["skill"], m["level"], tagged)
                    cached_by_skill[m["skill"]] = tagged
            except YouTubeQuotaExhausted as e:
                quota_dead = True
                msg = f"YouTube quota exhausted (429) on '{query}': {e}"
                print(f"WARNING: {msg}")
                errors.append(msg)
                used_fallback = True
            except Exception as e:
                errors.append(f"YouTube search failed for '{query}': {e}")
                used_fallback = True

        if need_fetch and (quota_dead or used_fallback or not shared):
            # 3) Fallback curated list when quota exhausted / search failed
            for m in need_fetch:
                if m["skill"] in cached_by_skill:
                    continue
                fb = _yt_fallback_videos(m["skill"], m["level"])
                # Cache fallback briefly so we don't keep retrying dead quota in-process
                _yt_cache_set(m["skill"], m["level"], fb)
                cached_by_skill[m["skill"]] = fb

        need_skills = {m["skill"] for m in need_fetch}
        for m in members:
            vids = cached_by_skill.get(m["skill"]) or _yt_fallback_videos(m["skill"], m["level"])
            gap_videos.append({
                "requirement": m["skill"],
                "classification": m["level"],
                "priority": m["priority"],
                "videos": vids,
                "queries": [query],
                "batched_family": group["family"],
                "from_cache": m["skill"] not in need_skills,
            })

    return {"gap_videos": gap_videos, "youtube_raw": [], "errors": errors}


def filter_resources(state: CareerState) -> dict:
    """Jev filters each video; discard below 0.6. No silent keep-all fallback."""
    gap_videos = state.get("gap_videos") or []
    if not gap_videos:
        return {"gap_videos": [], "resources": [], "errors": (state.get("errors") or []) + ["No YouTube results to filter"]}

    filtered = []
    errors = list(state.get("errors") or [])

    for mod in gap_videos:
        videos = mod.get("videos") or []
        skill = mod.get("requirement") or ""
        level = mod.get("classification") or "missing"
        if not videos:
            filtered.append({**mod, "videos": []})
            continue

        questions = {}
        for i, item in enumerate(videos[:12]):
            questions[f"yt_{i}"] = Noul(
                instructions=(
                    f"Is this video a genuine educational resource for learning {skill} "
                    f"at {level} level? Title: {item.get('title')}. Channel: {item.get('channel')}."
                ),
            )
        try:
            _require_jev()
            resp = jev_client.system_one(
                state={"skill": skill, "level": level, "role": state.get("target_role")},
                questions=questions,
            )
            answers = _jev_answers(resp)
            kept = []
            for i, item in enumerate(videos[:12]):
                prob = _jev_prob(answers.get(f"yt_{i}"))
                if prob >= 0.6:
                    kept.append({**item, "relevance_score": prob})
            filtered.append({**mod, "videos": kept})
        except Exception as e:
            errors.append(f"Jev filter failed for {skill}: {e}")
            # Spec: do not silently keep unfiltered fakes — leave empty for this gap
            filtered.append({**mod, "videos": []})

    flat = []
    for m in filtered:
        flat.extend(m.get("videos") or [])
    return {"gap_videos": filtered, "resources": flat, "errors": errors}


def curate_final_resources(state: CareerState) -> dict:
    """DeepSeek sequences surviving videos per gap into learning modules."""
    gap_videos = state.get("gap_videos") or []
    modules = []
    errors = list(state.get("errors") or [])
    all_resources = []

    for mod in gap_videos:
        videos = mod.get("videos") or []
        skill = mod.get("requirement") or ""
        level = mod.get("classification") or "missing"
        if not videos:
            modules.append({
                "requirement": skill,
                "classification": level,
                "priority": mod.get("priority"),
                "queries": mod.get("queries") or [],
                "videos": [],
            })
            continue
        try:
            response = deepseek_json.invoke([
                {"role": "system", "content": MODULE_SEQUENCE_SYSTEM},
                {"role": "user", "content": json.dumps({
                    "skill": skill,
                    "level": level,
                    "target_role": state.get("target_role"),
                    "videos": [{"title": v.get("title"), "url": v.get("url"), "channel": v.get("channel")} for v in videos[:10]],
                }, default=str)},
            ])
            data = _parse_json_content(response.content)
            sequenced = data.get("videos") or []
            # Keep only real URLs from input set
            allowed = {v.get("url") for v in videos}
            cleaned = []
            for i, v in enumerate(sequenced):
                if v.get("url") not in allowed:
                    continue
                cleaned.append({
                    "title": v.get("title"),
                    "url": v.get("url"),
                    "channel": v.get("channel"),
                    "order": v.get("order") or (i + 1),
                    "description": v.get("description") or "",
                    "relevance_score": next((x.get("relevance_score") for x in videos if x.get("url") == v.get("url")), None),
                })
            cleaned = sorted(cleaned, key=lambda x: x.get("order") or 99)[:5]
            if not cleaned:
                # DeepSeek returned junk URLs — fall back to Jev-ranked order with empty descriptions forbidden;
                # attach short DeepSeek-less placeholders only as order metadata from relevance
                cleaned = [
                    {
                        "title": v.get("title"),
                        "url": v.get("url"),
                        "channel": v.get("channel"),
                        "order": i + 1,
                        "description": f"Curated {level}-level resource for {skill}.",
                        "relevance_score": v.get("relevance_score"),
                    }
                    for i, v in enumerate(sorted(videos, key=lambda x: x.get("relevance_score") or 0, reverse=True)[:5])
                ]
            modules.append({
                "requirement": skill,
                "classification": level,
                "priority": mod.get("priority"),
                "queries": mod.get("queries") or [],
                "videos": cleaned,
            })
            all_resources.extend(cleaned)
        except Exception as e:
            errors.append(f"DeepSeek sequence failed for {skill}: {e}")
            modules.append({
                "requirement": skill,
                "classification": level,
                "priority": mod.get("priority"),
                "queries": mod.get("queries") or [],
                "videos": [],
            })

    return {"modules": modules, "resources": all_resources, "errors": errors}


# ---------------------------------------------------------------------------
# Compile graphs
# ---------------------------------------------------------------------------
def _build_resume_graph():
    g = StateGraph(ResumeState)
    g.add_node("extract_text", extract_text)
    g.add_node("normalize_sections", normalize_sections)
    g.add_node("extract_entities", extract_entities)
    g.add_node("classify_skills", classify_skill_levels)
    g.add_node("build_profile", build_profile)
    g.set_entry_point("extract_text")
    g.add_edge("extract_text", "normalize_sections")
    g.add_edge("normalize_sections", "extract_entities")
    g.add_conditional_edges(
        "extract_entities",
        lambda s: "retry" if s.get("errors") and (s.get("retry_count") or 0) > 0 and (s.get("retry_count") or 0) <= 3 and not s.get("skills") else "continue",
        {"retry": "extract_entities", "continue": "classify_skills"},
    )
    g.add_edge("classify_skills", "build_profile")
    g.add_edge("build_profile", END)
    return g.compile()


def _build_match_graph():
    g = StateGraph(MatchState)
    g.add_node("semantic_compare", semantic_compare)
    g.add_node("score_requirements", score_requirements)
    g.add_node("weighted_score", compute_weighted_score)
    g.add_node("extract_evidence", extract_evidence)
    g.add_node("generate_explanation", generate_explanation)
    g.set_entry_point("semantic_compare")
    g.add_conditional_edges(
        "semantic_compare",
        lambda s: "retry" if s.get("errors") and (s.get("retry_count") or 0) > 0 and (s.get("retry_count") or 0) <= 3 and not s.get("semantic_comparison") else "continue",
        {"retry": "semantic_compare", "continue": "score_requirements"},
    )
    g.add_edge("score_requirements", "weighted_score")
    g.add_edge("weighted_score", "extract_evidence")
    g.add_edge("extract_evidence", "generate_explanation")
    g.add_edge("generate_explanation", END)
    return g.compile()


def _build_gap_graph():
    g = StateGraph(GapState)
    g.add_node("classify_gaps", classify_gaps)
    g.add_node("prioritize_gaps", prioritize_gaps)
    g.set_entry_point("classify_gaps")
    g.add_edge("classify_gaps", "prioritize_gaps")
    g.add_edge("prioritize_gaps", END)
    return g.compile()


def _build_career_graph():
    g = StateGraph(CareerState)
    g.add_node("generate_objectives", generate_objectives)
    g.add_node("create_study_plan", create_study_plan)
    g.add_node("suggest_projects", suggest_projects)
    g.add_node("search_resources", search_youtube_resources)
    g.add_node("filter_resources", filter_resources)
    g.add_node("curate_resources", curate_final_resources)
    g.set_entry_point("generate_objectives")
    g.add_edge("generate_objectives", "create_study_plan")
    g.add_edge("create_study_plan", "suggest_projects")
    g.add_edge("suggest_projects", "search_resources")
    g.add_edge("search_resources", "filter_resources")
    g.add_edge("filter_resources", "curate_resources")
    g.add_edge("curate_resources", END)
    return g.compile()


resume_app = _build_resume_graph()
match_app = _build_match_graph()
gap_app = _build_gap_graph()
career_app = _build_career_graph()


# ---------------------------------------------------------------------------
# FastAPI
# ---------------------------------------------------------------------------
app = FastAPI(title="X-CEED AI Core", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:3002", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    resume_text: str


class MatchRequest(BaseModel):
    candidate_profile: dict
    job_requirements: dict
    weights: Optional[dict] = None


class GapRequest(BaseModel):
    match_result: dict


class CareerRequest(BaseModel):
    gaps: list
    target_role: str = "Software Engineer"


class ChatRequest(BaseModel):
    message: str
    resume_text: Optional[str] = None
    job_description: Optional[str] = None
    history: list = Field(default_factory=list)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "deepseek": bool(DEEPSEEK_API_KEY),
        "jev": bool(TYPESAFE_API_KEY),
        "mongo": bool(MONGODB_URI),
    }


@app.get("/")
def root():
    return {"service": "xceed-ai-core", "endpoints": ["/analyze", "/match", "/gap", "/career-plan", "/chat", "/health"]}


@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    if not req.resume_text.strip():
        raise HTTPException(400, "resume_text required")
    result = cached_invoke(resume_app, {"raw_text": req.resume_text}, "resume")
    return {
        "skills": result.get("skills") or [],
        "experience": result.get("experience") or [],
        "education": result.get("education") or [],
        "projects": result.get("projects") or [],
        "communication_profile": result.get("communication_profile") or {},
        "skill_levels": result.get("skill_levels") or {},
        "errors": result.get("errors") or [],
    }


@app.post("/match")
def match(req: MatchRequest):
    inputs = {
        "candidate_profile": req.candidate_profile,
        "job_requirements": req.job_requirements,
        "weights": req.weights or {
            "skills": 0.35, "experience": 0.25, "education": 0.15, "projects": 0.15, "communication": 0.10,
        },
    }
    result = cached_invoke(match_app, inputs, "match:v3")
    return {
        "overall_score": result.get("overall_score"),
        "component_scores": result.get("component_scores"),
        "evidence": result.get("evidence"),
        "explanation": result.get("explanation"),
        "requirement_scores": result.get("requirement_scores"),
        "semantic_comparison": result.get("semantic_comparison"),
        "confidence": result.get("confidence"),
        "errors": result.get("errors") or [],
    }


@app.post("/gap")
def gap(req: GapRequest):
    result = cached_invoke(gap_app, {"match_result": req.match_result}, "gap")
    return {
        "gaps": result.get("prioritized_gaps") or result.get("gaps") or [],
        "errors": result.get("errors") or [],
    }


@app.post("/career-plan")
def career_plan(req: CareerRequest):
    if not YOUTUBE_API_KEY:
        raise HTTPException(503, "YOUTUBE_API_KEY required for skill-gap course creation")
    if not DEEPSEEK_API_KEY:
        raise HTTPException(503, "DEEPSEEK_API_KEY required")
    result = cached_invoke(
        career_app,
        {"gaps": req.gaps, "target_role": req.target_role},
        "career",
    )
    modules = result.get("modules") or []
    if not any((m.get("videos") or []) for m in modules):
        errs = result.get("errors") or []
        raise HTTPException(
            502,
            "Career plan produced no curated YouTube modules. " + "; ".join(errs[:3]),
        )
    return {
        "objectives": result.get("objectives"),
        "study_plan": result.get("study_plan"),
        "projects": result.get("projects"),
        "modules": modules,
        "resources": result.get("resources"),
        "errors": result.get("errors") or [],
    }


@app.post("/chat")
def chat(req: ChatRequest):
    """RAG-style chat without Chroma dependency — context stuffed into DeepSeek."""
    context_parts = []
    if req.resume_text:
        context_parts.append(f"RESUME:\n{clean_resume_text(req.resume_text)[:6000]}")
    if req.job_description:
        context_parts.append(f"JOB:\n{extract_requirements_section(req.job_description)[:4000]}")
    context = "\n\n".join(context_parts) or "No documents provided."
    messages = [
        {"role": "system", "content": (
            "You are X-CEED career assistant. Answer using the provided resume/job context. "
            "Be concise and actionable. If context is missing, say so."
        )},
        *[{"role": m.get("role", "user"), "content": m.get("content", "")} for m in (req.history or [])[-8:]],
        {"role": "user", "content": f"{context}\n\nQuestion: {req.message}"},
    ]
    try:
        response = deepseek.invoke(messages)
        return {"reply": response.content, "model": "deepseek-chat"}
    except Exception as e:
        raise HTTPException(500, str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
