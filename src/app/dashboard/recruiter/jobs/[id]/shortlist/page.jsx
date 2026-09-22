'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  Brain, 
  Users, 
  TrendingUp, 
  Award, 
  Target,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  Mail,
  Calendar,
  FileText,
  ArrowLeft,
  RefreshCw,
  Download,
  Filter,
  Eye,
  Star,
  AlertCircle,
  Loader2,
  Copy,
  Sparkles
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import InterviewSchedulingDialog from "@/components/InterviewSchedulingDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function AIShortlistPage() {
  const params = useParams();
  const router = useRouter();
  const [job, setJob] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [outreachOpen, setOutreachOpen] = useState(false);
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [outreachEmail, setOutreachEmail] = useState('');
  const [outreachMeta, setOutreachMeta] = useState(null);
  const [aiResults, setAiResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState({});
  const [filter, setFilter] = useState('all');
  
  // Interview scheduling
  const [interviewDialogOpen, setInterviewDialogOpen] = useState(false);
  const [candidateForInterview, setCandidateForInterview] = useState(null);
  
  // Resume viewer
  const [resumeViewerOpen, setResumeViewerOpen] = useState(false);
  const [resumeUrl, setResumeUrl] = useState('');
  const [loadingResume, setLoadingResume] = useState(false);

  const handleDraftOutreach = async (candidate) => {
    setOutreachOpen(true);
    setOutreachLoading(true);
    setOutreachEmail('');
    setOutreachMeta(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/ai/generate-outreach', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          jobId: job?._id || job?.id || params.id,
          candidateId: candidate.applicantId || candidate.userId || candidate.applicant?._id,
          applicationId: candidate._id || candidate.id,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed');
      setOutreachEmail(json.data.email || '');
      setOutreachMeta(json.data);
    } catch (e) {
      setOutreachEmail(`Could not generate outreach: ${e.message}`);
    } finally {
      setOutreachLoading(false);
    }
  };

  useEffect(() => {
    console.log('🚀 Shortlist page mounted with jobId:', params.id);
    if (params.id) {
      fetchJobAndAnalyze();
    }
  }, [params.id]);

  const fetchJobAndAnalyze = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem('token');
      console.log('🔍 Frontend token check:', token ? 'Token exists' : 'No token found');
      
      if (!token) {
        setError('Authentication required. Please log in again.');
        return;
      }

      // Fetch job details
      console.log('📤 Fetching job details...');
      const jobResponse = await fetch(`/api/jobs/${params.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!jobResponse.ok) {
        if (jobResponse.status === 401) {
          setError('Authentication expired. Please log in again.');
          return;
        }
        throw new Error(`Job not found (${jobResponse.status})`);
      }
      
      const jobData = await jobResponse.json();
      setJob(jobData.job || jobData);
      console.log('✅ Job details fetched:', jobData.job?.title || jobData.title);

      // Fetch candidates/applications
      console.log('📤 Fetching candidates...');
      const candidatesResponse = await fetch(`/api/applications?jobId=${params.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (candidatesResponse.ok) {
        const candidatesData = await candidatesResponse.json();
        const candidatesList = candidatesData.applications || candidatesData.data || [];
        setCandidates(candidatesList);
        console.log('✅ Candidates fetched:', candidatesList.length);
        console.log('🔍 Sample candidate data:', JSON.stringify({
          firstCandidate: candidatesList[0],
          candidateStructure: candidatesList[0] ? Object.keys(candidatesList[0]) : [],
          applicantData: candidatesList[0]?.applicant,
          applicantStructure: candidatesList[0]?.applicant ? Object.keys(candidatesList[0]?.applicant) : []
        }, null, 2));

        // Start AI analysis if we have candidates
        if (candidatesList.length > 0) {
          await performAIAnalysis(jobData.job || jobData, candidatesList);
        } else {
          console.log('ℹ️ No candidates found for this job');
        }
      } else {
        console.warn('⚠️ Failed to fetch candidates:', candidatesResponse.status);
        // Continue without candidates - maybe use mock data for testing
        setCandidates([]);
      }

    } catch (error) {
      console.error('❌ Error fetching data:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const performAIAnalysis = async (jobData, candidatesList) => {
    try {
      setAnalyzing(true);
      
      const token = localStorage.getItem('token');
      console.log('🔍 Token check:', token ? `Token exists (${token.substring(0, 20)}...)` : 'No token found');
      console.log('🔍 Full token for debugging:', token);
      
      if (!token) {
        throw new Error('No authentication token found. Please log in again.');
      }
      
      // Prepare candidates data for AI analysis
      const candidatesForAI = candidatesList.map(candidate => {
        const candidateData = {
          id: candidate._id || candidate.id || 'unknown-id',
          name: getApplicantFullName(candidate) || 'Unknown Candidate',
          email: getApplicantEmail(candidate) || 'no-email@example.com',
          skills: (getApplicantSkills(candidate) || []).map(s => s?.name || s).filter(Boolean),
          resumeText: candidate.resumeText || `${getApplicantFullName(candidate)} - Applied for ${jobData.title}`,
          appliedAt: candidate.appliedAt || candidate.createdAt || new Date().toISOString(),
          resumePath: candidate.resumeUsed || candidate.resumePath || null
        };
        
        // Log any potential data issues
        if (!candidateData.id || candidateData.id === 'unknown-id') {
          console.warn('⚠️ Candidate missing ID:', candidate);
        }
        if (!candidateData.name || candidateData.name === 'Unknown Candidate') {
          console.warn('⚠️ Candidate missing name:', candidate);
        }
        if (candidateData.skills.length === 0) {
          console.warn('⚠️ Candidate has no skills:', candidate);
        }
        
        return candidateData;
      }).filter(candidate => candidate.id && candidate.name); // Filter out candidates with missing essential data

      console.log('📤 Sending AI analysis request:', {
        jobId: jobData._id || jobData.id,
        jobTitle: jobData.title,
        candidateCount: candidatesForAI.length,
        candidatesData: candidatesForAI.map(c => ({ id: c.id, name: c.name, skills: c.skills?.length })),
        url: '/api/ai/shortlist-candidates',
        jobDescription: jobData.description ? 'Present' : 'Missing',
        jobRequirements: (jobData.requirements || []).length
      });

      // Validate essential data before making API call
      if (!jobData._id && !jobData.id) {
        throw new Error('Job ID is missing');
      }
      if (!jobData.title) {
        throw new Error('Job title is missing');
      }
      if (candidatesForAI.length === 0) {
        throw new Error('No valid candidates found for analysis');
      }

      const requestBody = {
        jobId: jobData._id || jobData.id,
        jobTitle: jobData.title,
        jobDescription: jobData.description || `Job posting for ${jobData.title}`,
        jobRequirements: jobData.requirements || [],
        candidates: candidatesForAI,
        weights: jobData.evaluationWeights || undefined,
      };

      console.log('📋 Request body validation:', {
        hasJobId: !!requestBody.jobId,
        hasJobTitle: !!requestBody.jobTitle,
        hasJobDescription: !!requestBody.jobDescription,
        requirementsCount: requestBody.jobRequirements.length,
        candidatesCount: requestBody.candidates.length
      });

      const response = await fetch('/api/ai/shortlist-candidates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      });

      console.log('📊 AI API Response details:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        url: response.url,
        headers: Object.fromEntries(response.headers.entries())
      });

      if (!response.ok) {
        let errorData = {};
        let errorText = '';
        
        try {
          const responseText = await response.text();
          errorText = responseText;
          console.log('📋 Raw error response:', responseText);
          
          // Try to parse as JSON
          if (responseText.trim().startsWith('{')) {
            errorData = JSON.parse(responseText);
          }
        } catch (parseError) {
          console.error('❌ Failed to parse error response:', parseError);
          errorData = { message: errorText || 'Unknown error occurred' };
        }
        
        console.error('❌ AI API Error Details:', {
          status: response.status,
          statusText: response.statusText,
          errorData: errorData,
          url: response.url,
          rawResponse: errorText
        });
        
        const errorMessage = errorData.message || 
                           errorData.error?.message || 
                           errorText ||
                           `API request failed with status ${response.status}: ${response.statusText}`;
        
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('✅ AI Analysis completed:', JSON.stringify(data, null, 2));
      console.log('🔍 AI Results structure:', JSON.stringify({
        hasData: !!data.data,
        hasTopCandidates: !!data.data?.topCandidates,
        hasAllRanked: !!data.data?.allRanked,
        topCandidatesCount: data.data?.topCandidates?.length || 0,
        allRankedCount: data.data?.allRanked?.length || 0,
        sampleTopCandidate: data.data?.topCandidates?.[0],
        sampleAllRanked: data.data?.allRanked?.[0]
      }, null, 2));
      setAiResults(data.data);

    } catch (error) {
      console.error('❌ AI Analysis Error Details:', {
        message: error.message,
        name: error.name,
        stack: error.stack,
        cause: error.cause,
        fullError: error
      });
      setError(`AI Analysis failed: ${error.message}`);
    } finally {
      setAnalyzing(false);
    }
  };



  // Helper functions to get applicant data consistently
  const getApplicantData = (candidate) => {
    return candidate?.applicant || candidate?.applicantDetails;
  };

  const getApplicantFullName = (candidate) => {
    const applicantData = getApplicantData(candidate);
    if (applicantData?.firstName && applicantData?.lastName) {
      return `${applicantData.firstName} ${applicantData.lastName}`;
    }
    return applicantData?.personal?.name || 'Candidate';
  };

  const getApplicantEmail = (candidate) => {
    const applicantData = getApplicantData(candidate);
    return applicantData?.email || applicantData?.personal?.email || 'N/A';
  };

  const getApplicantSkills = (candidate) => {
    const applicantData = getApplicantData(candidate);
    return applicantData?.skills || applicantData?.professional?.skills || [];
  };

  const updateApplicationStatus = async (candidateId, newStatus) => {
    // If status is interview, open the interview scheduling dialog
    if (newStatus === 'interview') {
      const candidate = candidates.find(c => c._id === candidateId);
      if (candidate) {
        setCandidateForInterview(candidate);
        setInterviewDialogOpen(true);
      }
      return;
    }

    setUpdatingStatus(prev => ({ ...prev, [candidateId]: true }));
    
    try {
      const token = localStorage.getItem('token');
      
      const response = await fetch(`/api/applications/${candidateId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (!response.ok) {
        throw new Error('Failed to update status');
      }

      // Update local state
      setCandidates(prev => 
        prev.map(candidate => 
          candidate._id === candidateId ? { ...candidate, status: newStatus } : candidate
        )
      );

    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update application status');
    } finally {
      setUpdatingStatus(prev => ({ ...prev, [candidateId]: false }));
    }
  };

  const handleScheduleInterview = async (interviewData) => {
    try {
      const token = localStorage.getItem('token');
      
      const response = await fetch('/api/applications/schedule-interview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(interviewData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to schedule interview');
      }

      // Update local state
      setCandidates(prev => 
        prev.map(candidate => 
          candidate._id === interviewData.applicationId 
            ? { ...candidate, status: 'interview' } 
            : candidate
        )
      );

      alert('Interview scheduled successfully!');
      return await response.json();
    } catch (error) {
      console.error('Error scheduling interview:', error);
      throw error;
    }
  };

  const handleViewResume = async (candidate) => {
    setLoadingResume(true);
    try {
      const resumePath = candidate.resumeUsed || candidate.resumePath || candidate.resumeUrl;
      
      if (!resumePath) {
        alert('No resume found for this candidate.');
        return;
      }

      const filename = resumePath.split('/').pop();
      const token = localStorage.getItem('token');
      
      const response = await fetch(`/api/download/resume/${filename}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setResumeUrl(url);
        setResumeViewerOpen(true);
      } else {
        alert('Failed to load resume. Please try again.');
      }
    } catch (error) {
      console.error('Error loading resume:', error);
      alert('An error occurred while loading the resume.');
    } finally {
      setLoadingResume(false);
    }
  };

  const getRecommendationColor = (recommendation) => {
    switch (recommendation) {
      case 'STRONG_HIRE': return 'bg-green-500 text-white';
      case 'HIRE': return 'bg-blue-500 text-white';
      case 'MAYBE': return 'bg-yellow-500 text-white';
      case 'REJECT': return 'bg-red-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getRecommendationIcon = (recommendation) => {
    switch (recommendation) {
      case 'STRONG_HIRE': return <Star className="w-4 h-4" />;
      case 'HIRE': return <CheckCircle className="w-4 h-4" />;
      case 'MAYBE': return <AlertCircle className="w-4 h-4" />;
      case 'REJECT': return <XCircle className="w-4 h-4" />;
      default: return <Eye className="w-4 h-4" />;
    }
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 60) return 'text-blue-600 dark:text-blue-400';
    if (score >= 40) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'accepted': return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'interview': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400';
      case 'reviewing': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'rejected': return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  // Merge AI results with candidate data
  const enrichedCandidates = candidates.map(candidate => {
    // Look for AI result in both topCandidates and allRanked arrays
    const aiResult = aiResults?.allRanked?.find(ai => 
      ai.candidateId === candidate._id || 
      ai.candidateId === candidate.id ||
      ai.id === candidate._id ||
      ai.id === candidate.id
    ) || aiResults?.topCandidates?.find(ai => 
      ai.candidateId === candidate._id || 
      ai.candidateId === candidate.id ||
      ai.id === candidate._id ||
      ai.id === candidate.id
    );

    // Debug logging for first candidate
    if (candidate === candidates[0]) {
      console.log('🔍 Enriching first candidate:', JSON.stringify({
        candidateId: candidate._id || candidate.id,
        candidateName: candidate?.applicant?.firstName || candidate?.name,
        candidateFullData: candidate,
        hasAiResults: !!aiResults,
        aiResultsKeys: aiResults ? Object.keys(aiResults) : [],
        aiResultsData: aiResults,
        foundAiResult: !!aiResult,
        aiResultData: aiResult
      }, null, 2));
    }

    return {
      ...candidate,
      aiScore: aiResult?.score || 0,
      aiRecommendation: aiResult?.recommendation || 'PENDING',
      aiStrengths: aiResult?.strengths || [],
      aiWeaknesses: aiResult?.weaknesses || [],
      aiReasoning: aiResult?.reasoning || 'AI analysis in progress...',
      aiBreakdown: aiResult?.breakdown || { skills: 0, experience: 0, projects: 0, overall: 0 },
      aiRank: aiResult?.rank || 999
    };
  }).sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0)); // Sort by AI score descending

  const filteredCandidates = enrichedCandidates.filter(candidate => {
    if (filter === 'all') return true;
    if (filter === 'high') return candidate.aiScore >= 70;
    if (filter === 'medium') return candidate.aiScore >= 50 && candidate.aiScore < 70;
    if (filter === 'low') return candidate.aiScore < 50;
    return true;
  }).sort((a, b) => b.aiScore - a.aiScore); // Sort by AI score descending

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-6">
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="grid gap-6">
            {[1, 2, 3].map(i => (
              <Card key={i} className="p-6">
                <Skeleton className="h-6 w-48 mb-4" />
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
                <Skeleton className="h-20 w-full" />
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md mx-auto">
          <CardContent className="text-center py-8">
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Error</h3>
            <p className="text-muted-foreground mb-4">{error}</p>
            <div className="flex gap-2 justify-center">
              <Button onClick={() => router.back()} variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Go Back
              </Button>
              <Button onClick={fetchJobAndAnalyze}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <Button 
                onClick={() => router.back()} 
                variant="outline" 
                size="sm"
                className="border-border"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Jobs
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
                  <Brain className="h-8 w-8 text-blue-500" />
                  AI Candidate Analysis
                </h1>
                <p className="text-muted-foreground">
                  {job?.title} - Intelligent candidate ranking and insights
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={fetchJobAndAnalyze} variant="outline" disabled={analyzing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${analyzing ? 'animate-spin' : ''}`} />
                {analyzing ? 'Analyzing...' : 'Refresh Analysis'}
              </Button>
              {candidates.length > 0 && !aiResults && !analyzing && (
                <Button 
                  onClick={() => performAIAnalysis(job, candidates)} 
                  variant="default"
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Brain className="h-4 w-4 mr-2" />
                  Start AI Analysis
                </Button>
              )}
            </div>
          </div>
        </div>

        {analyzing && (
          <Card className="mb-6 border-blue-200 dark:border-blue-800">
            <CardContent className="py-8">
              <div className="text-center">
                <Brain className="h-12 w-12 text-blue-500 mx-auto mb-4 animate-pulse" />
                <h3 className="text-lg font-semibold text-foreground mb-2">AI Analysis in Progress</h3>
                <p className="text-muted-foreground mb-4">
                  Analyzing candidate resumes and matching against job requirements...
                </p>
                <div className="w-full max-w-xs mx-auto">
                  <Progress value={75} className="h-2" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {candidates.length > 0 ? (
          <>
            {/* Analysis Overview */}
            <Card className="mb-6 border-border">
              <CardHeader>
                <CardTitle className="text-xl text-foreground">AI Analysis Overview</CardTitle>
                <CardDescription>
                  Intelligent candidate ranking and insights for {job?.title}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {candidates.length}
                    </div>
                    <div className="text-sm text-muted-foreground">Total Candidates</div>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {enrichedCandidates.filter(c => c.aiRecommendation === 'STRONG_HIRE').length}
                    </div>
                    <div className="text-sm text-muted-foreground">Strong Hire</div>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {enrichedCandidates.filter(c => c.aiRecommendation === 'HIRE').length}
                    </div>
                    <div className="text-sm text-muted-foreground">Hire</div>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                      {enrichedCandidates.filter(c => c.aiRecommendation === 'MAYBE').length}
                    </div>
                    <div className="text-sm text-muted-foreground">Maybe</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Filters and Actions */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-semibold text-foreground">
                  Ranked Candidates ({filteredCandidates.length})
                </h2>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Filter className="h-4 w-4 mr-2" />
                      Filter: {filter === 'all' ? 'All' : filter === 'high' ? 'High Score' : filter === 'medium' ? 'Medium Score' : 'Low Score'}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => setFilter('all')}>All Candidates</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilter('high')}>High Score (70%+)</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilter('medium')}>Medium Score (50-69%)</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilter('low')}>Low Score (&lt;50%)</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export Results
              </Button>
            </div>

            {/* Candidates List */}
            {filteredCandidates.length > 0 ? (
              <div className="space-y-6">
                {filteredCandidates.map((candidate, index) => (
                  <Card key={candidate._id} className="border-l-4 border-l-blue-500 hover:shadow-lg transition-all duration-200 border-border">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <CardTitle className="text-lg flex items-center gap-3 text-foreground">
                            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-sm">
                              #{index + 1}
                            </div>
                            {getApplicantFullName(candidate)}
                          </CardTitle>
                          <CardDescription className="flex items-center gap-4 mt-2 text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Mail className="h-4 w-4" />
                              {getApplicantEmail(candidate)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {new Date(candidate.appliedAt || candidate.createdAt).toLocaleDateString()}
                            </span>
                            {(candidate.resumeUsed || candidate.resumePath) && (
                              <span className="flex items-center gap-1">
                                <FileText className="h-4 w-4" />
                                Resume Available
                              </span>
                            )}
                          </CardDescription>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <div className="text-right mr-4">
                            <div className={`text-3xl font-bold ${getScoreColor(candidate.aiScore)}`}>
                              {candidate.aiScore}%
                            </div>
                            <div className="text-sm text-muted-foreground">AI Score</div>
                          </div>
                          
                          <Badge 
                            className={`${getRecommendationColor(candidate.aiRecommendation)} flex items-center gap-1`}
                          >
                            {getRecommendationIcon(candidate.aiRecommendation)}
                            {candidate.aiRecommendation.replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent>
                      {/* Score Breakdown */}
                      <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{candidate.aiBreakdown.skills}%</div>
                          <div className="text-sm text-muted-foreground">Skills Match</div>
                          <Progress value={candidate.aiBreakdown.skills} className="mt-2 h-2" />
                        </div>
                        <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                          <div className="text-2xl font-bold text-green-600 dark:text-green-400">{candidate.aiBreakdown.experience}%</div>
                          <div className="text-sm text-muted-foreground">Experience</div>
                          <Progress value={candidate.aiBreakdown.experience} className="mt-2 h-2" />
                        </div>
                        <div className="text-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{candidate.aiBreakdown.projects}%</div>
                          <div className="text-sm text-muted-foreground">Projects</div>
                          <Progress value={candidate.aiBreakdown.projects} className="mt-2 h-2" />
                        </div>
                      </div>

                      {/* Strengths and Weaknesses */}
                      <div className="grid md:grid-cols-2 gap-6 mb-6">
                        <div>
                          <h4 className="font-semibold text-green-600 dark:text-green-400 mb-3 flex items-center gap-2">
                            <Award className="h-4 w-4" />
                            Key Strengths
                          </h4>
                          <ul className="space-y-2">
                            {candidate.aiStrengths?.length > 0 ? candidate.aiStrengths.map((strength, idx) => (
                              <li key={idx} className="text-sm flex items-start gap-2">
                                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                                <span className="text-foreground">{strength}</span>
                              </li>
                            )) : (
                              <li className="text-sm text-muted-foreground">Analysis in progress...</li>
                            )}
                          </ul>
                        </div>
                        <div>
                          <h4 className="font-semibold text-orange-600 dark:text-orange-400 mb-3 flex items-center gap-2">
                            <Target className="h-4 w-4" />
                            Areas for Growth
                          </h4>
                          <ul className="space-y-2">
                            {candidate.aiWeaknesses?.length > 0 ? candidate.aiWeaknesses.map((weakness, idx) => (
                              <li key={idx} className="text-sm flex items-start gap-2">
                                <XCircle className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
                                <span className="text-foreground">{weakness}</span>
                              </li>
                            )) : (
                              <li className="text-sm text-muted-foreground">Analysis in progress...</li>
                            )}
                          </ul>
                        </div>
                      </div>

                      {/* AI Recommendation */}
                      <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg border border-blue-200 dark:border-blue-800 mb-6">
                        <h4 className="font-semibold mb-2 flex items-center gap-2 text-foreground">
                          <Brain className="h-4 w-4 text-blue-500" />
                          AI Recommendation
                        </h4>
                        <p className="text-sm text-foreground">{candidate.aiReasoning}</p>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center justify-between pt-4 border-t">
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={() => handleDraftOutreach(candidate)}
                            variant="outline"
                            size="sm"
                            className="flex items-center gap-2"
                          >
                            <Sparkles className="h-4 w-4" />
                            AI Draft Outreach
                          </Button>

                          <Button
                            onClick={() => handleViewResume(candidate)}
                            disabled={loadingResume}
                            variant="outline"
                            size="sm"
                            className="flex items-center gap-2"
                          >
                            {loadingResume ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                            View Resume
                          </Button>
                          
                          <Button
                            onClick={() => {
                              const filename = (candidate.resumeUsed || candidate.resumePath || '').split('/').pop();
                              if (filename) {
                                const link = document.createElement('a');
                                link.href = `/api/download/resume/${filename}`;
                                link.download = filename;
                                link.click();
                              }
                            }}
                            variant="outline"
                            size="sm"
                            className="flex items-center gap-2"
                          >
                            <Download className="h-4 w-4" />
                            Download
                          </Button>
                        </div>

                        {/* Status Update Dropdown */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              disabled={updatingStatus[candidate._id]}
                              className={getStatusColor(candidate.status || 'pending')}
                            >
                              {updatingStatus[candidate._id] ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  {candidate.status || 'pending'}
                                  <ChevronDown className="h-4 w-4 ml-1" />
                                </>
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem 
                              onClick={() => updateApplicationStatus(candidate._id, 'reviewing')}
                            >
                              Under Review
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => updateApplicationStatus(candidate._id, 'interview')}
                            >
                              Schedule Interview
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => updateApplicationStatus(candidate._id, 'accepted')}
                            >
                              Accept
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => updateApplicationStatus(candidate._id, 'rejected')}
                              className="text-red-600 dark:text-red-400"
                            >
                              Reject
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-border">
                <CardContent className="text-center py-12">
                  <Users className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">No Candidates Found</h3>
                  <p className="text-muted-foreground">
                    {filter === 'all' 
                      ? 'No applications have been submitted for this job yet.' 
                      : `No candidates match the selected filter criteria.`
                    }
                  </p>
                  {filter !== 'all' && (
                    <Button 
                      onClick={() => setFilter('all')} 
                      variant="outline" 
                      className="mt-4"
                    >
                      View All Candidates
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          !loading && (
            <Card className="border-border">
              <CardContent className="text-center py-12">
                <Users className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">No Applications Yet</h3>
                <p className="text-muted-foreground mb-4">
                  No candidates have applied for this job position yet.
                </p>
                <Button 
                  onClick={() => router.back()} 
                  variant="outline"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Jobs
                </Button>
              </CardContent>
            </Card>
          )
        )}

        {/* Interview Scheduling Dialog */}
        {candidateForInterview && (
          <InterviewSchedulingDialog
            isOpen={interviewDialogOpen}
            onClose={() => {
              setInterviewDialogOpen(false);
              setCandidateForInterview(null);
            }}
            candidate={candidateForInterview}
            job={job}
            onSchedule={handleScheduleInterview}
          />
        )}

        {/* Resume Viewer Dialog */}
        {resumeViewerOpen && (
          <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl max-h-[90vh] w-full overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold">Resume Viewer</h3>
                <Button
                  onClick={() => {
                    setResumeViewerOpen(false);
                    URL.revokeObjectURL(resumeUrl);
                    setResumeUrl('');
                  }}
                  variant="outline"
                  size="sm"
                >
                  Close
                </Button>
              </div>
              <div className="p-4 h-[80vh]">
                <iframe
                  src={resumeUrl}
                  className="w-full h-full border rounded"
                  title="Resume Viewer"
                />
              </div>
            </div>
          </div>
        )}

        <Dialog open={outreachOpen} onOpenChange={setOutreachOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                AI Draft Outreach
                {outreachMeta?.candidateName ? ` — ${outreachMeta.candidateName}` : ''}
              </DialogTitle>
            </DialogHeader>
            {outreachLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="space-y-3">
                <textarea
                  className="w-full h-64 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={outreachEmail}
                  onChange={(e) => setOutreachEmail(e.target.value)}
                />
                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(outreachEmail);
                  }}
                  className="w-full"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy to Clipboard
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
