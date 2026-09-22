const KEY = "xceed_resume_match_job";

/** Stash large job payload so resume-match URL stays under header limits (HTTP 431). */
export function stashResumeMatchJob(payload) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(KEY, JSON.stringify(payload));
}

/** Read stashed job for this jobId (or any if jobId omitted). Does not clear. */
export function peekResumeMatchJob(jobId) {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (jobId && data.jobId && data.jobId !== jobId) return null;
    return data;
  } catch {
    return null;
  }
}
