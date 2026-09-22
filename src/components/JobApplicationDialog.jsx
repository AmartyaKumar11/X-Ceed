'use client';

import { useState } from 'react';
import { X, Upload, FileText, Send, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import PostApplicationRecommendationDialog from './PostApplicationRecommendationDialog';

export default function JobApplicationDialog({ isOpen, onClose, job, onApplicationSubmitted }) {
  const [isSubmitting, setIsSubmitting] = useState(false);  const [formData, setFormData] = useState({
    coverLetter: '',
    additionalMessage: '',
    contactEmail: ''
  });
  const [resumeFile, setResumeFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [showRecommendationDialog, setShowRecommendationDialog] = useState(false);
  const [submittedJobData, setSubmittedJobData] = useState(null);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleFileSelect = (file) => {
    if (file && file.type === 'application/pdf') {
      setResumeFile(file);
    } else {
      alert('Please select a PDF file');
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!resumeFile) {
      alert('Please upload your resume (PDF format)');
      return;
    }

    if (!formData.coverLetter.trim()) {
      alert('Please provide a cover letter');
      return;
    }    setIsSubmitting(true);
    
    try {
      // Create FormData for file upload
      const applicationFormData = new FormData();      applicationFormData.append('jobId', job._id);
      applicationFormData.append('coverLetter', formData.coverLetter);
      applicationFormData.append('additionalMessage', formData.additionalMessage);
      applicationFormData.append('contactEmail', formData.contactEmail);
      applicationFormData.append('resume', resumeFile);

      // Submit application
      const response = await fetch('/api/applications/submit', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: applicationFormData
      });

      const result = await response.json();      if (!response.ok) {
        throw new Error(result.message || 'Failed to submit application');
      }

      // Success - store job data for recommendation dialog
      setSubmittedJobData({
        jobId: job._id,
        jobTitle: result.data?.jobTitle || job.title
      });
        // Reset form
      setFormData({
        coverLetter: '',
        additionalMessage: '',
        contactEmail: ''
      });
      setResumeFile(null);
      
      // Call callback if provided
      if (onApplicationSubmitted) {
        onApplicationSubmitted(result.data);
      }
      
      // Close application dialog and show recommendation dialog
      onClose();
      setShowRecommendationDialog(true);} catch (error) {
      alert(`Error submitting application: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecommendedJobClick = (recommendedJob) => {
    // Pass the recommended job back to the parent for opening in a new dialog
    if (onApplicationSubmitted) {
      onApplicationSubmitted(null, recommendedJob);
    }
  };

  if (!isOpen || !job) return (
    <>
      {/* Post-Application Recommendation Dialog */}
      <PostApplicationRecommendationDialog
        isOpen={showRecommendationDialog}
        onClose={() => {
          setShowRecommendationDialog(false);
          setSubmittedJobData(null);
        }}
        appliedJobId={submittedJobData?.jobId}
        appliedJobTitle={submittedJobData?.jobTitle}
        onRecommendedJobClick={handleRecommendedJobClick}
      />
    </>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            Apply for {job.title}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Job Details Summary */}
          <div className="bg-muted p-4 rounded-lg">
            <h3 className="font-semibold text-foreground">{job.title}</h3>
            <p className="text-sm text-muted-foreground">{job.companyName || 'Company'}</p>
            <p className="text-sm text-muted-foreground">{job.location}</p>
          </div>

          {/* Cover Letter */}
          <div className="space-y-2">
            <Label htmlFor="coverLetter" className="text-sm font-medium">
              Cover Letter *
            </Label>
            <Textarea
              id="coverLetter"
              value={formData.coverLetter}
              onChange={(e) => handleInputChange('coverLetter', e.target.value)}
              placeholder="Write a compelling cover letter explaining why you're the perfect fit for this position..."
              className="min-h-[120px] resize-none"
              required
            />
          </div>

          {/* Additional Message */}
          <div className="space-y-2">
            <Label htmlFor="additionalMessage" className="text-sm font-medium">
              Additional Message (Optional)
            </Label>
            <Textarea
              id="additionalMessage"
              value={formData.additionalMessage}
              onChange={(e) => handleInputChange('additionalMessage', e.target.value)}
              placeholder="Any additional information you'd like to share..."
              className="min-h-[80px] resize-none"
            />
          </div>

          {/* Resume Upload */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Resume Upload *</Label>
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                dragActive 
                  ? 'border-primary bg-primary/5' 
                  : 'border-border hover:border-primary/50'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              {resumeFile ? (
                <div className="flex items-center justify-center space-x-2">
                  <FileText className="h-8 w-8 text-primary" />
                  <div>
                    <p className="font-medium text-foreground">{resumeFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(resumeFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setResumeFile(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div>
                  <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-foreground font-medium mb-2">
                    Drop your resume here or click to upload
                  </p>
                  <p className="text-sm text-muted-foreground mb-4">
                    PDF format only, max 10MB
                  </p>
                  <Input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => handleFileSelect(e.target.files[0])}
                    className="hidden"
                    id="resume-upload"
                  />
                  <Label
                    htmlFor="resume-upload"
                    className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-md cursor-pointer hover:bg-primary/90 transition-colors"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Choose File
                  </Label>
                </div>
              )}
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !resumeFile || !formData.coverLetter.trim()}
              className="min-w-[120px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Submit Application
                </>
              )}
            </Button>          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
