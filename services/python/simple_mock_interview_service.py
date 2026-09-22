from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
from dotenv import load_dotenv
import google.generativeai as genai

# Load environment variables
load_dotenv('.env.local')
load_dotenv('.env')

app = FastAPI(title="Simple Mock Interview Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

class QuestionRequest(BaseModel):
    job_description: str
    previous_questions: list = []

@app.get("/")
async def root():
    return {"message": "Simple Mock Interview Service is running"}

@app.post("/generate-question")
async def generate_question(req: QuestionRequest):
    print(f"🔄 Received request for job: {req.job_description[:100]}...")
    
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
    
    if not GEMINI_API_KEY:
        print("❌ No Gemini API key found")
        raise HTTPException(status_code=500, detail="Gemini API key not configured")
    
    try:
        print("🔄 Calling Gemini API...")
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
                print(f"[INFO] Mock Interview Service using model: {model_name}")
                break
            except Exception:
                continue
        if not model:
            raise Exception("Failed to initialize any Gemini model")
        
        response = model.generate_content(prompt)
        if response.text:
            question = response.text.strip()
            print(f"✅ Gemini generated question: {question}")
            return {"question": question, "source": "gemini"}
        else:
            print("⚠️ Gemini returned empty response")
            raise HTTPException(status_code=500, detail="AI service returned empty response")
            
    except Exception as e:
        print(f"❌ Gemini API Exception: {str(e)}")
        
        # Fallback to static question
        print("🔄 Using fallback question")
        fallback_question = "Tell me about your experience relevant to this position and how you would approach the key responsibilities mentioned in the job description."
        return {"question": fallback_question, "source": "fallback"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8009)
