from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pymongo import MongoClient
import pdfplumber
import requests
import os
from datetime import datetime
from dotenv import load_dotenv
import google.generativeai as genai
import traceback

# Load environment variables from .env.local and .env files
load_dotenv('../../.env.local')  # Load from root directory
load_dotenv('../../.env')        # Load from root directory
load_dotenv('.env.local')        # Fallback to local directory
load_dotenv('.env')              # Fallback to local directory

app = FastAPI(title="Job Description & Mock Interview Service", description="Enhanced with better error handling")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB setup with DNS fallback
MONGO_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/")
MONGO_URI_BACKUP = os.getenv("MONGODB_URI_BACKUP")

def create_mongo_client():
    """Create MongoDB client with fallback for DNS issues"""
    connection_strategies = [
        {"name": "Primary URI", "uri": MONGO_URI},
    ]
    
    if MONGO_URI_BACKUP:
        connection_strategies.append({"name": "Backup URI (Direct IPs)", "uri": MONGO_URI_BACKUP})
    
    for strategy in connection_strategies:
        try:
            print(f"[INFO] Trying MongoDB connection: {strategy['name']}")
            client = MongoClient(strategy['uri'], serverSelectionTimeoutMS=10000)
            # Test the connection
            client.admin.command('ping')
            print(f"[SUCCESS] MongoDB connection successful: {strategy['name']}")
            return client
        except Exception as error:
            print(f"[ERROR] MongoDB connection failed ({strategy['name']}): {error}")
            if strategy == connection_strategies[-1]:  # Last strategy
                raise Exception(f"All MongoDB connection strategies failed. Last error: {error}")
            continue

client = create_mongo_client()
db = client["x-ceed-db"]
collection = db["mock_interviews"]

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Debug: Check if Gemini key is loaded
print(f"[DEBUG] GEMINI_API_KEY loaded: {bool(GEMINI_API_KEY)}")
if GEMINI_API_KEY:
    key_preview = f"{GEMINI_API_KEY[:4]}...{GEMINI_API_KEY[-4:]}" if len(GEMINI_API_KEY) > 8 else "***"
    print(f"[DEBUG] Key preview: {key_preview}")
    print(f"[DEBUG] Key length: {len(GEMINI_API_KEY)} characters")
    print(f"[DEBUG] Starts with 'AIza': {GEMINI_API_KEY.startswith('AIza')}")
else:
    print("[DEBUG] GEMINI_API_KEY is None or empty!")

MISTRAL_MODEL = "mistralai/mistral-7b-instruct:free"

# Simple test endpoint
@app.get("/test")
async def test_endpoint():
    return {"status": "working", "message": "Test endpoint is responding"}

# 1. File parsing endpoint
@app.post("/parse-job-description")
async def parse_job_description(file: UploadFile = File(...)):
    if file.content_type == "application/pdf":
        try:
            file.file.seek(0)
            with pdfplumber.open(file.file) as pdf:
                text = "\n".join(page.extract_text() or "" for page in pdf.pages)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"PDF parsing failed: {e}")
    elif file.content_type == "text/plain":
        text = (await file.read()).decode("utf-8")
    else:
        raise HTTPException(status_code=400, detail="Unsupported file type")
    if not text.strip():
        raise HTTPException(status_code=400, detail="No text extracted from file")
    return {"success": True, "text": text, "filename": file.filename}

# 2. Generate interview question
class QuestionRequest(BaseModel):
    job_description: str
    previous_questions: list = []

@app.post("/generate-question")
async def generate_question(req: QuestionRequest):
    print(f"[INFO] Received request: job_description={req.job_description[:100]}...")
    
    prompt = f"""
You are an expert interviewer. Based on the following job description, generate ONE relevant interview question.
Job Description:
{req.job_description}

Previous questions (avoid repetition):
{chr(10).join(req.previous_questions)}

Instructions:
- Generate only ONE question
- Make it relevant to the job description
- Vary the question type (technical, behavioral, situational)
- Keep it concise and clear
- Don't include any explanations or additional text, just the question

Generate the question:
"""
    
    # Try OpenRouter first
    if OPENROUTER_API_KEY:
        print("[INFO] Trying OpenRouter API...")
        try:
            response = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "http://localhost:3002",
                    "X-Title": "X-Ceed Mock Interview",
                },
                json={
                    "model": "mistralai/mistral-7b-instruct:free",
                    "messages": [
                        {"role": "system", "content": "You are an expert interviewer."},
                        {"role": "user", "content": prompt}
                    ],
                    "max_tokens": 200,
                    "temperature": 0.7
                }
            )
            
            print(f"[INFO] OpenRouter response status: {response.status_code}")
            if response.status_code == 200:
                data = response.json()
                if "choices" in data and len(data["choices"]) > 0:
                    question = data["choices"][0]["message"]["content"].strip()
                    print(f"[SUCCESS] OpenRouter generated question: {question}")
                    return {"question": question}
                else:
                    print(f"[WARN] OpenRouter unexpected response format: {data}")
            else:
                print(f"[ERROR] OpenRouter API Error: {response.status_code} - {response.text}")
        except Exception as e:
            print(f"[ERROR] OpenRouter API Exception: {str(e)}")
            print(f"[ERROR] OpenRouter Exception traceback: {traceback.format_exc()}")
    
    # Try Gemini as backup
    if GEMINI_API_KEY:
        print("[INFO] Trying Gemini API...")
        try:
            genai.configure(api_key=GEMINI_API_KEY)
            # Try Gemini 2.0 first, then 1.5-flash, then gemini-pro (with fallback chain)
            model_chain = [
                'gemini-2.5-flash',          # Gemini 2.5 Flash (best performance, 5 RPM)
                'gemini-2.5-flash-lite',     # Gemini 2.5 Flash Lite (higher rate limits, 10 RPM)
                'gemini-3-flash',            # Gemini 3 Flash (if available)
                'gemini-1.5-flash',          # Gemini 1.5 Flash (stable fallback)
                'gemini-pro'                 # Gemini Pro (final fallback)
            ]
            model = None
            for model_name in model_chain:
                try:
                    model = genai.GenerativeModel(model_name)
                    print(f"[INFO] Job Description Service using model: {model_name}")
                    break
                except Exception:
                    continue
            if not model:
                raise Exception("Failed to initialize any Gemini model")
            
            response = model.generate_content(prompt)
            if response.text:
                question = response.text.strip()
                print(f"[SUCCESS] Gemini generated question: {question}")
                return {"question": question}
            else:
                print("[WARN] Gemini returned empty response")
        except Exception as e:
            print(f"[ERROR] Gemini API Exception: {str(e)}")
            print(f"[ERROR] Gemini Exception traceback: {traceback.format_exc()}")
    
    # Fallback to predefined question
    print("[INFO] Using fallback question")
    fallback_question = "Tell me about your experience relevant to this position and how you would approach the key responsibilities mentioned in the job description."
    return {"question": fallback_question}

# 3. Analyze interview answers and store in MongoDB
class AnalysisRequest(BaseModel):
    user_id: str = None
    job_description: str
    questions: list
    answers: list

@app.post("/analyze-answers")
async def analyze_answers(req: AnalysisRequest):
    prompt = f"""
You are an expert interview coach. Analyze the following mock interview and provide detailed feedback.

Job Description:
{req.job_description}

Questions and Answers:
{chr(10).join([f'Q: {q}\nA: {a}' for q, a in zip(req.questions, req.answers)])}

Please provide a JSON with:
- score (overall, communication, technical, confidence)
- strengths
- improvements
- recommendations
"""
    response = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": MISTRAL_MODEL,
            "messages": [
                {"role": "system", "content": "You are an expert interview analyst."},
                {"role": "user", "content": prompt}
            ],
            "max_tokens": 1000,
            "temperature": 0.3
        }
    )
    data = response.json()
    analysis = data["choices"][0]["message"]["content"].strip()
    # Store in MongoDB
    doc = {
        "userId": req.user_id,
        "jobDescription": req.job_description,
        "questions": req.questions,
        "answers": req.answers,
        "analysis": analysis,
        "createdAt": datetime.utcnow()
    }
    collection.insert_one(doc)
    return {"analysis": analysis, "success": True}

# Health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "Job Description & Mock Interview Service"}

@app.get("/")
async def root():
    return {"message": "Job Description & Mock Interview Service is running", "status": "online"}