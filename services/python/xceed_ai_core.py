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
Valid JSON only."""

EXPLANATION_SYSTEM = """You are X-CEED's match explainer.
Write a clear recruiter-facing explanation of fit.
Return JSON: {explanation: string, summary: string}.
Valid JSON only."""

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


def _yt_search(query: str, max_results: int = 5) -> list:
    if not YOUTUBE_API_KEY:
        raise RuntimeError("YOUTUBE_API_KEY not configured")
    r = httpx.get(
        "https://www.googleapis.com/youtube/v3/search",
        params={
            "part": "snippet",
            "q": query,
            "type": "video",
            "maxResults": max_results,
            "key": YOUTUBE_API_KEY,
        },
        timeout=25.0,
    )
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
        vals = [v.get("fit_score", 0.5) for v in req_scores.values()]
        skills_score = sum(vals) / max(len(vals), 1)
    else:
        skills_score = 0.5
    # ponytail: other components derived lightly from profile richness until separate Jev dims exist
    profile = state.get("candidate_profile") or {}
    exp_score = min(1.0, 0.3 + 0.1 * len(profile.get("experience") or []))
    edu_score = 0.7 if profile.get("education") else 0.4
    proj_score = min(1.0, 0.3 + 0.15 * len(profile.get("projects") or []))
    comm = profile.get("communication_profile") or {}
    comm_score = (comm.get("writing_quality") or 3) / 5.0
    component = {
        "skills": round(skills_score, 3),
        "experience": round(exp_score, 3),
        "education": round(edu_score, 3),
        "projects": round(proj_score, 3),
        "communication": round(comm_score, 3),
    }
    overall = sum(component[k] * float(weights.get(k, 0)) for k in component)
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
        return {"evidence": data.get("evidence") or []}
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
    """Per-gap YouTube search with classification-specific queries. No mocks."""
    if not YOUTUBE_API_KEY:
        return {"gap_videos": [], "errors": (state.get("errors") or []) + ["YOUTUBE_API_KEY not configured"]}

    gaps = state.get("gaps") or []
    if not gaps:
        # synthesize a gap from target role so we still search something real
        gaps = [{"requirement": state.get("target_role") or "software engineering", "classification": "missing", "priority": "high"}]

    gap_videos = []
    errors = list(state.get("errors") or [])
    seen_ids = set()

    for gap in gaps:
        if not isinstance(gap, dict):
            gap = {"requirement": str(gap), "classification": "missing", "priority": "medium"}
        skill = (gap.get("requirement") or gap.get("skill") or "").strip()
        if not skill:
            continue
        level = _normalize_gap_class(gap.get("classification") or gap.get("priority") or "")
        templates = GAP_QUERY_TEMPLATES.get(level, GAP_QUERY_TEMPLATES["missing"])
        collected = []
        for tmpl in templates:
            q = tmpl.format(skill=skill)
            try:
                for v in _yt_search(q, max_results=4):
                    if v["video_id"] in seen_ids:
                        continue
                    seen_ids.add(v["video_id"])
                    collected.append({**v, "skill": skill, "level": level})
            except Exception as e:
                errors.append(f"YouTube search failed for '{q}': {e}")
        gap_videos.append({
            "requirement": skill,
            "classification": level,
            "priority": gap.get("priority") or "medium",
            "videos": collected,
            "queries": [t.format(skill=skill) for t in templates],
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
    result = cached_invoke(match_app, inputs, "match")
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
