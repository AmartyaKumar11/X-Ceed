'use client';

import { useState } from 'react';
import { Upload, FileText, X, CheckCircle } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { ShiningText } from "@/components/ui/shining-text";

export default function JobDescriptionUpload({ onJobDescriptionSet }) {
  const [jobDescription, setJobDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isSaved, setIsSaved] = useState(false);
  const { toast } = useToast();

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Check file type - be more permissive with text files
    const isTextFile = file.type.includes('text') || file.name.endsWith('.txt');
    const isPdfFile = file.type.includes('pdf') || file.name.endsWith('.pdf');
    
    if (!isTextFile && !isPdfFile) {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF or text (.txt) file.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadedFile(file);

    try {
      let extractedText = '';
      
      // Try text files first (simple client-side processing)
      if (isTextFile) {
        extractedText = await file.text();
      } else if (isPdfFile) {
        // For PDF files, try the backend service
        try {
          const formData = new FormData();
          formData.append('file', file);

          const response = await fetch('/api/parse-job-description', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Server error: ${response.status}`);
          }

          const data = await response.json();
          // Try to extract text from the correct field in the backend response
          extractedText = data.text || data.description || '';
          if (!extractedText && data.data) {
            extractedText = data.data.text || data.data.description || '';
          }
        } catch (backendError) {
          console.warn('Backend service unavailable, suggesting manual input:', backendError);
          toast({
            title: "PDF parsing unavailable",
            description: "Please copy and paste the job description manually below, or ensure the Python backend service is running.",
            variant: "destructive",
          });
          setUploadedFile(null);
          setIsUploading(false);
          return;
        }
      }

      if (extractedText && extractedText.trim()) {
        setJobDescription(extractedText);
        setIsSaved(true);
        localStorage.setItem('mockInterviewJobDescription', extractedText);
        onJobDescriptionSet(extractedText);
        
        toast({
          title: "Job description uploaded!",
          description: "You can now start your mock interview.",
        });
      } else {
        throw new Error('No text extracted from file');
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      toast({
        title: "Upload failed",
        description: error.message || "Could not extract text from the file. Please try again or enter manually.",
        variant: "destructive",
      });
      setUploadedFile(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleManualInput = () => {
    if (jobDescription.trim()) {
      localStorage.setItem('mockInterviewJobDescription', jobDescription);
      onJobDescriptionSet(jobDescription);
      setIsSaved(true);
      
      toast({
        title: "Job description saved!",
        description: "You can now start your mock interview.",
      });
    }
  };

  const clearJobDescription = () => {
    setJobDescription('');
    setUploadedFile(null);
    setIsSaved(false);
    localStorage.removeItem('mockInterviewJobDescription');
    onJobDescriptionSet('');
    
    toast({
      title: "Job description cleared",
      description: "Please upload or enter a new job description.",
    });
  };

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Job Description
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isSaved ? (
          <>
            {/* File Upload */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Upload Job Description (PDF/TXT)</label>
              <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept=".pdf,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="job-description-upload"
                  disabled={isUploading}
                />
                <label
                  htmlFor="job-description-upload"
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  {isUploading ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                      <ShiningText text="Processing..." />
                    </div>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Click to upload</p>
                        <p className="text-xs text-muted-foreground">PDF or TXT files only</p>
                      </div>
                    </>
                  )}
                </label>
              </div>
            </div>

            {/* Manual Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Or enter manually</label>
              <div className="text-xs text-muted-foreground mb-2">
                💡 Tip: For PDF files, copy and paste the job description text here if upload fails
              </div>
              <textarea
                value={jobDescription}
                onChange={(e) => {
                  const v = e.target.value;
                  setJobDescription(v);
                  // keep parent in sync so Start Interview works without a separate Save click
                  onJobDescriptionSet(v);
                }}
                placeholder="Paste or type the job description here...

Example:
Job Title: Software Developer
Company: Tech Corp
Requirements:
- 3+ years experience
- React/JavaScript knowledge
- etc..."
                className="w-full min-h-[120px] p-3 border rounded-md bg-background resize-none"
              />
              <Button
                onClick={handleManualInput}
                disabled={!jobDescription.trim()}
                className="w-full"
              >
                Save Job Description
              </Button>
            </div>
          </>
        ) : (
          /* Display uploaded job description */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="text-sm font-medium">Job Description Loaded</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={clearJobDescription}
                className="flex items-center gap-1"
              >
                <X className="h-4 w-4" />
                Clear
              </Button>
            </div>
            
            <div className="max-h-[200px] overflow-y-auto p-3 bg-muted rounded-md">
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {jobDescription.length > 500 
                  ? `${jobDescription.substring(0, 500)}...` 
                  : jobDescription
                }
              </p>
              {jobDescription.length > 500 && (
                <p className="text-xs text-muted-foreground mt-2">
                  (Showing first 500 characters)
                </p>
              )}
            </div>
            
            <div className="text-xs text-muted-foreground">
              {uploadedFile && (
                <p>Uploaded: {uploadedFile.name}</p>
              )}
              <p>Characters: {jobDescription.length}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
} 