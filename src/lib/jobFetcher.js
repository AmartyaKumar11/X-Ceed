const REMOTIVE_URL =
  'https://remotive.com/api/remote-jobs?category=software-dev&limit=50';
// ponytail: Jobicy rejects industry=tech (400); tag=tech returns tech listings
const JOBICY_URL =
  'https://jobicy.com/api/v2/remote-jobs?count=50&tag=tech';

export function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeJobType(type) {
  if (!type) return 'full_time';
  const key = String(type).toLowerCase().replace(/[\s-]+/g, '_');
  const map = {
    full_time: 'full_time',
    fulltime: 'full_time',
    contract: 'contract',
    contractor: 'contract',
    freelance: 'contract',
    part_time: 'part_time',
    parttime: 'part_time',
    internship: 'part_time',
  };
  return map[key] || 'full_time';
}

export function parseSalary(salary) {
  if (salary == null) return null;
  if (typeof salary === 'object' && (salary.min || salary.max)) {
    return {
      min: Number(salary.min) || null,
      max: Number(salary.max) || null,
      currency: salary.currency || 'USD',
    };
  }
  if (typeof salary !== 'string' || !salary.trim()) return null;
  const nums = salary.replace(/,/g, '').match(/\d+/g);
  if (!nums || nums.length === 0) return null;
  const min = parseInt(nums[0], 10);
  const max = nums.length > 1 ? parseInt(nums[1], 10) : min;
  return { min, max, currency: 'USD' };
}

export function normalizeRemotive(job) {
  const now = new Date();
  return {
    source: 'remotive',
    source_id: `remotive_${job.id}`,
    source_url: job.url,
    title: job.title,
    company: job.company_name,
    company_logo: job.company_logo || null,
    description: stripHtml(job.description),
    description_raw: job.description,
    location: 'Remote',
    job_type: normalizeJobType(job.job_type),
    salary_range: parseSalary(job.salary),
    tags: job.tags || [],
    published_at: new Date(job.publication_date),
    fetched_at: now,
    expires_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    active: true,
    requirements: null,
    evaluationWeights: null,
  };
}

export function normalizeJobicy(job) {
  const now = new Date();
  return {
    source: 'jobicy',
    source_id: `jobicy_${job.id}`,
    source_url: job.url,
    title: job.title || job.jobTitle,
    company: job.companyName,
    company_logo: job.companyLogo || null,
    description: stripHtml(job.jobDescription),
    description_raw: job.jobDescription,
    location: job.jobGeo || 'Remote',
    job_type: normalizeJobType(job.jobType),
    salary_range: job.annualSalaryMin
      ? {
          min: job.annualSalaryMin,
          max: job.annualSalaryMax || job.annualSalaryMin,
          currency: 'USD',
        }
      : null,
    tags: [],
    published_at: new Date(job.pubDate),
    fetched_at: now,
    expires_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    active: true,
    requirements: null,
    evaluationWeights: null,
  };
}

export async function fetchRemotiveJobs() {
  const res = await fetch(REMOTIVE_URL, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Remotive ${res.status}`);
  const data = await res.json();
  return (data.jobs || []).map(normalizeRemotive);
}

export async function fetchJobicyJobs() {
  const res = await fetch(JOBICY_URL, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Jobicy ${res.status}`);
  const data = await res.json();
  return (data.jobs || []).map(normalizeJobicy);
}
