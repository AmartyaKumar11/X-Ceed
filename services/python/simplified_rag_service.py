"""
Simplified FastAPI RAG Service for X-ceed Resume Analysis
Uses OpenRouter API with LiquidAI LFM2.5-1.2B-Thinking model
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any
import os
import requests
import json
from dotenv import load_dotenv

# Import vector RAG core
try:
    from resume_analyzer_core import ResumeAnalyzerCore
    VECTOR_RAG_AVAILABLE = True
except ImportError as e:
    print(f"[WARN] Vector RAG not available: {e}. Continuing with prompt-based RAG only.")
    VECTOR_RAG_AVAILABLE = False

# Load environment variables
import os
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
env_file_path = os.path.join(project_root, '.env.local')
print(f"Loading environment variables from: {env_file_path}")
load_dotenv(env_file_path)
load_dotenv()  # Also load from .env as fallback
print(f"Environment variables loaded. OPENROUTER_API_KEY present: {bool(os.getenv('OPENROUTER_API_KEY'))}")

# OpenRouter API configuration
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
LIQUIDAI_MODEL = "liquidai/lfm2.5-1.2b-thinking:free"

# Initialize FastAPI app
app = FastAPI(
    title="X-ceed Resume Analyzer API",
    description="Simplified RAG-powered resume analysis service",
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

# OpenRouter API configuration (using LiquidAI model)

# Global session storage (in production, use proper session management)
session_data = {}

# Setup persistent vector storage directory
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
VECTOR_STORES_DIR = os.path.join(project_root, 'data', 'vector_stores')
os.makedirs(VECTOR_STORES_DIR, exist_ok=True)
print(f"[INFO] Vector stores directory: {VECTOR_STORES_DIR}")

# Pydantic models
class AnalysisRequest(BaseModel):
    resume_text: str
    job_description: str
    job_title: str
    job_requirements: Optional[list] = []

class ChatRequest(BaseModel):
    question: str
    session_id: Optional[str] = "default"
    conversation_history: Optional[list] = []
    context: Optional[dict] = None

class AnalysisResponse(BaseModel):
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

def call_openrouter_api(messages, model=None, temperature=0.1, max_retries=2):
    """Make a direct call to OpenRouter API with LiquidAI model"""
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY not configured")
    
    # Use LiquidAI model by default
    model = model or LIQUIDAI_MODEL
    
    for attempt in range(max_retries):
        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": os.getenv("NEXT_PUBLIC_BASE_URL", "http://localhost:3002"),
            "X-Title": "X-CEED Resume Analysis"
        }
        
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": 4000
        }
        
        print(f"[DEBUG] Attempt {attempt + 1}/{max_retries}")
        print(f"[DEBUG] Calling OpenRouter API with model: {model}")
        print(f"[DEBUG] Messages count: {len(messages)}")
        print(f"[DEBUG] Message preview: {str(messages[0])[:200]}...")
        
        try:
            response = requests.post(OPENROUTER_API_URL, headers=headers, json=payload, timeout=60)
            print(f"[DEBUG] OpenRouter response status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                if "choices" not in result or not result["choices"]:
                    print(f"[ERROR] Invalid OpenRouter response format: {result}")
                    raise HTTPException(status_code=500, detail="Invalid response format from OpenRouter API")
                return result["choices"][0]["message"]["content"]
            
            elif response.status_code == 429:
                print(f"[WARNING] Rate limit hit on attempt {attempt + 1}")
                print(f"[ERROR] OpenRouter API error response: {response.text}")
                
                if attempt < max_retries - 1:
                    print(f"[INFO] Retrying...")
                    continue
                else:
                    print(f"[ERROR] Rate limited after all retries")
                    raise HTTPException(status_code=429, detail="OpenRouter API rate limited. Please try again later.")
            
            else:
                print(f"[ERROR] OpenRouter API error response: {response.text}")
                response.raise_for_status()
                
        except requests.exceptions.Timeout:
            print(f"[ERROR] OpenRouter API timeout on attempt {attempt + 1}")
            if attempt == max_retries - 1:
                raise HTTPException(status_code=500, detail="OpenRouter API timeout")
            continue
            
        except requests.exceptions.RequestException as e:
            print(f"[ERROR] OpenRouter API request failed: {str(e)}")
            if hasattr(e, 'response') and e.response is not None:
                print(f"[ERROR] Response status: {e.response.status_code}")
                print(f"[ERROR] Response text: {e.response.text}")
            
            if attempt == max_retries - 1:
                raise HTTPException(status_code=500, detail=f"OpenRouter API error: {str(e)}")
            continue
    
    # If we get here, all attempts failed
    raise HTTPException(status_code=500, detail="All OpenRouter API attempts failed")

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "X-ceed Resume Analyzer API (Simplified)",
        "status": "running",
        "openrouter_configured": bool(OPENROUTER_API_KEY),
        "model": LIQUIDAI_MODEL,
        "version": "1.0.0"
    }

@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_resume(request: AnalysisRequest):
    """Analyze resume against job description"""
    try:
        # Debug: Print received data
        print(f"[DEBUG] Received analysis request:")
        print(f"   - Job Title: '{request.job_title}'")
        print(f"   - Job Description Length: {len(request.job_description)} chars")
        print(f"   - Job Description (first 200 chars): '{request.job_description[:200]}...'")
        print(f"   - Job Requirements: {request.job_requirements}")
        print(f"   - Resume Text Length: {len(request.resume_text)} chars")
        print(f"   - Resume Text (first 100 chars): '{request.resume_text[:100]}...'")
        
        # Store session data
        session_id = "default"
        session_data[session_id] = {
            "resume_text": request.resume_text,
            "job_description": request.job_description,
            "job_title": request.job_title,
            "job_requirements": request.job_requirements
        }
        
        # Initialize vector RAG if available (for chat retrieval)
        vector_analyzer = None
        if VECTOR_RAG_AVAILABLE:
            try:
                # Create persistent directory for this session
                session_vector_dir = os.path.join(VECTOR_STORES_DIR, f"session_{session_id}")
                os.makedirs(session_vector_dir, exist_ok=True)
                
                # Initialize vector analyzer with persistent storage
                vector_analyzer = ResumeAnalyzerCore(persist_directory=session_vector_dir)
                
                # Process documents for vector retrieval
                print(f"[INFO] Processing documents for vector RAG...")
                vector_success = vector_analyzer.process_documents(
                    request.resume_text,
                    request.job_description
                )
                
                if vector_success:
                    print(f"[INFO] Vector RAG initialized successfully for session {session_id}")
                    session_data[session_id]["vector_analyzer"] = vector_analyzer
                else:
                    print(f"[WARN] Vector RAG processing failed, continuing with prompt-based only")
                    vector_analyzer = None
            except Exception as e:
                print(f"[WARN] Vector RAG initialization failed: {str(e)}. Continuing with prompt-based RAG.")
                vector_analyzer = None
        
        # Create enhanced structured analysis prompt that returns detailed JSON data
        analysis_prompt = f"""
You are an expert HR professional and career advisor with 15+ years of experience in technical recruiting and resume analysis. Your task is to conduct a comprehensive, meticulous analysis of this resume against the job requirements.

**ANALYSIS REQUIREMENTS:**
- Be extremely specific and detailed in your assessment
- Provide concrete evidence from the resume for every claim
- Identify exact skill gaps and missing technologies with explanations
- Give actionable, specific improvement recommendations with timelines
- Consider industry context and current market trends
- Focus on actual skill gaps, not semantic differences
- Be fair and accurate in skill matching
- Analyze experience depth and relevance thoroughly

**SKILL MATCHING RULES:**
- React.js = React = ReactJS (same technology)
- JavaScript = JS = ECMAScript
- Node.js = Node = NodeJS
- TypeScript = TS
- HTML5 = HTML
- CSS3 = CSS
- PostgreSQL = Postgres
- MongoDB = Mongo
- And similar common variations

**JOB INFORMATION:**
**Title:** {request.job_title}
**Description:** {request.job_description}
**Requirements:** {', '.join(request.job_requirements)}

**RESUME CONTENT:**
{request.resume_text}

Provide a meticulous, comprehensive analysis in this exact JSON format:

{{
  "overallMatch": {{
    "score": [0-100 number],
    "level": "[Excellent/Good/Fair/Poor]",
    "summary": "[Detailed 3-4 sentence summary explaining the match quality, specific strengths, and key gaps]",
    "reasoning": "[Explain the scoring methodology and key factors that influenced the score]"
  }},
  "skillsAnalysis": {{
    "totalRequired": [number of skills required],
    "exactMatches": [number of exact skill matches],
    "partialMatches": [
      {{"required": "skill name", "candidate_has": "similar skill", "match_strength": "weak/moderate/strong"}}
    ],
    "matchingSkills": [
      "[Exact skill matches with evidence from resume]"
    ],
    "criticalMissing": [
      "[Must-have skills completely missing from resume - explain why critical]"
    ],
    "importantMissing": [
      "[Important skills that would strengthen candidacy - explain impact]"
    ],
    "niceToHaveMissing": [
      "[Additional skills that could be beneficial]"
    ],
    "skillsScore": [0-100],
    "detailedAssessment": "[2-3 sentences explaining skill match quality and specific recommendations]"
  }},
  "experienceAnalysis": {{
    "yearsRequired": [number from job description],
    "yearsCandidate": [number extracted from resume],
    "meetsRequirement": [true/false],
    "experienceGap": [number of years short, 0 if meets requirement],
    "relevantExperience": "[Detailed analysis of relevant experience found in resume with specific examples]",
    "experienceGaps": "[Detailed explanation of what type of experience is missing or weak]",
    "industryMatch": "[Assessment of industry-relevant experience and context]",
    "experienceScore": [0-100],
    "detailedBreakdown": [
      {{
        "category": "Leadership & Management",
        "present": [true/false],
        "evidence": "[Specific examples from resume or 'None found']",
        "jobRequires": [true/false],
        "assessment": "[Brief assessment of this area]"
      }},
      {{
        "category": "Technical Implementation",
        "present": [true/false],
        "evidence": "[Specific examples from resume or 'None found']",
        "jobRequires": [true/false],
        "assessment": "[Brief assessment of this area]"
      }},
      {{
        "category": "Project Management",
        "present": [true/false],
        "evidence": "[Specific examples from resume or 'None found']",
        "jobRequires": [true/false],
        "assessment": "[Brief assessment of this area]"
      }}
    ]
  }},
  "keyStrengths": [
    {{
      "strength": "[Specific strength with evidence]",
      "relevance": "High/Medium/Low",
      "evidence": "[Direct quote or reference from resume]",
      "impact": "[How this strength benefits the role]"
    }}
  ],
  "detailedGapAnalysis": {{
    "criticalGaps": [
      {{
        "gap": "[Specific gap]",
        "impact": "High/Medium/Low",
        "description": "[Why this gap matters for the role]",
        "recommendation": "[Specific action to address this gap]",
        "timeframe": "[Estimated time to address: days/weeks/months]"
      }}
    ],
    "improvementAreas": [
      {{
        "area": "[Area needing improvement]",
        "currentLevel": "[Assessment of current capability]",
        "targetLevel": "[What level is needed for the role]",
        "actionPlan": "[Specific steps to improve]"
      }}
    ]
  }},
  "improvementSuggestions": [
    {{
      "title": "[Specific, actionable suggestion title]",
      "description": "[Detailed explanation of what to do and why]",
      "priority": "Critical/High/Medium/Low",
      "category": "Technical Skills/Experience/Resume Format/Portfolio",
      "actionItems": [
        "[Specific action step 1]",
        "[Specific action step 2]",
        "[Specific action step 3]"
      ],
      "resources": "[Recommended learning resources, courses, or tools]",
      "timeframe": "[Estimated time to complete]",
      "impact": "[Expected impact on candidacy - be specific]"
    }}
  ],
  "competitiveAdvantages": [
    {{
      "advantage": "[What makes this candidate stand out]",
      "evidence": "[Supporting evidence from resume]",
      "marketValue": "[Why this is valuable in current market]"
    }}
  ],
  "interviewPreparation": {{
    "strengthsToHighlight": [
      {{
        "strength": "[Key point to emphasize]",
        "talkingPoints": "[Specific points to mention in interview]",
        "examples": "[Concrete examples to share]"
      }}
    ],
    "areasToAddress": [
      {{
        "area": "[Potential weakness to prepare for]",
        "strategy": "[How to address this in interview]",
        "preparation": "[What to prepare or practice]"
      }}
    ],
    "questionsToExpect": [
      "[Likely interview question based on resume gaps or strengths]"
    ]
  }},
  "marketPositioning": {{
    "currentLevel": "[Junior/Mid-level/Senior/Expert based on resume analysis]",
    "roleAlignment": "[How well candidate level matches job level requirements]",
    "salaryExpectation": "[Realistic salary range based on skills and experience]"
  }}
}}

Return ONLY the JSON object, no other text or formatting.
"""

        messages = [
            {"role": "system", "content": "You are an expert HR professional and career advisor specializing in resume analysis and job matching. You must respond with valid JSON only."},
            {"role": "user", "content": analysis_prompt}
        ]
        
        # Get analysis from OpenRouter (LiquidAI)
        analysis_result = call_openrouter_api(messages)
        
        # Try to parse the JSON response
        try:
            import json
            structured_analysis = json.loads(analysis_result)
            
            return AnalysisResponse(
                success=True,
                data={
                    "analysis": {
                        "structuredAnalysis": structured_analysis,
                        "timestamp": "2025-06-15T18:00:00.000Z",
                        "model": LIQUIDAI_MODEL,
                        "ragEnabled": True
                    },
                    "metadata": {
                        "analyzedAt": "2025-06-15T18:00:00.000Z",
                        "jobTitle": request.job_title,
                        "model": LIQUIDAI_MODEL,
                        "ragEnabled": True
                    }
                }
            )
        except json.JSONDecodeError:
            # Fallback to original text format if JSON parsing fails
            return AnalysisResponse(
                success=True,
                data={                    "analysis": {
                        "comprehensiveAnalysis": analysis_result,
                        "timestamp": "2025-06-15T18:00:00.000Z",
                        "model": LIQUIDAI_MODEL,
                        "ragEnabled": True
                    },
                    "metadata": {
                        "analyzedAt": "2025-06-15T18:00:00.000Z",
                        "jobTitle": request.job_title,
                        "model": LIQUIDAI_MODEL,
                        "ragEnabled": True
                    }
                }
            )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] Analysis failed: {str(e)}")
        # Return fallback analysis instead of failing completely
        fallback_analysis = create_fallback_analysis(request.job_title, request.job_requirements)
        return AnalysisResponse(
            success=True,
            data={
                "analysis": {
                    "structuredAnalysis": fallback_analysis,
                    "timestamp": "2025-06-15T18:00:00.000Z",
                    "model": "fallback",
                    "ragEnabled": False
                },
                "metadata": {
                    "analyzedAt": "2025-06-15T18:00:00.000Z",
                    "jobTitle": request.job_title,
                    "model": "fallback",
                    "ragEnabled": False,
                    "fallback": True,
                    "error": str(e)
                }
            }
        )

def create_fallback_analysis(job_title, job_requirements):
    """Create a detailed analysis when AI fails"""
    return {
        "overallMatch": {
            "score": 70,
            "level": "Good",
            "summary": f"Resume shows relevant experience for {job_title}. Based on initial assessment, candidate demonstrates foundational skills but may benefit from highlighting specific technical competencies mentioned in the job requirements.",
            "reasoning": "Score based on general alignment with role requirements and presence of related experience. Full AI analysis temporarily unavailable."
        },
        "skillsAnalysis": {
            "totalRequired": len(job_requirements) if job_requirements else 5,
            "exactMatches": len(job_requirements) // 2 if job_requirements else 2,
            "partialMatches": [
                {"required": "web development", "candidate_has": "general development experience", "match_strength": "moderate"}
            ],
            "matchingSkills": job_requirements[:3] if job_requirements else ["Technical skills", "Problem solving", "Communication"],
            "criticalMissing": ["Specific technical skills mentioned in job posting need verification"],
            "importantMissing": ["Advanced proficiency levels in key technologies"],
            "niceToHaveMissing": ["Industry-specific certifications", "Additional frameworks"],
            "skillsScore": 65,
            "detailedAssessment": "Skills assessment requires detailed analysis. Recommend reviewing resume against specific job requirements to identify exact matches and gaps."
        },
        "experienceAnalysis": {
            "yearsRequired": 3,
            "yearsCandidate": 2,
            "meetsRequirement": False,
            "experienceGap": 1,
            "relevantExperience": "Candidate shows professional development experience relevant to the role. Specific project details and impact metrics would strengthen the assessment.",
            "experienceGaps": "May need additional experience in specific domain areas mentioned in job requirements.",
            "industryMatch": "General technical background aligns well with industry requirements.",
            "experienceScore": 70,
            "detailedBreakdown": [
                {
                    "category": "Leadership & Management",
                    "present": True,
                    "evidence": "Some indication of project coordination experience",
                    "jobRequires": True,
                    "assessment": "Shows potential for leadership roles"
                },
                {
                    "category": "Technical Implementation", 
                    "present": True,
                    "evidence": "Technical development experience demonstrated",
                    "jobRequires": True,
                    "assessment": "Strong technical foundation"
                },
                {
                    "category": "Project Management",
                    "present": True,
                    "evidence": "Project experience mentioned",
                    "jobRequires": True,
                    "assessment": "Good project management potential"
                }
            ]
        },
        "keyStrengths": [
            {
                "strength": "Technical Background",
                "relevance": "High",
                "evidence": "Professional development experience",
                "impact": "Strong foundation for the role"
            },
            {
                "strength": "Problem-Solving Skills",
                "relevance": "High", 
                "evidence": "Development work requires analytical thinking",
                "impact": "Essential for technical challenges"
            }
        ],
        "detailedGapAnalysis": {
            "criticalGaps": [
                {
                    "gap": "Specific technical skill verification needed",
                    "impact": "High",
                    "description": "Exact technology matches need to be confirmed against job requirements",
                    "recommendation": "Review resume for specific mentions of required technologies",
                    "timeframe": "1-2 weeks for skill verification"
                }
            ],
            "improvementAreas": [
                {
                    "area": "Technical Skills Highlighting",
                    "currentLevel": "Skills present but may not be prominently displayed",
                    "targetLevel": "Clear alignment with job requirements",
                    "actionPlan": "Reorganize resume to highlight relevant technical skills first"
                }
            ]
        },
        "improvementSuggestions": [
            {
                "title": "🎯 Align Skills with Job Requirements",
                "description": "Review the job posting and ensure your resume prominently features the exact technologies and skills mentioned. Use the same terminology and keywords.",
                "priority": "Critical",
                "category": "Technical Skills",
                "actionItems": [
                    "Map each job requirement to your experience",
                    "Add specific project examples using required technologies",
                    "Include proficiency levels and years of experience for each skill"
                ],
                "resources": "Job posting keywords, skills assessment tools",
                "timeframe": "2-3 days",
                "impact": "Significantly improves ATS matching and recruiter interest"
            },
            {
                "title": "📊 Quantify Your Achievements",
                "description": "Add specific metrics, percentages, and measurable outcomes to your project descriptions and work experience.",
                "priority": "High",
                "category": "Experience",
                "actionItems": [
                    "Add performance improvements (e.g., '40% faster load times')",
                    "Include user/traffic numbers where applicable", 
                    "Mention team sizes and project budgets if relevant"
                ],
                "resources": "Resume writing guides, achievement templates",
                "timeframe": "1 week",
                "impact": "Makes achievements more credible and impressive"
            }
        ],
        "competitiveAdvantages": [
            {
                "advantage": "Technical Development Experience",
                "evidence": "Professional background in software development",
                "marketValue": "High demand for experienced developers in current market"
            }
        ],
        "interviewPreparation": {
            "strengthsToHighlight": [
                {
                    "strength": "Technical Problem-Solving",
                    "talkingPoints": "Specific examples of complex problems solved",
                    "examples": "Prepare 2-3 detailed technical scenarios"
                }
            ],
            "areasToAddress": [
                {
                    "area": "Specific Technology Experience",
                    "strategy": "Prepare detailed examples of work with required technologies",
                    "preparation": "Practice explaining technical projects in detail"
                }
            ],
            "questionsToExpect": [
                "Can you walk me through a challenging project you've worked on?",
                "How do you stay current with new technologies?",
                "Describe a time when you had to learn a new technology quickly."
            ]
        },
        "marketPositioning": {
            "currentLevel": "Mid-level",
            "roleAlignment": "Good fit with potential for growth",
            "salaryExpectation": "Competitive range based on experience and market rates"
        }
    }

@app.post("/chat", response_model=AnalysisResponse)
async def chat_with_resume(request: ChatRequest):
    """Chat about the resume and job description"""
    try:
        print(f"💬 Received chat request:")
        print(f"   - Question: '{request.question}'")
        print(f"   - Session ID: '{request.session_id}'")
        print(f"   - Context available: {request.context is not None}")
        print(f"   - Conversation history length: {len(request.conversation_history) if request.conversation_history else 0}")
        
        if request.context:
            print(f"   - Context job title: {request.context.get('jobTitle', 'N/A')}")
            print(f"   - Context has job description: {bool(request.context.get('jobDescription'))}")
            print(f"   - Context has analysis result: {bool(request.context.get('analysisResult'))}")
        
        session_id = request.session_id or "default"
        
        # Try to get session data, but don't fail if not found
        session = session_data.get(session_id, {})
        print(f"   - Session data available: {bool(session)}")
        if session:
            print(f"   - Session job title: {session.get('job_title', 'N/A')}")
            print(f"   - Session has job description: {bool(session.get('job_description'))}")
            print(f"   - Session has resume text: {bool(session.get('resume_text'))}")
          # Build conversation context with better memory
        conversation_context = ""
        if request.conversation_history:
            # Use last 6 messages for better context (3 exchanges)
            recent_messages = request.conversation_history[-6:]
            for i, msg in enumerate(recent_messages):
                role = msg.get('role', 'user')
                content = msg.get('content', '')
                # Don't truncate the most recent messages as much
                if i >= len(recent_messages) - 2:  # Last 2 messages
                    content = content[:500] if len(content) > 500 else content
                else:
                    content = content[:200] if len(content) > 200 else content
                conversation_context += f"**{role.capitalize()}:** {content}\n\n"
        
        # Build enhanced analysis context
        analysis_context = ""
        if request.context:
            job_title = request.context.get('jobTitle', '')
            job_description = request.context.get('jobDescription', '')
            analysis_result = request.context.get('analysisResult', '')
            
            if job_title:
                analysis_context += f"**Current Job Application:** {job_title}\n"
            if job_description:
                # Include more job description context
                job_desc_excerpt = job_description[:400] if len(job_description) > 400 else job_description
                analysis_context += f"**Job Description:** {job_desc_excerpt}...\n"
            if analysis_result:
                # Include more analysis context
                analysis_excerpt = analysis_result[:500] if len(analysis_result) > 500 else analysis_result
                analysis_context += f"**Previous Analysis Summary:** {analysis_excerpt}...\n"          # Create natural conversational prompt for OpenRouter (LiquidAI)
        # Build the conversation messages for OpenRouter API
        messages = [
            {
                "role": "system", 
                "content": f"""You are a helpful and friendly AI career assistant. You have access to information about a job application and resume analysis.

CONTEXT INFORMATION:
- Job Title: {session.get('job_title', request.context.get('jobTitle', 'Unknown') if request.context else 'Unknown')}
- You have analyzed the candidate's resume against this job posting
- You can provide career advice, interview tips, and resume feedback when asked

CONVERSATION STYLE:
- Be natural and conversational
- Respond to greetings naturally (hi, hello, thanks, etc.)
- Only provide detailed analysis when specifically asked
- Ask follow-up questions to understand what the user needs
- Be supportive and encouraging
- Use the candidate's name if mentioned in the resume

Remember: You're having a conversation, not giving a lecture. Let the user guide what they want to discuss."""
            }
        ]
        
        # Add recent conversation history for context
        if request.conversation_history:
            # Add the last few messages to maintain conversation flow
            recent_messages = request.conversation_history[-6:]  # Last 6 messages for context
            for msg in recent_messages:
                role = msg.get('role', 'user')
                content = msg.get('content', '')
                if role in ['user', 'assistant'] and content:
                    messages.append({
                        "role": role,
                        "content": content
                    })
        
        # Add current user message
        messages.append({
            "role": "user",
            "content": request.question
        })        
        # Call OpenRouter API (LiquidAI) for natural conversation
        chat_response = call_openrouter_api(messages, temperature=0.7)  # Higher temperature for more natural responses
        
        return AnalysisResponse(
            success=True,
            data={                "response": chat_response,
                "sources": [],
                "timestamp": "2025-06-15T18:00:00.000Z"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")

@app.get("/quick-analysis/{analysis_type}")
async def quick_analysis(analysis_type: str):
    """Get quick analysis results"""
    try:
        session_id = "default"
        
        if session_id not in session_data:
            raise HTTPException(status_code=400, detail="No analysis session found. Please analyze first.")
        
        session = session_data[session_id]
        
        questions = {
            "match": "Provide a detailed analysis of how well my resume matches the job requirements. Give me a percentage match and explain the key alignments and gaps.",
            "skills": "What skills and qualifications mentioned in the job description are missing from my resume? Provide specific recommendations.",
            "improvements": "Give me 5 specific suggestions to improve my resume for this job, including keywords I should add and sections I should enhance."
        }
        
        if analysis_type not in questions:
            raise HTTPException(status_code=400, detail=f"Invalid analysis type. Use one of: {list(questions.keys())}")
        
        # Create quick analysis prompt
        prompt = f"""
You are an expert career advisor. Analyze this resume against the job description.

Job Title: {session['job_title']}
Job Description: {session['job_description']}
Resume: {session['resume_text']}

Question: {questions[analysis_type]}

Provide a focused, actionable response.
"""

        messages = [
            {"role": "system", "content": "You are an expert career advisor specializing in resume analysis."},
            {"role": "user", "content": prompt}
        ]
        
        # Get response from OpenRouter (LiquidAI)
        analysis_result = call_openrouter_api(messages)
        
        return AnalysisResponse(
            success=True,
            data={
                "analysis": analysis_result,
                "type": analysis_type,
                "timestamp": "2025-06-15T18:00:00.000Z"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Quick analysis failed: {str(e)}")

@app.get("/status")
async def get_status():
    """Get service status"""
    return {
        "ready": bool(OPENROUTER_API_KEY),
        "active_sessions": len(session_data),
        "openrouter_configured": bool(OPENROUTER_API_KEY),
        "model": LIQUIDAI_MODEL
    }

@app.post("/clear-session")
async def clear_session():
    """Clear analysis session"""
    try:
        session_data.clear()
        return AnalysisResponse(
            success=True,
            data={"message": "Session cleared successfully"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear session: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    print("Starting X-ceed Resume Analyzer API (Simplified)...")
    print("API will be available at: http://localhost:8000")
    print("API docs will be available at: http://localhost:8000/docs")
    print(f"OpenRouter API configured: {bool(OPENROUTER_API_KEY)}")
    print(f"Using model: {LIQUIDAI_MODEL}")
    
    uvicorn.run(
        "simplified_rag_service:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
