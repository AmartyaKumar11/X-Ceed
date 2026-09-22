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
import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain_openai import ChatOpenAI

logger = logging.getLogger("xceed")
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
# ponytail: P0.6 YouTube key rotation — support comma-separated keys
YOUTUBE_API_KEYS = [k.strip() for k in os.getenv("YOUTUBE_API_KEYS", YOUTUBE_API_KEY or "").split(",") if k.strip()]
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3002")
TYPESAFE_URL = os.getenv("TYPESAFE_BASE_URL", "https://api.typesafe.ai/v1/systemone")
# ponytail: P0.6 extend cache TTL from 24h to 7 days (videos don't change daily)
CACHE_TTL = timedelta(days=7)

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

# ponytail: P0.5 model fallback chain — retry with fallback models on failure
class ResilientLLM:
    """Wrapper that tries multiple models in sequence on failure."""
    
    def __init__(self):
        self.models = [
            {"name": "deepseek-chat", "base_url": "https://api.deepseek.com", "key_env": "DEEPSEEK_API_KEY"},
            # Fallback: DeepSeek reasoner model (same API, different model)
            {"name": "deepseek-reasoner", "base_url": "https://api.deepseek.com", "key_env": "DEEPSEEK_API_KEY"},
        ]
        self.active_model = self.models[0]["name"]
        self.fallback_count = 0
    
    def invoke(self, messages, json_mode=False, temperature=0.1):
        """Synchronous invoke with fallback."""
        last_error = None
        for model_config in self.models:
            try:
                kwargs = {"temperature": temperature}
                if json_mode:
                    kwargs["model_kwargs"] = {"response_format": {"type": "json_object"}}
                llm = ChatOpenAI(
                    model=model_config["name"],
                    base_url=model_config["base_url"],
                    api_key=os.getenv(model_config["key_env"]) or "missing",
                    **kwargs,
                )
                result = llm.invoke(messages)
                self.active_model = model_config["name"]
                return result
            except Exception as e:
                logger.warning(f"Model {model_config['name']} failed: {e}")
                last_error = e
                self.fallback_count += 1
                continue
        raise RuntimeError(f"All models failed. Last error: {last_error}")
    
    async def ainvoke(self, messages, json_mode=False, temperature=0.1):
        """Async invoke with fallback."""
        last_error = None
        for model_config in self.models:
            try:
                kwargs = {"temperature": temperature}
                if json_mode:
                    kwargs["model_kwargs"] = {"response_format": {"type": "json_object"}}
                llm = ChatOpenAI(
                    model=model_config["name"],
                    base_url=model_config["base_url"],
                    api_key=os.getenv(model_config["key_env"]) or "missing",
                    **kwargs,
                )
                result = await llm.ainvoke(messages)
                self.active_model = model_config["name"]
                return result
            except Exception as e:
                logger.warning(f"Model {model_config['name']} failed: {e}")
                last_error = e
                self.fallback_count += 1
                continue
        raise RuntimeError(f"All models failed. Last error: {last_error}")
    
    async def astream(self, messages, json_mode=False, temperature=0.1):
        """Async streaming invoke with fallback."""
        last_error = None
        for model_config in self.models:
            try:
                kwargs = {"temperature": temperature}
                if json_mode:
                    kwargs["model_kwargs"] = {"response_format": {"type": "json_object"}}
                llm = ChatOpenAI(
                    model=model_config["name"],
                    base_url=model_config["base_url"],
                    api_key=os.getenv(model_config["key_env"]) or "missing",
                    **kwargs,
                )
                self.active_model = model_config["name"]
                async for chunk in llm.astream(messages):
                    yield chunk
                return
            except Exception as e:
                logger.warning(f"Model {model_config['name']} streaming failed: {e}")
                last_error = e
                self.fallback_count += 1
                continue
        raise RuntimeError(f"All models failed streaming. Last error: {last_error}")
    
    def get_status(self):
        return {"active_model": self.active_model, "fallback_activations": self.fallback_count}


resilient_llm = ResilientLLM()

# ponytail: P0.6 YouTube API key rotation
class YouTubeKeyRotator:
    """Round-robin YouTube API keys with exhaustion tracking."""
    
    def __init__(self, keys: list[str]):
        self.keys = keys or []
        self.current_index = 0
        self.exhausted: set[int] = set()
    
    def get_key(self) -> str | None:
        """Get next available API key."""
        if not self.keys:
            return None
        available = [(i, k) for i, k in enumerate(self.keys) if i not in self.exhausted]
        if not available:
            return None
        # Round-robin among available keys
        idx, key = available[self.current_index % len(available)]
        self.current_index = (self.current_index + 1) % len(available)
        return key
    
    def mark_exhausted(self, key: str):
        """Mark a key as quota-exhausted."""
        try:
            idx = self.keys.index(key)
            self.exhausted.add(idx)
            logger.warning(f"YouTube API key {idx+1}/{len(self.keys)} exhausted")
        except ValueError:
            pass
    
    def reset(self):
        """Reset all keys (call daily)."""
        self.exhausted.clear()
        self.current_index = 0
    
    def has_keys(self) -> bool:
        return bool(self.keys) and len(self.exhausted) < len(self.keys)


yt_key_rotator = YouTubeKeyRotator(YOUTUBE_API_KEYS)

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


# ponytail: P0.2 recalibrated levels — a 3-year React dev should score level 3, not 1-2
SKILL_CRITERIA = [
    "Not mentioned anywhere in the resume — skill name absent",
    "Mentioned as a keyword only — no context, no project, no duration stated",
    "Used in at least one project or role with 1-2 years experience demonstrated",
    "Regular professional use across multiple projects, 2-4 years, demonstrated impact",
    "Deep expertise — 4+ years, led or architected systems, mentored others, or open-source contributions",
]

GAP_CRITERIA = {
    "missing": "requirement not present",
    "weak": "shallow or limited evidence",
    "under-evidenced": "mentioned without proof",
    "sufficient": "clear demonstrated evidence",
}

PRIORITY_CRITERIA = ["ignore", "low", "medium", "high", "critical"]

# ponytail: P0.4 technology-specific Jev questions — require explicit naming of services/tech
# Prevents false positives like "Python scripting" counting as AWS experience
TECH_SPECIFIC_QUESTIONS: dict[str, dict] = {
    "aws": {
        "fit": "Does the candidate explicitly mention any AWS services (S3, EC2, Lambda, CloudFront, RDS, ECS, EKS, IAM, CloudWatch, DynamoDB, API Gateway) by name? Score based ONLY on named AWS services, not general cloud or DevOps mentions. 'Cloud experience' without AWS names = level 0-1.",
        "must": "Has the candidate used at least one AWS service (S3, EC2, Lambda, RDS, CloudFront, etc.) in a professional or project context? Yes requires explicit AWS service mention with evidence.",
    },
    "docker": {
        "fit": "Does the candidate explicitly mention Docker, containers, Dockerfile, docker-compose, or containerization by name? Score based ONLY on explicit Docker/container mentions, not just 'deployment' or 'DevOps'.",
        "must": "Has the candidate used Docker/containers in a professional or project context? Yes requires explicit Docker/container mention with evidence of containerization work.",
    },
    "kubernetes": {
        "fit": "Does the candidate explicitly mention Kubernetes, K8s, kubectl, Helm, EKS, GKE, or AKS by name? Score based ONLY on explicit Kubernetes mentions, not just 'orchestration' or 'cloud'.",
        "must": "Has the candidate used Kubernetes in a professional or project context? Yes requires explicit K8s/Kubernetes mention with evidence.",
    },
    "graphql": {
        "fit": "Does the candidate explicitly mention GraphQL, Apollo, or GraphQL-specific concepts (schemas, resolvers, mutations, subscriptions) by name? Score based ONLY on explicit GraphQL mentions, not just 'API'.",
        "must": "Has the candidate built or worked with GraphQL APIs? Yes requires explicit GraphQL mention with evidence.",
    },
    "typescript": {
        "fit": "Does the candidate explicitly mention TypeScript, TS, type annotations, or TypeScript-specific features by name? Score based ONLY on explicit TypeScript mentions, not just JavaScript.",
        "must": "Has the candidate used TypeScript professionally or in projects? Yes requires explicit TypeScript mention, not just JavaScript experience.",
    },
    "react": {
        "fit": "Does the candidate explicitly mention React, React.js, JSX, hooks (useState, useEffect, etc.), React components, or React-specific patterns? Score based on explicit React evidence.",
        "must": "Has the candidate built production applications or projects with React? Yes requires explicit React mention with evidence of components/hooks/JSX work.",
    },
    "node": {
        "fit": "Does the candidate explicitly mention Node.js, Node, Express, Fastify, NestJS, or server-side JavaScript by name? Score based ONLY on explicit Node.js ecosystem mentions.",
        "must": "Has the candidate built backend services with Node.js? Yes requires explicit Node.js/Express mention with evidence.",
    },
    "python": {
        "fit": "Does the candidate explicitly mention Python, Django, Flask, FastAPI, or Python-specific frameworks/tools? Score based on explicit Python evidence and depth of usage.",
        "must": "Has the candidate used Python professionally or in substantial projects? Yes requires explicit Python mention with evidence.",
    },
    "mongodb": {
        "fit": "Does the candidate explicitly mention MongoDB, Mongoose, NoSQL document databases, or MongoDB-specific concepts? Score based ONLY on explicit MongoDB mentions, not just 'database'.",
        "must": "Has the candidate used MongoDB in a professional or project context? Yes requires explicit MongoDB mention with evidence.",
    },
    "sql": {
        "fit": "Does the candidate explicitly mention SQL, PostgreSQL, MySQL, database queries, schema design, or relational databases? Score based on explicit SQL/relational DB evidence.",
        "must": "Has the candidate used SQL databases professionally? Yes requires explicit SQL/PostgreSQL/MySQL mention with evidence.",
    },
    "git": {
        "fit": "Does the candidate mention Git, GitHub, GitLab, version control, branching, PRs, or CI/CD pipelines? Score based on explicit Git/version control evidence.",
        "must": "Has the candidate used Git for version control? Yes requires explicit Git mention or evidence of collaborative development.",
    },
}


def _get_tech_specific_question(req_desc: str, question_type: str = "fit") -> str | None:
    """Return tech-specific Jev question if requirement matches a known technology."""
    req_lower = req_desc.lower()
    for tech, questions in TECH_SPECIFIC_QUESTIONS.items():
        # Match technology keywords in requirement description
        if tech in req_lower or (tech == "node" and "node.js" in req_lower):
            return questions.get(question_type)
        # Handle common variations
        if tech == "aws" and any(kw in req_lower for kw in ("amazon", "cloud", "s3", "ec2", "lambda")):
            return questions.get(question_type)
        if tech == "kubernetes" and any(kw in req_lower for kw in ("k8s", "helm", "eks", "gke")):
            return questions.get(question_type)
        if tech == "docker" and "container" in req_lower:
            return questions.get(question_type)
    return None


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
    gap_clusters: list  # P1.2: clustered gaps for combined learning
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

# ponytail: P0.1 evidence density — one item per requirement, even when no evidence exists
EVIDENCE_SYSTEM = """You are X-CEED's evidence extractor.
For EACH requirement listed below, extract the strongest supporting evidence from the resume.
If NO evidence exists for a requirement, return {{"resume_excerpt": "No evidence found in resume", "strength": "none"}}.

Return a JSON object with exactly this structure:
{{"evidence": [array of EXACTLY {n_requirements} items, one per requirement, in the same order as listed]}}

Each item must have:
- requirement: string (copy the requirement text exactly)
- resume_excerpt: string (quote the resume verbatim, or "No evidence found in resume")
- strength: "none" | "weak" | "moderate" | "strong"

Rules:
- resume_excerpt MUST be a verbatim or near-verbatim quote from the resume — never invent quotes.
- If no evidence exists, say "No evidence found in resume" with strength "none".
- Return EXACTLY {n_requirements} items — one per requirement, same order.
Valid JSON only. No markdown fences."""

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


# ponytail: P0.6 use key rotator with automatic fallback on 429
def _yt_search(query: str, max_results: int = 10) -> list:
    """YouTube search.list with key rotation — costs 100 quota units per key."""
    api_key = yt_key_rotator.get_key()
    if not api_key:
        raise YouTubeQuotaExhausted("All YouTube API keys exhausted")
    
    r = httpx.get(
        "https://www.googleapis.com/youtube/v3/search",
        params={
            "part": "snippet",
            "q": query,
            "type": "video",
            "maxResults": min(max(1, max_results), 10),
            "key": api_key,
        },
        timeout=25.0,
    )
    
    if r.status_code == 429:
        # Mark this key as exhausted and retry with next key
        yt_key_rotator.mark_exhausted(api_key)
        next_key = yt_key_rotator.get_key()
        if next_key:
            logger.info(f"Retrying YouTube search with next API key")
            r = httpx.get(
                "https://www.googleapis.com/youtube/v3/search",
                params={
                    "part": "snippet",
                    "q": query,
                    "type": "video",
                    "maxResults": min(max(1, max_results), 10),
                    "key": next_key,
                },
                timeout=25.0,
            )
            if r.status_code == 429:
                yt_key_rotator.mark_exhausted(next_key)
                raise YouTubeQuotaExhausted(r.text[:300])
        else:
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
    # ponytail: P0.4 use technology-specific questions when available
    questions = {}
    for i, req in enumerate(normalized):
        req_desc = req['description']
        
        # Check for technology-specific question
        tech_fit_q = _get_tech_specific_question(req_desc, "fit")
        tech_must_q = _get_tech_specific_question(req_desc, "must")
        
        if tech_fit_q:
            questions[f"req_{i}_fit"] = Score(
                instructions=tech_fit_q,
                criteria=SKILL_CRITERIA,
            )
        else:
            questions[f"req_{i}_fit"] = Score(
                instructions=f"How well does the candidate demonstrate: {req_desc}? Score based on explicit evidence in the resume.",
                criteria=SKILL_CRITERIA,
            )
        
        if tech_must_q:
            questions[f"req_{i}_must_have"] = Noul(
                instructions=tech_must_q,
            )
        else:
            questions[f"req_{i}_must_have"] = Noul(
                instructions=f"Does the candidate meet the minimum bar for: {req_desc}? Yes requires explicit mention with evidence.",
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


# ponytail: P1.6 confidence intervals from Jev probability distributions
def compute_confidence_intervals(req_scores: dict) -> dict:
    """Compute confidence intervals from Jev probability distributions."""
    intervals = {}
    for req_name, scores in req_scores.items():
        if not isinstance(scores, dict):
            continue
        
        probs = scores.get("fit_probabilities") or {}
        fit_score = scores.get("fit_score", 0.5)
        confidence = scores.get("confidence", 0.6)
        
        if probs:
            # Compute expected value and variance from probability distribution
            try:
                ev = sum(int(k) * float(v) for k, v in probs.items() if k.isdigit())
                var = sum(float(v) * (int(k) - ev) ** 2 for k, v in probs.items() if k.isdigit())
                std = var ** 0.5 if var > 0 else 0
                # 90% confidence interval (±1.645 std), normalized to 0-100 scale
                margin = 1.645 * std / 4 * 100  # /4 because scores are 0-4
            except Exception:
                margin = 15.0  # Default margin when calculation fails
        else:
            # No probability distribution — estimate margin from confidence
            margin = 20.0 * (1.0 - confidence) + 5.0  # Higher uncertainty when confidence is low
        
        score_pct = fit_score * 100 if fit_score <= 1 else fit_score
        intervals[req_name] = {
            "score": round(score_pct, 1),
            "margin": round(margin, 1),
            "low": max(0, round(score_pct - margin, 1)),
            "high": min(100, round(score_pct + margin, 1)),
            "confidence": confidence,
            "uncertain_reason": _uncertainty_reason(scores, margin) if margin > 15 else None,
        }
    
    return intervals


def _uncertainty_reason(scores: dict, margin: float) -> str | None:
    """Generate explanation for high uncertainty."""
    if margin <= 15:
        return None
    fit_level = scores.get("fit_level", 0)
    if fit_level in (0, 1):
        return "Skill mentioned briefly or as keyword only — adding project details would narrow this range"
    if fit_level == 2:
        return "Some experience shown but duration/depth unclear — specifying years of experience would help"
    return "Evidence exists but specificity is low — adding concrete examples would narrow uncertainty"


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
    
    # ponytail: P1.6 compute confidence intervals for each requirement
    confidence_intervals = compute_confidence_intervals(req_scores)
    
    return {
        "component_scores": component,
        "overall_score": round(overall * 100, 1),
        "confidence": confidence,
        "confidence_intervals": confidence_intervals,
    }


# ponytail: P0.1 evidence density — enumerate requirements, validate count, retry once
def extract_evidence(state: MatchState) -> dict:
    job = state.get("job_requirements") or {}
    normalized = job.get("_normalized") or []
    if not normalized:
        # Build normalized requirements list from job data
        reqs = job.get("requirements") if isinstance(job, dict) else None
        if not reqs:
            reqs = job.get("skills") or job.get("required_skills") or []
        for i, r in enumerate(reqs[:15]):
            if isinstance(r, str):
                normalized.append({"name": r, "description": r})
            elif isinstance(r, dict):
                normalized.append({
                    "name": r.get("name") or r.get("skill") or f"req_{i}",
                    "description": r.get("description") or r.get("name") or str(r),
                })
    
    n_requirements = len(normalized)
    if n_requirements == 0:
        return {"evidence": [], "errors": ["No requirements to extract evidence for"]}
    
    # Build numbered requirements list for the prompt
    numbered_requirements = "\n".join(
        f"{i+1}. {req.get('description') or req.get('name')}" 
        for i, req in enumerate(normalized)
    )
    
    # Get resume text
    profile = state.get("candidate_profile") or {}
    resume_text = profile.get("raw_text") or ""
    if not resume_text:
        # Reconstruct from profile sections
        parts = []
        for sk in (profile.get("skills") or []):
            if isinstance(sk, dict):
                parts.append(f"{sk.get('name', '')} ({sk.get('level', '')}): {sk.get('evidence', '')}")
        for exp in (profile.get("experience") or []):
            if isinstance(exp, dict):
                parts.append(f"{exp.get('title', '')} at {exp.get('company', '')} - {exp.get('description', '')}")
        for proj in (profile.get("projects") or []):
            if isinstance(proj, dict):
                parts.append(f"{proj.get('name', '')}: {proj.get('description', '')}")
        resume_text = "\n".join(parts) if parts else json.dumps(profile, default=str)[:8000]
    
    system_prompt = EVIDENCE_SYSTEM.format(n_requirements=n_requirements)
    user_prompt = f"""Requirements to evaluate:
{numbered_requirements}

Resume text:
{resume_text[:10000]}"""
    
    def attempt_extraction(retry_msg=""):
        response = deepseek_json.invoke([
            {"role": "system", "content": system_prompt + retry_msg},
            {"role": "user", "content": user_prompt},
        ])
        data = _parse_json_content(response.content)
        return data.get("evidence") or []
    
    try:
        raw = attempt_extraction()
        
        # Validate count — retry once if wrong
        if len(raw) != n_requirements and n_requirements > 0:
            retry_msg = f"\n\nIMPORTANT: You returned {len(raw)} items but I need EXACTLY {n_requirements}. Return one item per requirement."
            raw = attempt_extraction(retry_msg)
        
        # Build final evidence list — keep all items including "none" strength
        evidence = []
        for i, item in enumerate(raw):
            if not isinstance(item, dict):
                continue
            req_name = item.get("requirement") or (normalized[i].get("name") if i < len(normalized) else f"req_{i}")
            excerpt = str(item.get("resume_excerpt") or item.get("excerpt") or "").strip()
            strength = str(item.get("strength") or "none").lower()
            
            # Normalize strength to valid values
            if strength not in ("none", "weak", "moderate", "strong"):
                if "no" in strength or not excerpt or "no evidence" in excerpt.lower():
                    strength = "none"
                else:
                    strength = "weak"
            
            evidence.append({
                "requirement": req_name,
                "resume_excerpt": excerpt or "No evidence found in resume",
                "strength": strength,
            })
        
        # If we still don't have enough items, pad with "none" entries
        while len(evidence) < n_requirements:
            idx = len(evidence)
            if idx < len(normalized):
                evidence.append({
                    "requirement": normalized[idx].get("name") or f"req_{idx}",
                    "resume_excerpt": "No evidence found in resume",
                    "strength": "none",
                })
            else:
                break
        
        return {"evidence": evidence}
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
# ponytail: P0.4 technology-specific gap classification to avoid false "weak" for missing skills
def classify_gaps(state: GapState) -> dict:
    match = state.get("match_result") or {}
    req_scores = match.get("requirement_scores") or {}
    questions = {}
    names = list(req_scores.keys())[:15]
    for i, name in enumerate(names):
        score_data = req_scores[name]
        # Technology-specific classification — be explicit about what counts as evidence
        tech_q = _get_tech_specific_question(name, "must")
        if tech_q:
            instructions = (
                f"For requirement '{name}': {tech_q} "
                f"Score data: {score_data}. "
                f"If no explicit mention exists, classify as 'missing'. "
                f"If mentioned but shallow, classify as 'weak'. "
                f"If mentioned without proof of depth, classify as 'under-evidenced'."
            )
        else:
            instructions = f"For requirement '{name}' with score data {score_data}, classify the gap."
        questions[f"gap_{i}"] = Choice(
            instructions=instructions,
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

# ponytail: P1.2 cross-gap learning synthesis — cluster related gaps
RELATED_TECH_GROUPS = [
    {"group": "frontend-react", "techs": {"react", "next.js", "nextjs", "jsx", "hooks", "redux", "context"}},
    {"group": "frontend-vue", "techs": {"vue", "vuex", "nuxt", "vue.js"}},
    {"group": "typescript-js", "techs": {"typescript", "javascript", "es6", "node.js", "nodejs"}},
    {"group": "backend-python", "techs": {"python", "django", "flask", "fastapi", "celery"}},
    {"group": "backend-node", "techs": {"node.js", "nodejs", "express", "nestjs", "fastify"}},
    {"group": "cloud-aws", "techs": {"aws", "s3", "ec2", "lambda", "cloudfront", "rds", "dynamodb"}},
    {"group": "containers", "techs": {"docker", "kubernetes", "k8s", "helm", "containers"}},
    {"group": "databases-sql", "techs": {"sql", "postgresql", "mysql", "database", "postgres"}},
    {"group": "databases-nosql", "techs": {"mongodb", "mongo", "nosql", "redis", "dynamodb"}},
    {"group": "api-graphql", "techs": {"graphql", "apollo", "relay"}},
    {"group": "devops", "techs": {"ci/cd", "github actions", "jenkins", "terraform", "ansible"}},
]


def _cluster_gaps(gaps: list) -> list[list]:
    """Group related gaps that can be learned together."""
    if len(gaps) <= 2:
        return [[g] for g in gaps]  # No clustering needed for small sets
    
    # Map each gap to its tech group
    gap_groups = {}
    for i, gap in enumerate(gaps):
        req = str(gap.get("requirement", "")).lower()
        assigned = False
        for group_def in RELATED_TECH_GROUPS:
            if any(tech in req for tech in group_def["techs"]):
                group_name = group_def["group"]
                if group_name not in gap_groups:
                    gap_groups[group_name] = []
                gap_groups[group_name].append(gap)
                assigned = True
                break
        if not assigned:
            # Standalone gap
            gap_groups[f"standalone_{i}"] = [gap]
    
    # Merge small groups and return clusters
    clusters = []
    for group_name, group_gaps in gap_groups.items():
        if len(group_gaps) >= 2 or "standalone" not in group_name:
            clusters.append(group_gaps)
        else:
            clusters.append(group_gaps)
    
    return clusters


def cluster_gaps(state: CareerState) -> dict:
    """LangGraph node: Group related gaps for combined learning paths."""
    gaps = state.get("gaps") or []
    clusters = _cluster_gaps(gaps)
    return {"gap_clusters": clusters}


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


# ponytail: P1.2 cluster-aware project generation
CLUSTER_PROJECTS_SYSTEM = """You are X-CEED's project recommender.
Given a CLUSTER of related skill gaps, suggest ONE project that addresses ALL gaps in the cluster simultaneously.
Return JSON: {project: {name: string, description: string, technologies: string[], addresses_gaps: string[], why_combined: string}}.

Rules:
- The project MUST address every gap in the cluster
- Explain why learning these skills together is beneficial
- Make the project practical and portfolio-worthy
Valid JSON only."""


def suggest_projects(state: CareerState) -> dict:
    # ponytail: P1.2 generate projects per gap cluster
    clusters = state.get("gap_clusters") or _cluster_gaps(state.get("gaps") or [])
    all_projects = []
    errors = list(state.get("errors") or [])
    
    for cluster in clusters:
        if len(cluster) >= 2:
            # Multi-gap cluster — generate one combined project
            cluster_gaps = [g.get("requirement", str(g)) for g in cluster]
            try:
                response = deepseek_json.invoke([
                    {"role": "system", "content": CLUSTER_PROJECTS_SYSTEM},
                    {"role": "user", "content": json.dumps({
                        "cluster_gaps": cluster_gaps,
                        "target_role": state.get("target_role"),
                    }, default=str)},
                ])
                data = _parse_json_content(response.content)
                project = data.get("project") or {}
                if project:
                    project["cluster"] = cluster_gaps  # Mark as cluster project
                    all_projects.append(project)
            except Exception as e:
                errors.append(f"Cluster project generation failed: {e}")
        else:
            # Single gap — use original prompt
            gap = cluster[0] if cluster else {}
            gap_name = gap.get("requirement", str(gap))
            try:
                response = deepseek_json.invoke([
                    {"role": "system", "content": PROJECTS_SYSTEM},
                    {"role": "user", "content": json.dumps({
                        "gaps": [gap],
                        "target_role": state.get("target_role"),
                    }, default=str)},
                ])
                data = _parse_json_content(response.content)
                for proj in (data.get("projects") or []):
                    proj["cluster"] = [gap_name]  # Single-gap project
                    all_projects.append(proj)
            except Exception as e:
                errors.append(f"Project generation for {gap_name} failed: {e}")
    
    return {"projects": all_projects, "errors": errors}


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


# ponytail: P1.2 add cluster_gaps node to career graph
def _build_career_graph():
    g = StateGraph(CareerState)
    g.add_node("cluster_gaps", cluster_gaps)  # P1.2: group related gaps
    g.add_node("generate_objectives", generate_objectives)
    g.add_node("create_study_plan", create_study_plan)
    g.add_node("suggest_projects", suggest_projects)
    g.add_node("search_resources", search_youtube_resources)
    g.add_node("filter_resources", filter_resources)
    g.add_node("curate_resources", curate_final_resources)
    g.set_entry_point("cluster_gaps")  # Start with clustering
    g.add_edge("cluster_gaps", "generate_objectives")
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
# P1.3 Resume Version Diffing — helpers
# ---------------------------------------------------------------------------
def _resume_versions_collection():
    """MongoDB collection for lightweight resume version history."""
    db = get_db()
    return db["resume_versions"] if db is not None else None


def _get_previous_profile(user_id: str) -> dict | None:
    """Fetch most recent profile for a user."""
    col = _resume_versions_collection()
    if col is None:
        return None
    try:
        doc = col.find_one(
            {"user_id": user_id},
            sort=[("created_at", -1)]
        )
        return doc.get("profile") if doc else None
    except Exception as e:
        logger.warning(f"Failed to fetch previous profile: {e}")
        return None


def _save_resume_version(user_id: str, profile: dict, diff: dict | None = None):
    """Store a new resume version snapshot."""
    col = _resume_versions_collection()
    if col is None:
        return
    try:
        col.insert_one({
            "user_id": user_id,
            "profile": profile,
            "diff_from_previous": diff,
            "created_at": datetime.utcnow(),
        })
        # Keep only last 10 versions per user (lightweight)
        cursor = col.find({"user_id": user_id}, sort=[("created_at", -1)]).skip(10)
        old_ids = [doc["_id"] for doc in cursor]
        if old_ids:
            col.delete_many({"_id": {"$in": old_ids}})
    except Exception as e:
        logger.warning(f"Failed to save resume version: {e}")


def _extract_skill_names(skills: list) -> set:
    """Extract skill names from skills array."""
    names = set()
    for sk in (skills or []):
        if isinstance(sk, dict):
            names.add((sk.get("name") or "").lower().strip())
        elif isinstance(sk, str):
            names.add(sk.lower().strip())
    return {n for n in names if n}


def _extract_experience_keys(experience: list) -> dict:
    """Map experience entries by (title+company) for comparison."""
    entries = {}
    for exp in (experience or []):
        if isinstance(exp, dict):
            key = f"{(exp.get('title') or '').lower()}@{(exp.get('company') or '').lower()}"
            entries[key] = exp
    return entries


def _extract_project_keys(projects: list) -> dict:
    """Map projects by name for comparison."""
    entries = {}
    for proj in (projects or []):
        if isinstance(proj, dict):
            key = (proj.get("name") or "").lower().strip()
            if key:
                entries[key] = proj
    return entries


def compute_resume_diff(old_profile: dict, new_profile: dict) -> dict:
    """
    Compute structured diff between two resume profiles.
    Returns: {skills_added, skills_removed, experience_added, experience_updated, projects_added, summary}
    """
    old_skills = _extract_skill_names(old_profile.get("skills"))
    new_skills = _extract_skill_names(new_profile.get("skills"))
    
    old_exp = _extract_experience_keys(old_profile.get("experience"))
    new_exp = _extract_experience_keys(new_profile.get("experience"))
    
    old_proj = _extract_project_keys(old_profile.get("projects"))
    new_proj = _extract_project_keys(new_profile.get("projects"))
    
    skills_added = list(new_skills - old_skills)
    skills_removed = list(old_skills - new_skills)
    
    exp_added = [new_exp[k] for k in (set(new_exp.keys()) - set(old_exp.keys()))]
    exp_updated = []
    for k in set(old_exp.keys()) & set(new_exp.keys()):
        old_months = old_exp[k].get("duration_months", 0) or 0
        new_months = new_exp[k].get("duration_months", 0) or 0
        if new_months != old_months:
            exp_updated.append({
                "title": new_exp[k].get("title"),
                "company": new_exp[k].get("company"),
                "duration_change": new_months - old_months,
            })
    
    projects_added = [new_proj[k] for k in (set(new_proj.keys()) - set(old_proj.keys()))]
    
    # Generate summary
    changes = []
    if skills_added:
        changes.append(f"+{len(skills_added)} skills ({', '.join(skills_added[:3])}{'...' if len(skills_added) > 3 else ''})")
    if skills_removed:
        changes.append(f"-{len(skills_removed)} skills")
    if exp_added:
        changes.append(f"+{len(exp_added)} experience entries")
    if exp_updated:
        changes.append(f"{len(exp_updated)} experience updates")
    if projects_added:
        changes.append(f"+{len(projects_added)} projects")
    
    return {
        "skills_added": skills_added,
        "skills_removed": skills_removed,
        "experience_added": exp_added,
        "experience_updated": exp_updated,
        "projects_added": projects_added,
        "has_changes": bool(skills_added or skills_removed or exp_added or exp_updated or projects_added),
        "summary": "; ".join(changes) if changes else "No significant changes detected",
    }


def _get_user_matched_jobs(user_id: str, limit: int = 5) -> list:
    """Fetch recent jobs this user has matched against."""
    col = cache_collection()
    if col is None:
        return []
    try:
        # Look for cached match results for this user
        cursor = col.find(
            {"_id": {"$regex": f"^match:.*{user_id}"}},
            sort=[("created_at", -1)],
            limit=limit
        )
        # This is a simplified approach — in production you'd have a dedicated user_matches collection
        return list(cursor)
    except Exception:
        return []


async def _run_match_async(inputs: dict) -> dict:
    """Run match graph asynchronously (wraps sync invoke)."""
    import asyncio
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, lambda: match_app.invoke(inputs))


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
    user_id: Optional[str] = None  # P1.3: for version history
    previous_profile: Optional[dict] = None  # P1.3: include diff if provided


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


# ---------------------------------------------------------------------------
# P1.3 Resume Version Diffing
# ---------------------------------------------------------------------------
class ResumeDiffRequest(BaseModel):
    user_id: str
    new_resume_text: str
    previous_profile: Optional[dict] = None  # If not provided, fetches from DB
    rematch_jobs: Optional[list] = None  # Optional: job IDs or job data to re-match


# P1.4 Batch Matching
class BatchMatchRequest(BaseModel):
    candidate_profile: dict
    jobs: list  # List of job_requirements dicts
    weights: Optional[dict] = None
    concurrency: int = 3  # Max parallel matches


class BatchMatchCandidatesRequest(BaseModel):
    job_requirements: dict
    candidates: list  # List of candidate_profile dicts
    weights: Optional[dict] = None
    concurrency: int = 5  # Recruiter shortlist: parallel batches of 5


# ponytail: P0.5 health endpoint reports active model
@app.get("/health")
def health():
    llm_status = resilient_llm.get_status()
    return {
        "status": "ok",
        "deepseek": bool(DEEPSEEK_API_KEY),
        "jev": bool(TYPESAFE_API_KEY),
        "mongo": bool(MONGODB_URI),
        "active_model": llm_status["active_model"],
        "fallback_activations": llm_status["fallback_activations"],
        "youtube_keys_available": yt_key_rotator.has_keys(),
    }


@app.get("/")
def root():
    return {
        "service": "xceed-ai-core",
        "endpoints": [
            "/analyze", "/match", "/gap", "/career-plan", "/chat", "/health",
            "/resume/diff", "/resume/history/{user_id}",
            "/match/batch", "/match/batch/candidates", "/match/batch/stream",
            "/match/stream", "/career-plan/stream", "/chat/stream",
        ],
    }


@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    if not req.resume_text.strip():
        raise HTTPException(400, "resume_text required")
    result = cached_invoke(resume_app, {"raw_text": req.resume_text}, "resume")
    
    new_profile = {
        "skills": result.get("skills") or [],
        "experience": result.get("experience") or [],
        "education": result.get("education") or [],
        "projects": result.get("projects") or [],
        "communication_profile": result.get("communication_profile") or {},
        "skill_levels": result.get("skill_levels") or {},
        "raw_text": req.resume_text,
    }
    
    response = {
        "skills": new_profile["skills"],
        "experience": new_profile["experience"],
        "education": new_profile["education"],
        "projects": new_profile["projects"],
        "communication_profile": new_profile["communication_profile"],
        "skill_levels": new_profile["skill_levels"],
        "errors": result.get("errors") or [],
    }
    
    # P1.3: Include diff when user_id or previous_profile is provided
    diff = None
    if req.user_id or req.previous_profile:
        old_profile = req.previous_profile or (_get_previous_profile(req.user_id) if req.user_id else None)
        if old_profile:
            diff = compute_resume_diff(old_profile, new_profile)
            response["diff"] = diff
        if req.user_id:
            _save_resume_version(req.user_id, new_profile, diff)
    
    return response


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
        "confidence_intervals": result.get("confidence_intervals"),  # P1.6
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


# ---------------------------------------------------------------------------
# P1.3 Resume Version Diffing — endpoints
# ---------------------------------------------------------------------------
@app.post("/resume/diff")
def resume_diff(req: ResumeDiffRequest):
    """Compute structured diff between new resume and previous version."""
    if not req.new_resume_text.strip():
        raise HTTPException(400, "new_resume_text required")
    
    new_result = resume_app.invoke({"raw_text": req.new_resume_text})
    new_profile = {
        "skills": new_result.get("skills") or [],
        "experience": new_result.get("experience") or [],
        "education": new_result.get("education") or [],
        "projects": new_result.get("projects") or [],
        "communication_profile": new_result.get("communication_profile") or {},
        "skill_levels": new_result.get("skill_levels") or {},
        "raw_text": req.new_resume_text,
    }
    
    old_profile = req.previous_profile or _get_previous_profile(req.user_id)
    if not old_profile:
        _save_resume_version(req.user_id, new_profile, None)
        return {"diff": None, "message": "First resume version recorded", "new_profile": new_profile, "rematch_results": None}
    
    diff = compute_resume_diff(old_profile, new_profile)
    _save_resume_version(req.user_id, new_profile, diff)
    
    rematch_results = None
    if req.rematch_jobs and diff.get("has_changes"):
        rematch_results = []
        weights = {"skills": 0.35, "experience": 0.25, "education": 0.15, "projects": 0.15, "communication": 0.10}
        for job in req.rematch_jobs[:5]:
            job_data = job if isinstance(job, dict) else {"requirements": [job]}
            old_match = match_app.invoke({"candidate_profile": old_profile, "job_requirements": job_data, "weights": weights})
            new_match = match_app.invoke({"candidate_profile": new_profile, "job_requirements": job_data, "weights": weights})
            old_score, new_score = old_match.get("overall_score", 0), new_match.get("overall_score", 0)
            delta = round(new_score - old_score, 1)
            rematch_results.append({
                "job_title": job_data.get("title") or "Job",
                "old_score": old_score, "new_score": new_score, "delta": delta,
                "message": f"Score {'improved' if delta > 0 else 'decreased' if delta < 0 else 'unchanged'} {old_score} -> {new_score}",
            })
    
    return {"diff": diff, "new_profile": new_profile, "rematch_results": rematch_results, "user_id": req.user_id}


@app.get("/resume/history/{user_id}")
def resume_history(user_id: str, limit: int = 5):
    """Get resume version history for a user."""
    col = _resume_versions_collection()
    if col is None:
        return {"versions": [], "error": "MongoDB not configured"}
    try:
        cursor = col.find({"user_id": user_id}, sort=[("created_at", -1)], limit=limit)
        versions = [{
            "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else None,
            "diff": doc.get("diff_from_previous"),
            "skills_count": len(doc.get("profile", {}).get("skills", [])),
        } for doc in cursor]
        return {"versions": versions, "total": len(versions)}
    except Exception as e:
        return {"versions": [], "error": str(e)}


# ---------------------------------------------------------------------------
# P1.4 Batch Matching — endpoints
# ---------------------------------------------------------------------------
import asyncio


async def _batch_match_worker(candidate_profile: dict, job: dict, weights: dict, job_index: int) -> dict:
    """Single match worker for batch processing."""
    try:
        result = await _run_match_async({"candidate_profile": candidate_profile, "job_requirements": job, "weights": weights})
        return {"index": job_index, "job_title": job.get("title") or f"Job {job_index+1}",
                "overall_score": result.get("overall_score"), "component_scores": result.get("component_scores"),
                "confidence": result.get("confidence"), "explanation": result.get("explanation"),
                "evidence": result.get("evidence"), "success": True}
    except Exception as e:
        return {"index": job_index, "job_title": job.get("title") or f"Job {job_index+1}", "success": False, "error": str(e)}


async def _batch_match_candidates_worker(candidate: dict, job_requirements: dict, weights: dict, idx: int) -> dict:
    """Single match worker for candidate batch processing."""
    try:
        result = await _run_match_async({"candidate_profile": candidate, "job_requirements": job_requirements, "weights": weights})
        return {"index": idx, "candidate_name": candidate.get("name") or f"Candidate {idx+1}",
                "overall_score": result.get("overall_score"), "component_scores": result.get("component_scores"),
                "confidence": result.get("confidence"), "explanation": result.get("explanation"),
                "evidence": result.get("evidence"), "success": True}
    except Exception as e:
        return {"index": idx, "candidate_name": candidate.get("name") or f"Candidate {idx+1}", "success": False, "error": str(e)}


@app.post("/match/batch")
async def match_batch(req: BatchMatchRequest):
    """Match one candidate against multiple jobs with parallel execution."""
    if not req.jobs:
        raise HTTPException(400, "jobs list required")
    weights = req.weights or {"skills": 0.35, "experience": 0.25, "education": 0.15, "projects": 0.15, "communication": 0.10}
    concurrency = min(max(req.concurrency, 1), 10)
    semaphore = asyncio.Semaphore(concurrency)
    
    async def limited_worker(job: dict, idx: int):
        async with semaphore:
            return await _batch_match_worker(req.candidate_profile, job, weights, idx)
    
    results = await asyncio.gather(*[limited_worker(job, i) for i, job in enumerate(req.jobs)])
    successful = sorted([r for r in results if r.get("success")], key=lambda x: x.get("overall_score", 0), reverse=True)
    return {"results": successful, "failed": [r for r in results if not r.get("success")], "total": len(req.jobs), "completed": len(successful)}


@app.post("/match/batch/candidates")
async def match_batch_candidates(req: BatchMatchCandidatesRequest):
    """Match multiple candidates against one job (recruiter shortlist)."""
    if not req.candidates:
        raise HTTPException(400, "candidates list required")
    weights = req.weights or {"skills": 0.35, "experience": 0.25, "education": 0.15, "projects": 0.15, "communication": 0.10}
    concurrency = min(max(req.concurrency, 1), 10)
    semaphore = asyncio.Semaphore(concurrency)
    
    async def limited_worker(candidate: dict, idx: int):
        async with semaphore:
            return await _batch_match_candidates_worker(candidate, req.job_requirements, weights, idx)
    
    results = await asyncio.gather(*[limited_worker(c, i) for i, c in enumerate(req.candidates)])
    successful = sorted([r for r in results if r.get("success")], key=lambda x: x.get("overall_score", 0), reverse=True)
    for rank, r in enumerate(successful, 1):
        r["rank"] = rank
    return {"results": successful, "failed": [r for r in results if not r.get("success")],
            "total": len(req.candidates), "completed": len(successful), "top_candidates": successful[:10]}


@app.post("/match/batch/stream")
async def match_batch_stream(req: BatchMatchRequest):
    """Streaming batch match — sends results as SSE events as each completes."""
    if not req.jobs:
        raise HTTPException(400, "jobs list required")
    weights = req.weights or {"skills": 0.35, "experience": 0.25, "education": 0.15, "projects": 0.15, "communication": 0.10}
    concurrency = min(max(req.concurrency, 1), 10)
    
    async def event_generator():
        try:
            yield f"data: {json.dumps({'type': 'start', 'data': {'total': len(req.jobs), 'concurrency': concurrency}})}\n\n"
            completed, failed = [], []
            semaphore = asyncio.Semaphore(concurrency)
            
            async def worker(job: dict, idx: int):
                async with semaphore:
                    return await _batch_match_worker(req.candidate_profile, job, weights, idx)
            
            tasks = [asyncio.create_task(worker(job, i)) for i, job in enumerate(req.jobs)]
            for coro in asyncio.as_completed(tasks):
                result = await coro
                if result.get("success"):
                    completed.append(result)
                    yield f"data: {json.dumps({'type': 'result', 'data': result})}\n\n"
                else:
                    failed.append(result)
                    yield f"data: {json.dumps({'type': 'error', 'data': result})}\n\n"
            
            completed.sort(key=lambda x: x.get("overall_score", 0), reverse=True)
            yield f"data: {json.dumps({'type': 'complete', 'data': {'results': completed, 'failed': failed, 'total': len(req.jobs), 'completed': len(completed)}})}\n\n"
        except Exception as e:
            logger.error(f"Batch stream error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'data': str(e)})}\n\n"
    
    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# P0.3 Streaming endpoints — SSE for progressive rendering
# ---------------------------------------------------------------------------

@app.post("/match/stream")
async def match_stream(req: MatchRequest):
    """Streaming match — sends scores/evidence first, then streams explanation."""
    
    async def event_generator():
        try:
            inputs = {
                "candidate_profile": req.candidate_profile,
                "job_requirements": req.job_requirements,
                "weights": req.weights or {
                    "skills": 0.35, "experience": 0.25, "education": 0.15, "projects": 0.15, "communication": 0.10,
                },
            }
            
            # Run graph synchronously (Jev + evidence extraction)
            result = match_app.invoke(inputs)
            
            # Send scores immediately
            scores_data = {
                "overall_score": result.get("overall_score"),
                "component_scores": result.get("component_scores"),
                "confidence": result.get("confidence"),
            }
            yield f"data: {json.dumps({'type': 'scores', 'data': scores_data})}\n\n"
            
            # Send evidence
            evidence_data = result.get("evidence") or []
            yield f"data: {json.dumps({'type': 'evidence', 'data': evidence_data})}\n\n"
            
            # Send explanation (already generated by graph)
            explanation = result.get("explanation") or ""
            # Stream explanation in chunks for progressive rendering
            chunk_size = 50
            for i in range(0, len(explanation), chunk_size):
                chunk = explanation[i:i+chunk_size]
                yield f"data: {json.dumps({'type': 'explanation_chunk', 'data': chunk})}\n\n"
            
            # Send complete signal
            yield f"data: {json.dumps({'type': 'complete', 'data': result})}\n\n"
            
        except Exception as e:
            logger.error(f"Match stream error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'data': str(e)})}\n\n"
    
    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/career-plan/stream")
async def career_plan_stream(req: CareerRequest):
    """Streaming career plan — sends objectives first, then modules progressively."""
    
    async def event_generator():
        try:
            if not yt_key_rotator.has_keys():
                yield f"data: {json.dumps({'type': 'error', 'data': 'No YouTube API keys available'})}\n\n"
                return
            
            inputs = {"gaps": req.gaps, "target_role": req.target_role}
            
            # Run graph synchronously
            result = career_app.invoke(inputs)
            
            # Send objectives
            objectives = result.get("objectives") or []
            yield f"data: {json.dumps({'type': 'objectives', 'data': objectives})}\n\n"
            
            # Send study plan
            study_plan = result.get("study_plan") or {}
            yield f"data: {json.dumps({'type': 'study_plan', 'data': study_plan})}\n\n"
            
            # Send projects
            projects = result.get("projects") or []
            yield f"data: {json.dumps({'type': 'projects', 'data': projects})}\n\n"
            
            # Stream modules one at a time
            modules = result.get("modules") or []
            for module in modules:
                yield f"data: {json.dumps({'type': 'module', 'data': module})}\n\n"
            
            # Send complete
            yield f"data: {json.dumps({'type': 'complete', 'data': result})}\n\n"
            
        except Exception as e:
            logger.error(f"Career plan stream error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'data': str(e)})}\n\n"
    
    return StreamingResponse(event_generator(), media_type="text/event-stream")


JOB_EXTRACT_SYSTEM = """Extract the technical and professional requirements from this job description.
Return a JSON object with:
- requirements: array of {description: string, priority: "must_have"|"nice_to_have"}
  - must_have: explicitly stated as required, mandatory, must have, minimum
  - nice_to_have: stated as preferred, bonus, nice to have, ideal, plus
  - Extract specific technologies, years of experience, skills, education, certifications
  - Keep each requirement to ONE skill or qualification per item
  - Typically 6-12 requirements per job
- evaluationWeights: {skills: float, experience: float, education: float, projects: float, communication: float}
  - Weights must sum to 1.0
  - Weight skills higher (0.35-0.45) for technical roles
  - Weight experience higher (0.30-0.40) for senior roles
  - Weight education lower (0.05-0.10) for roles that say "or equivalent experience"
  - Infer appropriate weights from the job description's emphasis

Return valid JSON only."""


class JobExtractRequest(BaseModel):
    description: str = Field(..., min_length=20)


@app.post("/extract-job-requirements")
async def extract_job_requirements(req: JobExtractRequest):
    """Extract requirements + evaluationWeights from a JD (cached in ai_cache)."""
    description = (req.description or "").strip()
    if not description:
        raise HTTPException(status_code=400, detail="description required")

    cache_key = "jobreq:" + hashlib.sha256(description.encode()).hexdigest()
    col = cache_collection()
    if col is not None:
        cached = col.find_one({"_id": cache_key})
        if cached and cached.get("result"):
            return cached["result"]

    default_weights = {
        "skills": 0.35,
        "experience": 0.25,
        "education": 0.15,
        "projects": 0.15,
        "communication": 0.10,
    }
    default_result = {
        "requirements": [],
        "evaluationWeights": default_weights,
    }

    try:
        response = await resilient_llm.ainvoke(
            [
                {"role": "system", "content": JOB_EXTRACT_SYSTEM},
                {
                    "role": "user",
                    "content": f"Job description:\n\n{description[:3000]}",
                },
            ],
            json_mode=True,
        )
        result = _parse_json_content(response.content)
        if not isinstance(result, dict):
            result = default_result

        requirements = result.get("requirements") or []
        cleaned = []
        for r in requirements:
            if isinstance(r, str):
                cleaned.append({"description": r, "priority": "must_have"})
            elif isinstance(r, dict) and r.get("description"):
                pri = str(r.get("priority") or "must_have").lower()
                if pri not in ("must_have", "nice_to_have"):
                    pri = "must_have"
                cleaned.append({"description": str(r["description"]), "priority": pri})
        result["requirements"] = cleaned[:20]

        weights = result.get("evaluationWeights") or dict(default_weights)
        keys = ["skills", "experience", "education", "projects", "communication"]
        weights = {k: float(weights.get(k, default_weights[k])) for k in keys}
        total = sum(weights.values()) or 1.0
        if abs(total - 1.0) > 0.01:
            weights = {k: round(v / total, 2) for k, v in weights.items()}
            # fix rounding drift on last key
            drift = round(1.0 - sum(weights.values()), 2)
            weights["communication"] = round(weights["communication"] + drift, 2)
        result["evaluationWeights"] = weights

        if col is not None:
            col.update_one(
                {"_id": cache_key},
                {"$set": {"result": result, "created_at": datetime.utcnow()}},
                upsert=True,
            )
        return result
    except Exception as e:
        logger.error(f"extract-job-requirements failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    """Streaming chat — sends tokens as they arrive."""
    
    async def event_generator():
        try:
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
            
            # Stream tokens via resilient_llm
            full_content = ""
            async for chunk in resilient_llm.astream(messages):
                content = chunk.content if hasattr(chunk, 'content') else str(chunk)
                if content:
                    full_content += content
                    yield f"data: {json.dumps({'type': 'token', 'data': content})}\n\n"
            
            yield f"data: {json.dumps({'type': 'complete', 'data': {'reply': full_content}})}\n\n"
            
        except Exception as e:
            logger.error(f"Chat stream error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'data': str(e)})}\n\n"
    
    return StreamingResponse(event_generator(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
