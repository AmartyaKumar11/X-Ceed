'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  Play, 
  Square, 
  MessageSquare, 
  Brain,
  Clock,
  Award,
  FileText,
  Settings,
  Volume2,
  VolumeX,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  Loader2,
  Menu,
  X,
  Pause,
  PhoneOff
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShiningText } from "@/components/ui/shining-text";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";
import JobDescriptionUpload from "@/components/JobDescriptionUpload";

export default function MockInterviewPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  // Video and audio refs
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  
  // State management
  const [isInterviewActive, setIsInterviewActive] = useState(false);
  const [isInterviewPaused, setIsInterviewPaused] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isTextToSpeechEnabled, setIsTextToSpeechEnabled] = useState(true);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [isQuestionLoading, setIsQuestionLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [questionHistory, setQuestionHistory] = useState([]);
  const [answerHistory, setAnswerHistory] = useState([]);
  const [interviewScore, setInterviewScore] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [stream, setStream] = useState(null);
  const [recognition, setRecognition] = useState(null);
  const [speechSynthesis, setSpeechSynthesis] = useState(null);
  
  const [interviewType, setInterviewType] = useState('mixed');
  const [targetRole, setTargetRole] = useState('Software Engineer');
  const [lastFeedback, setLastFeedback] = useState(null);
  const [scoreHistory, setScoreHistory] = useState([]);
  const [finalReport, setFinalReport] = useState(null);
  const [totalQuestions, setTotalQuestions] = useState(5);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [jobDescription, setJobDescription] = useState('');
  const [interviewDuration, setInterviewDuration] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [backendStatus, setBackendStatus] = useState('checking');

  
  // Sidebar state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleJobDescriptionSet = (description) => {
    setJobDescription(description);
  };

  // Check backend service status
  const checkBackendStatus = async () => {
    try {
      const response = await fetch('/api/mock-interview/generate-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true }),
      });
      
      if (response.status === 503) {
        setBackendStatus('offline');
      } else {
        setBackendStatus('online');
      }
    } catch (error) {
      setBackendStatus('offline');
    }
  };

  useEffect(() => {
    // Initialize speech recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognitionInstance = new SpeechRecognition();
      recognitionInstance.continuous = true;
      recognitionInstance.interimResults = true;
      recognitionInstance.lang = 'en-US';
      
      recognitionInstance.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }
        
        setTranscript(finalTranscript + interimTranscript);
      };
      
      recognitionInstance.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
      };
      
      setRecognition(recognitionInstance);
    }
    
    // Initialize speech synthesis
    if ('speechSynthesis' in window) {
      setSpeechSynthesis(window.speechSynthesis);
    }
    
    // Check backend service status
    checkBackendStatus();
    
    // Load job description from localStorage or fetch from API
    const savedJobDescription = localStorage.getItem('mockInterviewJobDescription');
    if (savedJobDescription) {
      setJobDescription(savedJobDescription);
    }
    
    return () => {
      if (recognition) {
        recognition.stop();
      }
      if (speechSynthesis) {
        speechSynthesis.cancel();
      }
    };
  }, []);

  const startVideo = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      
      setStream(mediaStream);
      toast({
        title: "Camera and microphone enabled",
        description: "You're ready to start the interview!",
      });
    } catch (error) {
      console.error('Error accessing media devices:', error);
      toast({
        title: "Camera access denied",
        description: "Please allow camera and microphone access to use the mock interview.",
        variant: "destructive",
      });
    }
  };

  const stopVideo = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const toggleVideo = () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  };

  const toggleAudio = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
        
        // Also pause/resume speech recognition based on audio state
        if (recognition && isInterviewActive && !isInterviewPaused) {
          if (audioTrack.enabled) {
            recognition.start();
          } else {
            recognition.stop();
          }
        }
      }
    }
  };

  const pauseResumeInterview = () => {
    if (isInterviewPaused) {
      // Resume interview
      setIsInterviewPaused(false);
      
      // Resume speech recognition if audio is enabled
      if (recognition && isAudioEnabled) {
        recognition.start();
      }
    } else {
      // Pause interview
      setIsInterviewPaused(true);
      
      // Pause speech recognition
      if (recognition) {
        recognition.stop();
      }
      
      // Stop any current speech synthesis
      if (speechSynthesis) {
        speechSynthesis.cancel();
      }
    }
  };

  const generateQuestion = async () => {
    if (!jobDescription) {
      toast({
        title: "No job description",
        description: "Please upload a job description first to generate relevant questions.",
        variant: "destructive",
      });
      return;
    }

    // Don't generate questions if interview is paused
    if (isInterviewPaused) {
      return;
    }

    setIsQuestionLoading(true);
    
    try {
      const response = await fetch('/api/mock-interview/generate-question', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobDescription,
          role: targetRole,
          interviewType,
          questionNumber: currentQuestionIndex + 1,
          previous_qa_pairs: questionHistory.map((q, i) => ({
            question: q.text || q.question,
            answer: answerHistory[i] || '',
            score: scoreHistory[i],
          })),
          questionHistory: questionHistory.map(q => q.text),
          answerHistory,
          scoreHistory,
          currentQuestionIndex,
          totalQuestions
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 503 && errorData.fallback) {
          throw new Error(errorData.message || 'Backend service unavailable');
        }
        throw new Error(errorData.error || 'Failed to generate question');
      }

      const data = await response.json();
      
      // Check if we have a valid question
      if (!data.question || typeof data.question !== 'string') {
        throw new Error('Invalid question received from server');
      }
      
      const newQuestion = data.question;
      
      setCurrentQuestion(newQuestion);
      setQuestionHistory(prev => [...prev, { 
        id: Date.now(), 
        text: newQuestion, 
        timestamp: new Date() 
      }]);
      
      // Speak the question if text-to-speech is enabled and interview is not paused
      if (isTextToSpeechEnabled && speechSynthesis && !isInterviewPaused) {
        speakQuestion(newQuestion);
      }
      
    } catch (error) {
      console.error('Error generating question:', error);
      
      // Provide specific error messages based on the error type
      let errorTitle = "Error generating question";
      let errorDescription = "Please try again.";
      
      if (error.message.includes('Backend service unavailable') || error.message.includes('port 8008')) {
        errorTitle = "Backend service unavailable";
        errorDescription = "The Python backend service is not running. Please start the service using 'npm run job-desc-service' and try again.";
      } else if (error.message.includes('timeout') || error.message.includes('fetch')) {
        errorTitle = "Connection timeout";
        errorDescription = "The backend service is taking too long to respond. Please check if the service is running.";
      }
      
      toast({
        title: errorTitle,
        description: errorDescription,
        variant: "destructive",
      });
    } finally {
      setIsQuestionLoading(false);
    }
  };

  const speakQuestion = (text) => {
    if (speechSynthesis) {
      speechSynthesis.cancel(); // Stop any current speech
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 1;
      
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      
      speechSynthesis.speak(utterance);
    }
  };

  const startInterview = async () => {
    if (!jobDescription) {
      toast({
        title: "Job description required",
        description: "Please upload a job description to start the interview.",
        variant: "destructive",
      });
      return;
    }

    // Camera is optional for AI question path — don't block if permission hangs
    startVideo().catch(() => {});
    setIsInterviewActive(true);
    setIsInterviewPaused(false);
    setStartTime(Date.now());
    setCurrentQuestionIndex(0);
    setQuestionHistory([]);
    setAnswerHistory([]);
    setTranscript('');
    setInterviewScore(null);
    setAnalysis(null);
    
    // Start speech recognition if audio is enabled
    if (recognition && isAudioEnabled) {
      recognition.start();
    }
    
    // Generate first question
    await generateQuestion();
  };

  const stopInterview = async () => {
    setIsInterviewActive(false);
    setIsInterviewPaused(false);
    stopVideo();
    
    if (recognition) {
      recognition.stop();
    }
    
    if (speechSynthesis) {
      speechSynthesis.cancel();
    }
    
    // Save current answer if there's a transcript
    if (transcript.trim() && currentQuestion) {
      const newAnswer = {
        id: Date.now(),
        question: currentQuestion,
        answer: transcript.trim(),
        timestamp: new Date()
      };
      setAnswerHistory(prev => [...prev, newAnswer]);
    }
    
    // Analyze the interview
    await analyzeInterview();
  };

  const nextQuestion = async () => {
    if (isInterviewPaused) return;

    const answerText = transcript.trim();
    if (!answerText || !currentQuestion) {
      toast({ title: 'Answer required', description: 'Provide an answer before next question.', variant: 'destructive' });
      return;
    }

    // Analyze this answer first (adaptive signal for next Q)
    setIsAnalyzing(true);
    let score = null;
    try {
      const fbRes = await fetch('/api/mock-interview/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: currentQuestion,
          answer: answerText,
          role: targetRole,
          interviewType,
          jobDescription,
        }),
      });
      const fb = await fbRes.json();
      if (!fbRes.ok) throw new Error(fb.error || 'Analyze failed');
      setLastFeedback(fb);
      score = fb.score;
      setScoreHistory((prev) => [...prev, score]);
    } catch (e) {
      toast({ title: 'Analysis failed', description: e.message, variant: 'destructive' });
      setIsAnalyzing(false);
      return;
    } finally {
      setIsAnalyzing(false);
    }

    setAnswerHistory((prev) => [
      ...prev,
      { id: Date.now(), question: currentQuestion, answer: answerText, score, timestamp: new Date() },
    ]);
    setTranscript('');

    const nextIndex = currentQuestionIndex + 1;
    setCurrentQuestionIndex(nextIndex);

    if (nextIndex >= totalQuestions) {
      await stopInterview();
    } else {
      await generateQuestion();
    }
  };

  const analyzeInterview = async () => {
    setIsAnalyzing(true);
    try {
      const qa_pairs = questionHistory.map((q, i) => ({
        question: q.text || q.question,
        answer: (answerHistory[i]?.answer || answerHistory[i] || ''),
        score: scoreHistory[i],
      }));
      const response = await fetch('/api/mock-interview/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'report',
          role: targetRole,
          interviewType,
          jobDescription,
          qa_pairs,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate report');
      }
      const data = await response.json();
      setFinalReport(data);
      setInterviewScore(data.overall_score);
      setAnalysis(data);
      toast({ title: 'Interview report ready', description: `Overall score: ${data.overall_score}/10` });
    } catch (error) {
      console.error('Error analyzing interview:', error);
      toast({ title: 'Report failed', description: error.message, variant: 'destructive' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const resetInterview = () => {
    setIsInterviewActive(false);
    setIsInterviewPaused(false);
    stopVideo();
    setCurrentQuestion('');
    setQuestionHistory([]);
    setAnswerHistory([]);
    setTranscript('');
    setInterviewScore(null);
    setAnalysis(null);
    setLastFeedback(null);
    setScoreHistory([]);
    setFinalReport(null);
    setCurrentQuestionIndex(0);
    setInterviewDuration(0);
    
    if (recognition) {
      recognition.stop();
    }
    
    if (speechSynthesis) {
      speechSynthesis.cancel();
    }
  };

  return (
    <div className="min-h-screen bg-black flex">
      {/* Main Camera Area - Takes up most of the screen like Google Meet */}
      <div className="flex-1 relative">
        {/* Video Window - Full Screen */}
        <div className="h-screen relative bg-gradient-to-br from-gray-900 to-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          
          {!stream && (
            <div className="absolute inset-0 flex items-center justify-center text-white">
              <div className="text-center">
                <Video className="h-20 w-20 mx-auto mb-6 opacity-50" />
                <p className="text-xl mb-2">Camera will activate when interview starts</p>
                <p className="text-gray-400">Get ready for your mock interview</p>
              </div>
            </div>
          )}

          {/* Video Status Overlay */}
          {isInterviewActive && (
            <div className="absolute top-4 left-4 flex gap-2">
              <Badge variant={isVideoEnabled ? "default" : "secondary"} className="bg-black/50 backdrop-blur">
                {isVideoEnabled ? "Video ON" : "Video OFF"}
              </Badge>
              <Badge variant={isAudioEnabled ? "default" : "secondary"} className="bg-black/50 backdrop-blur">
                {isAudioEnabled ? "Audio ON" : "Audio OFF"}
              </Badge>
              {isInterviewPaused && (
                <Badge variant="destructive" className="bg-red-600/80 backdrop-blur text-white animate-pulse">
                  PAUSED
                </Badge>
              )}
              {isInterviewActive && startTime && !isInterviewPaused && (
                <Badge variant="outline" className="bg-black/50 backdrop-blur text-white border-white/30">
                  {Math.floor((Date.now() - startTime) / 1000 / 60)}:{String(Math.floor((Date.now() - startTime) / 1000 % 60)).padStart(2, '0')}
                </Badge>
              )}
            </div>
          )}

          {/* Interview Progress Overlay */}
          {isInterviewActive && (
            <div className="absolute top-4 right-4">
              <div className="bg-black/50 backdrop-blur rounded-lg p-3 text-white">
                <div className="text-sm mb-2">Question {currentQuestionIndex + 1} of {totalQuestions}</div>
                <Progress value={(currentQuestionIndex / totalQuestions) * 100} className="w-32" />
              </div>
            </div>
          )}

          {/* Current Question Overlay - Smaller and more compact */}
          {currentQuestion && isInterviewActive && !isInterviewPaused && (
            <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 w-3/5 max-w-2xl">
              <Card className="bg-black/80 backdrop-blur-lg border-white/20">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Brain className="h-5 w-5 text-blue-400 mt-1 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-white text-base leading-relaxed">{currentQuestion}</p>
                      <div className="flex items-center gap-2 mt-2">
                        {isSpeaking && <Volume2 className="h-3 w-3 animate-pulse text-blue-400" />}
                        {isTextToSpeechEnabled && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => speakQuestion(currentQuestion)}
                            disabled={isSpeaking}
                            className="text-white hover:bg-white/10 h-7 px-2 text-xs"
                          >
                            {isSpeaking ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Volume2 className="h-3 w-3" />
                            )}
                            Replay
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Paused Overlay */}
          {isInterviewActive && isInterviewPaused && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
              <Card className="bg-black/80 backdrop-blur-lg border-white/20">
                <CardContent className="p-6">
                  <div className="text-center text-white">
                    <Pause className="h-16 w-16 mx-auto mb-4 text-yellow-400" />
                    <h3 className="text-xl font-semibold mb-2">Interview Paused</h3>
                    <p className="text-gray-300 mb-4">Click the play button to resume your interview</p>
                    <Button
                      onClick={pauseResumeInterview}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Resume Interview
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {isAnalyzing && (
            <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-20">
              <div className="bg-black/70 backdrop-blur-lg rounded-full px-5 py-2 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-white" />
                <ShiningText text="AI is analyzing your answer..." className="text-sm" />
              </div>
            </div>
          )}

          {/* Bottom Controls Bar */}
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2">
            <div className="flex items-center gap-3 bg-black/70 backdrop-blur-lg rounded-full px-6 py-3">
              {!isInterviewActive ? (
                <Button
                  onClick={startInterview}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700 rounded-full px-6 py-3 text-white"
                  size="lg"
                >
                  <Play className="h-5 w-5" />
                  Start Interview
                </Button>
              ) : (
                <>
                  {/* Microphone Toggle - Like Google Meet */}
                  <Button
                    onClick={toggleAudio}
                    variant={isAudioEnabled ? "default" : "destructive"}
                    className={`rounded-full w-12 h-12 p-0 ${
                      !isAudioEnabled ? 'bg-red-600 hover:bg-red-700' : ''
                    }`}
                  >
                    {isAudioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
                  </Button>
                  
                  {/* Video Toggle - Like Google Meet */}
                  <Button
                    onClick={toggleVideo}
                    variant={isVideoEnabled ? "default" : "destructive"}
                    className={`rounded-full w-12 h-12 p-0 ${
                      !isVideoEnabled ? 'bg-red-600 hover:bg-red-700' : ''
                    }`}
                  >
                    {isVideoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                  </Button>
                  
                  {/* Pause/Resume Button */}
                  <Button
                    onClick={pauseResumeInterview}
                    variant={isInterviewPaused ? "default" : "secondary"}
                    className={`rounded-full w-12 h-12 p-0 ${
                      isInterviewPaused ? 'bg-green-600 hover:bg-green-700' : 'bg-yellow-600 hover:bg-yellow-700'
                    }`}
                  >
                    {isInterviewPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
                  </Button>
                  
                  {/* Next Question Button */}
                  <Button
                    onClick={nextQuestion}
                    disabled={!currentQuestion || currentQuestionIndex >= totalQuestions - 1 || isInterviewPaused}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 rounded-full px-4 py-2 disabled:opacity-50"
                  >
                    Next Question
                  </Button>
                  
                  {/* End Interview Button - Red like Google Meet */}
                  <Button
                    onClick={stopInterview}
                    variant="destructive"
                    className="rounded-full w-12 h-12 p-0 bg-red-600 hover:bg-red-700"
                  >
                    <PhoneOff className="h-5 w-5" />
                  </Button>
                </>
              )}
              
              {/* Reset Button */}
              <Button
                onClick={resetInterview}
                variant="outline"
                className="rounded-full w-12 h-12 p-0 border-white/30 text-white hover:bg-white/10"
              >
                <RotateCcw className="h-5 w-5" />
              </Button>
              
              {/* Sidebar Toggle Button */}
              <Button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                variant="outline"
                className="rounded-full w-12 h-12 p-0 border-white/30 text-white hover:bg-white/10"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Right Sidebar - Collapsible like Google Meet's sidebar */}
      <div className={`fixed top-0 right-0 h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-xl transition-transform duration-300 ease-in-out z-50 ${
        isSidebarOpen ? 'translate-x-0' : 'translate-x-full'
      } w-80 overflow-y-auto`}>
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Interview Panel</h2>
          <Button
            onClick={() => setIsSidebarOpen(false)}
            variant="ghost"
            size="sm"
            className="rounded-full w-8 h-8 p-0 hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="p-4 space-y-8">
          {/* Backend Status Indicator */}
          {backendStatus === 'offline' && (
            <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <div className="flex-1">
                  <span className="text-sm font-medium text-red-800 dark:text-red-200">Service Offline</span>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={checkBackendStatus}
                    className="ml-2 h-6 text-xs border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300"
                  >
                    Retry
                  </Button>
                </div>
              </div>
            </div>
          )}

          {backendStatus === 'online' && (
            <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-800 dark:text-green-200">Ready for Interview</span>
              </div>
            </div>
          )}

          {backendStatus === 'checking' && (
            <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 text-yellow-600 animate-spin" />
                <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Checking Status...</span>
              </div>
            </div>
          )}

          {/* Job Description Upload */}
          <JobDescriptionUpload onJobDescriptionSet={handleJobDescriptionSet} />

          {/* Live Transcript */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Mic className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              <h3 className="font-medium text-gray-900 dark:text-white">Live Transcript</h3>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 min-h-[100px]">
              {transcript ? (
                <p className="text-sm text-gray-900 dark:text-gray-100 leading-relaxed">{transcript}</p>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                  {isInterviewActive ? "Start speaking to see transcript..." : "Transcript will appear here during interview"}
                </p>
              )}
            </div>
          </div>

          {/* Interview Score */}
          {interviewScore && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Award className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                <h3 className="font-medium text-gray-900 dark:text-white">Interview Score</h3>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-3">
                    {interviewScore.overall}%
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700 dark:text-gray-300">Communication</span>
                      <span className="font-medium text-gray-900 dark:text-white">{interviewScore.communication}%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700 dark:text-gray-300">Technical</span>
                      <span className="font-medium text-gray-900 dark:text-white">{interviewScore.technical}%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700 dark:text-gray-300">Confidence</span>
                      <span className="font-medium text-gray-900 dark:text-white">{interviewScore.confidence}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Analysis */}
          {analysis && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                <h3 className="font-medium text-gray-900 dark:text-white">Analysis</h3>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 max-h-[300px] overflow-y-auto">
                <div className="space-y-4 text-sm">
                  <div>
                    <h4 className="font-semibold mb-2 text-green-600 dark:text-green-400">Strengths</h4>
                    <ul className="space-y-1">
                      {analysis.strengths?.map((strength, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-700 dark:text-gray-300">{strength}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2 text-yellow-600 dark:text-yellow-400">Improvements</h4>
                    <ul className="space-y-1">
                      {analysis.improvements?.map((improvement, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-700 dark:text-gray-300">{improvement}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2 text-blue-600 dark:text-blue-400">Recommendations</h4>
                    <p className="text-gray-700 dark:text-gray-300">{analysis.recommendations}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Settings */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              <h3 className="font-medium text-gray-900 dark:text-white">Settings</h3>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-300">Text-to-Speech</span>
                <Button
                  variant={isTextToSpeechEnabled ? "default" : "secondary"}
                  size="sm"
                  onClick={() => setIsTextToSpeechEnabled(!isTextToSpeechEnabled)}
                  className="h-7 text-xs px-3"
                >
                  {isTextToSpeechEnabled ? "ON" : "OFF"}
                </Button>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Questions</label>
                <select
                  value={totalQuestions}
                  onChange={(e) => setTotalQuestions(Number(e.target.value))}
                  className="w-full mt-1 p-2 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700"
                  disabled={isInterviewActive}
                >
                  <option value={3}>3 Questions</option>
                  <option value={5}>5 Questions</option>
                  <option value={10}>10 Questions</option>
                </select>
              </div>
            </div>
          </div>

          {/* Question History */}
          {questionHistory.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                <h3 className="font-medium text-gray-900 dark:text-white">Question History</h3>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 max-h-[150px] overflow-y-auto">
                <div className="space-y-2">
                  {questionHistory.map((q, index) => (
                    <div key={q.id} className="text-sm p-2 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
                      <div className="font-medium text-gray-900 dark:text-white">Q{index + 1}:</div>
                      <div className="text-gray-600 dark:text-gray-300 mt-1">{q.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 