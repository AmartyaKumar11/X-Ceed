'use client';

import { useState, useEffect, useRef, Suspense} from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { 
  Target,
  Send,
  Bot,
  User,
  Brain,
  Sparkles,
  MessageSquare,
  Award,
  Briefcase,
  DollarSign,
  CheckCircle,
  AlertCircle,
  Lightbulb,
  Loader2,
  ArrowLeft,
  Square,
  GraduationCap,
  Video
} from 'lucide-react';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import EnhancedVideoSelector from "@/components/prep-plan/EnhancedVideoSelector";
import { peekResumeMatchJob } from "@/lib/resumeMatchHandoff";

function ResumeMatchPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const chatEndRef = useRef(null);
  
  // URL parameters
  const jobId = searchParams.get('jobId');
  const resumeId = searchParams.get('resumeId');
  const resumeFilename = searchParams.get('resumeFilename');
  const resumeName = searchParams.get('resumeName');
  const jobDesc = searchParams.get('jobDesc');
  const requirementsParam = searchParams.get('requirements');
  const companyNameParam = searchParams.get('companyName');
  const jobTypeParam = searchParams.get('jobType');
  
  // State management
  const [job, setJob] = useState(null);
  const [userResume, setUserResume] = useState(null);
  const [ragAnalysis, setRagAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [prepPlanCreated, setPrepPlanCreated] = useState(false);
  const [prepPlanDuration, setPrepPlanDuration] = useState(4); // Add duration state
  
  // Enhanced video selection states
  const [showVideoSelector, setShowVideoSelector] = useState(false);
  const [extractedSkills, setExtractedSkills] = useState([]);
  const [customPlanGenerated, setCustomPlanGenerated] = useState(null);
  
    // Chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');  const [chatLoading, setChatLoading] = useState(false);
  const [chatInitialized, setChatInitialized] = useState(false);  const [typingMessageIndex, setTypingMessageIndex] = useState(-1);
  const [abortController, setAbortController] = useState(null);
  const [isTypingResponse, setIsTypingResponse] = useState(false);
  const partialContentRef = useRef('');// Typewriter effect component
  const TypewriterText = ({ text, speed = 30, onComplete, onPartialUpdate }) => {
    const [displayedText, setDisplayedText] = useState('');
    const [isTyping, setIsTyping] = useState(true);
    const [showCursor, setShowCursor] = useState(true);

    useEffect(() => {
      if (!isTyping) return;

      let index = 0;
      const timer = setInterval(() => {
        if (index < text.length) {
          const newText = text.slice(0, index + 1);
          setDisplayedText(newText);
          // Report partial update for stopping functionality
          if (onPartialUpdate) {
            onPartialUpdate(newText);
          }
          index++;
        } else {
          setIsTyping(false);
          clearInterval(timer);
          // Hide cursor after a short delay
          setTimeout(() => setShowCursor(false), 500);
          if (onComplete) onComplete();
        }
      }, speed);

      return () => clearInterval(timer);
    }, [text, speed, isTyping, onComplete, onPartialUpdate]);// Blinking cursor effect
    useEffect(() => {
      if (!isTyping && !showCursor) return;
      
      const cursorTimer = setInterval(() => {
        setShowCursor(prev => !prev);
      }, 600); // Slightly slower blink for more natural feel

      return () => clearInterval(cursorTimer);
    }, [isTyping]);

    return (
      <div className="relative">
        <div 
          className="text-sm leading-relaxed prose prose-sm max-w-none dark:prose-invert"
          dangerouslySetInnerHTML={{
            __html: displayedText
              .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold">$1</strong>')
              .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
              .replace(/^- (.*?)$/gm, '<div class="flex items-start gap-2 my-1"><span class="text-blue-500 mt-1">•</span><span>$1</span></div>')
              .replace(/^(\d+)\. (.*?)$/gm, '<div class="flex items-start gap-2 my-1"><span class="text-green-600 font-semibold min-w-[1.5rem]">$1.</span><span>$2</span></div>')
              .replace(/\n\n/g, '<div class="my-2"></div>')
              .replace(/\n/g, '<br>')
          }}
        />        {(isTyping || showCursor) && (
          <span className="inline-block w-0.5 h-4 bg-gray-700 dark:bg-gray-300 ml-0.5" />
        )}
      </div>
    );
  };

  // Debug logging
  useEffect(() => {
    console.log('🔍 Resume Match Page Debug:', {
      jobId,
      resumeId,
      resumeFilename,
      resumeName,
      job,
      userResume,
      ragAnalysis,
      loading,
      analyzing
    });
  }, [jobId, resumeId, resumeFilename, resumeName, job, userResume, ragAnalysis, loading, analyzing]);  // Fetch data on component mount
  useEffect(() => {
    fetchData();
  }, [jobId]);

  // Check for existing prep plan when job data is loaded
  useEffect(() => {
    if (job) {
      checkPrepPlanExists();
    }
  }, [job]);// Ensure page is scrollable on mount
  useEffect(() => {
    // Fix scrolling issues that might be caused by CSS constraints
    const fixScrolling = () => {
      // Only fix document scrolling, don't touch specific elements
      document.body.style.height = 'auto';
      document.body.style.overflow = 'auto';
      document.documentElement.style.height = 'auto';
      document.documentElement.style.overflow = 'auto';
      
      // Fix main content container but be very specific to avoid sidebar
      const mainContent = document.querySelector('main');
      if (mainContent && !mainContent.closest('.sidebar')) {
        mainContent.style.height = 'auto';
        mainContent.style.maxHeight = 'none';
        mainContent.style.overflow = 'visible';
      }
    };

    // Apply immediately and after a short delay
    fixScrolling();
    const timer = setTimeout(fixScrolling, 100);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (chatEndRef.current && chatMessages.length > 0) {
      // Only scroll if there are messages and user hasn't scrolled up
      setTimeout(() => {
        chatEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }
  }, [chatMessages]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch job data
      let jobData = null;
      const stashed = peekResumeMatchJob(jobId);
      if (stashed?.description) {
        // External/remote job handoff via sessionStorage (avoids HTTP 431 from huge query strings)
        jobData = {
          _id: stashed.jobId || jobId || 'external',
          title: stashed.title || 'External Job',
          description: stashed.description,
          requirements: stashed.requirements || [],
          companyName: stashed.companyName || '',
          jobType: stashed.jobType || '',
          location: stashed.location,
          applicationUrl: stashed.applicationUrl,
          remote: stashed.remote,
          source: stashed.source,
        };
        setJob(jobData);
        console.log('🌐 Using stashed external job data:', jobData.title);
      } else if (jobDesc) {
        // Legacy: short jobDesc in query (keep for old bookmarks)
        jobData = {
          _id: jobId || 'external',
          title: searchParams.get('jobTitle') || 'External Job',
          description: decodeURIComponent(jobDesc),
          requirements: requirementsParam ? JSON.parse(requirementsParam) : [],
          companyName: companyNameParam || '',
          jobType: jobTypeParam || '',
        };
        setJob(jobData);
        console.log('🌐 Using external job data from query:', jobData);
      } else if (jobId && !String(jobId).startsWith('remote_')) {
        // Internal job: fetch from API
        console.log('📋 Fetching job data for:', jobId);
        const jobResponse = await fetch(`/api/jobs/${jobId}`);
        if (jobResponse.ok) {
          const jobResponseData = await jobResponse.json();
          // API returns { job: jobObject }, so extract the job
          jobData = jobResponseData.job || jobResponseData;
          
          // If description is empty but jobDescriptionFile exists, try to load it
          if (!jobData.description && jobData.jobDescriptionFile) {
            try {
              console.log('📄 Loading job description from file:', jobData.jobDescriptionFile);
              const filePath = jobData.jobDescriptionFile.startsWith('/') 
                ? jobData.jobDescriptionFile 
                : `/${jobData.jobDescriptionFile}`;
              
              // Try to extract PDF content using the extract-pdf API
              try {
                // Ensure filePath is relative to public folder
                const cleanPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
                
                const extractResponse = await fetch('/api/extract-pdf', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ filePath: cleanPath })
                });
                
                if (extractResponse.ok) {
                  const extractData = await extractResponse.json();
                  if (extractData.success && extractData.data?.text) {
                    jobData.description = extractData.data.text;
                    console.log('✅ Loaded job description from PDF file:', extractData.data.text.substring(0, 100) + '...');
                  } else {
                    console.warn('⚠️ PDF extraction succeeded but no text found');
                  }
                } else {
                  const errorData = await extractResponse.json().catch(() => ({}));
                  console.warn('⚠️ PDF extraction API failed:', extractResponse.status, errorData);
                  
                  // Fallback: try direct file read if it's a text file
                  try {
                    const directResponse = await fetch(filePath);
                    if (directResponse.ok) {
                      const contentType = directResponse.headers.get('content-type');
                      if (contentType?.includes('text')) {
                        const text = await directResponse.text();
                        jobData.description = text;
                        console.log('✅ Loaded job description directly from text file');
                      }
                    }
                  } catch (e) {
                    console.warn('⚠️ Could not load job description file:', e);
                  }
                }
              } catch (extractError) {
                console.warn('⚠️ PDF extraction failed:', extractError);
              }
            } catch (error) {
              console.warn('⚠️ Error loading job description file:', error);
            }
          }
          
          setJob(jobData);
          console.log('✅ Job data loaded:', jobData.title);
          console.log('📋 Job details:', {
            title: jobData.title,
            description: jobData.description ? `${jobData.description.substring(0, 100)}...` : 'No description',
            requirements: jobData.requirements ? `${jobData.requirements.length} requirements` : 'No requirements',
            hasDescriptionFile: !!jobData.jobDescriptionFile
          });
        }
      }

      // Handle resume data
      let resumeData = null;
      if (resumeFilename) {
        resumeData = {
          filename: resumeFilename,
          name: resumeName || resumeFilename,
          resumePath: `/uploads/temp-resumes/${resumeFilename}`
        };
        setUserResume(resumeData);
        console.log('📄 Using uploaded resume:', resumeData);
      }

      // Start RAG analysis
      if (jobData && resumeData) {
        console.log('🤖 Starting RAG analysis...');
        await performRagAnalysis(jobData, resumeData);
      } else {
        console.warn('⚠️ Cannot start analysis - Missing data:', {
          hasJob: !!jobData,
          hasResume: !!resumeData,
          jobTitle: jobData?.title,
          resumeFilename: resumeData?.filename
        });
      }
    } catch (error) {
      console.error('❌ Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };  const performRagAnalysis = async (jobData, resumeData) => {
    setAnalyzing(true);
    try {
      const token = localStorage.getItem('token');
      console.log('🔑 Token status:', token ? 'Found' : 'Missing');
      
      console.log('🤖 Starting analysis with data:', { jobTitle: jobData.title, resumePath: resumeData.resumePath });
      
      // Try Python-powered RAG service first
      const headers = {
        'Content-Type': 'application/json'
      };
      
      // Only add Authorization header if token exists
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
        const requestBody = {
        action: 'analyze',  // Add the required action parameter
        jobId: jobData._id,
        jobTitle: jobData.title,
        jobDescription: jobData.description,
        jobRequirements: jobData.requirements || [],
        resumePath: resumeData.resumePath
      };
      
      console.log('📤 Sending request body:', JSON.stringify(requestBody, null, 2));
      
      const response = await fetch('/api/resume-rag-python', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
      });

      console.log('📊 API Response status:', response.status);
      console.log('📊 API Response ok:', response.ok);
      
      if (!response.ok) {
        // Log the response details for debugging
        const responseText = await response.text();
        console.error('❌ RAG analysis failed:', response.status, response.statusText);
        console.error('❌ Response body:', responseText);
        
        let errorData;
        try {
          errorData = JSON.parse(responseText);
        } catch (parseError) {
          errorData = { message: responseText || 'Unknown error' };
        }
        console.error('❌ Error details:', errorData);
        
        // Set a fallback message for the user
        setRagAnalysis({
          overallMatch: {
            score: 0,
            level: "Analysis Failed",
            summary: `API Error: ${response.status} - ${errorData.message || response.statusText}`
          },
          error: true,
          errorDetails: errorData
        });
        return;
      }

      // If we get here, response is OK
      const result = await response.json();
        console.log('🔍 Full response from API:', result);
        console.log('📄 Resume text in response:', result.data?.resumeText ? `${result.data.resumeText.length} characters` : 'Missing');
        
        // Handle both structured and text-based analysis
        const analysisData = result.data?.analysis || result.data || result;
        console.log('📈 Extracted analysis data:', analysisData);
        console.log('📈 Analysis data type:', typeof analysisData);
        console.log('📈 Analysis data keys:', Object.keys(analysisData || {}));
        
        // Check if we have structured analysis
        if (analysisData?.structuredAnalysis) {
          // Use structured analysis from Python service (preferred)
          console.log('✅ Using Python structured analysis');
          console.log('📋 Structured analysis keys:', Object.keys(analysisData.structuredAnalysis));
          setRagAnalysis({
            structuredAnalysis: analysisData.structuredAnalysis,
            resumeText: result.data?.resumeText, // Store the extracted resume text
            pythonPowered: true,
            timestamp: analysisData.timestamp || new Date().toISOString()
          });
        } else if (analysisData?.comprehensiveAnalysis) {
          // Fallback to text-based comprehensive analysis from Python service
          console.log('✅ Using Python comprehensive analysis (fallback)');
          
          // Parse the JSON string if it's a string
          let parsedAnalysis = analysisData.comprehensiveAnalysis;
          if (typeof parsedAnalysis === 'string') {
            try {
              parsedAnalysis = JSON.parse(parsedAnalysis);
              console.log('✅ Successfully parsed JSON analysis:', parsedAnalysis);
            } catch (parseError) {
              console.warn('⚠️ Could not parse analysis JSON, using as string:', parseError);
            }
          }
            setRagAnalysis({
            structuredAnalysis: typeof parsedAnalysis === 'object' ? parsedAnalysis : null,
            comprehensiveAnalysis: analysisData.comprehensiveAnalysis,
            resumeText: result.data?.resumeText, // Store the extracted resume text 
            pythonPowered: true,
            timestamp: analysisData.timestamp || new Date().toISOString()
          });
        } else {
          // Fallback to any other structured analysis
          console.log('⚠️ Using fallback analysis format');
          console.log('⚠️ Fallback data type:', typeof analysisData);
          console.log('⚠️ Fallback data:', analysisData);
          
          // Try to extract structured data from various formats
          let structuredAnalysis = null;
          let comprehensiveAnalysis = null;
          
          // Check if analysisData is already structured JSON
          if (analysisData && typeof analysisData === 'object') {
            // Look for various property names that might contain structured data
            structuredAnalysis = analysisData.structuredAnalysis || 
                               analysisData.structured_analysis ||
                               analysisData.analysis ||
                               (analysisData.overallMatch ? analysisData : null);
            
            comprehensiveAnalysis = analysisData.comprehensiveAnalysis ||
                                  analysisData.comprehensive_analysis ||
                                  analysisData.analysis_text ||
                                  analysisData.summary;
          }
          
          // Create a well-structured fallback
          const fallbackAnalysis = {
            structuredAnalysis: structuredAnalysis,
            comprehensiveAnalysis: comprehensiveAnalysis || JSON.stringify(analysisData, null, 2),
            resumeText: result.data?.resumeText,
            pythonPowered: true,
            fallback: true,
            timestamp: new Date().toISOString()
          };
          
          console.log('📋 Final fallback structure:', {
            hasStructuredAnalysis: !!fallbackAnalysis.structuredAnalysis,
            hasComprehensiveAnalysis: !!fallbackAnalysis.comprehensiveAnalysis,
            fallback: fallbackAnalysis.fallback
          });
          
          setRagAnalysis(fallbackAnalysis);
        }
        
        setChatInitialized(true);
          // Add welcome message
        const welcomeMessage = {
          role: 'assistant',
          content: `Hello! I've analyzed your resume against the "${jobData.title}" position. I can answer questions about your match, skills, experience, and provide interview tips. What would you like to know?`,
          timestamp: new Date().toISOString(),
          isTyping: true
        };
        
        setChatMessages([welcomeMessage]);
        setTypingMessageIndex(0);
          console.log('✅ RAG analysis completed successfully');
    } catch (error) {
      console.error('❌ RAG analysis error:', error);
      
      // Set error state with fallback content
      setRagAnalysis({
        error: true,
        errorMessage: error.message || 'Analysis failed',
        comprehensiveAnalysis: `❌ Analysis Error: ${error.message || 'Unable to analyze resume'}\n\nPlease try again or check your connection.`,
        pythonPowered: false,
        timestamp: new Date().toISOString()
      });
    } finally {
      setAnalyzing(false);
    }
  };
  
  const sendChatMessage = async () => {
    console.log('🔍 sendChatMessage called:', {
      chatInput: chatInput.trim(),
      chatInitialized,
      chatLoading,
      isTypingResponse,
      typingMessageIndex
    });
    
    if (!chatInput.trim() || !chatInitialized || chatLoading || isTypingResponse) {
      console.log('❌ Message blocked by validation');
      return;
    }

    console.log('✅ Message validation passed, sending...');

    // Cancel any ongoing request
    if (abortController) {
      console.log('🛑 Cancelling previous request');
      abortController.abort();
    }

    const newAbortController = new AbortController();
    setAbortController(newAbortController);

    const userMessage = {
      role: 'user',
      content: chatInput.trim(),
      timestamp: new Date().toISOString()
    };    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setChatLoading(true);

    try {
      const token = localStorage.getItem('token');
      
      const headers = {
        'Content-Type': 'application/json'
      };
      
      // Only add Authorization header if token exists
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }      const requestBody = {
        action: 'chat',
        question: userMessage.content,
        sessionId: 'default',
        conversationHistory: chatMessages,
        analysisContext: ragAnalysis ? {
          jobTitle: job?.title,
          jobDescription: job?.description,
          jobRequirements: job?.requirements || [],
          resumePath: userResume?.resumePath,
          resumeText: ragAnalysis.resumeText || ragAnalysis.resumeContent, // Include resume content
          analysisResult: ragAnalysis.comprehensiveAnalysis || ragAnalysis.overallMatch?.summary,
          structuredAnalysis: ragAnalysis.structuredAnalysis, // Include detailed analysis
          timestamp: new Date().toISOString()
        } : {
          jobTitle: job?.title,
          jobDescription: job?.description,
          jobRequirements: job?.requirements || [],
          resumePath: userResume?.resumePath
        }
      };
      
      console.log('💬 Sending chat request:', {
        question: userMessage.content,
        hasAnalysisContext: !!ragAnalysis,
        resumeTextLength: ragAnalysis?.resumeText?.length || 0,
        contextKeys: ragAnalysis ? Object.keys(requestBody.analysisContext) : []
      });

      const response = await fetch('/api/resume-rag-python', {
        method: 'POST',
        headers: headers,
        signal: newAbortController.signal,
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        const result = await response.json();
        const assistantMessage = {
          role: 'assistant',
          content: result.data?.response || result.response || 'I apologize, but I encountered an issue processing your question.',
          timestamp: new Date().toISOString(),
          isTyping: true
        };    // Add the message and start typewriter effect
        setChatMessages(prev => {
          const newMessages = [...prev, assistantMessage];
          setTypingMessageIndex(newMessages.length - 1);
          setIsTypingResponse(true);
          partialContentRef.current = ''; // Reset partial content
          console.log('🎬 Starting typewriter effect:', {
            messageIndex: newMessages.length - 1,
            isTypingResponse: true
          });
          return newMessages;
        });

        // Check if the user's message was asking for prep plan creation
        checkForPrepPlanRequest(userMessage.content);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Request was aborted');
        return;
      }
      console.error('❌ Chat error:', error);
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setChatLoading(false);
      setAbortController(null);
    }
  };  const checkForPrepPlanRequest = (userMessage) => {
    const prepPlanKeywords = [
      'prep plan', 'preparation plan', 'learning plan', 'study plan',
      'how to prepare', 'how can i prepare', 'what should i learn', 'skills to develop',
      'create prep plan', 'make a plan', 'learning path', 'study guide',
      'skills should i develop', 'what skills', 'prepare for this', 'get ready for'
    ];

    const lowerMessage = userMessage.toLowerCase();
    const containsPrepPlanKeyword = prepPlanKeywords.some(keyword => 
      lowerMessage.includes(keyword)
    );

    if (containsPrepPlanKeyword) {
      console.log('🎯 Detected prep plan request in user message');
      
      // Add a simple response directing to the button
      setTimeout(() => {
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: `To create a personalized learning plan for this job, simply click the "Create Learning Plan for This Job" button above. It will analyze the job requirements and generate a customized study plan for you! 📚`,
          timestamp: new Date().toISOString(),
          isTyping: true
        }]);
      }, 1000);
    }
  };const stopResponse = () => {
    // Stop current request
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
    
    // Save partial content and stop typing animation
    if (typingMessageIndex !== -1) {
      setChatMessages(prev => 
        prev.map((msg, i) => 
          i === typingMessageIndex ? { 
            ...msg, 
            isTyping: false,
            content: partialContentRef.current || msg.content
          } : msg
        )
      );
      setTypingMessageIndex(-1);
      partialContentRef.current = '';
    }
    
    // Reset states
    setIsTypingResponse(false);
    setChatLoading(false);
  };  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      console.log('⌨️ Enter key pressed:', {
        chatLoading,
        isTypingResponse,
        canSend: !chatLoading && !isTypingResponse
      });
      if (!chatLoading && !isTypingResponse) {
        sendChatMessage();
      } else {
        console.log('🚫 Enter key blocked - chat is busy');
      }
    }
  };  const createPrepPlan = async () => {
    console.log('🎯 createPrepPlan function called');
    console.log('📊 Current state:', {
      job: job ? { id: job._id, title: job.title } : null,
      ragAnalysis: !!ragAnalysis,
      prepPlanCreated,
      token: !!localStorage.getItem('token')
    });

    if (!job) {
      console.error('❌ No job data available for prep plan creation');
      alert('Error: No job data available. Please refresh the page and try again.');
      return;
    }

    try {
      console.log('🎯 Creating prep plan for job:', job.title);
      
      // Show loading state (you could add a loading state here if needed)
      console.log('⏳ Calling createPrepPlanRecord...');
      
      // Create prep plan record
      const prepPlanData = await createPrepPlanRecord(job);
      console.log('📋 createPrepPlanRecord result:', prepPlanData);
        
      if (prepPlanData) {
        console.log('✅ Prep plan created successfully! You can view it in the Prep Plans section.');
        setPrepPlanCreated(true);
          // Add a success message to the chat
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: `🎉 **Learning plan created successfully!** 

I've added "${job.title}" ${job.companyName || job.company ? `at ${job.companyName || job.company}` : ''} to your prep plans. You can now:

• **View it anytime** in the "Prep Plans" section from the sidebar
• **Track your progress** as you learn new skills
• **Access personalized learning materials** based on this job's requirements

The prep plan is ready and waiting for you! 🚀`,
          timestamp: new Date().toISOString(),
          isTyping: true,
          isPrepPlanSuccess: true
        }]);
        
        // Auto-scroll to the new message
        setTimeout(() => {
          if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
          }
        }, 100);
        
      } else {
        console.log('⚠️ No prep plan data returned, but no error occurred');
        alert('The prep plan creation completed, but there may have been an issue. Please check the Prep Plans section.');
      }
      
    } catch (error) {
      console.error('❌ Error creating prep plan:', error);
      alert(`Error creating prep plan: ${error.message}. Please try again.`);
    }
  };
  const createPrepPlanRecord = async (jobData) => {
    console.log('📝 createPrepPlanRecord called with:', {
      jobId: jobData._id,
      jobTitle: jobData.title,
      companyName: jobData.companyName
    });
    
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('⚠️ No authentication token available');
        throw new Error('Authentication required. Please log in and try again.');
      }

      console.log('🔐 Token found, making API request...');
      
      // Include resume analysis data for personalized prep plans
      const requestBody = {
        jobId: jobData._id,
        jobTitle: jobData.title,
        companyName: jobData.companyName || jobData.company || 'Company Not Specified',
        jobDescription: jobData.description || jobData.jobDescriptionText,
        requirements: jobData.requirements,
        location: jobData.location,
        salaryRange: jobData.salaryRange || `${jobData.salaryMin || 0}-${jobData.salaryMax || 0} ${jobData.currency || 'USD'}`,
        jobType: jobData.jobType,
        department: jobData.department,
        level: jobData.level,
        workMode: jobData.workMode,
        duration: prepPlanDuration, // Add duration from state
        source: 'resume-match',
        // Add resume analysis data for personalized prep plans
        resumeAnalysis: ragAnalysis ? {
          structuredAnalysis: ragAnalysis.structuredAnalysis,
          comprehensiveAnalysis: ragAnalysis.comprehensiveAnalysis,
          resumeText: ragAnalysis.resumeText,
          gapAnalysis: ragAnalysis.structuredAnalysis?.gap_analysis || ragAnalysis.structuredAnalysis?.gapAnalysis,
          missingSkills: ragAnalysis.structuredAnalysis?.missing_skills || ragAnalysis.structuredAnalysis?.missingSkills,
          matchingSkills: ragAnalysis.structuredAnalysis?.matching_skills || ragAnalysis.structuredAnalysis?.matchingSkills,
          skillsToImprove: ragAnalysis.structuredAnalysis?.skills_to_improve || ragAnalysis.structuredAnalysis?.skillsToImprove
        } : null
      };
      
      console.log('📡 API request body:', requestBody);

      const response = await fetch('/api/prep-plans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      });

      console.log('📡 API response status:', response.status);

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Prep plan created successfully:', result.data);
        return result.data;
      } else if (response.status === 409) {
        // Prep plan already exists, that's fine
        console.log('ℹ️ Prep plan already exists for this job');
        setPrepPlanCreated(true);
        return { existing: true };
      } else if (response.status === 401) {
        console.error('❌ Authentication failed');
        throw new Error('Authentication failed. Please log in again.');
      } else if (response.status === 403) {
        console.error('❌ Access forbidden');
        throw new Error('Access denied. Make sure you have the right permissions.');
      } else {
        console.error('❌ API request failed:', response.status, response.statusText);
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error('❌ Error details:', errorData);
        throw new Error(`Failed to create prep plan: ${errorData.message || response.statusText}`);
      }
    } catch (error) {
      console.error('❌ Error in createPrepPlanRecord:', error);
      throw error; // Re-throw to be handled by the calling function
    }
  };
  // Extract skills from analysis for video selection
  const extractSkillsFromAnalysis = () => {
    const skills = new Set();
    
    if (ragAnalysis?.structuredAnalysis) {
      // Add missing skills
      ragAnalysis.structuredAnalysis.missingSkills?.forEach(skill => skills.add(skill));
      
      // Add skills to advance
      ragAnalysis.structuredAnalysis.skillsToAdvance?.forEach(skill => skills.add(skill));
      
      // Add skills from gap analysis
      ragAnalysis.structuredAnalysis.gap_analysis?.technical_gaps?.forEach(gap => {
        if (gap.skill) skills.add(gap.skill);
      });
      
      // Add key strengths that can be improved
      ragAnalysis.structuredAnalysis.keyStrengths?.forEach(strength => {
        if (typeof strength === 'object' && strength.title) {
          skills.add(strength.title);
        } else if (typeof strength === 'string') {
          skills.add(strength);
        }
      });
    }
    
    // Add job requirements as potential skills
    if (job?.requirements) {
      job.requirements.forEach(req => {
        // Extract technical terms from requirements
        const techTerms = req.match(/\b(React|Vue|Angular|JavaScript|Python|Java|Node\.js|MongoDB|SQL|AWS|Docker|Kubernetes|Git|API|REST|GraphQL|TypeScript|CSS|HTML|Express|Django|Spring|Laravel)\b/gi);
        if (techTerms) {
          techTerms.forEach(term => skills.add(term));
        }
      });
    }
    
    return Array.from(skills).slice(0, 8); // Limit to 8 skills to keep manageable
  };

  // Handle custom plan generation
  const handleCustomPlanGenerated = async (customPlan) => {
    try {
      console.log('🎯 Generating custom prep plan:', customPlan);
      
      // Add job information to the custom plan
      const enhancedPlan = {
        ...customPlan,
        jobData: job,
        jobTitle: job.title,
        companyName: job.companyName || job.company,
        resumeAnalysis: ragAnalysis
      };
      
      const response = await fetch('/api/prep-plans/create-custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          jobId: job._id || 'custom-job',
          customPlan: enhancedPlan,
          overwriteExisting: true
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Custom prep plan created:', result);
        
        setCustomPlanGenerated(result.data);
        setPrepPlanCreated(true);
        setShowVideoSelector(false);
        
        alert('🎉 Custom learning plan created successfully! You can now view it in your prep plans section.');
      } else {
        const error = await response.json();
        console.error('❌ Error creating custom plan:', error);
        alert(`Failed to create custom plan: ${error.message}`);
      }
    } catch (error) {
      console.error('❌ Error in custom plan generation:', error);
      alert(`Error creating custom plan: ${error.message}`);
    }
  };

  // Show video selector when analysis is complete
  const handleShowVideoSelector = () => {
    const skills = extractSkillsFromAnalysis();
    setExtractedSkills(skills);
    setShowVideoSelector(true);
  };

  const viewPrepPlan = () => {
    if (!job) return;
    
    const jobParam = encodeURIComponent(JSON.stringify(job));
    router.push(`/dashboard/applicant/prep-plan?job=${jobParam}`);
  };

  const checkPrepPlanExists = async () => {
    if (!job) return;
    
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch('/api/prep-plans', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        const prepPlans = result.data || [];
        
        // Check if a prep plan exists for this job
        const existingPlan = prepPlans.find(plan => 
          plan.jobId === job._id || 
          (plan.jobTitle === job.title && plan.companyName === job.companyName)
        );
        
        if (existingPlan) {
          setPrepPlanCreated(true);
        }
      }
    } catch (error) {
      console.error('Error checking prep plan existence:', error);
    }
  };
  // Loading state
  if (loading) {
    return (
      <div className="bg-background flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <div>
            <h3 className="font-semibold">Loading Analysis</h3>
            <p className="text-muted-foreground text-sm">Preparing your resume analysis...</p>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-background" style={{ minHeight: '100vh', overflow: 'auto' }}>
      <div className="container mx-auto px-4 py-6 max-w-7xl" style={{ minHeight: 'auto', height: 'auto' }}>
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => router.back()}
                className="p-2"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-3xl font-bold tracking-tight mb-2">AI Resume Analysis</h1>
                {job && (
                  <div className="text-muted-foreground text-base mb-6">
                    {job.companyName && <span className="font-semibold">{job.companyName}</span>}
                    {job.jobType && <span className="ml-2">({job.jobType.charAt(0).toUpperCase() + job.jobType.slice(1).replace('_', ' ')})</span>}
                  </div>
                )}
              </div>
            </div>
            {analyzing && (
              <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-950 rounded-full">
                <Brain className="h-4 w-4 text-blue-600 animate-pulse" />
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">AI analyzing...</span>
              </div>
            )}
          </div>        {/* Main Content - Responsive Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 pb-20" style={{ minHeight: 'auto', height: 'auto' }}>
          {/* Analysis Results - Takes 2 columns on xl screens */}
          <div className="xl:col-span-2" style={{ height: 'auto', overflow: 'visible' }}>{ragAnalysis ? (
              <div className="space-y-6">
                {/* Check if we have structured analysis */}
                {ragAnalysis.structuredAnalysis ? (
                  /* Structured Analysis Cards */
                  <>
                    {/* Overall Match Score */}
                    <Card className="border border-border rounded-lg shadow-md bg-card">
                      <CardHeader className="pb-4">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-xl flex items-center gap-3">
                            <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                              <Target className="w-5 h-5 text-green-600 dark:text-green-400" />
                            </div>                            Overall Match
                          </CardTitle>
                          <Badge variant="secondary" className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border-0">
                            Analysis
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="flex items-center gap-4 mb-4">
                          <div className="text-3xl font-bold text-green-600">
                            {ragAnalysis.structuredAnalysis.overallMatch?.score || 0}%
                          </div>
                          <div>
                            <Badge variant={
                              ragAnalysis.structuredAnalysis.overallMatch?.level === 'Excellent' ? 'default' :
                              ragAnalysis.structuredAnalysis.overallMatch?.level === 'Good' ? 'secondary' :
                              ragAnalysis.structuredAnalysis.overallMatch?.level === 'Fair' ? 'outline' : 'destructive'
                            }>
                              {ragAnalysis.structuredAnalysis.overallMatch?.level || 'Unknown'}
                            </Badge>
                          </div>
                        </div>
                        <Progress value={ragAnalysis.structuredAnalysis.overallMatch?.score || 0} className="mb-4" />
                        <p className="text-muted-foreground">
                          {ragAnalysis.structuredAnalysis.overallMatch?.summary || 'No summary available'}
                        </p>
                      </CardContent>
                    </Card>

                    {/* Quick Gap Summary - Only show if there are missing skills */}
                    {ragAnalysis.structuredAnalysis.missingSkills?.length > 0 && (
                      <Card className="border-l-4 border-l-orange-500 bg-orange-50/50 dark:bg-orange-950/30 shadow-md">
                        <CardContent className="pt-6">
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded-lg">
                              <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                            </div>
                            <div className="flex-1">
                              <h3 className="font-semibold text-orange-800 dark:text-orange-200 mb-2">
                                🎯 Focus Areas to Improve Your Match
                              </h3>
                              <p className="text-orange-700 dark:text-orange-300 text-sm mb-3">
                                You're missing <strong>{ragAnalysis.structuredAnalysis.missingSkills.length} key skills</strong> that this employer is looking for. 
                                Developing these skills could significantly boost your chances!
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {ragAnalysis.structuredAnalysis.missingSkills.slice(0, 4).map((skill, index) => (
                                  <Badge key={index} variant="outline" className="border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/50">
                                    {skill}
                                  </Badge>
                                ))}
                                {ragAnalysis.structuredAnalysis.missingSkills.length > 4 && (
                                  <Badge variant="outline" className="border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/50">
                                    +{ragAnalysis.structuredAnalysis.missingSkills.length - 4} more
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}



                    {/* Missing Skills - Prominent Section */}
                    {ragAnalysis.structuredAnalysis.missingSkills?.length > 0 && (
                      <Card className="border-2 border-red-200 dark:border-red-800 rounded-lg shadow-lg bg-red-50/50 dark:bg-red-950/30">
                        <CardHeader className="pb-4">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-xl flex items-center gap-3">
                              <div className="p-2 bg-red-100 dark:bg-red-900 rounded-lg">
                                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                              </div>
                              Skills You Need to Develop
                            </CardTitle>
                            <Badge variant="destructive" className="bg-red-600 text-white">
                              {ragAnalysis.structuredAnalysis.missingSkills.length} Skills Missing
                            </Badge>
                          </div>
                          <CardDescription className="text-red-700 dark:text-red-300 font-medium">
                            These skills are required for the job but missing from your resume. Focus on these to improve your chances!
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="space-y-3">
                            {ragAnalysis.structuredAnalysis.missingSkills.map((skill, index) => (
                              <div key={index} className="flex items-center justify-between p-3 rounded-lg border-2 border-red-200 dark:border-red-800 bg-white dark:bg-red-950/50">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center">
                                    <span className="text-red-600 dark:text-red-400 font-bold text-sm">{index + 1}</span>
                                  </div>
                                  <div>
                                    <div className="font-semibold text-red-800 dark:text-red-200">{skill}</div>
                                    <div className="text-xs text-red-600 dark:text-red-400">Required by employer</div>
                                  </div>
                                </div>
                                <Badge variant="outline" className="border-red-300 text-red-700 dark:border-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30">
                                  Priority
                                </Badge>
                              </div>
                            ))}
                          </div>
                          <div className="mt-4 p-4 bg-red-100 dark:bg-red-900/50 rounded-lg border border-red-200 dark:border-red-800">
                            <div className="flex items-start gap-2">
                              <Lightbulb className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                              <div>
                                <div className="font-semibold text-red-800 dark:text-red-200 text-sm">💡 Action Needed</div>
                                <div className="text-red-700 dark:text-red-300 text-sm mt-1">
                                  Consider learning these skills through online courses, projects, or certifications to strengthen your application.
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Skills Analysis Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Matching Skills */}
                      <Card className="border border-border rounded-lg shadow-md bg-card">
                        <CardHeader className="pb-4">
                          <CardTitle className="text-lg flex items-center gap-3">
                            <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                              <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                            </div>
                            Your Matching Skills
                          </CardTitle>
                          <CardDescription>
                            Skills you have that match the job requirements
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="space-y-2">
                            {ragAnalysis.structuredAnalysis.matchingSkills?.length > 0 ? (
                              ragAnalysis.structuredAnalysis.matchingSkills.map((skill, index) => (
                                <Badge key={index} variant="secondary" className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 mr-2 mb-2">
                                  ✓ {skill}
                                </Badge>
                              ))
                            ) : (
                              <p className="text-muted-foreground text-sm">No matching skills found</p>
                            )}
                          </div>
                        </CardContent>
                      </Card>

                      {/* Skills to Improve */}
                      <Card className="border border-border rounded-lg shadow-md bg-card">
                        <CardHeader className="pb-4">
                          <CardTitle className="text-lg flex items-center gap-3">
                            <div className="p-2 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
                              <GraduationCap className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                            </div>
                            Skills to Advance
                          </CardTitle>
                          <CardDescription>
                            Skills you have but could strengthen for this role
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="space-y-2">
                            {ragAnalysis.structuredAnalysis.skillsToImprove?.length > 0 ? (
                              ragAnalysis.structuredAnalysis.skillsToImprove.map((skill, index) => (
                                <Badge key={index} variant="outline" className="border-yellow-200 text-yellow-700 dark:border-yellow-800 dark:text-yellow-300 mr-2 mb-2">
                                  📈 {skill}
                                </Badge>
                              ))
                            ) : ragAnalysis.structuredAnalysis.missingSkills?.length === 0 ? (
                              <div className="flex items-center gap-2 p-3 rounded-lg border bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
                                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                                <span className="text-sm text-green-700 dark:text-green-300">Great! All skills are well-matched.</span>
                              </div>
                            ) : (
                              <p className="text-muted-foreground text-sm">Focus on missing skills first</p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Experience Analysis */}
                    <Card className="border border-border rounded-lg shadow-md bg-card">
                      <CardHeader className="pb-4">
                        <CardTitle className="text-xl flex items-center gap-3">
                          <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                            <Briefcase className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                          </div>
                          Experience Analysis
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <h4 className="font-semibold text-green-700 dark:text-green-300 mb-2">Relevant Experience</h4>
                            <p className="text-sm text-muted-foreground">
                              {ragAnalysis.structuredAnalysis.experienceAnalysis?.relevantExperience || 'Not specified'}
                            </p>
                          </div>
                          <div>
                            <h4 className="font-semibold text-orange-700 dark:text-orange-300 mb-2">Experience Gaps</h4>
                            <p className="text-sm text-muted-foreground">
                              {ragAnalysis.structuredAnalysis.experienceAnalysis?.experienceGaps || 'None identified'}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Improvement Suggestions */}
                    <Card className="border border-border rounded-lg shadow-md bg-card">
                      <CardHeader className="pb-4">
                        <CardTitle className="text-xl flex items-center gap-3">
                          <div className="p-2 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
                            <Lightbulb className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                          </div>
                          Improvement Suggestions
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">                        <div className="space-y-3">                          {ragAnalysis.structuredAnalysis.improvementSuggestions?.map((suggestion, index) => (
                            <div key={index} className="flex items-start gap-3 p-4 rounded-lg border bg-muted/30 border-border">
                              <div className={`${
                                typeof suggestion === 'object' && suggestion.priority === 'Critical' ? 'bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200' :
                                typeof suggestion === 'object' && suggestion.priority === 'High' ? 'bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200' :
                                'bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200'
                              } text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5`}>
                                {index + 1}
                              </div>
                              <div className="flex-1">
                                <div className="text-sm font-medium text-foreground mb-1">
                                  {typeof suggestion === 'object' ? suggestion.title : suggestion}
                                </div>
                                {typeof suggestion === 'object' && suggestion.description && (
                                  <div className="text-xs text-muted-foreground mb-2">
                                    {suggestion.description}
                                  </div>
                                )}
                                {typeof suggestion === 'object' && suggestion.priority && (
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className={`px-2 py-1 rounded-full text-xs ${
                                      suggestion.priority === 'Critical' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' :
                                      suggestion.priority === 'High' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' :
                                      suggestion.priority === 'Medium' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                                      'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300'
                                    }`}>
                                      {suggestion.priority} Priority
                                    </span>
                                    {suggestion.timeframe && (
                                      <span className="text-xs text-muted-foreground">
                                        ⏱️ {suggestion.timeframe}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {typeof suggestion === 'object' && suggestion.actionItems && suggestion.actionItems.length > 0 && (
                                  <div className="space-y-1">
                                    <div className="text-xs font-medium text-foreground">Action Items:</div>
                                    <ul className="text-xs text-muted-foreground space-y-1 ml-2">
                                      {suggestion.actionItems.slice(0, 3).map((item, itemIndex) => (
                                        <li key={itemIndex} className="flex items-start gap-1">
                                          <span className="text-green-600 dark:text-green-400 mt-1">•</span>
                                          <span>{item}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            </div>
                          )) || <p className="text-muted-foreground">No suggestions available</p>}
                        </div>
                      </CardContent>
                    </Card>


                  </>
                ) : ragAnalysis.comprehensiveAnalysis ? (
                  /* Fallback to Original Text Analysis */
                  <Card className="border border-border rounded-lg shadow-md bg-card">
                    <CardHeader className="pb-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-xl flex items-center gap-3">
                          <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                            <Brain className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                          </div>
                          Comprehensive Analysis
                        </CardTitle>                        <Badge variant="secondary" className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border-0">
                          Analysis
                        </Badge>
                      </div>
                    </CardHeader>                    <CardContent className="pt-0">
                      <div className="bg-muted/30 rounded-lg p-6">
                        <div 
                          className="prose prose-sm max-w-none dark:prose-invert leading-relaxed"
                          dangerouslySetInnerHTML={{
                            __html: ragAnalysis.comprehensiveAnalysis
                              .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-foreground">$1</strong>')
                              .replace(/\*(.*?)\*/g, '<em class="text-muted-foreground">$1</em>')
                              .replace(/^- (.*?)$/gm, '<div class="flex items-start gap-2 my-2"><span class="text-blue-500 mt-1 text-lg">•</span><span>$1</span></div>')
                              .replace(/^(\d+)\. (.*?)$/gm, '<div class="flex items-start gap-2 my-2"><span class="text-green-600 font-semibold min-w-[1.5rem]">$1.</span><span>$2</span></div>')
                              .replace(/\n\n/g, '<div class="my-4"></div>')
                              .replace(/\n/g, '<br>')
                          }}
                        />
                      </div>
                    </CardContent>
                  </Card>) : (
                  // Fallback - try to find analysis in different formats
                  <Card className="border border-border rounded-lg shadow-md">
                    <CardContent className="p-6">
                      {/* Add debug info for development */}
                      {process.env.NODE_ENV === 'development' && (
                        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-950 rounded border">
                          <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">Debug Info</h4>
                          <p className="text-xs text-yellow-700 dark:text-yellow-300">
                            Data type: {typeof ragAnalysis} | Has structuredAnalysis: {!!ragAnalysis?.structuredAnalysis?.toString()} | 
                            Has comprehensiveAnalysis: {!!ragAnalysis?.comprehensiveAnalysis?.toString()} | 
                            Keys: {Object.keys(ragAnalysis || {}).join(', ')}
                          </p>
                        </div>
                      )}
                      
                      {ragAnalysis.analysis ? (
                        // If there's an 'analysis' property - try to display it better
                        <div>
                          <h3 className="font-semibold mb-4">Analysis Results</h3>
                          {typeof ragAnalysis.analysis === 'object' && ragAnalysis.analysis.overallMatch ? (
                            // If the analysis object has structured data, display it properly
                            <div className="space-y-4">
                              <div className="p-4 bg-muted/30 rounded-lg">
                                <h4 className="font-semibold mb-2">Overall Match</h4>
                                <p>Score: {ragAnalysis.analysis.overallMatch.score}%</p>
                                <p>Level: {ragAnalysis.analysis.overallMatch.level}</p>
                                <p>Summary: {ragAnalysis.analysis.overallMatch.summary}</p>
                              </div>
                              {ragAnalysis.analysis.keyStrengths && (
                                <div className="p-4 bg-muted/30 rounded-lg">
                                  <h4 className="font-semibold mb-2">Key Strengths</h4>
                                  <ul className="list-disc list-inside space-y-1">
                                    {ragAnalysis.analysis.keyStrengths.map((strength, index) => (
                                      <li key={index} className="text-sm">
                                        <div className="font-medium">
                                          {typeof strength === 'object' ? (strength.title || strength.strength) : strength}
                                        </div>
                                        {typeof strength === 'object' && (strength.description || strength.evidence) && (
                                          <div className="text-xs text-muted-foreground mt-1">
                                            {strength.description || strength.evidence}
                                          </div>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          ) : (
                            // Fallback to JSON display
                            <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded max-h-96 overflow-auto">
                              {JSON.stringify(ragAnalysis.analysis, null, 2)}
                            </pre>
                          )}
                        </div>
                      ) : ragAnalysis.overallMatch ? (
                        // If there's structured data
                        <div>
                          <h3 className="font-semibold mb-4">Match Analysis</h3>
                          <p>Overall Match: {ragAnalysis.overallMatch.score}%</p>
                          <p>Level: {ragAnalysis.overallMatch.level}</p>
                          <p>Summary: {ragAnalysis.overallMatch.summary}</p>
                        </div>
                      ) : ragAnalysis.error ? (
                        // If there's an error
                        <div className="text-center py-8">
                          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                          <h3 className="font-semibold mb-2 text-red-700">Analysis Error</h3>
                          <p className="text-muted-foreground text-sm">{ragAnalysis.errorMessage || 'Unknown error occurred'}</p>
                        </div>
                      ) : (
                        // Unknown format
                        <div className="text-center py-8">
                          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                          <h3 className="font-semibold mb-2">Unknown Analysis Format</h3>
                          <p className="text-muted-foreground text-sm mb-4">Received data in unexpected format</p>
                          <details className="text-left">
                            <summary className="cursor-pointer text-sm font-medium">View Raw Data</summary>
                            <pre className="text-xs bg-muted p-2 rounded mt-2 overflow-auto">
                              {JSON.stringify(ragAnalysis, null, 2)}
                            </pre>
                          </details>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              // Empty state
              <Card className="border border-border rounded-lg shadow-md">
                <CardContent className="p-12">
                  <div className="text-center">
                    <Brain className="h-16 w-16 text-muted-foreground mx-auto mb-6" />
                    <h3 className="text-xl font-semibold mb-2">Ready to Analyze</h3>
                    <p className="text-muted-foreground mb-6">
                      {analyzing ? 'AI is analyzing your resume...' : 
                       loading ? 'Loading job and resume data...' :
                       !job ? 'Job data not available' :
                       !userResume ? 'Resume data not available' :
                       'Click below to start your AI-powered resume analysis'}
                    </p>
                    
                    {!analyzing && !loading && job && userResume && (
                      <Button 
                        onClick={() => performRagAnalysis(job, userResume)}
                        className="px-8"
                        disabled={analyzing}
                      >
                        <Brain className="h-4 w-4 mr-2" />
                        Start AI Analysis
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>          {/* AI Chat Assistant - Takes 1 column */}
          <div className="xl:col-span-1">
            <Card className="border border-border rounded-lg shadow-md flex flex-col">
              <CardHeader className="pb-4 flex-shrink-0">
                <CardTitle className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                    <MessageSquare className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  AI Career Assistant
                </CardTitle>
                <CardDescription className="text-sm">
                  Ask questions about your resume, the job, or get interview tips
                </CardDescription>
              </CardHeader>
              {job && (
                <div className="px-4 pb-2 space-y-2">
                  {!prepPlanCreated ? (
                    <>
                      {/* Duration Selector */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                          Preparation Duration
                        </label>
                        <Select value={prepPlanDuration.toString()} onValueChange={(value) => setPrepPlanDuration(parseInt(value))}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="2">2 weeks - Intensive (Critical skills only)</SelectItem>
                            <SelectItem value="4">4 weeks - Balanced (Recommended)</SelectItem>
                            <SelectItem value="6">6 weeks - Comprehensive</SelectItem>
                            <SelectItem value="8">8+ weeks - Mastery</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          {prepPlanDuration <= 2 ? 'Focus on interview-critical skills only' :
                           prepPlanDuration <= 4 ? 'Balanced coverage with solid foundation' :
                           prepPlanDuration <= 6 ? 'Thorough preparation with advanced topics' :
                           'Deep mastery with comprehensive skill development'}
                        </p>
                      </div>
                      
                      <div className="grid grid-cols-1 gap-2">
                        <Button
                          onClick={async () => {
                            console.log('🎯 Create Learning Plan button clicked');
                            console.log('Button state:', { job: !!job, ragAnalysis: !!ragAnalysis, prepPlanCreated, duration: prepPlanDuration });
                            try {
                              await createPrepPlan();
                            } catch (error) {
                              console.error('❌ Error in button click handler:', error);
                            }
                          }}
                          variant="outline"
                          size="sm"
                          className="w-full border-border hover:bg-accent hover:text-accent-foreground"
                          disabled={!job}
                        >
                          <GraduationCap className="h-4 w-4 mr-2" />
                          Create Learning Plan for This Job
                        </Button>
                        
                        <Button
                          onClick={() => {
                            console.log('🎥 Custom Video Plan button clicked');
                            const extractedSkills = extractSkillsFromAnalysis(ragAnalysis);
                            console.log('Extracted skills for video selection:', extractedSkills);
                            setVideoSelectorSkills(extractedSkills);
                            setShowVideoSelector(true);
                          }}
                          variant="default"
                          size="sm"
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                          disabled={!job || !ragAnalysis}
                        >
                          <Video className="h-4 w-4 mr-2" />
                          Create Custom Video Plan
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2">                      <Button
                        onClick={() => {
                          console.log('🎯 View Prep Plan button clicked');
                          viewPrepPlan();
                        }}
                        size="sm"
                        className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        <GraduationCap className="h-4 w-4 mr-2" />
                        View Prep Plan
                      </Button>
                    </div>
                  )}
                </div>
              )}
              <CardContent className="flex-1 flex flex-col p-0">
                {/* Chat Messages */}
                <div className="flex-1 p-4 min-h-[400px] max-h-[500px] overflow-y-auto">
                  <div className="space-y-4">
                    {chatMessages.map((message, index) => (
                      <div
                        key={index}
                        className={`flex items-start gap-3 ${
                          message.role === 'user' ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        {message.role === 'assistant' && (
                          <div className="bg-blue-100 dark:bg-blue-900 p-2 rounded-full flex-shrink-0">
                            <Bot className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          </div>
                        )}                        <div
                          className={`rounded-lg px-4 py-2 max-w-[85%] ${                            message.role === 'user'
                              ? 'bg-primary text-primary-foreground ml-12'
                              : message.isPrepPlanSuccess
                              ? 'bg-accent text-accent-foreground border border-border mr-12'
                              : 'bg-muted text-foreground mr-12'
                          }`}
                        >{message.role === 'assistant' ? (
                            index === typingMessageIndex && message.isTyping ? (                              <TypewriterText 
                                text={message.content}
                                speed={20}
                                onPartialUpdate={(partialText) => {
                                  partialContentRef.current = partialText;
                                }}
                                onComplete={() => {
                                  setTypingMessageIndex(-1);
                                  setIsTypingResponse(false);
                                  partialContentRef.current = '';
                                  setChatMessages(prev => 
                                    prev.map((msg, i) => 
                                      i === index ? { ...msg, isTyping: false } : msg
                                    )
                                  );
                                }}
                              />
                            ) : (
                              <div 
                                className="text-sm leading-relaxed prose prose-sm max-w-none dark:prose-invert"
                                dangerouslySetInnerHTML={{
                                  __html: message.content
                                    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold">$1</strong>')
                                    .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
                                    .replace(/^- (.*?)$/gm, '<div class="flex items-start gap-2 my-1"><span class="text-blue-500 mt-1">•</span><span>$1</span></div>')
                                    .replace(/^(\d+)\. (.*?)$/gm, '<div class="flex items-start gap-2 my-1"><span class="text-green-600 font-semibold min-w-[1.5rem]">$1.</span><span>$2</span></div>')
                                    .replace(/\n\n/g, '<div class="my-2"></div>')
                                    .replace(/\n/g, '<br>')
                                }}
                              />
                            )
                          ) : (
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">
                              {message.content}
                            </p>
                          )}
                        </div>
                        
                        {message.role === 'user' && (
                          <div className="bg-primary/10 p-2 rounded-full flex-shrink-0">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                        )}
                      </div>
                    ))}
                    
                    {chatLoading && (
                      <div className="flex items-start gap-3">
                        <div className="bg-blue-100 dark:bg-blue-900 p-2 rounded-full">
                          <Bot className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="bg-muted rounded-lg px-4 py-2">
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-sm text-muted-foreground">Thinking...</span>
                          </div>
                        </div>
                      </div>                    )}
                    
                    <div ref={chatEndRef} />
                  </div>
                </div>
                {/* Chat Input */}
                <div className="p-4 border-t bg-muted/20 flex-shrink-0">
                  <div className="flex gap-2">                    <Input
                      placeholder={chatInitialized ? "Ask me anything about your resume analysis..." : "Please wait for analysis to complete..."}
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={handleKeyPress}
                      disabled={!chatInitialized || chatLoading || isTypingResponse}
                      className="flex-1"
                    />
                    
                    {/* Show pause button when response is being typed or loading */}
                    {(chatLoading || isTypingResponse) ? (
                      <Button
                        onClick={stopResponse}
                        variant="outline"
                        size="sm"
                        className="px-3 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                      >
                        <Square className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        onClick={sendChatMessage}
                        disabled={!chatInitialized || !chatInput.trim()}
                        size="sm"
                        className="px-3"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {!chatInitialized && (
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                      Chat will be available after analysis is complete
                    </p>
                  )}
                  {/* Status indicator */}
                  {(chatLoading || isTypingResponse) && (
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                      {chatLoading ? 'Processing your question...' : 'AI is responding...'}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      
      {/* Custom Video Plan Selector Modal */}
      {showVideoSelector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-semibold">Create Custom Video Learning Plan</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowVideoSelector(false)}
                className="h-8 w-8 p-0"
              >
                ×
              </Button>
            </div>
            <div className="p-4 overflow-auto max-h-[calc(90vh-120px)]">
              <EnhancedVideoSelector
                skills={videoSelectorSkills}
                onPlanGenerated={handleCustomPlanGenerated}
              />
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}

export default function ResumeMatchPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
      <ResumeMatchPageInner />
    </Suspense>
  );
}

