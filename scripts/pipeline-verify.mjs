import dotenv from 'dotenv';
import { SignJWT } from 'jose';
dotenv.config({ path: '.env.local' });

const NEXT = 'http://127.0.0.1:3002';
const CORE = process.env.NEXT_PUBLIC_AI_CORE_URL || 'http://127.0.0.1:8000';
const SUP = process.env.NEXT_PUBLIC_AI_SUPPORT_URL || 'http://127.0.0.1:8001';
const results = [];

function ok(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail: String(detail).slice(0, 200) });
  console.log((pass ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' — ' + String(detail).slice(0, 140) : ''));
}

async function jfetch(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, json, text };
}

async function tok(payload) {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(secret);
}

const resume = [
  'Jane Doe',
  'Software Engineer',
  'Skills: React, TypeScript, Node.js, MongoDB, GraphQL',
  'Experience: 3 years Frontend at Acme building dashboards',
  'Education: B.S. Computer Science',
  'Projects: Open-source UI kit, RAG chatbot',
].join('\n');

const job = {
  title: 'Senior Frontend Engineer',
  description: 'Build React/TypeScript apps. GraphQL, Node, MongoDB. Strong communication.',
  requirements: ['React', 'TypeScript', 'GraphQL', 'Node.js', 'MongoDB'],
};
const weights = {
  skills: 0.4,
  experience: 0.3,
  education: 0.1,
  projects: 0.15,
  communication: 0.05,
};

async function main() {
  // 1 health
  {
    const a = await jfetch(CORE + '/health');
    ok('AI Core /health', a.status === 200 && a.json.status === 'ok', JSON.stringify(a.json));
    const b = await jfetch(SUP + '/health');
    ok('AI Support /health', b.status === 200 && b.json.status === 'ok', JSON.stringify(b.json));
    const c = await jfetch(NEXT + '/');
    ok('Next.js /', c.status === 200 || c.status === 307 || c.status === 308, 'status=' + c.status);
  }

  // 2 analyze
  let profile = null;
  {
    const r = await jfetch(CORE + '/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume_text: resume }),
    });
    profile = r.json;
    ok(
      'AI Core /analyze',
      r.status === 200 && (profile.skills || profile.errors),
      'skills=' + (profile.skills?.length ?? '?') + ' errs=' + (profile.errors?.length ?? 0)
    );
  }

  // 3 match
  let match = null;
  {
    const r = await jfetch(CORE + '/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_profile: profile, job_requirements: job, weights }),
    });
    match = r.json;
    ok(
      'AI Core /match',
      r.status === 200 && typeof match.overall_score === 'number',
      'score=' + match.overall_score + ' explanation=' + !!match.explanation
    );
  }

  // 4 gap
  let gaps = [];
  {
    const r = await jfetch(CORE + '/gap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ match_result: match }),
    });
    gaps = r.json.gaps || [];
    ok('AI Core /gap', r.status === 200 && Array.isArray(gaps), 'gaps=' + gaps.length);
  }

  // 5 career-plan
  {
    const r = await jfetch(CORE + '/career-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gaps, target_role: job.title }),
    });
    ok(
      'AI Core /career-plan',
      r.status === 200 && (r.json.objectives || r.json.study_plan),
      'obj=' + !!r.json.objectives + ' projects=' + !!r.json.projects + ' resources=' + !!r.json.resources
    );
  }

  // 6 chat
  {
    const r = await jfetch(CORE + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Summarize top 2 skill gaps in one sentence.',
        resume_text: resume,
        job_description: job.description,
        history: [],
      }),
    });
    ok('AI Core /chat', r.status === 200 && !!r.json.reply, (r.json.reply || '').slice(0, 100));
  }

  const recruiter = await tok({
    userId: process.env.PIPELINE_RECRUITER_ID || '686d492eb20d34f4751c3a33',
    userType: 'recruiter',
    email: process.env.PIPELINE_RECRUITER_EMAIL || 'amartya-recruiter@gmail.com',
  });
  const applicant = await tok({
    userId: process.env.PIPELINE_APPLICANT_ID || '686d41c8a7597e3bc30ee649',
    userType: 'applicant',
    email: process.env.PIPELINE_APPLICANT_EMAIL || 'amartya-applicant@gmail.com',
  });
  const realJobId = process.env.PIPELINE_JOB_ID || '686d4a36b20d34f4751c3a34';
  const realApplicantId = process.env.PIPELINE_APPLICANT_ID || '686d41c8a7597e3bc30ee649';

  // 7 Next proxies
  {
    const r = await jfetch(NEXT + '/api/resume-match/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + applicant },
      body: JSON.stringify({
        resumeText: resume,
        jobTitle: job.title,
        jobDescription: job.description,
        jobRequirements: job.requirements,
        weights,
      }),
    });
    ok(
      'Next /api/resume-match/analyze',
      r.status === 200 && r.json.success,
      'score=' + (r.json.data?.overall_score ?? r.json.data?.overallScore) + ' msg=' + (r.json.message || '')
    );
  }

  {
    const r = await jfetch(NEXT + '/api/career-plan/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + applicant },
      body: JSON.stringify({ targetRole: job.title, gaps: gaps.slice(0, 3) }),
    });
    ok(
      'Next /api/career-plan/generate',
      r.status === 200 && r.json.success,
      'obj=' + !!r.json.data?.objectives + ' msg=' + (r.json.message || '')
    );
  }

  {
    const r = await jfetch(NEXT + '/api/ai/generate-outreach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + recruiter },
      body: JSON.stringify({
        jobId: realJobId,
        candidateId: realApplicantId,
      }),
    });
    ok(
      'Next /api/ai/generate-outreach',
      r.status === 200 && !!(r.json.data?.email || r.json.success),
      'status=' + r.status + ' emailLen=' + (r.json.data?.email || '').length + ' msg=' + (r.json.message || '').slice(0, 80)
    );
  }

  // 8 GraphQL
  {
    const q = '{ recruiterDashboard { stats { totalJobs totalApplications activeJobs } jobs { id title } } }';
    const noAuth = await jfetch(NEXT + '/api/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q }),
    });
    ok('GraphQL rejects unauth', !!(noAuth.json.errors?.length), (noAuth.json.errors?.[0]?.message || '').slice(0, 80));

    const auth = await jfetch(NEXT + '/api/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + recruiter },
      body: JSON.stringify({ query: q }),
    });
    ok(
      'GraphQL recruiterDashboard',
      !auth.json.errors && !!auth.json.data?.recruiterDashboard,
      'jobs=' + (auth.json.data?.recruiterDashboard?.jobs?.length ?? '?') + ' err=' + (auth.json.errors?.[0]?.message || '')
    );
  }

  {
    const q = '{ candidateProfile { user { email userType } skills { name } } }';
    const auth = await jfetch(NEXT + '/api/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + applicant },
      body: JSON.stringify({ query: q }),
    });
    ok(
      'GraphQL candidateProfile',
      !auth.json.errors && !!auth.json.data?.candidateProfile,
      'email=' + (auth.json.data?.candidateProfile?.user?.email || '') + ' err=' + (auth.json.errors?.[0]?.message || '')
    );
  }

  // 9 auth gate
  {
    const r = await jfetch(NEXT + '/api/resume-match/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeText: 'x' }),
    });
    ok('resume-match requires auth', r.status === 401 || r.status === 403, 'status=' + r.status);
  }

  // 10 pages
  for (const path of ['/auth', '/dashboard/applicant/career-plan', '/dashboard/recruiter', '/landing']) {
    const r = await jfetch(NEXT + path);
    ok('Page ' + path, r.status === 200 || r.status === 307 || r.status === 308, 'status=' + r.status);
  }

  // 11 real login if demo user exists (best-effort)
  {
    const email = process.env.PIPELINE_TEST_EMAIL;
    const password = process.env.PIPELINE_TEST_PASSWORD;
    if (email && password) {
      const r = await jfetch(NEXT + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      ok('Auth login', r.status === 200 && (r.json.token || r.json.success), 'status=' + r.status);
    } else {
      ok('Auth login (skipped — set PIPELINE_TEST_EMAIL/PASSWORD)', true, 'skipped');
    }
  }

  const failed = results.filter((r) => !r.pass);
  console.log('\n==== SUMMARY ====');
  console.log('passed', results.filter((r) => r.pass).length + '/' + results.length);
  if (failed.length) {
    console.log('FAILED:');
    failed.forEach((f) => console.log(' -', f.name, f.detail));
    process.exitCode = 1;
  } else {
    console.log('ALL GREEN');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
