"""
X-CEED AI Support — stateless FastAPI (port 8001).
DeepSeek only. Quiz, mock interview, video helpers, YouTube curate.
"""
from __future__ import annotations

import json
import os
import re
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

app = FastAPI(title="X-CEED AI Support", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:3002", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _parse_json(content: str) -> dict:
    content = content.strip()
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*", "", content)
        content = re.sub(r"\s*```$", "", content)
    return json.loads(content)


class QuizGenerateRequest(BaseModel):
    topic: str
    difficulty: str = "medium"
    num_questions: int = 5
    transcript: Optional[str] = None


class QuizSubmitRequest(BaseModel):
    questions: list
    answers: list  # list of selected option indices or strings


class MockQuestionRequest(BaseModel):
    job_description: str
    resume_text: Optional[str] = None
    previous_questions: list = Field(default_factory=list)


class MockAnalyzeRequest(BaseModel):
    job_description: str
    questions: list
    answers: list


class VideoChatRequest(BaseModel):
    message: str
    transcript: Optional[str] = None
    video_title: Optional[str] = None
    history: list = Field(default_factory=list)


class VideoNotesRequest(BaseModel):
    transcript: str
    video_title: Optional[str] = None


class VideoClipsRequest(BaseModel):
    transcript: str
    topic: Optional[str] = None


class YoutubeCurateRequest(BaseModel):
    skill: str
    difficulty: str = "intermediate"
    max_results: int = 6


@app.get("/health")
def health():
    return {"status": "ok", "deepseek": bool(DEEPSEEK_API_KEY), "youtube": bool(YOUTUBE_API_KEY)}


@app.get("/")
def root():
    return {"service": "xceed-ai-support", "port": 8001}


@app.post("/quiz/generate")
def quiz_generate(req: QuizGenerateRequest):
    system = """You generate short educational quizzes.
Return JSON: {questions: [{id: int, question: string, options: string[4], correct_index: int, explanation: string}]}.
Valid JSON only."""
    user = f"Topic: {req.topic}\nDifficulty: {req.difficulty}\nNum: {req.num_questions}"
    if req.transcript:
        user += f"\nTranscript excerpt:\n{req.transcript[:5000]}"
    try:
        r = deepseek_json.invoke([
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ])
        return _parse_json(r.content)
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/quiz/submit")
def quiz_submit(req: QuizSubmitRequest):
    correct = 0
    details = []
    for i, q in enumerate(req.questions):
        expected = q.get("correct_index")
        ans = req.answers[i] if i < len(req.answers) else None
        ok = ans == expected
        if ok:
            correct += 1
        details.append({"id": q.get("id", i), "correct": ok, "expected": expected, "got": ans})
    total = max(len(req.questions), 1)
    return {"score": round(100 * correct / total, 1), "correct": correct, "total": total, "details": details}


@app.post("/mock-interview/question")
def mock_question(req: MockQuestionRequest):
    system = """You are an interview interviewer.
Return JSON: {question: string, type: "behavioral"|"technical"|"system_design", tip: string}.
Valid JSON only. Do not repeat previous questions."""
    try:
        r = deepseek_json.invoke([
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps({
                "job_description": req.job_description[:6000],
                "resume_text": (req.resume_text or "")[:4000],
                "previous_questions": req.previous_questions[-10:],
            })},
        ])
        return _parse_json(r.content)
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/mock-interview/analyze")
def mock_analyze(req: MockAnalyzeRequest):
    system = """You evaluate interview answers.
Return JSON: {overall_score: number, feedback: string, per_answer: [{question: string, score: number, notes: string}]}.
Valid JSON only."""
    try:
        r = deepseek_json.invoke([
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps({
                "job_description": req.job_description[:4000],
                "qa": [{"q": q, "a": a} for q, a in zip(req.questions, req.answers)],
            }, default=str)},
        ])
        return _parse_json(r.content)
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/video/chat")
def video_chat(req: VideoChatRequest):
    system = "You help learners understand educational videos. Use the transcript when provided. Be concise."
    ctx = req.transcript[:8000] if req.transcript else ""
    messages = [
        {"role": "system", "content": system},
        *[{"role": m.get("role", "user"), "content": m.get("content", "")} for m in (req.history or [])[-6:]],
        {"role": "user", "content": f"Title: {req.video_title or 'video'}\nTranscript:\n{ctx}\n\nQ: {req.message}"},
    ]
    try:
        r = deepseek.invoke(messages)
        return {"reply": r.content}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/video/notes")
def video_notes(req: VideoNotesRequest):
    system = """Summarize video into study notes.
Return JSON: {title: string, key_points: string[], summary: string, flashcards: [{q: string, a: string}]}.
Valid JSON only."""
    try:
        r = deepseek_json.invoke([
            {"role": "system", "content": system},
            {"role": "user", "content": f"Title: {req.video_title}\n\n{req.transcript[:10000]}"},
        ])
        return _parse_json(r.content)
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/video/clips")
def video_clips(req: VideoClipsRequest):
    system = """Suggest clip timestamps from a transcript (estimates OK).
Return JSON: {clips: [{start_sec: int, end_sec: int, label: string, reason: string}]}.
Valid JSON only."""
    try:
        r = deepseek_json.invoke([
            {"role": "system", "content": system},
            {"role": "user", "content": f"Topic focus: {req.topic}\n\n{req.transcript[:10000]}"},
        ])
        return _parse_json(r.content)
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/parse-job-description")
async def parse_job_description(file: UploadFile = File(...)):
    """Extract text from uploaded JD PDF/text for mock-interview / job create."""
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
            videos.append({
                "title": it["snippet"]["title"],
                "url": f"https://www.youtube.com/watch?v={it['id']['videoId']}",
                "channel": it["snippet"].get("channelTitle"),
                "thumbnail": (it["snippet"].get("thumbnails") or {}).get("medium", {}).get("url"),
                "skill": req.skill,
                "difficulty": req.difficulty,
            })
        return {"videos": videos, "query": q}
    except Exception as e:
        raise HTTPException(500, str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
