'use client';

import { useState, useEffect } from 'react';
import { 
  Filter, 
  Search,
  X,
  MapPin,
  DollarSign,
  Building,
  Calendar,
  ChevronDown,
  ExternalLink,
  Briefcase,
  Clock,
  Tag,
  RefreshCw,
  Loader2,
  Brain,
  FileText
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ShiningText } from "@/components/ui/shining-text";
import { useRouter } from 'next/navigation';
import ResumeUploadDialog from './ResumeUploadDialog';
import { stashResumeMatchJob } from '@/lib/resumeMatchHandoff';

export default function JobicyJobsComponent() {
  const router = useRouter();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalJobs, setTotalJobs] = useState(0);
  const [matchingJobs, setMatchingJobs] = useState(new Set());
  
  // Resume upload dialog state
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [selectedJobForMatching, setSelectedJobForMatching] = useState(null);
  const [scrapedJobData, setScrapedJobData] = useState(null);

  // Filter states
  const [filters, setFilters] = useState({
    industry: '',
    geo: '',
    tag: '',
    count: 50
  });

  // Available filter options (you can expand these based on Jobicy API documentation)
  const industries = [
    'Technology', 'Marketing', 'Design', 'Sales', 'Customer Support', 
    'Engineering', 'Product', 'Finance', 'HR', 'Data Science', 'DevOps'
  ];

  const locations = [
    'United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 
    'France', 'Netherlands', 'Spain', 'Italy', 'Remote', 'Worldwide'
  ];

  const tags = [
    'React', 'Node.js', 'Python', 'JavaScript', 'TypeScript', 'AWS', 
    'Machine Learning', 'Full Stack', 'Frontend', 'Backend', 'DevOps', 
    'UI/UX', 'Mobile', 'Data Analytics'
  ];

  // Fetch jobs from Jobicy API
  const fetchJobs = async (resetPage = false) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('q', searchQuery);
      if (filters.industry) params.append('industry', filters.industry);
      if (filters.geo) params.append('geo', filters.geo);
      if (filters.tag) params.append('tag', filters.tag);
      params.append('count', filters.count.toString());
      params.append('page', resetPage ? '1' : currentPage.toString());

      const response = await fetch(`/api/jobs/jobicy?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        setJobs(resetPage ? data.jobs : [...jobs, ...data.jobs]);
        setTotalJobs(data.total);
        if (resetPage) setCurrentPage(1);
      } else {
        setError(data.message || 'Failed to fetch jobs');
      }
    } catch (err) {
      console.error('Error fetching jobs:', err);
      setError('Failed to fetch jobs. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Load jobs on component mount
  useEffect(() => {
    fetchJobs(true);
  }, []);

  // Handle search
  const handleSearch = () => {
    setJobs([]);
    setCurrentPage(1);
    fetchJobs(true);
  };

  // Handle filter change
  const handleFilterChange = (filterKey, value) => {
    setFilters(prev => ({
      ...prev,
      [filterKey]: value
    }));
  };

  // Apply filters
  const applyFilters = () => {
    setJobs([]);
    setCurrentPage(1);
    fetchJobs(true);
    setShowFilters(false);
  };

  // Clear filters
  const clearFilters = () => {
    setFilters({
      industry: '',
      geo: '',
      tag: '',
      count: 50
    });
    setSearchQuery('');
    setJobs([]);
    setCurrentPage(1);
    fetchJobs(true);
  };

  // Load more jobs
  const loadMore = () => {
    setCurrentPage(prev => prev + 1);
    fetchJobs(false);
  };

  // Open job in new tab
  const openJob = (job) => {
    if (job.applicationUrl && job.applicationUrl !== '#') {
      window.open(job.applicationUrl, '_blank');
    }
  };

  // Handle resume matching for remote jobs
  const handleMatchResume = async (job, event) => {
    event.stopPropagation(); // Prevent opening the job URL
    
    // Check if user is logged in
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Please log in to match your resume with jobs');
      return;
    }

    // Add job to matching state
    setMatchingJobs(prev => new Set([...prev, job._id]));

    try {
      console.log('🤖 Starting remote job matching for:', job.title);

      // Step 1: Scrape the job description from the external URL
      console.log('📊 Step 1: Extracting job details from external website...');
      const scrapeResponse = await fetch('/api/scrape-job', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: job.applicationUrl,
          jobTitle: job.title,
          company: job.company,
          jobId: job._id
        })
      });

      if (!scrapeResponse.ok) {
        throw new Error('Failed to scrape job description');
      }

      const scrapedData = await scrapeResponse.json();
      
      if (!scrapedData.success) {
        throw new Error(scrapedData.error || 'Failed to scrape job description');
      }

      console.log('✅ Successfully extracted job details:', {
        title: scrapedData.data.jobTitle,
        descriptionLength: scrapedData.data.description.length,
        requirementsCount: scrapedData.data.requirements.length,
        scrapingStatus: scrapedData.data.metadata?.scrapingStatus || 'success'
      });

      // Step 2: Store job data and show upload dialog
      console.log('📊 Step 2: Showing resume upload dialog...');
      setSelectedJobForMatching(job);
      setScrapedJobData(scrapedData.data);
      setShowUploadDialog(true);

    } catch (error) {
      console.error('❌ Error preparing job matching:', error);
      
      // Provide more specific error messages
      let errorMessage = 'Failed to analyze this job. ';
      
      if (error.message.includes('Failed to scrape')) {
        errorMessage += 'We couldn\'t automatically extract the job description from this website, but you can still proceed with basic matching based on the job title and company.';
      } else if (error.message.includes('log in')) {
        errorMessage = 'Please log in to use the resume matching feature.';
      } else {
        errorMessage += 'This might be due to website restrictions or network issues. Please try again or visit the job posting directly.';
      }
      
      alert(errorMessage);
    } finally {
      // Remove job from matching state
      setMatchingJobs(prev => {
        const newSet = new Set(prev);
        newSet.delete(job._id);
        return newSet;
      });
    }
  };

  // Handle successful resume upload
  const handleUploadSuccess = (resumeData, jobData) => {
    console.log('✅ Resume uploaded successfully:', resumeData);
    console.log('🎯 Job data for matching:', selectedJobForMatching);
    console.log('📄 Scraped job data:', scrapedJobData);

    // Close the upload dialog
    setShowUploadDialog(false);

    // Large JD/requirements go in sessionStorage — URL query blows past HTTP 431 limits
    const remoteJobId = 'remote_' + selectedJobForMatching._id;
    stashResumeMatchJob({
      jobId: remoteJobId,
      title: selectedJobForMatching.title,
      companyName: selectedJobForMatching.company,
      description: scrapedJobData.description,
      requirements: scrapedJobData.requirements || [],
      jobType: 'remote',
      location: selectedJobForMatching.location,
      source: 'jobicy',
      applicationUrl: selectedJobForMatching.applicationUrl,
      remote: true,
    });

    const matchParams = new URLSearchParams({
      jobId: remoteJobId,
      source: 'jobicy',
      remote: 'true',
      resumeFilename: resumeData.filename,
      resumeName: resumeData.originalName || resumeData.filename,
    });

    router.push(`/dashboard/applicant/resume-match?${matchParams.toString()}`);

    // Clear the stored data
    setSelectedJobForMatching(null);
    setScrapedJobData(null);
  };

  // Handle upload dialog close
  const handleUploadDialogClose = () => {
    setShowUploadDialog(false);
    setSelectedJobForMatching(null);
    setScrapedJobData(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Remote Jobs</h2>
          <p className="text-muted-foreground">
            {totalJobs > 0 ? `${totalJobs} remote opportunities available` : 'Discover remote opportunities'}
          </p>
        </div>
        <Button
          onClick={() => fetchJobs(true)}
          variant="outline"
          size="sm"
          disabled={loading}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="card p-4 space-y-4">
        {/* Search Bar */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type="text"
              placeholder="Search jobs by title, company, or keywords..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-10"
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          </div>
          <Button onClick={handleSearch} disabled={loading}>
            Search
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2"
          >
            <Filter className="h-4 w-4" />
            Filters
          </Button>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="border-t pt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Industry Filter */}
              <div>
                <label className="block text-sm font-medium mb-2">Industry</label>
                <select
                  value={filters.industry}
                  onChange={(e) => handleFilterChange('industry', e.target.value)}
                  className="w-full p-2 border border-border rounded-md bg-card text-foreground"
                >
                  <option value="">All Industries</option>
                  {industries.map(industry => (
                    <option key={industry} value={industry}>{industry}</option>
                  ))}
                </select>
              </div>

              {/* Location Filter */}
              <div>
                <label className="block text-sm font-medium mb-2">Location</label>
                <select
                  value={filters.geo}
                  onChange={(e) => handleFilterChange('geo', e.target.value)}
                  className="w-full p-2 border border-border rounded-md bg-card text-foreground"
                >
                  <option value="">All Locations</option>
                  {locations.map(location => (
                    <option key={location} value={location}>{location}</option>
                  ))}
                </select>
              </div>

              {/* Technology/Tag Filter */}
              <div>
                <label className="block text-sm font-medium mb-2">Technology</label>
                <select
                  value={filters.tag}
                  onChange={(e) => handleFilterChange('tag', e.target.value)}
                  className="w-full p-2 border border-border rounded-md bg-card text-foreground"
                >
                  <option value="">All Technologies</option>
                  {tags.map(tag => (
                    <option key={tag} value={tag}>{tag}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Filter Actions */}
            <div className="flex gap-2">
              <Button onClick={applyFilters} size="sm">
                Apply Filters
              </Button>
              <Button onClick={clearFilters} variant="outline" size="sm">
                Clear All
              </Button>
            </div>
          </div>
        )}

        {/* Active Filters Display */}
        {(filters.industry || filters.geo || filters.tag || searchQuery) && (
          <div className="flex flex-wrap gap-2">
            {searchQuery && (
              <Badge variant="secondary" className="flex items-center gap-1">
                Search: {searchQuery}
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => setSearchQuery('')}
                />
              </Badge>
            )}
            {filters.industry && (
              <Badge variant="secondary" className="flex items-center gap-1">
                Industry: {filters.industry}
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => handleFilterChange('industry', '')}
                />
              </Badge>
            )}
            {filters.geo && (
              <Badge variant="secondary" className="flex items-center gap-1">
                Location: {filters.geo}
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => handleFilterChange('geo', '')}
                />
              </Badge>
            )}
            {filters.tag && (
              <Badge variant="secondary" className="flex items-center gap-1">
                Tech: {filters.tag}
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => handleFilterChange('tag', '')}
                />
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="card p-4 border-destructive/50 bg-destructive/10">
          <p className="text-destructive">{error}</p>
        </div>
      )}

      {/* Jobs Grid */}
      {loading && jobs.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading jobs...</span>
        </div>
      ) : jobs.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {jobs.map((job) => (
            <div 
              key={job._id} 
              className="card p-6 hover:shadow-lg transition-all duration-200 cursor-pointer group"
              onClick={() => openJob(job)}
            >
              {/* Job Header */}
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg text-foreground group-hover:text-primary transition-colors line-clamp-2">
                    {job.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{job.company}</span>
                  </div>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>

              {/* Job Details */}
              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span>{job.location}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Briefcase className="h-4 w-4" />
                  <span>{job.type}</span>
                </div>
                {job.salary && job.salary !== 'Not specified' && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <DollarSign className="h-4 w-4" />
                    <span>{job.salary}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>{job.postedDateRelative}</span>
                </div>
              </div>

              {/* Job Description */}
              <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                {job.description}
              </p>

              {/* Job Tags */}
              {job.tags && job.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-4">
                  {job.tags.slice(0, 3).map((tag, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                  {job.tags.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{job.tags.length - 3} more
                    </Badge>
                  )}
                </div>
              )}

              {/* Remote Badge and Actions */}
              <div className="flex justify-between items-center">
                <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                  <Tag className="h-3 w-3 mr-1" />
                  Remote
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {job.industry}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => handleMatchResume(job, e)}
                  disabled={matchingJobs.has(job._id)}
                  className="flex-1 flex items-center gap-2"
                >
                  {matchingJobs.has(job._id) ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Brain className="h-3 w-3" />
                  )}
                  {matchingJobs.has(job._id) ? 'Analyzing...' : 'Match Resume'}
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    openJob(job);
                  }}
                  className="flex items-center gap-2"
                >
                  <ExternalLink className="h-3 w-3" />
                  Apply
                </Button>
              </div>
              {matchingJobs.has(job._id) && (
                <div className="mt-2">
                  <ShiningText text="AI is matching your resume..." className="text-xs" />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No jobs found</h3>
          <p className="text-muted-foreground">
            Try adjusting your search criteria or filters
          </p>
        </div>
      )}

      {/* Load More Button */}
      {jobs.length > 0 && jobs.length < totalJobs && (
        <div className="text-center">
          <Button 
            onClick={loadMore} 
            disabled={loading}
            variant="outline"
            className="flex items-center gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Load More Jobs'
            )}
          </Button>
        </div>
      )}

      {/* Resume Upload Dialog */}
      <ResumeUploadDialog
        isOpen={showUploadDialog}
        onClose={handleUploadDialogClose}
        onUploadSuccess={handleUploadSuccess}
        jobId={selectedJobForMatching?._id}
      />
    </div>
  );
}
