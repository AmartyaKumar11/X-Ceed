'use client';

import { ExternalLink, FileText } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ResumeUploadDialog from './ResumeUploadDialog';
import { stashResumeMatchJob } from '@/lib/resumeMatchHandoff';

function formatSalary(range) {
  if (!range || (range.min == null && range.max == null)) return 'Not specified';
  const cur = range.currency || 'USD';
  if (range.min != null && range.max != null) {
    return `${cur} ${Number(range.min).toLocaleString()} – ${Number(range.max).toLocaleString()}`;
  }
  return `${cur} ${(range.min ?? range.max).toLocaleString()}`;
}

export default function AggregatedJobDetailDialog({ isOpen, onClose, job }) {
  const router = useRouter();
  const [resumeDialog, setResumeDialog] = useState({ isOpen: false, jobId: null });

  if (!job) return null;

  const source = job.source || 'remotive';
  const requirements = Array.isArray(job.requirements) ? job.requirements : [];
  const html = job.description_raw || job.description || '';

  const handleMatch = async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      alert('Please log in to match your resume');
      return;
    }
    try {
      const res = await fetch('/api/resumes', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const resumes = data.data || data.resumes || [];
        if (resumes.length > 0) {
          const r = resumes[0];
          stashResumeMatchJob({
            jobId: String(job._id),
            title: job.title,
            company: job.company || job.companyName,
            requirements: job.requirements || [],
            description: job.description,
            evaluationWeights: job.evaluationWeights,
            source: job.source,
            sourceUrl: job.source_url,
          });
          router.push(
            `/dashboard/applicant/resume-match?jobId=${job._id}&resumeId=${r._id || r.id}`
          );
          return;
        }
      }
    } catch (e) {
      console.error(e);
    }
    setResumeDialog({ isOpen: true, jobId: String(job._id) });
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3 pr-6">
              <div>
                <DialogTitle className="text-xl">{job.title}</DialogTitle>
                <p className="text-muted-foreground mt-1">
                  {job.company || job.companyName}
                  {job.location ? ` · ${job.location}` : ''}
                </p>
              </div>
              <Badge
                variant="outline"
                className={
                  source === 'remotive'
                    ? 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400'
                    : 'border-sky-500/50 text-sky-600 dark:text-sky-400'
                }
              >
                via {source === 'remotive' ? 'Remotive' : 'Jobicy'}
              </Badge>
            </div>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2 text-muted-foreground">
              <span>{job.job_type || job.jobType || 'full_time'}</span>
              <span>·</span>
              <span>{formatSalary(job.salary_range || {
                min: job.salaryMin,
                max: job.salaryMax,
                currency: job.currency,
              })}</span>
            </div>

            {requirements.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Requirements</h4>
                <ul className="space-y-1.5">
                  {requirements.map((req, i) => {
                    const text = typeof req === 'string' ? req : req.description;
                    const pri =
                      typeof req === 'object' ? req.priority : 'must_have';
                    return (
                      <li key={i} className="flex items-start gap-2">
                        <Badge
                          variant={pri === 'must_have' ? 'default' : 'secondary'}
                          className="text-[10px] shrink-0 mt-0.5"
                        >
                          {pri === 'must_have' ? 'must' : 'nice'}
                        </Badge>
                        <span>{text}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div>
              <h4 className="font-medium mb-2">Description</h4>
              <div
                className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground [&_a]:text-primary"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <Button onClick={handleMatch} className="flex items-center gap-1">
                <FileText className="h-4 w-4" />
                Match My Resume
              </Button>
              {job.source_url && (
                <Button variant="outline" asChild>
                  <a
                    href={job.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1"
                  >
                    View Original Posting
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ResumeUploadDialog
        isOpen={resumeDialog.isOpen}
        onClose={() => setResumeDialog({ isOpen: false, jobId: null })}
        onUploadSuccess={() => {
          stashResumeMatchJob({
            jobId: String(job._id),
            title: job.title,
            company: job.company || job.companyName,
            requirements: job.requirements || [],
            description: job.description,
            evaluationWeights: job.evaluationWeights,
            source: job.source,
            sourceUrl: job.source_url,
          });
          setResumeDialog({ isOpen: false, jobId: null });
          router.push(
            `/dashboard/applicant/resume-match?jobId=${job._id}`
          );
        }}
        jobId={resumeDialog.jobId}
      />
    </>
  );
}
