import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ExternalLink, FileText, Search } from 'lucide-react';
import ResumeUploadDialog from './ResumeUploadDialog';
import { stashResumeMatchJob } from '@/lib/resumeMatchHandoff';

const JOB_TYPE_LABELS = {
  full_time: 'Full Time',
  part_time: 'Part Time',
  contract: 'Contract',
  internship: 'Internship',
  freelance: 'Freelance',
  temporary: 'Temporary',
  other: 'Other',
};

export default function WebJobsComponent() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [resumeUploadDialog, setResumeUploadDialog] = useState({ isOpen: false, job: null });
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [fetchingCategories, setFetchingCategories] = useState(true);

  useEffect(() => {
    fetchCategories();
    fetchJobs();
  }, []);

  const fetchCategories = async () => {
    setFetchingCategories(true);
    try {
      const response = await fetch('https://remotive.com/api/remote-jobs/categories');
      const data = await response.json();
      setCategories(data.jobs || []);
    } catch (err) {
      setCategories([]);
    } finally {
      setFetchingCategories(false);
    }
  };

  const fetchJobs = async (opts = {}) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (opts.search !== undefined ? opts.search : search) params.append('search', opts.search !== undefined ? opts.search : search);
    if (opts.category !== undefined ? opts.category : category) params.append('category', opts.category !== undefined ? opts.category : category);
    params.append('results_per_page', 8);
    try {
      const response = await fetch(`/api/web-jobs?${params.toString()}`);
      const data = await response.json();
      if (data.success) {
        setJobs(data.data || []);
      } else {
        setError(data.error || 'Failed to load web jobs.');
      }
    } catch (err) {
      setError('An error occurred while loading web jobs.');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = (job) => {
    window.open(job.redirectUrl, '_blank');
  };

  const handleResumeMatch = (job) => {
    setResumeUploadDialog({ isOpen: true, job });
  };

  const handleCloseResumeUploadDialog = () => {
    setResumeUploadDialog({ isOpen: false, job: null });
  };

  const handleResumeUploadSuccess = (resumeData) => {
    const job = resumeUploadDialog.job;
    const jobId = String(job.id);
    stashResumeMatchJob({
      jobId,
      title: job.title || 'External Job',
      companyName: job.companyName || '',
      description: job.description || '',
      requirements: [],
      jobType: job.jobType || '',
      source: 'web',
    });
    const params = new URLSearchParams({
      jobId,
      resumeId: resumeData.id,
      resumeFilename: resumeData.filename,
      resumeName: resumeData.originalName,
      external: 'true',
    });
    window.location.href = `/dashboard/applicant/resume-match?${params.toString()}`;
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchJobs({ search, category });
  };

  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold mb-4 flex items-center text-foreground">
        <ExternalLink className="h-5 w-5 mr-2 text-muted-foreground" />
        Jobs from the Web
      </h3>
      <form className="flex flex-wrap gap-3 mb-6 items-center" onSubmit={handleSearchSubmit}>
        <div className="flex items-center border rounded-md px-2 bg-background">
          <Search className="h-4 w-4 text-muted-foreground mr-1" />
          <input
            type="text"
            placeholder="Search jobs (e.g. python, designer)"
            className="bg-transparent outline-none py-2 px-1 text-sm min-w-[180px]"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="border rounded-md py-2 px-2 text-sm bg-background"
          value={category}
          onChange={e => { setCategory(e.target.value); fetchJobs({ search, category: e.target.value }); }}
          disabled={fetchingCategories}
        >
          <option value="">All Categories</option>
          {categories.map(cat => (
            <option key={cat.slug} value={cat.slug}>{cat.name}</option>
          ))}
        </select>
        <Button type="submit" size="sm" className="h-9">Search</Button>
      </form>
      {loading ? (
        <div className="flex flex-col items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-2" />
          <p className="text-muted-foreground">Loading jobs from the web...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <FileText className="h-8 w-8 text-amber-500 mb-2" />
          <h3 className="text-base font-medium">Failed to load web jobs</h3>
          <p className="text-muted-foreground mt-1">{error}</p>
          <Button variant="outline" className="mt-3" onClick={() => fetchJobs()}>Try Again</Button>
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <FileText className="h-8 w-8 text-muted-foreground mb-2" />
          <h3 className="text-base font-medium text-foreground">No web jobs found</h3>
          <p className="text-sm text-muted-foreground mt-1">Try again later or adjust your search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {jobs.map((job) => (
            <Card key={job.id} className="flex flex-col h-full p-4 border border-white/10 rounded-lg shadow-md hover:shadow-lg transition-all">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">{job.title}</CardTitle>
                <div className="text-xs text-muted-foreground mt-1">{job.companyName} • {job.location}</div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <div
                  className="line-clamp-3 text-sm text-muted-foreground mb-2 min-h-[60px]"
                  dangerouslySetInnerHTML={{ __html: job.description?.replace(/<[^>]+>/g, '').slice(0, 180) + '...' }}
                />
                <div className="flex flex-wrap gap-2 mt-auto mb-2">
                  <Badge variant="secondary" className="font-normal">
                    {JOB_TYPE_LABELS[job.jobType] || (job.jobType ? job.jobType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'N/A')}
                  </Badge>
                  <Badge variant="secondary" className="font-normal">{job.category || 'General'}</Badge>
                </div>
              </CardContent>
              <CardFooter className="flex gap-2 justify-end mt-auto">
                <Button size="sm" onClick={() => handleApply(job)} className="bg-primary text-primary-foreground border border-primary rounded-lg flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" />
                  Apply
                </Button>
                <Button size="sm" onClick={() => handleResumeMatch(job)} className="bg-primary text-primary-foreground border border-primary rounded-lg flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  Match Resume
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
      <ResumeUploadDialog
        isOpen={resumeUploadDialog.isOpen}
        onClose={handleCloseResumeUploadDialog}
        onUploadSuccess={handleResumeUploadSuccess}
        jobId={resumeUploadDialog.job?.id}
        jobDescription={resumeUploadDialog.job?.description}
      />
    </div>
  );
} 