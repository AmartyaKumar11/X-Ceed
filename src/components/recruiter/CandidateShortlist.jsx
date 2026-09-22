'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Users,
  Brain,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  Download,
  Star
} from 'lucide-react';
import { ShiningText } from "@/components/ui/shining-text";

export default function CandidateShortlist({ jobId, jobTitle, jobDescription, jobRequirements, candidates }) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState(null);

  const analyzeCandiates = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/ai/shortlist-candidates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          jobId,
          jobTitle,
          jobDescription,
          jobRequirements,
          candidates
        })
      });

      if (response.ok) {
        const data = await response.json();
        setResults(data.data);
        console.log('✅ Shortlisting completed:', data.data);
      } else {
        console.error('❌ Shortlisting failed:', response.status);
      }
    } catch (error) {
      console.error('❌ Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRecommendationColor = (recommendation) => {
    switch (recommendation) {
      case 'STRONG_HIRE': return 'bg-green-500';
      case 'HIRE': return 'bg-blue-500';
      case 'MAYBE': return 'bg-yellow-500';
      case 'REJECT': return 'bg-red-500';
      default: return 'bg-gray-500';
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

  if (!results) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            AI-Powered Candidate Shortlisting
          </CardTitle>
          <CardDescription>
            Analyze and rank {candidates?.length || 0} candidates for {jobTitle}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-blue-500" />
                <div>
                  <p className="font-medium">Ready to Analyze</p>
                  <p className="text-sm text-gray-600">
                    {candidates?.length || 0} candidates • {jobRequirements?.length || 0} requirements
                  </p>
                </div>
              </div>
              <Button
                onClick={analyzeCandiates}
                disabled={loading || !candidates?.length}
                className="flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Brain className="w-4 h-4" />
                    Start Analysis
                  </>
                )}
              </Button>
            </div>

            {loading && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Clock className="w-4 h-4" />
                  <ShiningText text="Processing candidates with AI..." className="text-sm" />
                </div>
                <Progress value={33} className="w-full" />
                <p className="text-xs text-gray-500">
                  This may take 30-60 seconds depending on the number of candidates
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Analysis Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {results.topCandidates?.filter(c => c.recommendation === 'STRONG_HIRE').length || 0}
              </div>
              <div className="text-sm text-gray-600">Strong Hire</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {results.topCandidates?.filter(c => c.recommendation === 'HIRE').length || 0}
              </div>
              <div className="text-sm text-gray-600">Hire</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">
                {results.topCandidates?.filter(c => c.recommendation === 'MAYBE').length || 0}
              </div>
              <div className="text-sm text-gray-600">Maybe</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-600">
                {results.analyzedCandidates || 0}
              </div>
              <div className="text-sm text-gray-600">Total Analyzed</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top Candidates */}
      <Card>
        <CardHeader>
          <CardTitle>Top Candidates</CardTitle>
          <CardDescription>
            Ranked by AI analysis • Showing top {Math.min(10, results.topCandidates?.length || 0)} candidates
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {results.topCandidates?.slice(0, 10).map((candidate) => (
              <div
                key={candidate.candidateId}
                className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => setSelectedCandidate(candidate)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-lg font-bold text-gray-400">
                      #{candidate.rank}
                    </div>
                    <div>
                      <h3 className="font-semibold">{candidate.name}</h3>
                      <p className="text-sm text-gray-600">{candidate.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-lg font-bold">{candidate.score}%</div>
                      <div className="text-xs text-gray-500">Overall Score</div>
                    </div>

                    <Badge
                      className={`${getRecommendationColor(candidate.recommendation)} text-white flex items-center gap-1`}
                    >
                      {getRecommendationIcon(candidate.recommendation)}
                      {candidate.recommendation.replace('_', ' ')}
                    </Badge>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-xs text-gray-500">Skills Match</div>
                    <Progress value={candidate.breakdown.skills} className="h-2 mt-1" />
                    <div className="text-xs text-gray-600 mt-1">{candidate.breakdown.skills}%</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Experience</div>
                    <Progress value={candidate.breakdown.experience} className="h-2 mt-1" />
                    <div className="text-xs text-gray-600 mt-1">{candidate.breakdown.experience}%</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Projects</div>
                    <Progress value={candidate.breakdown.projects} className="h-2 mt-1" />
                    <div className="text-xs text-gray-600 mt-1">{candidate.breakdown.projects}%</div>
                  </div>
                </div>

                {candidate.keySkillsFound?.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs text-gray-500 mb-1">Key Skills Found:</div>
                    <div className="flex flex-wrap gap-1">
                      {candidate.keySkillsFound.slice(0, 5).map((skill, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Detailed View Modal */}
      {selectedCandidate && (
        <Card className="fixed inset-0 z-50 bg-white m-4 overflow-auto">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <div className="text-2xl font-bold text-gray-400">
                  #{selectedCandidate.rank}
                </div>
                {selectedCandidate.name}
              </CardTitle>
              <Button
                variant="outline"
                onClick={() => setSelectedCandidate(null)}
              >
                Close
              </Button>
            </div>
            <CardDescription>
              Detailed AI analysis and recommendations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Score Breakdown */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 border rounded-lg">
                <div className="text-3xl font-bold text-blue-600">
                  {selectedCandidate.score}%
                </div>
                <div className="text-sm text-gray-600">Overall Score</div>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <div className="text-3xl font-bold text-green-600">
                  {selectedCandidate.breakdown.skills}%
                </div>
                <div className="text-sm text-gray-600">Skills Match</div>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <div className="text-3xl font-bold text-purple-600">
                  {selectedCandidate.breakdown.experience}%
                </div>
                <div className="text-sm text-gray-600">Experience</div>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <div className="text-3xl font-bold text-orange-600">
                  {selectedCandidate.breakdown.projects}%
                </div>
                <div className="text-sm text-gray-600">Projects</div>
              </div>
            </div>

            {/* Recommendation */}
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Badge
                  className={`${getRecommendationColor(selectedCandidate.recommendation)} text-white flex items-center gap-1`}
                >
                  {getRecommendationIcon(selectedCandidate.recommendation)}
                  {selectedCandidate.recommendation.replace('_', ' ')}
                </Badge>
              </div>
              <p className="text-gray-700">{selectedCandidate.reasoning}</p>
            </div>

            {/* Strengths & Weaknesses */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 border rounded-lg">
                <h4 className="font-semibold text-green-600 mb-2">Strengths</h4>
                <ul className="space-y-1">
                  {selectedCandidate.strengths?.map((strength, index) => (
                    <li key={index} className="text-sm flex items-center gap-2">
                      <CheckCircle className="w-3 h-3 text-green-500" />
                      {strength}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-4 border rounded-lg">
                <h4 className="font-semibold text-red-600 mb-2">Areas for Improvement</h4>
                <ul className="space-y-1">
                  {selectedCandidate.weaknesses?.map((weakness, index) => (
                    <li key={index} className="text-sm flex items-center gap-2">
                      <XCircle className="w-3 h-3 text-red-500" />
                      {weakness}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Skills Analysis */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 border rounded-lg">
                <h4 className="font-semibold text-blue-600 mb-2">Skills Found</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedCandidate.keySkillsFound?.map((skill, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="p-4 border rounded-lg">
                <h4 className="font-semibold text-orange-600 mb-2">Missing Critical Skills</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedCandidate.missingCriticalSkills?.map((skill, index) => (
                    <Badge key={index} variant="destructive" className="text-xs">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button className="flex items-center gap-2">
                <Eye className="w-4 h-4" />
                View Full Resume
              </Button>
              <Button variant="outline" className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                Download Resume
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}