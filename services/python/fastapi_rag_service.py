"""
FastAPI service for Resume RAG Analysis
Provides REST API endpoints for the Next.js frontend
"""

from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any
import os
import tempfile
from resume_analyzer_core import ResumeAnalyzerCore, DocumentProcessor

# Initialize FastAPI app
app = FastAPI(
    title="X-ceed Resume Analyzer API",
    description="RAG-powered resume analysis service",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3002", "http://localhost:3000"],  # Next.js dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global analyzer instance (in production, you'd want session management)
analyzer = ResumeAnalyzerCore()

# Pydantic models
class AnalysisRequest(BaseModel):
    resume_text: str
    job_description: str
    job_title: str
    job_requirements: Optional[list] = []

class ChatRequest(BaseModel):
    question: str
    session_id: Optional[str] = None

class AnalysisResponse(BaseModel):
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "X-ceed Resume Analyzer API",
        "status": "running",
        "version": "1.0.0"
    }

@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_resume(request: AnalysisRequest):
    """
    Analyze resume against job description
    """
    try:
        # Process documents
        success = analyzer.process_documents(
            request.resume_text, 
            request.job_description
        )
        
        if not success:
            raise HTTPException(status_code=400, detail="Failed to process documents")
        
        # Get comprehensive analysis
        analysis_result = analyzer.get_comprehensive_analysis()
        
        if not analysis_result.get('success'):
            raise HTTPException(status_code=500, detail=analysis_result.get('error', 'Analysis failed'))
        
        return AnalysisResponse(
            success=True,
            data={
                "analysis": {
                    "comprehensiveAnalysis": analysis_result['analysis'],
                    "timestamp": analysis_result.get('timestamp'),
                    "model": "liquidai/lfm2.5-1.2b-thinking:free",
                    "ragEnabled": True
                },
                "metadata": {
                    "analyzedAt": analysis_result.get('timestamp'),
                    "jobTitle": request.job_title,
                    "model": "liquidai/lfm2.5-1.2b-thinking:free",
                    "ragEnabled": True
                }
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@app.post("/chat", response_model=AnalysisResponse)
async def chat_with_resume(request: ChatRequest):
    """
    Chat about the resume and job description
    """
    try:
        if not analyzer.is_ready():
            raise HTTPException(status_code=400, detail="No documents processed. Please analyze first.")
        
        response = analyzer.ask_question(request.question)
        
        if not response.get('success'):
            raise HTTPException(status_code=500, detail=response.get('error', 'Chat failed'))
        
        return AnalysisResponse(
            success=True,
            data={
                "response": response['answer'],
                "sources": response.get('sources', []),
                "timestamp": "2025-06-15T18:00:00.000Z"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")

@app.get("/quick-analysis/{analysis_type}")
async def quick_analysis(analysis_type: str):
    """
    Get quick analysis results
    """
    try:
        if not analyzer.is_ready():
            raise HTTPException(status_code=400, detail="No documents processed. Please analyze first.")
        
        valid_types = ["match", "skills", "improvements"]
        if analysis_type not in valid_types:
            raise HTTPException(status_code=400, detail=f"Invalid analysis type. Use one of: {valid_types}")
        
        response = analyzer.get_quick_analysis(analysis_type)
        
        if response.get('error'):
            raise HTTPException(status_code=500, detail=response['error'])
        
        return AnalysisResponse(
            success=True,
            data={
                "analysis": response['answer'],
                "type": analysis_type,
                "timestamp": "2025-06-15T18:00:00.000Z"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Quick analysis failed: {str(e)}")

@app.get("/chat-history")
async def get_chat_history():
    """
    Get chat history
    """
    try:
        history = analyzer.get_chat_history()
        return AnalysisResponse(
            success=True,
            data={"history": history}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get chat history: {str(e)}")

@app.post("/clear-session")
async def clear_session():
    """
    Clear the current analysis session
    """
    try:
        analyzer.clear_session()
        return AnalysisResponse(
            success=True,
            data={"message": "Session cleared successfully"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear session: {str(e)}")

@app.get("/status")
async def get_status():
    """
    Get analyzer status
    """
    return {
        "ready": analyzer.is_ready(),
        "has_documents": analyzer.vectorstore is not None,
        "chat_history_length": len(analyzer.get_chat_history())
    }

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting X-ceed Resume Analyzer API...")
    print("📊 API will be available at: http://localhost:8000")
    print("📚 API docs will be available at: http://localhost:8000/docs")
    
    uvicorn.run(
        "fastapi_rag_service:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
