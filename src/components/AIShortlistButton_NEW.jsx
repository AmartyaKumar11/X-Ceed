'use client';

import { useState } from 'react';
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
  FileText
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShiningText } from "@/components/ui/shining-text";
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

const AIShortlistButton = ({ job, onShortlistComplete }) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [shortlistResults, setShortlistResults] = useState(null);
  const [error, setError] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState({});

  const handleAIShortlist = async () => {
    setIsAnalyzing(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication required');
      }

      const response = await fetch('/api/ai/shortlist-candidates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          jobId: job._id
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to analyze candidates');
      }

      const data = await response.json();
      setShortlistResults(data);
      setShowResults(true);
      
      if (onShortlistComplete) {
        onShortlistComplete(data);
      }

    } catch (error) {
      console.error('AI Shortlisting Error:', error);
      setError(error.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const updateApplicationStatus = async (candidateId, newStatus) => {
    setUpdatingStatus(prev => ({ ...prev, [candidateId]: true }));
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/applications/${candidateId}/status`, {
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

      // Update the local state
      setShortlistResults(prev => ({
        ...prev,
        data: {
          ...prev.data,
          shortlist: prev.data.shortlist.map(candidate => 
            candidate.candidate_id === candidateId 
              ? { ...candidate, application_status: newStatus }
              : candidate
          )
        }
      }));

    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update application status');
    } finally {
      setUpdatingStatus(prev => ({ ...prev, [candidateId]: false }));
    }
  };

  const getRecommendationColor = (recommendation) => {
    if (recommendation?.includes('HIGHLY_RECOMMENDED')) return 'text-green-600 bg-green-50 border-green-200';
    if (recommendation?.includes('RECOMMENDED')) return 'text-blue-600 bg-blue-50 border-blue-200';
    if (recommendation?.includes('CONSIDER')) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-blue-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'shortlisted': return 'bg-green-100 text-green-800';
      case 'under_review': return 'bg-blue-100 text-blue-800';
      case 'interviewed': return 'bg-purple-100 text-purple-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <>
      <Button
        onClick={handleAIShortlist}
        disabled={isAnalyzing}
        variant="outline"
        className="flex items-center gap-2 bg-gradient-to-r from-blue-50 to-purple-50 hover:from-blue-100 hover:to-purple-100"
      >
        <Brain className="h-4 w-4" />
        {isAnalyzing ? (
          <>
            <Clock className="h-4 w-4 animate-spin" />
            Analyzing Candidates...
          </>
        ) : (
          'AI Shortlist Candidates'
        )}
      </Button>

      <Dialog open={showResults} onOpenChange={setShowResults}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Brain className="h-6 w-6 text-blue-500" />
              AI Candidate Analysis Results
            </DialogTitle>
            <DialogDescription>
              {isAnalyzing && !shortlistResults?.data?.summary ? (
                <ShiningText text="Analyzing candidates for the best matches..." className="text-sm" />
              ) : (
                shortlistResults?.data?.summary || 'Analyzing candidates for the best matches...'
              )}
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {shortlistResults?.data && (
            <div className="space-y-6">
              {/* Analysis Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Analysis Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {shortlistResults.data.totalCandidates}
                      </div>
                      <div className="text-sm text-gray-600">Total Candidates</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {shortlistResults.data.shortlist?.filter(c => c.overall_score >= 70).length || 0}
                      </div>
                      <div className="text-sm text-gray-600">Strong Matches</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-yellow-600">
                        {shortlistResults.data.shortlist?.filter(c => c.overall_score >= 50 && c.overall_score < 70).length || 0}
                      </div>
                      <div className="text-sm text-gray-600">Potential Matches</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">
                        {new Date().toLocaleDateString()}
                      </div>
                      <div className="text-sm text-gray-600">Analysis Date</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Analysis Criteria */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">AI Analysis Criteria</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {shortlistResults?.data?.criteria?.map((criterion, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span className="text-sm">{criterion}</span>
                      </div>
                    )) || (
                      <div className="col-span-full text-center text-gray-500">
                        No criteria available
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Ranked Candidates */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-blue-500" />
                  Ranked Candidates ({shortlistResults.data.shortlist?.length || 0})
                </h3>

                {shortlistResults?.data?.shortlist?.length > 0 ? (
                  <div className="space-y-4">
                    {shortlistResults.data.shortlist.map((candidate, index) => (
                      <Card key={candidate.candidate_id} className="border-l-4 border-l-blue-500 hover:shadow-lg transition-shadow">
                        <CardHeader>
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <CardTitle className="text-lg flex items-center gap-2">
                                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm">
                                  #{index + 1}
                                </div>
                                {candidate.applicant_name}
                              </CardTitle>
                              <CardDescription className="flex items-center gap-4 mt-2">
                                <span className="flex items-center gap-1">
                                  <Mail className="h-4 w-4" />
                                  {candidate.applicant_email}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-4 w-4" />
                                  {new Date(candidate.application_date).toLocaleDateString()}
                                </span>
                                {candidate.resume_filename && (
                                  <span className="flex items-center gap-1">
                                    <FileText className="h-4 w-4" />
                                    Resume Available
                                  </span>
                                )}
                              </CardDescription>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <div className="text-right mr-4">
                                <div className={`text-2xl font-bold ${getScoreColor(candidate.overall_score)}`}>
                                  {candidate.overall_score}%
                                </div>
                                <div className="text-sm text-gray-600">Overall Match</div>
                              </div>
                              
                              <Badge 
                                variant="outline" 
                                className={getRecommendationColor(candidate.recommendation)}
                              >
                                {candidate.recommendation?.split('_')[0] || 'REVIEW'}
                              </Badge>

                              {/* Status Update Dropdown */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    disabled={updatingStatus[candidate.candidate_id]}
                                    className={getStatusColor(candidate.application_status || 'pending')}
                                  >
                                    {updatingStatus[candidate.candidate_id] ? (
                                      <Clock className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <>
                                        {candidate.application_status || 'pending'}
                                        <ChevronDown className="h-4 w-4 ml-1" />
                                      </>
                                    )}
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                  <DropdownMenuItem 
                                    onClick={() => updateApplicationStatus(candidate.candidate_id, 'under_review')}
                                  >
                                    Under Review
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => updateApplicationStatus(candidate.candidate_id, 'shortlisted')}
                                  >
                                    Shortlisted
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => updateApplicationStatus(candidate.candidate_id, 'interviewed')}
                                  >
                                    Interviewed
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => updateApplicationStatus(candidate.candidate_id, 'rejected')}
                                    className="text-red-600"
                                  >
                                    Rejected
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </CardHeader>

                        <CardContent>
                          {/* Score Breakdown */}
                          <div className="grid grid-cols-3 gap-4 mb-6">
                            <div className="text-center p-3 bg-blue-50 rounded-lg">
                              <div className="text-2xl font-bold text-blue-600">{candidate.skills_score || 0}%</div>
                              <div className="text-sm text-gray-600">Skills Match</div>
                              <Progress value={candidate.skills_score || 0} className="mt-2 h-2" />
                            </div>
                            <div className="text-center p-3 bg-green-50 rounded-lg">
                              <div className="text-2xl font-bold text-green-600">{candidate.experience_score || 0}%</div>
                              <div className="text-sm text-gray-600">Experience</div>
                              <Progress value={candidate.experience_score || 0} className="mt-2 h-2" />
                            </div>
                            <div className="text-center p-3 bg-purple-50 rounded-lg">
                              <div className="text-2xl font-bold text-purple-600">{candidate.projects_score || 0}%</div>
                              <div className="text-sm text-gray-600">Projects</div>
                              <Progress value={candidate.projects_score || 0} className="mt-2 h-2" />
                            </div>
                          </div>

                          {/* Strengths and Weaknesses */}
                          <div className="grid md:grid-cols-2 gap-4 mb-4">
                            <div>
                              <h4 className="font-semibold text-green-600 mb-2 flex items-center gap-1">
                                <Award className="h-4 w-4" />
                                Key Strengths
                              </h4>
                              <ul className="space-y-1">
                                {candidate.strengths?.length > 0 ? candidate.strengths.map((strength, idx) => (
                                  <li key={idx} className="text-sm flex items-start gap-2">
                                    <CheckCircle className="h-3 w-3 text-green-500 mt-0.5 flex-shrink-0" />
                                    {strength}
                                  </li>
                                )) : (
                                  <li className="text-sm text-gray-500">No strengths listed</li>
                                )}
                              </ul>
                            </div>
                            <div>
                              <h4 className="font-semibold text-orange-600 mb-2 flex items-center gap-1">
                                <Target className="h-4 w-4" />
                                Areas for Growth
                              </h4>
                              <ul className="space-y-1">
                                {candidate.weaknesses?.length > 0 ? candidate.weaknesses.map((weakness, idx) => (
                                  <li key={idx} className="text-sm flex items-start gap-2">
                                    <XCircle className="h-3 w-3 text-orange-500 mt-0.5 flex-shrink-0" />
                                    {weakness}
                                  </li>
                                )) : (
                                  <li className="text-sm text-gray-500">No growth areas listed</li>
                                )}
                              </ul>
                            </div>
                          </div>

                          {/* AI Recommendation */}
                          <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg">
                            <h4 className="font-semibold mb-2 flex items-center gap-2">
                              <Brain className="h-4 w-4 text-blue-500" />
                              AI Recommendation
                            </h4>
                            <p className="text-sm text-gray-700">{candidate.detailed_analysis || candidate.recommendation}</p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="text-center py-8">
                      <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-600 mb-2">No Candidates Found</h3>
                      <p className="text-gray-500">No applications have been submitted for this job yet.</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AIShortlistButton;
