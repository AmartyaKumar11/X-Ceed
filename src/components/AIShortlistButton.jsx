'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Brain, 
  Clock
} from 'lucide-react';
import { Button } from "@/components/ui/button";

const AIShortlistButton = ({ job, onShortlistComplete }) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const router = useRouter();

  const handleAIShortlist = async () => {
    setIsAnalyzing(true);
    setError(null);

    try {
      // Navigate to the shortlist page immediately
      // The shortlist page will handle the AI analysis
      router.push(`/dashboard/recruiter/jobs/${job._id}/shortlist`);
      
      // Call completion callback if provided
      if (onShortlistComplete) {
        onShortlistComplete({ redirected: true });
      }
    } catch (error) {
      console.error('❌ Navigation Error:', error);
      setError('Failed to navigate to shortlist page');
    } finally {
      setIsAnalyzing(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <Button
        onClick={handleAIShortlist}
        disabled={isAnalyzing}
      >
        <Brain className="h-4 w-4" />
        {isAnalyzing ? (
          <>
            <Clock className="h-4 w-4 animate-spin" />
            Analyzing...
          </>
        ) : (
          <>AI Shortlist</>
        )}
      </Button>
      
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive rounded-lg">
          <p className="text-destructive text-sm">{error}</p>
        </div>
      )}
    </div>  );
};

export default AIShortlistButton;
