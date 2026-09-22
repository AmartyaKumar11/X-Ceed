"""
Gemini-powered FastAPI RAG Service for X-ceed Resume Analysis Chat
Specifically for the resume matching analysis chatbot using Google Gemini AI
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import os
import json
from dotenv import load_dotenv
import google.generativeai as genai

# Import vector RAG core for hybrid approach
try:
    import sys
    import os
    # Add current directory to path for imports
    current_dir = os.path.dirname(os.path.abspath(__file__))
    if current_dir not in sys.path:
        sys.path.insert(0, current_dir)
    
    from resume_analyzer_core import ResumeAnalyzerCore
    VECTOR_RAG_AVAILABLE = True
    print(f"[INFO] Vector RAG core imported successfully")
except ImportError as e:
    print(f"[WARN] Vector RAG not available: {e}. Continuing with context injection only.")
    import traceback
    traceback.print_exc()
    VECTOR_RAG_AVAILABLE = False

# Load environment variables
import os
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
env_file_path = os.path.join(project_root, '.env.local')
print(f"Loading environment variables from: {env_file_path}")
# Use override=True so the project .env.local always wins over any existing OS env var
load_dotenv(env_file_path, override=True)
load_dotenv(override=True)  # Also load from .env as fallback, still allowing project files to win
print(f"Environment variables loaded. GEMINI_API_KEY present: {bool(os.getenv('GEMINI_API_KEY'))}")

# Initialize FastAPI app
app = FastAPI(
    title="X-ceed Resume Analysis Chat API (Gemini)",
    description="Gemini-powered resume analysis chatbot service",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3002", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("ERROR: GEMINI_API_KEY not found in environment variables")
    print("Please check your .env.local file in the project root")
    raise ValueError("GEMINI_API_KEY is required")

# Diagnostic logging (masked for security)
key_length = len(GEMINI_API_KEY)
key_preview = f"{GEMINI_API_KEY[:4]}...{GEMINI_API_KEY[-4:]}" if key_length > 8 else "***"
starts_with_aiza = GEMINI_API_KEY.startswith("AIza")
print(f"Gemini API Key configured: {bool(GEMINI_API_KEY)}")
print(f"Key length: {key_length} characters")
print(f"Key preview: {key_preview}")
print(f"Starts with 'AIza': {starts_with_aiza}")
if not starts_with_aiza:
    print("WARNING: Google API keys typically start with 'AIza'. This may not be a valid Gemini API key.")

genai.configure(api_key=GEMINI_API_KEY)

# Global model fallback chain for runtime quota errors
MODEL_FALLBACK_CHAIN = [
    'gemini-2.5-flash',          # Gemini 2.5 Flash (best performance, 5 RPM)
    'gemini-2.5-flash-lite',     # Gemini 2.5 Flash Lite (higher rate limits, 10 RPM)
    'gemini-3-flash',            # Gemini 3 Flash (if available)
    'gemini-1.5-flash',          # Gemini 1.5 Flash (stable fallback)
    'gemini-pro'                 # Gemini Pro (final fallback)
]

# Lazy model initialization - initialize on first use, not at startup
model = None
active_model_name = None

# Helper function to initialize Gemini model with fallback chain
def get_gemini_model(preferred_models=None):
    """
    Initialize Gemini model with fallback chain (lazy initialization).
    Tries models in order: Gemini 2.5/3.0 -> Gemini 1.5 Flash -> Gemini Pro
    Note: gemini-2.0-flash has limit: 0 on free tier, so we skip it
    """
    global model, active_model_name
    
    # Return cached model if already initialized
    if model is not None:
        return model, active_model_name
    
    if preferred_models is None:
        preferred_models = MODEL_FALLBACK_CHAIN
    
    last_error = None
    for model_name in preferred_models:
        try:
            model = genai.GenerativeModel(model_name)
            active_model_name = model_name
            print(f"[INFO] Successfully initialized model: {model_name}")
            return model, active_model_name
        except Exception as e:
            error_type = type(e).__name__
            # Check if it's a quota/resource error (model exists but not available on plan)
            if 'ResourceExhausted' in error_type or 'limit: 0' in str(e):
                print(f"[DEBUG] Model {model_name} has quota limit 0 (not available on free tier), trying next...")
            else:
                print(f"[DEBUG] Model {model_name} not available: {error_type}")
            last_error = e
            continue
    
    # If all models fail, log error but don't crash - will retry on first API call
    print(f"[WARN] Failed to initialize any Gemini model at startup. Will retry on first API call. Last error: {last_error}")
    return None, None

# Global model fallback chain for runtime quota errors
MODEL_FALLBACK_CHAIN = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-3-flash',
    'gemini-1.5-flash',
    'gemini-pro'
]

# Global session storage (in production, use proper session management)
session_data = {}

# Setup persistent vector storage directory
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
VECTOR_STORES_DIR = os.path.join(project_root, 'data', 'vector_stores')
os.makedirs(VECTOR_STORES_DIR, exist_ok=True)
print(f"[INFO] Vector stores directory: {VECTOR_STORES_DIR}")

# Pydantic models
class ChatRequest(BaseModel):
    question: str
    session_id: Optional[str] = "default"
    conversation_history: Optional[List[Dict]] = []
    context: Optional[Dict] = None

class ChatResponse(BaseModel):
    success: bool
    response: Optional[str] = None
    error: Optional[str] = None

def post_process_response(text: str) -> str:
    """
    Post-process response to make it more concise and direct
    """
    if not text:
        return text
    
    # Remove common verbose introductions
    verbose_intros = [
        "I'd be happy to help you",
        "I can help you with that",
        "Let me analyze",
        "Based on the information provided",
        "Looking at your resume",
        "I've reviewed your resume",
    ]
    
    lines = text.split('\n')
    cleaned_lines = []
    skip_intro = True
    
    for line in lines:
        line_stripped = line.strip()
        
        # Skip generic introductory lines
        if skip_intro and any(intro.lower() in line_stripped.lower() for intro in verbose_intros):
            continue
        
        # Once we hit actual content, stop skipping
        if line_stripped and not line_stripped.startswith(('I ', 'Let me', 'Based on')):
            skip_intro = False
        
        if not skip_intro or line_stripped:
            cleaned_lines.append(line)
    
    result = '\n'.join(cleaned_lines).strip()
    
    # If response is still very long, truncate at a reasonable point
    if len(result) > 2000:
        # Try to truncate at a sentence boundary
        sentences = result.split('. ')
        truncated = []
        char_count = 0
        for sentence in sentences:
            if char_count + len(sentence) > 1800:
                break
            truncated.append(sentence)
            char_count += len(sentence) + 2
        result = '. '.join(truncated) + '.'
    
    return result

def call_gemini_api(prompt: str, conversation_history: List[Dict] = None) -> str:
    """Make a call to Gemini API for chat responses with automatic model fallback on quota errors"""
    global model, active_model_name
    
    # Lazy initialization - initialize model on first use if not already initialized
    if model is None:
        model, active_model_name = get_gemini_model()
        if model is None:
            raise HTTPException(
                status_code=503, 
                detail="Gemini API models are currently unavailable. Please check your API key and quota limits."
            )
    
    # Build conversation context
    context_parts = []
    
    # Add conversation history if available
    if conversation_history:
        for msg in conversation_history[-5:]:  # Last 5 messages for context
            role = "User" if msg.get('role') == 'user' else "Assistant"
            content = msg.get('content', '')
            context_parts.append(f"{role}: {content}")
    
    # Create the full prompt with context - optimized for concise, direct responses
    system_instruction = """You are a resume analysis expert. Your responses must be:
- DIRECT: Get straight to the point, skip pleasantries
- SPECIFIC: Use exact examples from the resume/job description
- CONCISE: 150-300 words maximum (unless detailed analysis is explicitly requested)
- ACTIONABLE: Tell them exactly what to do, not general advice

FORMAT:
- Start with the answer immediately
- Use bullet points for lists
- Cite specific resume sections or job requirements
- Avoid: "generally", "typically", "usually", "in most cases"
- End with concrete next steps if applicable"""

    full_prompt = f"""{system_instruction}

{"Previous conversation:" + chr(10) + chr(10).join(context_parts) + chr(10) + chr(10) if context_parts else ""}

Current question: {prompt}

Answer directly and specifically:"""

    print(f"[DEBUG] Calling Gemini API with prompt length: {len(full_prompt)}")
    
    # Try current model first, then fallback chain if quota error
    models_to_try = []
    if active_model_name:
        models_to_try = [active_model_name] + [m for m in MODEL_FALLBACK_CHAIN if m != active_model_name]
    else:
        models_to_try = MODEL_FALLBACK_CHAIN if active_model_name else MODEL_FALLBACK_CHAIN
    
    last_error = None
    for model_name in models_to_try:
        try:
            # Get or create model instance
            if model_name != active_model_name:
                print(f"[INFO] Trying fallback model: {model_name}")
                current_model = genai.GenerativeModel(model_name)
            else:
                current_model = model
            
            print(f"[DEBUG] Calling model.generate_content with {model_name}...")
            
            # Configure generation parameters for more focused, concise responses
            generation_config = genai.types.GenerationConfig(
                temperature=0.3,        # Lower temperature = more focused, less creative
                top_p=0.8,              # Nucleus sampling for focused responses
                top_k=40,               # Limit vocabulary for more direct answers
                max_output_tokens=800,  # Limit response length (encourages conciseness)
            )
            
            response = current_model.generate_content(
                full_prompt,
                generation_config=generation_config
            )
            print(f"[DEBUG] Gemini response received: {type(response)}")
            
            # Update global model if we successfully used a fallback
            if model_name != active_model_name:
                model = current_model
                active_model_name = model_name
                print(f"[INFO] Switched to model: {model_name}")
            
            if hasattr(response, 'text') and response.text:
                response_text = response.text
                
                # Post-process to ensure conciseness
                response_text = post_process_response(response_text)
                
                print(f"[DEBUG] Response text length: {len(response_text)} (after post-processing)")
                return response_text
            else:
                print(f"[DEBUG] No text in response. Response: {response}")
                if hasattr(response, 'candidates'):
                    print(f"[DEBUG] Candidates: {response.candidates}")
                if hasattr(response, 'prompt_feedback'):
                    print(f"[DEBUG] Prompt feedback: {response.prompt_feedback}")
                return "I apologize, but I'm unable to generate a response at the moment. Please try rephrasing your question or try again later."
                
        except Exception as e:
            error_type = type(e).__name__
            error_str = str(e)
            
            # Check if it's a quota/resource error
            if 'ResourceExhausted' in error_type or 'limit: 0' in error_str or 'quota' in error_str.lower():
                print(f"[WARN] Model {model_name} quota exhausted, trying next model...")
                last_error = e
                continue
            else:
                # For non-quota errors, log and try next model once, then raise
                print(f"[ERROR] Gemini API error with {model_name}: {error_type}: {error_str}")
                if model_name == models_to_try[-1]:  # Last model in chain
                    import traceback
                    traceback.print_exc()
                    raise HTTPException(status_code=500, detail=f"Gemini API error: {error_str}")
                last_error = e
                continue
    
    # If all models failed
    import traceback
    traceback.print_exc()
    raise HTTPException(status_code=500, detail=f"All Gemini models failed. Last error: {str(last_error)}")

@app.get("/")
async def root():
    """Health check endpoint"""
    # Re-check key diagnostics for health endpoint
    key_length = len(GEMINI_API_KEY) if GEMINI_API_KEY else 0
    key_preview = f"{GEMINI_API_KEY[:4]}...{GEMINI_API_KEY[-4:]}" if key_length > 8 else "***"
    starts_with_aiza = GEMINI_API_KEY.startswith("AIza") if GEMINI_API_KEY else False
    
    # Check model initialization status (lazy initialization)
    model_initialized = model is not None
    
    return {
        "service": "X-ceed Resume Analysis Chat API (Gemini)",
        "status": "running",
        "gemini_configured": bool(GEMINI_API_KEY),
        "model_initialized": model_initialized,
        "active_model": active_model_name if model_initialized else "not_initialized",
        "key_length": key_length,
        "key_preview": key_preview,
        "starts_with_aiza": starts_with_aiza,
        "version": "1.0.0"
    }

@app.post("/chat", response_model=ChatResponse)
async def chat_with_resume_analyzer(request: ChatRequest):
    """Chat endpoint for resume analysis discussions"""
    try:
        print(f"[DEBUG] Received chat request:")
        print(f"   - Question: '{request.question[:100]}...'")
        print(f"   - Session ID: {request.session_id}")
        print(f"   - Has context: {bool(request.context)}")
        print(f"   - History length: {len(request.conversation_history) if request.conversation_history else 0}")

        # Store session context if provided
        if request.context and request.session_id:
            session_data[request.session_id] = request.context
            print(f"[DEBUG] Stored context for session {request.session_id}")

        # Get session context
        session_context = session_data.get(request.session_id, {})
        
        # Build comprehensive context for resume analysis
        enhanced_question = request.question
        context_info = request.context or session_context
        
        # Initialize vector RAG if available and context has resume/job data
        vector_chunks = []
        if VECTOR_RAG_AVAILABLE and context_info:
            resume_text = context_info.get('resumeText') or context_info.get('resume_text')
            job_description = context_info.get('jobDescription') or context_info.get('job_description')
            
            if resume_text and job_description:
                try:
                    # Check if we already have a vector analyzer for this session
                    session_key = f"vector_analyzer_{request.session_id}"
                    if session_key not in session_data:
                        # Create persistent directory for this session
                        session_vector_dir = os.path.join(VECTOR_STORES_DIR, f"chat_session_{request.session_id}")
                        os.makedirs(session_vector_dir, exist_ok=True)
                        
                        # Initialize vector analyzer
                        vector_analyzer = ResumeAnalyzerCore(persist_directory=session_vector_dir)
                        
                        # Process documents
                        print(f"[INFO] Processing documents for vector RAG in chat service...")
                        if vector_analyzer.process_documents(resume_text, job_description):
                            session_data[session_key] = vector_analyzer
                            print(f"[INFO] Vector RAG initialized for chat session {request.session_id}")
                        else:
                            print(f"[WARN] Vector RAG processing failed for chat session")
                    else:
                        vector_analyzer = session_data[session_key]
                    
                    # Get relevant chunks using vector similarity search
                    if session_key in session_data:
                        vector_analyzer = session_data[session_key]
                        vector_chunks = vector_analyzer.get_relevant_chunks(request.question, k=3)
                        if vector_chunks:
                            print(f"[INFO] Retrieved {len(vector_chunks)} relevant chunks from vector store")
                except Exception as e:
                    print(f"[WARN] Vector RAG error in chat: {str(e)}. Continuing with context injection only.")
                    vector_chunks = []
        
        if context_info:
            print(f"[DEBUG] Context available - Job: {context_info.get('jobTitle', 'N/A')}")
            print(f"[DEBUG] Has resume text: {bool(context_info.get('resumeText'))}")
            print(f"[DEBUG] Has job description: {bool(context_info.get('jobDescription'))}")
            
            # Build comprehensive analysis context
            context_parts = []
            
            # Add job information
            if context_info.get('jobTitle'):
                context_parts.append(f"JOB TITLE: {context_info['jobTitle']}")
                
            if context_info.get('jobDescription'):
                job_desc = context_info['jobDescription']
                # Truncate if too long but keep essential info
                if len(job_desc) > 1000:
                    job_desc = job_desc[:1000] + "... [truncated]"
                context_parts.append(f"JOB DESCRIPTION: {job_desc}")
                
            if context_info.get('jobRequirements') and len(context_info['jobRequirements']) > 0:
                requirements = ', '.join(context_info['jobRequirements'][:10])  # Limit to first 10
                context_parts.append(f"JOB REQUIREMENTS: {requirements}")
            
            # Add resume information - use vector chunks if available, otherwise truncate
            if vector_chunks:
                # Use vector-retrieved chunks instead of full resume
                context_parts.append("RELEVANT RESUME SECTIONS (from semantic search):")
                for i, chunk in enumerate(vector_chunks, 1):
                    context_parts.append(f"[Section {i}]: {chunk[:400]}...")  # Limit chunk size
            elif context_info.get('resumeText'):
                # Fallback: only include resume if vector RAG not available
                resume_text = context_info['resumeText']
                # Truncate significantly more if not using vector RAG
                if len(resume_text) > 1000:
                    resume_text = resume_text[:1000] + "... [truncated - use vector RAG for better results]"
                context_parts.append(f"CANDIDATE'S RESUME CONTENT (summary): {resume_text}")
            elif context_info.get('resumePath'):
                context_parts.append(f"RESUME PATH: {context_info['resumePath']}")
            
            # Add previous analysis if available
            if context_info.get('analysisResult'):
                analysis = context_info['analysisResult']
                if len(analysis) > 800:
                    analysis = analysis[:800] + "... [truncated]"
                context_parts.append(f"PREVIOUS ANALYSIS: {analysis}")
                
            if context_info.get('structuredAnalysis'):
                struct_analysis = context_info['structuredAnalysis']
                if isinstance(struct_analysis, dict):
                    # Extract key metrics
                    if struct_analysis.get('overallMatch'):
                        match_info = struct_analysis['overallMatch']
                        context_parts.append(f"MATCH SCORE: {match_info.get('score', 'N/A')}% - {match_info.get('level', 'N/A')}")
                
            # Vector chunks are now added above in resume section, no need to duplicate
            
            if context_parts:
                # Use vector RAG mode indicator
                rag_mode = "vector RAG (semantic search)" if vector_chunks else "context injection"
                enhanced_question = f"""RESUME ANALYSIS CONTEXT:
{chr(10).join(context_parts)}

USER QUESTION: {request.question}

INSTRUCTIONS:
- Be DIRECT and CONCISE - get straight to the point
- Skip generic introductions or pleasantries
- Provide SPECIFIC, ACTIONABLE answers based on the actual resume and job data
- Use bullet points or numbered lists when listing items
- Focus on concrete examples from the resume/job description
- Keep responses under 300 words unless the question requires detailed analysis
- If asked about gaps, list the EXACT missing skills/requirements
- If asked about strengths, cite SPECIFIC examples from the resume
- Avoid vague statements like "generally" or "typically" - be precise"""
                
                # Log context size for monitoring
                prompt_length = len(enhanced_question)
                print(f"[INFO] Built prompt with {rag_mode} - Total length: {prompt_length} chars")
                if prompt_length > 5000:
                    print(f"[WARN] Prompt is large ({prompt_length} chars). Consider using vector RAG to reduce size.")

        # Generate response using Gemini
        response_text = call_gemini_api(enhanced_question, request.conversation_history)
        
        print(f"[DEBUG] Generated response length: {len(response_text)} characters")
        
        return ChatResponse(
            success=True,
            response=response_text
        )

    except Exception as e:
        # Use ASCII-safe logging to avoid UnicodeEncodeError on some Windows consoles
        print(f"[ERROR] Chat error: {e}")
        return ChatResponse(
            success=False,
            error=f"Failed to generate response: {str(e)}"
        )

@app.post("/analyze")
async def analyze_resume(request: dict):
    """Analysis endpoint - delegates to existing analysis logic or provides basic analysis"""
    try:
        print(f"[DEBUG] Received analysis request")
        
        # For now, return a message directing to the proper analysis service
        # In the future, this could integrate with the AI resume analyzer
        return {
            "success": True,
            "message": "Analysis functionality is handled by the main resume analysis system. This service focuses on chat interactions.",
            "data": {
                "analysis_status": "delegated",
                "chat_available": True
            }
        }
        
    except Exception as e:
        print(f"❌ Analysis error: {e}")
        return {
            "success": False,
            "error": f"Analysis error: {str(e)}"
        }

if __name__ == "__main__":
    import uvicorn
    print("Starting Gemini Resume Chat Service...")
    print(f"Gemini API Key configured: {bool(GEMINI_API_KEY)}")
    uvicorn.run(app, host="0.0.0.0", port=8003)
