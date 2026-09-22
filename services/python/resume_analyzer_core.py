"""
X-ceed Resume Analyzer - Core RAG Engine
Modular chatbot that can be integrated into any project
"""

import os
import requests
from dotenv import load_dotenv
from langchain.text_splitter import RecursiveCharacterTextSplitter
try:
    from langchain_huggingface import HuggingFaceEmbeddings
except ImportError:
    from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma

# Handle both old and new LangChain versions
try:
    # Newer LangChain versions (0.3+)
    from langchain.chains import ConversationalRetrievalChain
    from langchain.memory import ConversationBufferMemory
    from langchain.schema import Document
except ImportError:
    try:
        # Alternative import paths for newer versions
        from langchain.chains.conversational_retrieval.base import ConversationalRetrievalChain
        from langchain.memory.buffer import ConversationBufferMemory
        from langchain_core.documents import Document
    except ImportError:
        # Fallback to langchain_core
        from langchain_core.documents import Document
        # For chains and memory, we'll need to handle this differently
        ConversationalRetrievalChain = None
        ConversationBufferMemory = None
        print("[WARN] ConversationalRetrievalChain and ConversationBufferMemory not available. Vector retrieval will work but conversation chains may not.")
import tempfile
from typing import List, Dict, Optional, Any

class OpenRouterLLMWrapper:
    """Wrapper class to make OpenRouter API calls compatible with LangChain-style LLM interface"""
    def __init__(self, api_key: str, model: str = "liquidai/lfm2.5-1.2b-thinking:free", temperature: float = 0.1):
        self.api_key = api_key
        self.model = model
        self.temperature = temperature
        self.api_url = "https://openrouter.ai/api/v1/chat/completions"
    
    def invoke(self, prompt: str):
        """Invoke the LLM with a prompt (LangChain-compatible interface)"""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": os.getenv("NEXT_PUBLIC_BASE_URL", "http://localhost:3002"),
            "X-Title": "X-CEED Resume Analysis"
        }
        
        payload = {
            "model": self.model,
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "temperature": self.temperature,
            "max_tokens": 4000
        }
        
        try:
            response = requests.post(self.api_url, headers=headers, json=payload, timeout=60)
            response.raise_for_status()
            result = response.json()
            
            if "choices" not in result or not result["choices"]:
                raise ValueError("Invalid response format from OpenRouter API")
            
            content = result["choices"][0]["message"]["content"]
            
            # Return a simple object with .content attribute (LangChain-compatible)
            class Response:
                def __init__(self, content):
                    self.content = content
            
            return Response(content)
        except Exception as e:
            print(f"[ERROR] OpenRouter API call failed: {str(e)}")
            raise

class ResumeAnalyzerCore:
    """
    Core RAG engine for resume analysis that can be integrated into any project.
    Handles document processing, vector storage, and AI conversations.
    """
    
    def __init__(self, openrouter_api_key: str = None, persist_directory: str = None):
        """
        Initialize the core analyzer
        
        Args:
            openrouter_api_key: OpenRouter API key (if not provided, will load from environment)
            persist_directory: Optional persistent directory for vector store. If None, uses temp directory.
        """
        # Load environment variables
        load_dotenv()
        
        self.openrouter_api_key = openrouter_api_key or os.getenv("OPENROUTER_API_KEY")
        if not self.openrouter_api_key:
            raise ValueError("Please provide OpenRouter API key or set OPENROUTER_API_KEY environment variable")
        
        # Store persist directory
        self.persist_directory = persist_directory
        
        # Initialize the LLM wrapper (using LiquidAI model)
        self.llm = OpenRouterLLMWrapper(
            api_key=self.openrouter_api_key,
            model="liquidai/lfm2.5-1.2b-thinking:free",
            temperature=0.1
        )
        
        # Initialize embeddings
        try:
            self.embeddings = HuggingFaceEmbeddings(
                model_name="sentence-transformers/all-MiniLM-L6-v2"
            )
        except Exception as e:
            print(f"[WARN] Could not initialize HuggingFaceEmbeddings: {e}")
            print("[INFO] Trying alternative embedding initialization...")
            # Try with different parameters or fallback
            try:
                from langchain_community.embeddings import HuggingFaceEmbeddings
                self.embeddings = HuggingFaceEmbeddings(
                    model_name="all-MiniLM-L6-v2"
                )
            except Exception as e2:
                print(f"[ERROR] Failed to initialize embeddings: {e2}")
                raise
        
        # Text splitter
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            length_function=len
        )
        
        self.vectorstore = None
        self.conversation_chain = None
        self.chat_history = []
        
    def process_documents(self, resume_text: str, job_description_text: str) -> bool:
        """
        Process resume and job description texts to create vector store
        
        Args:
            resume_text: Full text content of the resume
            job_description_text: Full text content of the job description
            
        Returns:
            bool: True if processing successful, False otherwise
        """
        try:
            documents = []
            
            if resume_text:
                resume_chunks = self.text_splitter.split_text(resume_text)
                for chunk in resume_chunks:
                    documents.append(Document(
                        page_content=chunk,
                        metadata={"source": "resume", "type": "resume_content"}
                    ))
            
            if job_description_text:
                job_chunks = self.text_splitter.split_text(job_description_text)
                for chunk in job_chunks:
                    documents.append(Document(
                        page_content=chunk,
                        metadata={"source": "job_description", "type": "job_requirements"}
                    ))
            
            if documents:
                # Use persistent directory if provided, otherwise use temp directory
                if self.persist_directory:
                    # Ensure directory exists
                    os.makedirs(self.persist_directory, exist_ok=True)
                    persist_directory = self.persist_directory
                else:
                    # Create a temporary directory for ChromaDB
                    persist_directory = tempfile.mkdtemp()
                
                self.vectorstore = Chroma.from_documents(
                    documents=documents, 
                    embedding=self.embeddings,
                    persist_directory=persist_directory
                )
                
                # Create conversation chain
                self._create_conversation_chain()
                return True
            return False
            
        except Exception as e:
            print(f"Error processing documents: {str(e)}")
            return False
    
    def _create_conversation_chain(self):
        """Create conversation chain with memory (if available)"""
        if self.vectorstore and ConversationalRetrievalChain and ConversationBufferMemory:
            try:
                memory = ConversationBufferMemory(
                    memory_key='chat_history',
                    return_messages=True,
                    output_key='answer'
                )
                
                self.conversation_chain = ConversationalRetrievalChain.from_llm(
                    llm=self.llm,
                    retriever=self.vectorstore.as_retriever(search_kwargs={"k": 3}),
                    memory=memory,
                    return_source_documents=True,
                    verbose=False
                )
            except Exception as e:
                print(f"[WARN] Could not create conversation chain: {e}. Using direct vector retrieval only.")
                self.conversation_chain = None
        else:
            # If chains not available, we'll use direct vector retrieval + LLM calls
            self.conversation_chain = None
            print("[INFO] Using direct vector retrieval mode (conversation chains not available)")
    
    def get_relevant_chunks(self, query: str, k: int = 3) -> List[str]:
        """
        Get relevant document chunks using vector similarity search
        
        Args:
            query: The search query
            k: Number of chunks to retrieve (default: 3)
            
        Returns:
            List of relevant chunk texts
        """
        if not self.vectorstore:
            return []
        
        try:
            docs = self.vectorstore.similarity_search(query, k=k)
            return [doc.page_content for doc in docs]
        except Exception as e:
            print(f"Error in similarity search: {str(e)}")
            return []
    
    def ask_question(self, question: str) -> Dict[str, Any]:
        """
        Ask a question about the resume and job description
        
        Args:
            question: The question to ask
            
        Returns:
            Dict containing answer, sources, and metadata
        """
        if not self.vectorstore:
            return {
                "answer": "Please process documents first using process_documents() method.",
                "sources": [],
                "error": "No documents processed"
            }
        
        # If conversation chain is available, use it
        if self.conversation_chain:
            try:
                response = self.conversation_chain({'question': question})
                
                # Store in chat history
                self.chat_history.append({
                    "question": question,
                    "answer": response['answer'],
                    "sources": response.get('source_documents', [])
                })
                
                return {
                    "answer": response['answer'],
                    "sources": response.get('source_documents', []),
                    "success": True
                }
            except Exception as e:
                print(f"[WARN] Conversation chain failed: {e}. Falling back to direct retrieval.")
        
        # Fallback: Use direct vector retrieval + LLM
        try:
            # Get relevant chunks
            relevant_chunks = self.get_relevant_chunks(question, k=3)
            
            if not relevant_chunks:
                return {
                    "answer": "No relevant information found in the documents.",
                    "sources": [],
                    "error": "No relevant chunks"
                }
            
            # Build prompt with retrieved context
            context = "\n\n".join([f"[Chunk {i+1}]: {chunk}" for i, chunk in enumerate(relevant_chunks)])
            prompt = f"""Based on the following context from a resume and job description, answer the question.

Context:
{context}

Question: {question}

Provide a detailed, helpful answer based on the context provided above."""

            # Call LLM directly
            response = self.llm.invoke(prompt)
            
            # Extract answer (handle different response formats)
            if hasattr(response, 'content'):
                answer = response.content
            elif isinstance(response, str):
                answer = response
            else:
                answer = str(response)
            
            # Store in chat history
            self.chat_history.append({
                "question": question,
                "answer": answer,
                "sources": relevant_chunks
            })
            
            return {
                "answer": answer,
                "sources": relevant_chunks,
                "success": True
            }
            
        except Exception as e:
            return {
                "answer": f"Error processing question: {str(e)}",
                "sources": [],
                "error": str(e)
            }
    
    def get_quick_analysis(self, analysis_type: str = "match") -> Dict[str, Any]:
        """
        Get quick analysis results
        
        Args:
            analysis_type: Type of analysis ('match', 'skills', 'improvements')
            
        Returns:
            Dict containing analysis results
        """
        questions = {
            "match": "Provide a detailed analysis of how well my resume matches the job requirements. Give me a percentage match and explain the key alignments and gaps.",
            "skills": "What skills and qualifications mentioned in the job description are missing from my resume? Provide specific recommendations.",
            "improvements": "Give me 5 specific suggestions to improve my resume for this job, including keywords I should add and sections I should enhance."
        }
        
        if analysis_type not in questions:
            return {"error": "Invalid analysis type. Use 'match', 'skills', or 'improvements'"}
        
        return self.ask_question(questions[analysis_type])
    
    def get_comprehensive_analysis(self) -> Dict[str, Any]:
        """
        Get comprehensive analysis similar to the JavaScript version
        
        Returns:
            Dict containing comprehensive analysis results
        """
        try:
            analysis_prompt = """
            Provide a comprehensive analysis of how well my resume matches this job description. 
            Return the analysis in the following structured format:

            OVERALL MATCH SCORE: [0-100]%
            MATCH LEVEL: [Excellent/Good/Fair/Poor]
            SUMMARY: [Brief summary of match quality]

            KEY STRENGTHS:
            - [List 3-5 key strengths with evidence]

            MATCHING SKILLS:
            - [List skills found in both resume and job description]

            MISSING SKILLS:
            - [List critical skills mentioned in job description but missing from resume]

            EXPERIENCE ANALYSIS:
            - Relevant Experience: [Years and specific roles]
            - Experience Gaps: [What experience is missing]

            IMPROVEMENT SUGGESTIONS:
            - [List 5 specific suggestions for improvement]

            COMPETITIVE ADVANTAGES:
            - [What makes this candidate stand out]

            INTERVIEW PREPARATION:
            - Strengths to Highlight: [Key points to emphasize]
            - Areas to Address: [Potential weaknesses to prepare for]

            Provide specific, actionable insights with evidence from the resume.
            """
            
            response = self.ask_question(analysis_prompt)
            
            if response.get('success'):
                return {
                    "success": True,
                    "analysis": response['answer'],
                    "comprehensive": True,
                    "timestamp": "2025-06-15T18:00:00.000Z"
                }
            else:
                return {
                    "success": False,
                    "error": response.get('error', 'Analysis failed'),
                    "analysis": response.get('answer', 'No analysis available')
                }
                
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "analysis": "Failed to generate comprehensive analysis"
            }
    
    def get_chat_history(self) -> List[Dict]:
        """Get the complete chat history"""
        return self.chat_history
    
    def clear_session(self):
        """Clear the current session"""
        self.vectorstore = None
        self.conversation_chain = None
        self.chat_history = []
    
    def is_ready(self) -> bool:
        """Check if the analyzer is ready to answer questions"""
        return self.conversation_chain is not None


# Utility functions for document processing
class DocumentProcessor:
    """Utility class for processing different document types"""
    
    @staticmethod
    def extract_text_from_pdf(pdf_file_bytes: bytes) -> str:
        """Extract text from PDF bytes"""
        try:
            import PyPDF2
            import io
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(pdf_file_bytes))
            text = ""
            for page in pdf_reader.pages:
                text += page.extract_text()
            return text
        except Exception as e:
            return f"Error reading PDF: {str(e)}"
    
    @staticmethod
    def extract_text_from_docx(docx_file_bytes: bytes) -> str:
        """Extract text from DOCX bytes"""
        try:
            from docx import Document
            import io
            doc = Document(io.BytesIO(docx_file_bytes))
            text = ""
            for paragraph in doc.paragraphs:
                text += paragraph.text + "\n"
            return text
        except Exception as e:
            return f"Error reading DOCX: {str(e)}"
    
    @staticmethod
    def extract_text_from_txt(txt_file_bytes: bytes) -> str:
        """Extract text from TXT bytes"""
        try:
            return txt_file_bytes.decode('utf-8')
        except Exception as e:
            return f"Error reading TXT: {str(e)}"
    
    @classmethod
    def process_file(cls, file_bytes: bytes, file_type: str) -> str:
        """
        Process file based on type
        
        Args:
            file_bytes: File content as bytes
            file_type: File type ('pdf', 'docx', 'txt')
            
        Returns:
            Extracted text content
        """
        processors = {
            'pdf': cls.extract_text_from_pdf,
            'docx': cls.extract_text_from_docx,
            'txt': cls.extract_text_from_txt
        }
        
        processor = processors.get(file_type.lower())
        if processor:
            return processor(file_bytes)
        else:
            return f"Unsupported file type: {file_type}"


if __name__ == "__main__":
    # Example usage
    analyzer = ResumeAnalyzerCore()
    
    # Example texts (you would get these from your document processing)
    sample_resume = "John Doe, Software Engineer with 5 years experience in Python, React, and AWS..."
    sample_job = "We are looking for a Senior Software Engineer with Python, React, and cloud experience..."
    
    # Process documents
    success = analyzer.process_documents(sample_resume, sample_job)
    
    if success:
        # Ask questions
        response = analyzer.ask_question("How well does my resume match this job?")
        print(response["answer"])
        
        # Get quick analysis
        match_analysis = analyzer.get_quick_analysis("match")
        print(match_analysis["answer"])
