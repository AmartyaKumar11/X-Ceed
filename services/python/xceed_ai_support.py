"""
X-CEED AI Support — stateless FastAPI (port 8001).
DeepSeek only. Quiz, mock interview, video helpers, YouTube curate.
No mocks / no silent fallbacks — failures surface as HTTP errors.
"""
from __future__ import annotations

import json
import os
import re
import uuid
from datetime import datetime
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
load_dotenv(os.path.join(_ROOT, ".env.local"))
load_dotenv()

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3002")
MONGODB_URI = os.getenv("MONGODB_URI", "")

if not DEEPSEEK_API_KEY:
    print("WARNING: DEEPSEEK_API_KEY missing — AI Support endpoints will 503")

deepseek = ChatOpenAI(
    model="deepseek-chat",
    base_url="https://api.deepseek.com",
    api_key=DEEPSEEK_API_KEY or "missing",
    temperature=0.3,
)

deepseek_json = ChatOpenAI(
    model="deepseek-chat",
    base_url="https://api.deepseek.com",
    api_key=DEEPSEEK_API_KEY or "missing",
    temperature=0.2,
    model_kwargs={"response_format": {"type": "json_object"}},
)

# Higher temperature for unique quizzes each run
deepseek_quiz = ChatOpenAI(
    model="deepseek-chat",
    base_url="https://api.deepseek.com",
    api_key=DEEPSEEK_API_KEY or "missing",
    temperature=0.85,
    model_kwargs={"response_format": {"type": "json_object"}},
)

app = FastAPI(title="X-CEED AI Support", version="2.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:3002", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _require_deepseek():
    if not DEEPSEEK_API_KEY:
        raise HTTPException(503, "DEEPSEEK_API_KEY not configured")


def _parse_json(content: str) -> dict:
    content = (content or "").strip()
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*", "", content)
        content = re.sub(r"\s*```$", "", content)
    return json.loads(content)


def _mongo():
    if not MONGODB_URI:
        return None
    from pymongo import MongoClient
    client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=8000, tlsAllowInvalidCertificates=True)
    return client.get_default_database() if "/" in MONGODB_URI else client["x-ceed-db"]


class QuizGenerateRequest(BaseModel):
    topic: str
    difficulty: str = "medium"
    num_questions: int = 5
    question_count: Optional[int] = None
    transcript: Optional[str] = None
    context: Optional[str] = None
    user_id: Optional[str] = None


class QuizSubmitRequest(BaseModel):
    quiz_id: Optional[str] = None
    questions: list
    answers: list
    topic: Optional[str] = None
    user_id: Optional[str] = None


class MockQuestionRequest(BaseModel):
    role: Optional[str] = None
    interview_type: str = "mixed"
    question_number: int = 1
    previous_qa_pairs: list = Field(default_factory=list)
    job_description: Optional[str] = None
    resume_text: Optional[str] = None
    previous_questions: list = Field(default_factory=list)  # legacy


class MockAnalyzeRequest(BaseModel):
    question: Optional[str] = None
    answer: Optional[str] = None
    role: Optional[str] = None
    interview_type: str = "mixed"
    job_description: Optional[str] = None
    questions: list = Field(default_factory=list)  # legacy batch
    answers: list = Field(default_factory=list)


class MockReportRequest(BaseModel):
    role: str
    interview_type: str = "mixed"
    qa_pairs: list
    job_description: Optional[str] = None


class VideoChatRequest(BaseModel):
    message: Optional[str] = None
    question: Optional[str] = None
    transcript: Optional[str] = None
    video_title: Optional[str] = None
    video_id: Optional[str] = None
    history: list = Field(default_factory=list)
    chat_history: list = Field(default_factory=list)


class VideoNotesRequest(BaseModel):
    transcript: Optional[str] = None
    video_title: Optional[str] = None
    video_id: Optional[str] = None


class VideoClipsRequest(BaseModel):
    transcript: str
    topic: Optional[str] = None


class VideoTranscriptRequest(BaseModel):
    video_id: str


class YoutubeCurateRequest(BaseModel):
    skill: str
    difficulty: str = "intermediate"
    max_results: int = 6
    classification: Optional[str] = None


@app.get("/health")
def health():
    return {"status": "ok", "deepseek": bool(DEEPSEEK_API_KEY), "youtube": bool(YOUTUBE_API_KEY)}


@app.get("/")
def root():
    return {
        "service": "xceed-ai-support",
        "port": 8001,
        "endpoints": [
            "/quiz/generate", "/quiz/submit",
            "/mock-interview/question", "/mock-interview/analyze", "/mock-interview/report",
            "/video/transcript", "/video/notes", "/video/chat", "/video/clips",
            "/youtube/curate", "/parse-job-description", "/health",
        ],
    }


@app.post("/quiz/generate")
def quiz_generate(req: QuizGenerateRequest):
    _require_deepseek()
    n = req.question_count or req.num_questions or 5
    system = """You generate unique educational quizzes. NEVER reuse stock questions.
Return JSON:
{questions: [{id: int, question: string, options: string[4], correct_index: int (0-3),
  explanation: string,
  wrong_explanations: string[4]  // why each option is wrong; for correct index say "This is correct because ..."
}]}
Rules:
- Exactly 4 options, exactly one correct_index
- Prefer scenario-based questions that test understanding
- wrong_explanations[i] must explain option i
- Valid JSON only. Make questions distinct from common textbook examples."""
    user = (
        f"Topic: {req.topic}\nDifficulty: {req.difficulty}\nNum questions: {n}\n"
        f"Nonce: {uuid.uuid4()} — generate a fresh unique set."
    )
    if req.context:
        user += f"\nLearner context / prep plan:\n{req.context[:4000]}"
    if req.transcript:
        user += f"\nTranscript excerpt:\n{req.transcript[:5000]}"
    try:
        r = deepseek_quiz.invoke([
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ])
        data = _parse_json(r.content)
        questions = data.get("questions") or []
        if not questions:
            raise ValueError("Empty questions from model")
        quiz_id = str(uuid.uuid4())
        payload = {
            "quiz_id": quiz_id,
            "topic": req.topic,
            "difficulty": req.difficulty,
            "questions": questions,
            "created_at": datetime.utcnow().isoformat(),
        }
        try:
            db = _mongo()
            if db is not None:
                db.quizzes.insert_one({**payload, "user_id": req.user_id})
        except Exception as e:
            print("quiz persist warn:", e)
        return payload
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Quiz generation failed: {e}")


@app.post("/quiz/submit")
def quiz_submit(req: QuizSubmitRequest):
    _require_deepseek()
    if not req.questions:
        raise HTTPException(400, "questions required")
    details = []
    correct = 0
    weak = []
    for i, q in enumerate(req.questions):
        expected = q.get("correct_index")
        ans = req.answers[i] if i < len(req.answers) else None
        ok = ans == expected
        if ok:
            correct += 1
        else:
            weak.append(q.get("question") or f"Q{i+1}")
        wrong_ex = q.get("wrong_explanations") or []
        details.append({
            "id": q.get("id", i),
            "question": q.get("question"),
            "correct": ok,
            "user_answer": ans,
            "correct_answer": expected,
            "correct_option": (q.get("options") or [None] * 4)[expected] if isinstance(expected, int) else None,
            "user_option": (q.get("options") or [None] * 4)[ans] if isinstance(ans, int) else ans,
            "explanation": q.get("explanation"),
            "why_wrong": wrong_ex[ans] if isinstance(ans, int) and ans < len(wrong_ex) and not ok else None,
            "option_explanations": wrong_ex,
        })
    total = max(len(req.questions), 1)
    score = round(100 * correct / total, 1)

    # DeepSeek weak-area summary
    suggested = []
    try:
        r = deepseek_json.invoke([
            {"role": "system", "content": "Return JSON: {weak_areas: string[], suggested_topics: string[], summary: string}"},
            {"role": "user", "content": json.dumps({
                "topic": req.topic,
                "missed": weak,
                "details": [{"q": d["question"], "correct": d["correct"]} for d in details],
            }, default=str)},
        ])
        meta = _parse_json(r.content)
        suggested = meta.get("suggested_topics") or []
        weak_areas = meta.get("weak_areas") or weak
        summary = meta.get("summary") or ""
    except Exception:
        weak_areas = weak
        summary = ""

    result = {
        "quiz_id": req.quiz_id,
        "score": score,
        "correct": correct,
        "total": total,
        "details": details,
        "weak_areas": weak_areas,
        "suggested_topics": suggested,
        "summary": summary,
    }
    try:
        db = _mongo()
        if db is not None:
            db.quiz_results.insert_one({
                **result,
                "user_id": req.user_id,
                "topic": req.topic,
                "submitted_at": datetime.utcnow(),
            })
    except Exception as e:
        print("quiz result persist warn:", e)
    return result


@app.post("/mock-interview/question")
def mock_question(req: MockQuestionRequest):
    _require_deepseek()
    role = req.role or "Software Engineer"
    itype = req.interview_type or "mixed"
    prev = req.previous_qa_pairs or []
    if not prev and req.previous_questions:
        prev = [{"question": q, "answer": "", "score": None} for q in req.previous_questions]

    system = """You are a rigorous interviewer. Generate ONE interview question.
Return JSON: {question: string, type: "behavioral"|"technical"|"system_design", tip: string, probes_weakness: boolean}.
Rules:
- Adapt to previous_qa_pairs: if the last answer was weak/low-score/vague, ask a follow-up that probes the SAME weakness.
- If the last answer was strong, escalate difficulty.
- Do not repeat previous questions.
- Match interview_type.
Valid JSON only."""
    try:
        r = deepseek_json.invoke([
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps({
                "role": role,
                "interview_type": itype,
                "question_number": req.question_number,
                "job_description": (req.job_description or "")[:6000],
                "resume_text": (req.resume_text or "")[:3000],
                "previous_qa_pairs": prev[-8:],
            }, default=str)},
        ])
        data = _parse_json(r.content)
        if not data.get("question"):
            raise ValueError("No question in model response")
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Question generation failed: {e}")


@app.post("/mock-interview/analyze")
def mock_analyze(req: MockAnalyzeRequest):
    _require_deepseek()
    # Single Q&A mode (preferred)
    if req.question and req.answer is not None:
        system = """Evaluate one interview answer.
Return JSON:
{score: number (1-10), strengths: string[], weaknesses: string[],
 strong_answer_would_include: string[], follow_up: string, notes: string}.
Valid JSON only."""
        try:
            r = deepseek_json.invoke([
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps({
                    "role": req.role,
                    "interview_type": req.interview_type,
                    "job_description": (req.job_description or "")[:3000],
                    "question": req.question,
                    "answer": req.answer,
                }, default=str)},
            ])
            return _parse_json(r.content)
        except Exception as e:
            raise HTTPException(500, f"Answer analysis failed: {e}")

    # Legacy batch mode
    if not req.questions:
        raise HTTPException(400, "question+answer or questions+answers required")
    system = """Evaluate interview answers.
Return JSON: {overall_score: number, feedback: string, per_answer: [{question: string, score: number, notes: string}]}.
Valid JSON only."""
    try:
        r = deepseek_json.invoke([
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps({
                "job_description": (req.job_description or "")[:4000],
                "qa": [{"q": q, "a": a} for q, a in zip(req.questions, req.answers)],
            }, default=str)},
        ])
        return _parse_json(r.content)
    except Exception as e:
        raise HTTPException(500, f"Batch analysis failed: {e}")


@app.post("/mock-interview/report")
def mock_report(req: MockReportRequest):
    _require_deepseek()
    system = """Write a comprehensive mock interview report.
Return JSON:
{overall_score: number (1-10),
 strengths_demonstrated: string[],
 weaknesses_to_work_on: string[],
 topics_to_revise: string[],
 interviewer_expectations: string,
 summary: string}.
Valid JSON only."""
    try:
        r = deepseek_json.invoke([
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps({
                "role": req.role,
                "interview_type": req.interview_type,
                "job_description": (req.job_description or "")[:4000],
                "qa_pairs": req.qa_pairs,
            }, default=str)},
        ])
        return _parse_json(r.content)
    except Exception as e:
        raise HTTPException(500, f"Report generation failed: {e}")


def _fetch_transcript(video_id: str) -> str:
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except ImportError as e:
        raise HTTPException(503, f"youtube-transcript-api not installed: {e}")
    try:
        # newer API
        if hasattr(YouTubeTranscriptApi, "get_transcript"):
            parts = YouTubeTranscriptApi.get_transcript(video_id)
        else:
            api = YouTubeTranscriptApi()
            parts = api.fetch(video_id)
            parts = [{"text": p.text if hasattr(p, "text") else p.get("text", ""), "start": getattr(p, "start", 0)} for p in parts]
        lines = []
        for p in parts:
            text = p.get("text") if isinstance(p, dict) else getattr(p, "text", "")
            start = p.get("start") if isinstance(p, dict) else getattr(p, "start", 0)
            lines.append(f"[{int(start)//60}:{int(start)%60:02d}] {text}")
        text = "\n".join(lines).strip()
        if not text:
            raise ValueError("Empty transcript")
        return text
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Transcript fetch failed for {video_id}: {e}")


@app.post("/video/transcript")
def video_transcript(req: VideoTranscriptRequest):
    if not req.video_id:
        raise HTTPException(400, "video_id required")
    text = _fetch_transcript(req.video_id)
    return {"video_id": req.video_id, "transcript": text, "length": len(text)}


@app.post("/video/notes")
def video_notes(req: VideoNotesRequest):
    _require_deepseek()
    transcript = req.transcript or ""
    if not transcript and req.video_id:
        transcript = _fetch_transcript(req.video_id)
    if not transcript.strip():
        raise HTTPException(400, "transcript or video_id required")
    system = """Create structured study notes from a video transcript.
Return JSON:
{summary: string (3-5 sentences),
 key_concepts: string[],
 timestamps: [{time: string, topic: string}],
 action_items: string[],
 title: string}.
Use timestamps from the transcript markers when present.
Valid JSON only."""
    try:
        r = deepseek_json.invoke([
            {"role": "system", "content": system},
            {"role": "user", "content": f"Title: {req.video_title or 'Video'}\n\n{transcript[:12000]}"},
        ])
        data = _parse_json(r.content)
        # also expose a flat notes string for older UI
        notes_md = (
            f"## Summary\n{data.get('summary','')}\n\n"
            f"## Key concepts\n" + "\n".join(f"- {c}" for c in (data.get("key_concepts") or [])) + "\n\n"
            f"## Timestamps\n" + "\n".join(
                f"- {t.get('time')}: {t.get('topic')}" for t in (data.get("timestamps") or [])
            ) + "\n\n"
            f"## Action items\n" + "\n".join(f"- {a}" for a in (data.get("action_items") or []))
        )
        data["notes"] = notes_md
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Notes generation failed: {e}")


@app.post("/video/chat")
def video_chat(req: VideoChatRequest):
    _require_deepseek()
    question = req.message or req.question
    if not question:
        raise HTTPException(400, "message/question required")
    transcript = req.transcript or ""
    if not transcript and req.video_id:
        transcript = _fetch_transcript(req.video_id)
    if not transcript.strip():
        raise HTTPException(400, "transcript required — cannot answer without video grounding")

    history = req.history or req.chat_history or []
    system = (
        "You answer questions ONLY using the provided video transcript. "
        "If the transcript does not contain the answer, say you cannot find it in this video. "
        "Do not invent content from general knowledge."
    )
    messages = [
        {"role": "system", "content": system},
        *[{"role": m.get("role", "user"), "content": m.get("content", "")} for m in history[-8:]],
        {"role": "user", "content": f"Title: {req.video_title or 'video'}\nTranscript:\n{transcript[:9000]}\n\nQuestion: {question}"},
    ]
    try:
        r = deepseek.invoke(messages)
        return {"reply": r.content, "response": r.content}
    except Exception as e:
        raise HTTPException(500, f"Video chat failed: {e}")


@app.post("/video/clips")
def video_clips(req: VideoClipsRequest):
    _require_deepseek()
    system = """Suggest the most important clips from a transcript.
Return JSON: {clips: [{start_sec: int, end_sec: int, label: string, reason: string}]}.
Valid JSON only."""
    try:
        r = deepseek_json.invoke([
            {"role": "system", "content": system},
            {"role": "user", "content": f"Topic focus: {req.topic}\n\n{req.transcript[:10000]}"},
        ])
        return _parse_json(r.content)
    except Exception as e:
        raise HTTPException(500, f"Clip suggestion failed: {e}")


@app.post("/parse-job-description")
async def parse_job_description(file: UploadFile = File(...)):
    raw = await file.read()
    name = (file.filename or "").lower()
    text = ""
    try:
        if name.endswith(".pdf") or (file.content_type or "").endswith("pdf"):
            import io
            import pdfplumber
            with pdfplumber.open(io.BytesIO(raw)) as pdf:
                text = "\n".join((p.extract_text() or "") for p in pdf.pages)
        else:
            text = raw.decode("utf-8", errors="ignore")
    except Exception as e:
        raise HTTPException(400, f"Failed to parse file: {e}")
    return {"text": text.strip(), "filename": file.filename}


@app.post("/youtube/curate")
def youtube_curate(req: YoutubeCurateRequest):
    if not YOUTUBE_API_KEY:
        raise HTTPException(503, "YOUTUBE_API_KEY not configured")
    level = (req.classification or req.difficulty or "intermediate").lower()
    if "miss" in level or level == "beginner":
        q = f"{req.skill} beginner tutorial crash course"
    elif "under" in level or "evidence" in level:
        q = f"build {req.skill} portfolio project hands-on"
    elif "weak" in level or level == "advanced":
        q = f"{req.skill} advanced techniques best practices"
    else:
        q = f"{req.skill} {req.difficulty} tutorial"
    try:
        r = httpx.get(
            "https://www.googleapis.com/youtube/v3/search",
            params={
                "part": "snippet",
                "q": q,
                "type": "video",
                "maxResults": min(req.max_results, 15),
                "key": YOUTUBE_API_KEY,
            },
            timeout=20.0,
        )
        r.raise_for_status()
        videos = []
        for it in r.json().get("items", []):
            vid = (it.get("id") or {}).get("videoId")
            if not vid:
                continue
            videos.append({
                "title": it["snippet"]["title"],
                "url": f"https://www.youtube.com/watch?v={vid}",
                "video_id": vid,
                "channel": it["snippet"].get("channelTitle"),
                "thumbnail": (it["snippet"].get("thumbnails") or {}).get("medium", {}).get("url"),
                "skill": req.skill,
                "difficulty": req.difficulty,
            })
        if not videos:
            raise HTTPException(502, "YouTube returned zero videos")
        return {"videos": videos, "query": q}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
