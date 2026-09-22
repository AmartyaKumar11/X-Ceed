'use client';

import { useState, useEffect, Suspense} from 'react';
import { useSearchParams } from 'next/navigation';
import CandidateShortlist from '@/components/recruiter/CandidateShortlist';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users } from 'lucide-react';

function ShortlistPageInner() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get('jobId');
  
  const [job, setJob] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (jobId) {
      fetchJobAndCandidates();
    }
  }, [jobId]);

  const fetchJobAndCandidates = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // Fetch job details
      const jobResponse = await fetch(`/api/jobs/${jobId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (jobResponse.ok) {
        const jobData = await jobResponse.json();
        setJob(jobData.job || jobData);
      }

      // Fetch candidates/applications for this job
      const candidatesResponse = await fetch(`/api/jobs/${jobId}/applications`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (candidatesResponse.ok) {
        const candidatesData = await candidatesResponse.json();
        setCandidates(candidatesData.applications || candidatesData.data || []);
      }
      
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="text-center py-12">
            <h2 className="text-xl font-semibold mb-2">Job Not Found</h2>
            <p className="text-gray-600 mb-4">The job you're looking for doesn't exist or you don't have access to it.</p>
            <Button onClick={() => window.history.back()}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Candidate Shortlisting</h1>
          <p className="text-gray-600">AI-powered candidate analysis and ranking</p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => window.history.back()}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Job
        </Button>
      </div>

      {/* Job Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            {job.title}
          </CardTitle>
          <CardDescription>
            {job.companyName} • {candidates.length} applications received
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold mb-2">Job Requirements</h4>
              <div className="flex flex-wrap gap-2">
                {job.requirements?.map((req, index) => (
                  <span 
                    key={index}
                    className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm"
                  >
                    {req}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Job Description</h4>
              <p className="text-sm text-gray-600 line-clamp-3">
                {job.description}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Candidate Shortlisting Component */}
      <CandidateShortlist
        jobId={job._id || job.id}
        jobTitle={job.title}
        jobDescription={job.description}
        jobRequirements={job.requirements || []}
        candidates={candidates}
      />
    </div>
  );
}

export default function ShortlistPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
      <ShortlistPageInner />
    </Suspense>
  );
}

