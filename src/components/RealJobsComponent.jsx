'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { 
  MapPin, 
  Building, 
  Calendar, 
  DollarSign, 
  Bookmark,
  FileText,
  AlertCircle,
  Loader2,
  Download
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import ResumeUploadDialog from './ResumeUploadDialog';

export default function RealJobsComponent({ onJobClick, searchQuery = '', filters = {}, showSavedOnly = false, sourceFilter = 'all' }) {
  const { resolvedTheme } = useTheme();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savedJobs, setSavedJobs] = useState(new Set());
  const [savingJobId, setSavingJobId] = useState(null);  const [applicationDialog, setApplicationDialog] = useState({
    isOpen: false,
    selectedJob: null
  });
  const [resumeUploadDialog, setResumeUploadDialog] = useState({
    isOpen: false,
    jobId: null
  });
  useEffect(() => {
    fetchJobs();
    fetchSavedJobs();
  }, [sourceFilter]);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      console.log('🔍 RealJobsComponent: Starting fetchJobs...');
      const params = new URLSearchParams({ public: 'true' });
      if (sourceFilter && sourceFilter !== 'all') {
        params.set('source', sourceFilter);
      }
      const response = await fetch(`/api/jobs?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('📡 RealJobsComponent: Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ RealJobsComponent: Received data:', data);
        if (data && data.success) {
          console.log('📊 RealJobsComponent: Setting jobs:', data.data?.length, 'jobs');
          setJobs(data.data || []);
        } else {
          console.error('❌ RealJobsComponent: API returned unsuccessful response:', data);
          setError('Failed to load jobs. Please try again later.');
        }
      } else {
        const errorText = await response.text();
        console.error('❌ RealJobsComponent: API request failed:', response.status, errorText);
        setError('Failed to load jobs. Please try again later.');
      }    } catch (error) {
      console.error('❌ RealJobsComponent: Error fetching jobs:', error);
      setError('An error occurred while loading jobs.');
    } finally {
      console.log('🏁 RealJobsComponent: Finished fetchJobs, setting loading to false');
      setLoading(false);
    }
  };

  const fetchSavedJobs = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return; // User not logged in

      const response = await fetch('/api/saved-jobs', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const savedJobIds = new Set(data.data.map(saved => saved.jobId));
          setSavedJobs(savedJobIds);
        }
      }
    } catch (error) {
      console.error('Error fetching saved jobs:', error);
    }
  };

  const handleSaveJob = async (jobId, e) => {
    e.stopPropagation();
    
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Please log in to save jobs');
      return;
    }

    setSavingJobId(jobId);
    const isSaved = savedJobs.has(jobId);

    try {
      if (isSaved) {
        // Remove from saved jobs
        const response = await fetch(`/api/saved-jobs?jobId=${jobId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          setSavedJobs(prev => {
            const newSaved = new Set(prev);
            newSaved.delete(jobId);
            return newSaved;
          });
        } else {
          alert('Failed to remove job from saved jobs');
        }
      } else {
        // Add to saved jobs
        const response = await fetch('/api/saved-jobs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ jobId })
        });

        if (response.ok) {
          setSavedJobs(prev => new Set(prev).add(jobId));
        } else if (response.status === 409) {
          // Job already saved
          setSavedJobs(prev => new Set(prev).add(jobId));
        } else {
          alert('Failed to save job');
        }
      }
    } catch (error) {
      console.error('Error saving/unsaving job:', error);
      alert('An error occurred. Please try again.');
    } finally {
      setSavingJobId(null);
    }
  };
  // Format the posted date as a relative time (e.g., "2 days ago")
  const formatPostedDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return formatDistanceToNow(date, { addSuffix: true });
    } catch (error) {
      return 'Recently';
    }
  };

  // Format salary range
  const formatSalary = (min, max, currency = 'USD') => {
    if (!min && !max) return 'Salary not specified';
    
    const formatNumber = (num) => {
      if (num >= 1000000) {
        return `${(num / 1000000).toFixed(0)}M`;
      }
      return `${(num / 1000).toFixed(0)}K`;
    };
    
    const currencySymbol = currency === 'USD' ? '$' : currency;
    
    if (min && max) {
      return `${currencySymbol}${formatNumber(min)} - ${currencySymbol}${formatNumber(max)}`;
    } else if (min) {
      return `From ${currencySymbol}${formatNumber(min)}`;
    } else if (max) {
      return `Up to ${currencySymbol}${formatNumber(max)}`;
    }  };

  const handleApplyJob = (job) => {
    setApplicationDialog({
      isOpen: true,
      selectedJob: job
    });  };
  const handleCloseApplicationDialog = () => {
    setApplicationDialog({
      isOpen: false,
      selectedJob: null
    });
  };

  const handleResumeMatch = (jobId) => {
    setResumeUploadDialog({
      isOpen: true,
      jobId: jobId
    });
  };

  const handleCloseResumeUploadDialog = () => {
    setResumeUploadDialog({
      isOpen: false,
      jobId: null
    });
  };
  const handleResumeUploadSuccess = (resumeData, jobId) => {
    // Navigate to resume match page with uploaded resume data
    const params = new URLSearchParams({
      jobId: jobId,
      resumeId: resumeData.id,
      resumeFilename: resumeData.filename,
      resumeName: resumeData.originalName
    });
    window.location.href = `/dashboard/applicant/resume-match?${params.toString()}`;
  };
  if (loading) {
    console.log('🔄 RealJobsComponent: Currently loading...');
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-12 w-12 animate-spin text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Loading job listings...</p>
      </div>
    );
  }

  if (error) {
    console.log('❌ RealJobsComponent: Error state:', error);
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-12 w-12 text-amber-500 mb-4" />
        <h3 className="text-lg font-medium">Failed to load jobs</h3>
        <p className="text-muted-foreground mt-2">{error}</p>
        <Button variant="outline" className="mt-4" onClick={fetchJobs}>
          Try Again
        </Button>
      </div>
    );
  }
  // Filter and search jobs based on provided criteria
  const getFilteredJobs = () => {
    let filteredJobs = [...jobs];

    // Apply search query
    if (searchQuery && searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filteredJobs = filteredJobs.filter(job => 
        job.title.toLowerCase().includes(query) ||
        (job.companyName && job.companyName.toLowerCase().includes(query)) ||
        (job.description && job.description.toLowerCase().includes(query)) ||
        (job.location && job.location.toLowerCase().includes(query)) ||
        (job.department && job.department.toLowerCase().includes(query))
      );
    }    // Apply filters with case-insensitive matching
    if (filters.jobType && filters.jobType.length > 0) {
      filteredJobs = filteredJobs.filter(job => {
        const jobType = (job.jobType || '').toLowerCase().replace(/[-\s]/g, ''); // normalize: remove spaces/hyphens and lowercase
        return filters.jobType.some(filterType => {
          const normalizedFilterType = filterType.toLowerCase().replace(/[-\s]/g, '');
          return jobType === normalizedFilterType;
        });
      });
    }

    if (filters.workMode && filters.workMode.length > 0) {
      filteredJobs = filteredJobs.filter(job => {
        const workMode = (job.workMode || '').toLowerCase().replace(/[-\s]/g, '');
        return filters.workMode.some(filterMode => {
          const normalizedFilterMode = filterMode.toLowerCase().replace(/[-\s]/g, '');
          return workMode === normalizedFilterMode;
        });
      });
    }

    if (filters.department && filters.department.length > 0) {
      filteredJobs = filteredJobs.filter(job => {
        const department = (job.department || '').toLowerCase();
        return filters.department.some(filterDept => {
          return department === filterDept.toLowerCase();
        });
      });
    }

    if (filters.level && filters.level.length > 0) {
      filteredJobs = filteredJobs.filter(job => {
        const level = (job.level || '').toLowerCase().replace(/[-\s]/g, '');
        return filters.level.some(filterLevel => {
          const normalizedFilterLevel = filterLevel.toLowerCase().replace(/[-\s]/g, '');
          return level === normalizedFilterLevel;
        });
      });
    }

    if (filters.location && filters.location.trim()) {
      const locationQuery = filters.location.toLowerCase().trim();
      filteredJobs = filteredJobs.filter(job => 
        (job.location && job.location.toLowerCase().includes(locationQuery))
      );
    }

    // Apply salary range filter
    if (filters.salaryRange && (filters.salaryRange[0] > 0 || filters.salaryRange[1] < 200000)) {
      filteredJobs = filteredJobs.filter(job => {
        const jobMinSalary = job.salaryMin || 0;
        const jobMaxSalary = job.salaryMax || 200000;
        
        // Check if job salary range overlaps with filter range
        return (jobMinSalary <= filters.salaryRange[1] && jobMaxSalary >= filters.salaryRange[0]);
      });
    }

    // Apply posted within filter
    if (filters.postedWithin) {
      const now = new Date();
      let cutoffDate;
      
      switch (filters.postedWithin) {
        case '1d':
          cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '3d':
          cutoffDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
          break;
        case '7d':
          cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '14d':
          cutoffDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          cutoffDate = null;
      }
      
      if (cutoffDate) {
        filteredJobs = filteredJobs.filter(job => {
          const jobDate = new Date(job.createdAt || job.postedAt);
          return jobDate >= cutoffDate;
        });
      }
    }

    // Apply saved jobs filter if showSavedOnly is true
    if (showSavedOnly) {
      filteredJobs = filteredJobs.filter(job => savedJobs.has(job._id));
    }

    if (sourceFilter && sourceFilter !== 'all') {
      filteredJobs = filteredJobs.filter((job) => {
        const src = job.source || 'recruiter';
        if (sourceFilter === 'recruiter' || sourceFilter === 'direct') {
          return src === 'recruiter';
        }
        return src === sourceFilter;
      });
    }

    return filteredJobs;
  };
  const filteredJobs = getFilteredJobs();

  // Debug: Log job types for debugging data inconsistencies
  if (jobs.length > 0) {
    const uniqueJobTypes = [...new Set(jobs.map(job => job.jobType).filter(Boolean))];
    const uniqueWorkModes = [...new Set(jobs.map(job => job.workMode).filter(Boolean))];
    const uniqueDepartments = [...new Set(jobs.map(job => job.department).filter(Boolean))];
    const uniqueLevels = [...new Set(jobs.map(job => job.level).filter(Boolean))];
    
    console.log('🔍 Debug - Unique values in database:');
    console.log('📄 Job Types:', uniqueJobTypes);
    console.log('🏢 Work Modes:', uniqueWorkModes);
    console.log('🏛️ Departments:', uniqueDepartments);
    console.log('📊 Levels:', uniqueLevels);
  }

  if (filteredJobs.length === 0 && jobs.length > 0) {
    // Show "no matches" message when filters are applied but no jobs match
    console.log('🔍 RealJobsComponent: No jobs match current filters');
    return (      
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileText className="h-16 w-16 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium text-foreground">No jobs match your filters</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Try adjusting your search criteria or removing some filters.
        </p>
      </div>
    );
  }

  if (jobs.length === 0) {
    console.log('📭 RealJobsComponent: No jobs to display');
    return (      
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileText className="h-16 w-16 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium text-foreground">No jobs available</h3>
        <p className="text-sm text-muted-foreground mt-1">
          There are currently no job postings available. Please check back later.
        </p>
      </div>
    );
  }

  console.log('🎯 RealJobsComponent: About to render', filteredJobs.length, 'filtered jobs out of', jobs.length, 'total jobs');
  console.log('📋 RealJobsComponent: Filtered jobs array:', filteredJobs.map(job => ({ id: job._id, title: job.title })));

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredJobs.map((job) => (
        <div 
          key={job._id} 
          className="card p-6 hover:shadow-lg transition-all duration-200 cursor-pointer group"
          onClick={() => onJobClick(job)}
        >
          {/* Job Header */}
          <div className="flex justify-between items-start mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="font-semibold text-lg text-foreground group-hover:text-primary transition-colors line-clamp-2">
                  {job.title}
                </h3>
                {job.source === 'remotive' && (
                  <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-600 dark:text-emerald-400 shrink-0">
                    via Remotive
                  </Badge>
                )}
                {job.source === 'jobicy' && (
                  <Badge variant="outline" className="text-[10px] border-sky-500/50 text-sky-600 dark:text-sky-400 shrink-0">
                    via Jobicy
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Building className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">{job.companyName || job.company || 'Company Name'}</span>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              disabled={savingJobId === job._id}
              onClick={(e) => handleSaveJob(job._id, e)}
            >
              {savingJobId === job._id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Bookmark 
                  className={`h-4 w-4 transition-colors ${
                    savedJobs.has(job._id) 
                      ? resolvedTheme === 'dark' 
                        ? 'fill-white text-white' 
                        : 'fill-black text-black'
                      : 'text-muted-foreground hover:text-foreground'
                  }`} 
                />
              )}
            </Button>
          </div>

          {/* Job Details */}
          <div className="space-y-2 mb-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>{job.workMode} {job.location ? `(${job.location})` : ''}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <DollarSign className="h-4 w-4" />
              <span>{formatSalary(job.salaryMin, job.salaryMax, job.currency)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Posted {formatPostedDate(job.createdAt || new Date())}</span>
            </div>
          </div>

          {/* Job Description - if available */}
          {job.description && (
            <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
              {job.description}
            </p>
          )}

          {/* Job Tags */}
          <div className="flex flex-wrap gap-1 mb-4">
            <Badge variant="outline" className="text-xs">
              {job.jobType || 'Full-time'}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {job.department || 'General'}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {job.level || 'Entry Level'}
            </Badge>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 justify-end">
            <Button 
              size="sm"
              variant="outline"
              onClick={async (e) => {
                e.stopPropagation();
                if (job.jobDescriptionFile) {
                  try {
                    const filename = job.jobDescriptionFile.split('/').pop();
                    const token = localStorage.getItem('token');
                    const response = await fetch(`/api/download/job-description/${filename}`, {
                      method: 'GET',
                      headers: {
                        'Authorization': `Bearer ${token}`,
                      },
                    });

                    if (response.ok) {
                      const blob = await response.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${job.title.replace(/\s+/g, '-')}-job-description.pdf`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    } else {
                      console.error('Failed to download job description');
                      window.open(job.jobDescriptionFile, '_blank');
                    }
                  } catch (error) {
                    console.error('Error downloading job description:', error);
                    window.open(job.jobDescriptionFile, '_blank');
                  }
                } else {
                  const jobDetails = `
Job Title: ${job.title}
Company: ${job.companyName || 'Not specified'}
Department: ${job.department || 'Not specified'}
Level: ${job.level || 'Not specified'}
Work Mode: ${job.workMode || 'Not specified'}
Location: ${job.location || 'Not specified'}
Salary: ${formatSalary(job.salaryMin, job.salaryMax, job.currency)}
Job Type: ${job.jobType || 'Not specified'}
Description: ${job.description || 'No description provided.'}
                  `;
                  
                  const blob = new Blob([jobDetails], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${job.title.replace(/\s+/g, '-')}-job-description.txt`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }
              }}
              className="flex items-center gap-1"
            >
              <Download className="h-3 w-3" />
              Download JD
            </Button>
            <Button 
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                handleResumeMatch(job._id);
              }}
              className="flex items-center gap-1"
            >
              <FileText className="h-3 w-3" />
              Match Resume
            </Button>
            <Button 
              size="sm"
              className="flex items-center gap-1"
            >
              View Details
            </Button>
          </div>
        </div>
      ))}
    </div>
      
    {/* Resume Upload Dialog */}
    <ResumeUploadDialog
      isOpen={resumeUploadDialog.isOpen}
      onClose={handleCloseResumeUploadDialog}
      onUploadSuccess={handleResumeUploadSuccess}
      jobId={resumeUploadDialog.jobId}
    />
  </div>
  );
}
