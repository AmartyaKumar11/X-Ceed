'use client';

import { useState, useEffect, Suspense} from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { 
  Brain, Clock, CheckCircle, XCircle, ArrowLeft, ArrowRight, 
  Play, Settings, Award, Target, ChevronDown, ChevronUp,
  RotateCcw, Send
} from 'lucide-react';
import { ShiningText } from '@/components/ui/shining-text';

function QuizPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Get video data from URL params
  const videoId = searchParams.get('videoId') || '';
  const videoTitle = decodeURIComponent(searchParams.get('title') || '');
  const transcript = searchParams.get('transcript') || '';
  
  // Quiz configuration state
  const [showSetup, setShowSetup] = useState(true);
  const [numQuestions, setNumQuestions] = useState(10);
  const [questionTypes, setQuestionTypes] = useState(['mcq']);
  const [difficultyLevel, setDifficultyLevel] = useState('medium');
  
  // Quiz state
  const [quiz, setQuiz] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [userAnswers, setUserAnswers] = useState({});
  const [timeSpent, setTimeSpent] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // Timer
  useEffect(() => {
    if (startTime && !showResults) {
      const interval = setInterval(() => {
        setTimeSpent(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [startTime, showResults]);
  
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const questionTypeOptions = [
    { value: 'mcq', label: 'Multiple Choice (MCQ)' },
    { value: 'subjective', label: 'Subjective/Essay' },
    { value: 'coding', label: 'Coding Problems' }
  ];
  
  const difficultyOptions = [
    { value: 'easy', label: 'Easy', color: 'text-green-600', bg: 'bg-green-100' },
    { value: 'medium', label: 'Medium', color: 'text-yellow-600', bg: 'bg-yellow-100' },
    { value: 'hard', label: 'Hard', color: 'text-red-600', bg: 'bg-red-100' }
  ];
  
  const handleTypeToggle = (type) => {
    setQuestionTypes(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };
  
  const generateQuiz = async () => {
    if (questionTypes.length === 0) {
      alert('Please select at least one question type');
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_quiz',
          data: {
            video_id: videoId,
            video_title: videoTitle,
            transcript: transcript,
            num_questions: numQuestions,
            question_types: questionTypes,
            difficulty_level: difficultyLevel
          }
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setQuiz(result);
        setShowSetup(false);
        setStartTime(Date.now());
        console.log('✅ Quiz generated:', result);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error generating quiz:', error);
      alert('Failed to generate quiz. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  const handleAnswer = (questionId, answer) => {
    setUserAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }));
  };
  
  const submitQuiz = async () => {
    if (Object.keys(userAnswers).length < quiz.questions.length) {
      const unanswered = quiz.questions.length - Object.keys(userAnswers).length;
      if (!confirm(`You have ${unanswered} unanswered questions. Submit anyway?`)) {
        return;
      }
    }
    
    setLoading(true);
    try {
      const response = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit_quiz',
          data: {
            quiz_id: quiz.quiz_id,
            user_answers: userAnswers,
            time_spent: timeSpent
          }
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setResults(result);
        setShowResults(true);
        console.log('✅ Quiz submitted:', result);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error submitting quiz:', error);
      alert('Failed to submit quiz. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  const nextQuestion = () => {
    if (currentQuestion < quiz.questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    }
  };
  
  const prevQuestion = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
    }
  };
  
  const restartQuiz = () => {
    setShowSetup(true);
    setQuiz(null);
    setCurrentQuestion(0);
    setUserAnswers({});
    setTimeSpent(0);
    setStartTime(null);
    setShowResults(false);
    setResults(null);
    setLoading(false);
  };
  
  if (!videoId || !videoTitle) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">Invalid Quiz Session</h1>
          <p className="text-muted-foreground mb-4">No video data found for quiz generation.</p>
          <button
            onClick={() => router.push('/video-ai-assistant')}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
          >
            Back to Video Assistant
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary rounded-lg">
                <Brain className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">AI Quiz Generator</h1>
              </div>
            </div>
          </div>
          
          {!showSetup && !showResults && quiz && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                {formatTime(timeSpent)}
              </div>
              <div className="text-sm text-muted-foreground">
                Question {currentQuestion + 1} of {quiz.questions.length}
              </div>
              <button
                onClick={submitQuiz}
                disabled={loading}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
              >
                <Send className="h-4 w-4" />
                Submit Test
              </button>
            </div>
          )}
        </div>
      </div>
      
      <div className="container mx-auto px-6 py-8 max-w-4xl">
        {/* Quiz Setup */}
        {showSetup && (
          <div className="bg-card rounded-xl border border-border shadow-sm max-w-2xl mx-auto">
            <div className="p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <Settings className="h-6 w-6 text-primary" />
                <h2 className="text-xl font-semibold text-foreground">Quiz Configuration</h2>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Number of Questions */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Number of Questions
                </label>
                <select
                  value={numQuestions}
                  onChange={(e) => setNumQuestions(parseInt(e.target.value))}
                  className="w-full p-3 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {[5, 10, 15, 20, 25, 30].map(num => (
                    <option key={num} value={num}>{num} Questions</option>
                  ))}
                </select>
              </div>
              
              {/* Question Types */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-3">
                  Question Types (Select Multiple)
                </label>
                <div className="grid grid-cols-1 gap-3">
                  {questionTypeOptions.map(option => (
                    <button
                      key={option.value}
                      onClick={() => handleTypeToggle(option.value)}
                      className={`p-4 border rounded-lg text-left transition-all ${
                        questionTypes.includes(option.value)
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background hover:border-primary/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                          questionTypes.includes(option.value) 
                            ? 'border-primary bg-primary' 
                            : 'border-muted-foreground'
                        }`}>
                          {questionTypes.includes(option.value) && (
                            <div className="w-2 h-2 bg-primary-foreground rounded-sm" />
                          )}
                        </div>
                        <span className="font-medium">{option.label}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Difficulty Level */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Difficulty Level
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {difficultyOptions.map(option => (
                    <button
                      key={option.value}
                      onClick={() => setDifficultyLevel(option.value)}
                      className={`p-3 border rounded-lg text-center transition-all ${
                        difficultyLevel === option.value
                          ? `border-primary ${option.bg} ${option.color}`
                          : 'border-border bg-background hover:border-primary/50'
                      }`}
                    >
                      <div className="font-medium">{option.label}</div>
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Start Quiz Button */}
              <div className="pt-4">
                <button
                  onClick={generateQuiz}
                  disabled={loading || questionTypes.length === 0}
                  className="w-full py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium transition-colors"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                      Generating Quiz...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Start Test
                    </>
                  )}
                </button>
                {loading && (
                  <div className="mt-3 text-center">
                    <ShiningText text="AI is generating your quiz..." className="text-sm" />
                  </div>
                )}
                
                {questionTypes.length === 0 && (
                  <p className="text-sm text-red-500 mt-2 text-center">
                    Please select at least one question type
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Quiz Questions */}
        {!showSetup && !showResults && quiz && (
          <div className="space-y-6">
            {/* Progress Bar */}
            <div className="bg-card rounded-xl border border-border shadow-sm p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-foreground">
                  Progress: {Object.keys(userAnswers).length} / {quiz.questions.length} answered
                </span>
                <span className="text-sm text-muted-foreground">
                  {Math.round((Object.keys(userAnswers).length / quiz.questions.length) * 100)}% complete
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div 
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(Object.keys(userAnswers).length / quiz.questions.length) * 100}%` }}
                />
              </div>
            </div>
            
            {/* Current Question */}
            <div className="bg-card rounded-xl border border-border shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-primary text-primary-foreground rounded-full text-sm font-medium">
                    Q{currentQuestion + 1}
                  </span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    difficultyOptions.find(d => d.value === quiz.questions[currentQuestion]?.difficulty)?.bg || 'bg-muted'
                  } ${
                    difficultyOptions.find(d => d.value === quiz.questions[currentQuestion]?.difficulty)?.color || 'text-muted-foreground'
                  }`}>
                    {quiz.questions[currentQuestion]?.difficulty?.toUpperCase()}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {quiz.questions[currentQuestion]?.type?.toUpperCase()}
                  </span>
                </div>
                
                {quiz.questions[currentQuestion]?.timestamp && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Video: {Math.floor(quiz.questions[currentQuestion].timestamp / 60)}:{(quiz.questions[currentQuestion].timestamp % 60).toString().padStart(2, '0')}
                  </div>
                )}
              </div>
              
              <h3 className="text-lg font-medium text-foreground mb-6">
                {quiz.questions[currentQuestion]?.question}
              </h3>
              
              {/* MCQ Options */}
              {quiz.questions[currentQuestion]?.type === 'mcq' && (
                <div className="space-y-3">
                  {quiz.questions[currentQuestion]?.options?.map((option, index) => (
                    <button
                      key={index}
                      onClick={() => handleAnswer(quiz.questions[currentQuestion].id, option)}
                      className={`w-full p-4 text-left border rounded-lg transition-all ${
                        userAnswers[quiz.questions[currentQuestion].id] === option
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background hover:border-primary/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex-shrink-0 w-6 h-6 border border-current rounded-full flex items-center justify-center text-xs">
                          {String.fromCharCode(65 + index)}
                        </span>
                        <span>{option}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              
              {/* Subjective/Coding Answer */}
              {(quiz.questions[currentQuestion]?.type === 'subjective' || quiz.questions[currentQuestion]?.type === 'coding') && (
                <div>
                  <textarea
                    value={userAnswers[quiz.questions[currentQuestion].id] || ''}
                    onChange={(e) => handleAnswer(quiz.questions[currentQuestion].id, e.target.value)}
                    placeholder={
                      quiz.questions[currentQuestion]?.type === 'coding' 
                        ? 'Write your code here...' 
                        : 'Write your answer here...'
                    }
                    className="w-full h-40 p-4 border border-border rounded-lg bg-background text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                    style={{ fontFamily: quiz.questions[currentQuestion]?.type === 'coding' ? 'monospace' : 'inherit' }}
                  />
                  <div className="text-xs text-muted-foreground mt-2">
                    {userAnswers[quiz.questions[currentQuestion].id]?.length || 0} characters
                  </div>
                </div>
              )}
            </div>
            
            {/* Navigation */}
            <div className="flex justify-between items-center">
              <button
                onClick={prevQuestion}
                disabled={currentQuestion === 0}
                className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowLeft className="h-4 w-4" />
                Previous
              </button>
              
              <div className="text-sm text-muted-foreground">
                {userAnswers[quiz.questions[currentQuestion]?.id] ? (
                  <span className="text-green-600 flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" />
                    Answered
                  </span>
                ) : (
                  <span className="text-yellow-600">Not answered</span>
                )}
              </div>
              
              <button
                onClick={nextQuestion}
                disabled={currentQuestion === quiz.questions.length - 1}
                className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        
        {/* Results */}
        {showResults && results && (
          <div className="space-y-6">
            {/* Score Overview */}
            <div className="bg-card rounded-xl border border-border shadow-sm p-8">
              <div className="text-center mb-6">
                <div className="w-16 h-16 mx-auto mb-4 bg-yellow-100 rounded-full flex items-center justify-center">
                  <Award className="h-8 w-8 text-yellow-600" />
                </div>
                <h2 className="text-2xl font-semibold text-foreground mb-2">Quiz Completed</h2>
                <div className="text-4xl font-bold text-primary mb-2">
                  {results.score.toFixed(1)}%
                </div>
                <p className="text-muted-foreground">
                  {results.correct_answers} out of {results.total_questions} questions correct
                </p>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <div className="w-8 h-8 mx-auto mb-2 bg-primary/10 rounded-full flex items-center justify-center">
                    <Target className="h-4 w-4 text-primary" />
                  </div>
                  <div className="font-semibold text-foreground">{results.score.toFixed(1)}%</div>
                  <div className="text-xs text-muted-foreground">Score</div>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <div className="w-8 h-8 mx-auto mb-2 bg-green-100 rounded-full flex items-center justify-center">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  </div>
                  <div className="font-semibold text-foreground">{results.correct_answers}</div>
                  <div className="text-xs text-muted-foreground">Correct</div>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <div className="w-8 h-8 mx-auto mb-2 bg-red-100 rounded-full flex items-center justify-center">
                    <XCircle className="h-4 w-4 text-red-600" />
                  </div>
                  <div className="font-semibold text-foreground">{results.total_questions - results.correct_answers}</div>
                  <div className="text-xs text-muted-foreground">Incorrect</div>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <div className="w-8 h-8 mx-auto mb-2 bg-blue-100 rounded-full flex items-center justify-center">
                    <Clock className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="font-semibold text-foreground">{formatTime(results.time_spent)}</div>
                  <div className="text-xs text-muted-foreground">Time</div>
                </div>
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex gap-4 justify-center">
              <button
                onClick={restartQuiz}
                className="flex items-center gap-2 px-6 py-3 border border-border rounded-lg hover:bg-muted"
              >
                <RotateCcw className="h-4 w-4" />
                Take Another Quiz
              </button>
              <button
                onClick={() => router.push(`/video-ai-assistant?videoId=${videoId}&title=${encodeURIComponent(videoTitle)}`)}
                className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Video
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function QuizPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
      <QuizPageInner />
    </Suspense>
  );
}

