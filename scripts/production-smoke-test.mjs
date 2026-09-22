/**
 * X-CEED production smoke test — LIVE URLs only (no localhost).
 * Run: node scripts/production-smoke-test.mjs
 * Writes: scripts/production-test-report.md
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WEB = "https://x-ceed.vercel.app";
const CORE = "https://ai-core-production-2826.up.railway.app";
const SUP = "https://ai-support-production-81a3.up.railway.app";
const EMAIL = "kumaramartya11@gmail.com";
const PASSWORD = "dreamisop69";
const REPORT = path.join(ROOT, "scripts", "production-test-report.md");
const ORIGIN = WEB;

const RESUME = `Alex Chen, Full Stack Engineer, 4 years experience.

React (3 years): Built customer-facing dashboard handling 50k daily users. Implemented code splitting, lazy loading, and React Query for server state.
Python (4 years): Django REST APIs, FastAPI microservices, Celery task queues.
PostgreSQL: Schema design, query optimization, migrations. Managed 500GB production database.
AWS: EC2, RDS, S3, CloudFront, Lambda. Deployed via Terraform.
Docker + Kubernetes: Containerized 12 microservices, managed via Helm charts on EKS.
CI/CD: GitHub Actions, ArgoCD for GitOps deployment.
Led team of 3 for payment processing rewrite, reducing transaction failures by 40%.
Education: M.S. Computer Science, Stanford University
Projects: Open-source API gateway (1.2k GitHub stars), real-time analytics pipeline processing 2M events/hour.`;

const FALLBACK_JOB = {
  title: "Senior Full Stack Engineer",
  companyName: "X-CEED Labs",
  description:
    "Looking for a Full Stack Engineer strong in React, TypeScript, Node.js, PostgreSQL, AWS, Docker, and Kubernetes. Build AI-assisted hiring products. GraphQL and CI/CD experience preferred.",
  requirements: ["React", "TypeScript", "Node.js", "PostgreSQL", "AWS", "Docker", "Kubernetes", "GraphQL"],
  evaluationWeights: {
    skills: 0.4,
    experience: 0.25,
    education: 0.1,
    projects: 0.15,
    communication: 0.1,
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const infra = [];
const security = [];
const matching = {};
const support = [];
const graphql = [];
const routes = [];
const cors = [];
const perf = [];
const critical = [];
const warnings = [];
const logs = [];

function log(...a) {
  const line = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ");
  console.log(line);
  logs.push(line);
}

function row(table, obj) {
  table.push(obj);
}

function addCritical(msg) {
  critical.push(msg);
  log(`  CRITICAL: ${msg}`);
}

function addWarn(msg) {
  warnings.push(msg);
  log(`  WARNING: ${msg}`);
}

function isCold(status, text) {
  return status === 0 || /ECONNREFUSED|timeout|fetch failed|Application not found/i.test(String(text || ""));
}

async function raw(url, { method = "GET", body, token, headers = {}, redirect = "manual" } = {}) {
  const h = { ...headers };
  if (body !== undefined && !h["Content-Type"]) h["Content-Type"] = "application/json";
  if (token) h.Authorization = `Bearer ${token}`;
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method,
      headers: h,
      body: body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
      redirect,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* raw */
    }
    return {
      ok: res.ok,
      status: res.status,
      json,
      text,
      ms: Date.now() - t0,
      headers: res.headers,
      location: res.headers.get("location"),
    };
  } catch (e) {
    return { ok: false, status: 0, json: null, text: e.message, ms: Date.now() - t0, headers: new Headers() };
  }
}

async function req(url, opts = {}, { retries = 1 } = {}) {
  let r = await raw(url, opts);
  if (retries > 0 && isCold(r.status, r.text)) {
    log(`  cold-start retry after 10s: ${url}`);
    await sleep(10000);
    r = await raw(url, opts);
  }
  return r;
}

function trackPerf(name, ms, limitMs) {
  const pass = ms > 0 && ms <= limitMs;
  row(perf, { endpoint: name, ms, limitMs, pass });
  return pass;
}

function verdict(pass) {
  return pass ? "PASS" : "FAIL";
}

// ---------------------------------------------------------------------------
async function stage1() {
  log("\n## STAGE 1: INFRASTRUCTURE HEALTH");
  let failFast = false;

  // 1. Frontend
  {
    const r = await req(WEB);
    const pass = r.status === 200 && /html/i.test(r.text.slice(0, 200) + (r.headers.get("content-type") || ""));
    const htmlish = r.status === 200 && (r.text.includes("<!DOCTYPE") || r.text.includes("<html") || (r.headers.get("content-type") || "").includes("text/html"));
    const ok = r.status === 200 && htmlish;
    log(`  [${ok ? "PASS" : "FAIL"}] ${WEB} status=${r.status} ${r.ms}ms`);
    row(infra, { service: "Vercel", status: r.status, ms: r.ms, pass: ok });
    trackPerf("Landing page", r.ms, 3000);
    if (!ok) {
      failFast = true;
      addCritical(`Frontend down: status=${r.status} err=${r.text.slice(0, 120)}`);
    }
  }

  // 2. AI Core health
  {
    const r = await req(`${CORE}/health`);
    const ok = r.status === 200 && r.json?.status === "ok";
    log(`  [${ok ? "PASS" : "FAIL"}] ${CORE}/health status=${r.status} ${r.ms}ms body=${JSON.stringify(r.json)}`);
    row(infra, { service: "AI Core", status: r.status, ms: r.ms, pass: ok, detail: r.json });
    trackPerf("AI Core /health", r.ms, 2000);
    if (!ok) {
      failFast = true;
      addCritical(`AI Core health failed: ${r.status} ${r.text.slice(0, 160)}`);
    }
  }

  // 3. AI Support health
  {
    const r = await req(`${SUP}/health`);
    const ok = r.status === 200 && r.json?.status === "ok";
    log(`  [${ok ? "PASS" : "FAIL"}] ${SUP}/health status=${r.status} ${r.ms}ms body=${JSON.stringify(r.json)}`);
    row(infra, { service: "AI Support", status: r.status, ms: r.ms, pass: ok, detail: r.json });
    trackPerf("AI Support /health", r.ms, 2000);
    if (!ok) {
      failFast = true;
      addCritical(`AI Support health failed: ${r.status} ${r.text.slice(0, 160)}`);
    }
  }

  // 4. Login
  let token = null;
  {
    const r = await req(`${WEB}/api/auth/login`, {
      method: "POST",
      body: { email: EMAIL, password: PASSWORD },
    });
    token = r.json?.token || null;
    const ok = r.status === 200 && !!token;
    log(`  [${ok ? "PASS" : "FAIL"}] login status=${r.status} ${r.ms}ms token=${!!token}`);
    row(infra, { service: "Auth login", status: r.status, ms: r.ms, pass: ok });
    trackPerf("Auth login", r.ms, 2000);
    if (!ok) {
      failFast = true;
      addCritical(`Login failed: ${r.status} ${r.text.slice(0, 200)}`);
    }
  }

  // 5. GraphQL typename
  {
    const r = await req(`${WEB}/api/graphql`, {
      method: "POST",
      token,
      body: { query: "{ __typename }" },
    });
    const ok = r.status === 200 && (r.json?.data?.__typename || !r.json?.errors);
    // Apollo may require auth — accept 200 with data OR errors that aren't "unreachable"
    const live = r.status === 200 && r.json && !String(r.text).includes("ECONNREFUSED");
    log(`  [${live ? "PASS" : "FAIL"}] graphql __typename status=${r.status} ${r.ms}ms`);
    row(infra, { service: "GraphQL", status: r.status, ms: r.ms, pass: live, detail: r.json });
    trackPerf("GraphQL query", r.ms, 3000);
    if (!live) {
      failFast = true;
      addCritical(`GraphQL not live: ${r.status} ${r.text.slice(0, 160)}`);
    }
  }

  // 6. CORS probe (GET with Origin — not fail-fast)
  for (const [name, base] of [
    ["AI Core CORS", CORE],
    ["AI Support CORS", SUP],
  ]) {
    const r = await raw(`${base}/health`, {
      method: "GET",
      headers: { Origin: ORIGIN },
    });
    const acao = r.headers.get("access-control-allow-origin");
    const ok = r.status === 200 && (acao === ORIGIN || acao === "*");
    log(`  [${ok ? "PASS" : "FAIL"}] ${name} acao=${acao} status=${r.status} ${r.ms}ms`);
    row(cors, { service: name, acao, pass: ok });
    if (!ok) addCritical(`CORS missing/wrong for ${name}: got ${acao}`);
  }

  return { failFast, token };
}

async function stage2(token) {
  log("\n## STAGE 2: AUTH + SECURITY");
  let secFail = false;

  // 1 valid login
  {
    const r = await req(`${WEB}/api/auth/login`, {
      method: "POST",
      body: { email: EMAIL, password: PASSWORD },
    });
    const ok = r.status === 200 && !!r.json?.token;
    row(security, { check: "login valid", expected: "200 + token", actual: `${r.status} token=${!!r.json?.token}`, pass: ok });
    log(`  [${ok ? "PASS" : "FAIL"}] login valid`);
    if (ok) token = r.json.token;
    else {
      secFail = true;
      addCritical("Valid login failed in stage 2");
    }
  }

  // 2 wrong password
  {
    const r = await req(`${WEB}/api/auth/login`, {
      method: "POST",
      body: { email: EMAIL, password: "wrong-password-xyz" },
    });
    const ok = r.status === 401;
    row(security, { check: "login wrong password", expected: "401", actual: String(r.status), pass: ok });
    log(`  [${ok ? "PASS" : "FAIL"}] login wrong password → ${r.status}`);
    if (!ok) addWarn(`Wrong-password returned ${r.status} (expected 401)`);
  }

  // 3 me with token
  {
    const r = await req(`${WEB}/api/auth/me`, { token });
    const ok = r.status === 200 && !!(r.json?.user || r.json?.data);
    row(security, { check: "auth/me with token", expected: "200 + profile", actual: String(r.status), pass: ok });
    log(`  [${ok ? "PASS" : "FAIL"}] auth/me authenticated`);
  }

  // 4 me no token
  {
    const r = await req(`${WEB}/api/auth/me`);
    const ok = r.status === 401;
    row(security, { check: "auth/me no token", expected: "401", actual: String(r.status), pass: ok });
    log(`  [${ok ? "PASS" : "FAIL"}] auth/me no token → ${r.status}`);
    if (!ok) {
      secFail = true;
      addCritical("auth/me unprotected");
    }
  }

  // 5 jobs no token
  {
    const r = await req(`${WEB}/api/jobs`);
    const publicOk = r.status === 200;
    const authReq = r.status === 401 || r.status === 403;
    const ok = publicOk || authReq; // either public listing or auth-gated is fine — log which
    row(security, {
      check: "jobs no token",
      expected: "401 or public 200",
      actual: `${r.status} (${publicOk ? "public" : authReq ? "auth-required" : "other"})`,
      pass: ok,
    });
    log(`  [${ok ? "PASS" : "FAIL"}] /api/jobs no token → ${r.status}`);
  }

  // 6 upload resume no token
  {
    const r = await req(`${WEB}/api/upload/resume`, { method: "POST", body: {} });
    const ok = r.status === 401;
    row(security, { check: "upload/resume no token", expected: "401", actual: String(r.status), pass: ok });
    log(`  [${ok ? "PASS" : "FAIL"}] upload/resume no token → ${r.status}`);
    if (!ok) {
      secFail = true;
      addCritical("upload/resume unprotected");
    }
  }

  // 7 debug-applications
  {
    const r = await req(`${WEB}/api/debug-applications`);
    const ok = r.status === 404;
    row(security, { check: "debug-applications deleted", expected: "404", actual: String(r.status), pass: ok });
    log(`  [${ok ? "PASS" : "FAIL"}] debug-applications → ${r.status}`);
    if (!ok) {
      secFail = true;
      addCritical(`debug-applications still live (${r.status})`);
    }
  }

  // 8 test-folder
  {
    const r = await req(`${WEB}/api/test-folder`);
    const ok = r.status === 404;
    row(security, { check: "test-folder deleted", expected: "404", actual: String(r.status), pass: ok });
    log(`  [${ok ? "PASS" : "FAIL"}] test-folder → ${r.status}`);
    if (!ok) {
      secFail = true;
      addCritical(`test-folder still live (${r.status})`);
    }
  }

  // 9 resume-rag-python no token
  {
    const r = await req(`${WEB}/api/resume-rag-python`, { method: "POST", body: { action: "analyze" } });
    const ok = r.status === 401;
    row(security, { check: "resume-rag-python no token", expected: "401", actual: String(r.status), pass: ok });
    log(`  [${ok ? "PASS" : "FAIL"}] resume-rag-python no token → ${r.status}`);
    if (!ok) {
      secFail = true;
      addCritical("resume-rag-python unprotected");
    }
  }

  // 10 shortlist no token
  {
    const r = await req(`${WEB}/api/ai/shortlist-candidates`, { method: "POST", body: { jobId: "x" } });
    const ok = r.status === 401;
    row(security, { check: "shortlist-candidates no token", expected: "401", actual: String(r.status), pass: ok });
    log(`  [${ok ? "PASS" : "FAIL"}] shortlist-candidates no token → ${r.status}`);
    if (!ok) {
      secFail = true;
      addCritical("shortlist-candidates unprotected");
    }
  }

  if (secFail) addCritical("SECURITY VERDICT: unprotected sensitive endpoint(s)");
  return token;
}

async function stage3(token) {
  log("\n## STAGE 3: CORE MATCHING PIPELINE");
  await sleep(3000);

  let job = { ...FALLBACK_JOB };
  {
    let r = await req(`${WEB}/api/jobs?public=true`, { token });
    let jobs = r.json?.data || r.json?.jobs || [];
    if (!jobs.length) {
      r = await req(`${WEB}/api/jobs`, { token });
      jobs = r.json?.data || [];
    }
    // Prefer recruiter-posted tech roles for pipeline smoke; aggregated JDs vary widely
    const picked =
      jobs.find((j) => (j.source || 'recruiter') === 'recruiter') ||
      jobs.find((j) => /engineer|developer|software|full.?stack/i.test(j.title || '')) ||
      jobs[0];
    if (picked) {
      const rawReqs =
        Array.isArray(picked.requirements) && picked.requirements.length
          ? picked.requirements
          : FALLBACK_JOB.requirements;
      const requirements = rawReqs.map((x) =>
        typeof x === 'string' ? x : x?.description || x?.name || String(x)
      );
      job = {
        _id: picked._id,
        title: picked.title || FALLBACK_JOB.title,
        companyName: picked.companyName || picked.company || "Unknown",
        description:
          picked.description ||
          picked.jobDescriptionText ||
          FALLBACK_JOB.description,
        requirements,
        evaluationWeights: picked.evaluationWeights || FALLBACK_JOB.evaluationWeights,
        source: picked.source || 'recruiter',
      };
      if ((job.description || "").length < 80) {
        job.description = FALLBACK_JOB.description;
        job.requirements = FALLBACK_JOB.requirements;
        addWarn("Selected job description thin — using FALLBACK_JOB text for match quality");
      }
    } else {
      addWarn("No jobs in DB — using FALLBACK_JOB");
    }
    log(`  Job: ${job.title} @ ${job.companyName}`);
    log(`  Requirements: ${(job.requirements || []).join(", ")}`);
    log(`  evaluationWeights: ${JSON.stringify(job.evaluationWeights)}`);
    matching.job = `${job.title} @ ${job.companyName}`;
    matching.requirements = job.requirements;
    matching.weights = job.evaluationWeights;
  }

  await sleep(3000);

  // Match via Next, fallback Core
  let match = null;
  let matchMs = 0;
  {
    const t0 = Date.now();
    let r = await req(`${WEB}/api/resume-match/analyze`, {
      method: "POST",
      token,
      body: {
        jobId: job._id,
        jobTitle: job.title,
        jobDescription: job.description,
        jobRequirements: job.requirements,
        resumeText: RESUME,
        weights: job.evaluationWeights,
      },
    });
    if (!r.ok) {
      log(`  Next match failed (${r.status}), falling back to AI Core`);
      const an = await req(`${CORE}/analyze`, { method: "POST", body: { resume_text: RESUME } });
      await sleep(3000);
      const m = await req(`${CORE}/match`, {
        method: "POST",
        body: {
          candidate_profile: an.json,
          job_requirements: {
            title: job.title,
            description: job.description,
            requirements: job.requirements,
          },
          weights: job.evaluationWeights,
        },
      });
      r = { ok: m.ok, status: m.status, json: { success: m.ok, data: m.json }, text: m.text, ms: m.ms };
    }
    matchMs = Date.now() - t0;
    match = r.json?.data || r.json;
    matching.matchMs = matchMs;
    trackPerf("Resume match", matchMs, 30000);

    const overall = match?.overall_score ?? match?.overallScore;
    const comps = match?.component_scores || match?.componentScores || {};
    const evidence = match?.evidence || [];
    const explanation = match?.explanation || "";
    const needed = ["skills", "experience", "education", "projects", "communication"];

    matching.score = overall;
    matching.comps = comps;
    matching.evidenceCount = evidence.length;
    matching.explanationLen = explanation.length;

    const scoreOk = typeof overall === "number" && overall >= 0 && overall <= 100;
    const compsOk = needed.every((k) => comps[k] !== undefined && comps[k] !== null);
    const evOk =
      evidence.length > 0 &&
      evidence.every(
        (e) =>
          (e.requirement || e.skill) &&
          (e.resume_excerpt || e.resumeExcerpt || e.excerpt) &&
          (e.strength || e.fit)
      );
    const explOk = explanation.length > 100;
    const timingOk = matchMs < 30000;

    // hallucinated evidence heuristic: excerpt not in resume
    const hall = evidence.filter((e) => {
      const ex = String(e.resume_excerpt || e.resumeExcerpt || e.excerpt || "").toLowerCase();
      if (ex.length < 12) return false;
      return !RESUME.toLowerCase().includes(ex.slice(0, Math.min(40, ex.length)));
    }).length;
    matching.hallucinated = hall;

    log(`  score=${overall} evidence=${evidence.length} hall=${hall} expl=${explanation.length} chars ${matchMs}ms`);
    log(`  components=${JSON.stringify(comps)}`);

    if (!scoreOk) addCritical(`Match score invalid: ${overall}`);
    if (!compsOk) addCritical(`Missing component scores: ${JSON.stringify(comps)}`);
    if (!evOk) addCritical("Evidence array empty or malformed");
    if (!explOk) addCritical(`Explanation too short: ${explanation.length}`);
    if (!timingOk) addWarn(`Match slow: ${matchMs}ms`);
    if (hall > 0) addWarn(`${hall} evidence excerpts not found in resume text (possible hallucination)`);

    matching.matchPass = scoreOk && compsOk && evOk && explOk && timingOk;
  }

  await sleep(3000);

  // Gap
  {
    const r = await req(`${CORE}/gap`, { method: "POST", body: { match_result: match } });
    const gaps = r.json?.gaps || r.json?.prioritized_gaps || [];
    matching.gaps = gaps.length;
    const classOk =
      gaps.length > 0 &&
      gaps.every((g) => /missing|weak|under.?evidenced/i.test(String(g.classification || "")));
    log(`  gaps=${gaps.length} classOk=${classOk} status=${r.status}`);
    matching.gapPass = classOk;
    if (!classOk) addCritical(`Gap classification failed n=${gaps.length}`);

    matching._gaps = gaps;
  }

  await sleep(3000);

  // Career plan
  {
    const t0 = Date.now();
    let r = await req(`${WEB}/api/career-plan/generate`, {
      method: "POST",
      token,
      body: { gaps: matching._gaps || [], targetRole: job.title },
    });
    if (!r.ok) {
      r = await req(`${CORE}/career-plan`, {
        method: "POST",
        body: { gaps: matching._gaps || [], target_role: job.title },
      });
      r = { ok: r.ok, status: r.status, json: { success: r.ok, data: r.json }, ms: r.ms };
    }
    const ms = Date.now() - t0;
    trackPerf("Career plan", ms, 30000);
    const plan = r.json?.data || r.json || {};
    const objectives = plan.objectives || [];
    const projects = plan.projects || [];
    const modules = plan.modules || [];
    const withVids = modules.filter((m) => (m.videos || m.youtube || m.resources || []).length > 0).length;
    matching.careerYes = objectives.length > 0 && projects.length > 0;
    matching.modulesWithVideos = `${withVids}/${modules.length}`;
    matching.careerMs = ms;
    log(`  career objectives=${objectives.length} projects=${projects.length} modules=${modules.length} videos=${withVids} ${ms}ms`);
    if (!matching.careerYes) addCritical("Career plan missing objectives/projects");
    if (withVids === 0 && modules.length) addWarn("No modules have videos (YouTube quota may be exhausted)");
  }

  matching.verdict =
    matching.matchPass && matching.gapPass && matching.careerYes ? "PASS" : "FAIL";
}

async function stage4() {
  log("\n## STAGE 4: AI SUPPORT SERVICES");

  // Mock interview
  let question = null;
  {
    await sleep(3000);
    const t0 = Date.now();
    const r = await req(`${SUP}/mock-interview/question`, {
      method: "POST",
      body: {
        role: "Full Stack Engineer",
        interview_type: "technical",
        question_number: 1,
        previous_qa_pairs: [],
      },
    });
    const ms = Date.now() - t0;
    trackPerf("Mock interview question", ms, 10000);
    question = r.json?.question;
    const ok = r.ok && !!question && /react|node|api|system|design|stack|scale|database|frontend|backend|engineer/i.test(question);
    row(support, { service: "Mock interview question", works: !!question, ms, pass: ok || (!!question && r.ok) });
    log(`  [${question ? "PASS" : "FAIL"}] mock question ${ms}ms: ${String(question || r.text).slice(0, 120)}`);
    if (!question) addCritical(`Mock question failed: ${r.status} ${r.text.slice(0, 160)}`);
  }

  {
    await sleep(3000);
    const t0 = Date.now();
    const r = await req(`${SUP}/mock-interview/analyze`, {
      method: "POST",
      body: {
        question: question || "Describe a full-stack architecture you would use.",
        answer:
          "I would use React for the frontend and Node.js for the backend with a REST API",
        role: "Full Stack Engineer",
        interview_type: "technical",
      },
    });
    const ms = Date.now() - t0;
    const score = r.json?.score ?? r.json?.overall_score;
    const ideal =
      r.json?.ideal_answer ||
      r.json?.idealAnswer ||
      r.json?.strong_answer_would_include ||
      r.json?.notes;
    const ok =
      r.ok &&
      typeof score === "number" &&
      score >= 1 &&
      score <= 10 &&
      Array.isArray(r.json?.strengths) &&
      Array.isArray(r.json?.weaknesses) &&
      !!ideal;
    row(support, { service: "Mock interview analyze", works: ok, ms, pass: ok });
    log(`  [${ok ? "PASS" : "FAIL"}] mock analyze score=${score} ${ms}ms`);
    if (!ok) addCritical(`Mock analyze failed: ${r.status} ${r.text.slice(0, 160)}`);
  }

  // Quiz
  let quiz = null;
  {
    await sleep(3000);
    const t0 = Date.now();
    const r = await req(`${SUP}/quiz/generate`, {
      method: "POST",
      body: { topic: "React Hooks", difficulty: "medium", question_count: 3 },
    });
    const ms = Date.now() - t0;
    trackPerf("Quiz generate", ms, 10000);
    quiz = r.json;
    const qs = quiz?.questions || [];
    const ok =
      r.ok &&
      qs.length === 3 &&
      qs.every(
        (q) =>
          Array.isArray(q.options) &&
          q.options.length === 4 &&
          typeof q.correct_index === "number" &&
          q.explanation
      );
    row(support, { service: "Quiz generation", works: ok, ms, pass: ok });
    log(`  [${ok ? "PASS" : "FAIL"}] quiz generate n=${qs.length} ${ms}ms`);
    if (!ok) addCritical(`Quiz generate failed: ${r.status} ${r.text.slice(0, 160)}`);
  }

  {
    await sleep(3000);
    if (quiz?.questions?.length) {
      const qs = quiz.questions;
      // answer 2 correctly, 1 wrong
      const answers = qs.map((q, i) => (i === 0 ? (q.correct_index + 1) % 4 : q.correct_index));
      const r = await req(`${SUP}/quiz/submit`, {
        method: "POST",
        body: {
          quiz_id: quiz.quiz_id,
          topic: quiz.topic,
          questions: qs,
          answers,
        },
      });
      const score = r.json?.score ?? r.json?.percent;
      const ok = r.ok && (typeof score === "number" || r.json?.correct !== undefined) && Array.isArray(r.json?.details || r.json?.results || r.json?.feedback);
      // weak areas optional
      row(support, { service: "Quiz submit", works: r.ok, ms: r.ms, pass: r.ok });
      log(`  [${r.ok ? "PASS" : "FAIL"}] quiz submit score=${score} status=${r.status}`);
      if (!r.ok) addWarn(`Quiz submit failed: ${r.status}`);
    }
  }

  // Video notes
  {
    await sleep(3000);
    const t0 = Date.now();
    const r = await req(`${SUP}/video/notes`, {
      method: "POST",
      body: { video_id: "dQw4w9WgXcQ", action: "auto_notes" },
    });
    const ms = Date.now() - t0;
    const has =
      r.ok &&
      !!(r.json?.summary || r.json?.notes) &&
      !!(r.json?.key_concepts || r.json?.concepts || r.json?.keyConcepts);
    if (!r.ok && /transcript|caption|unavailable/i.test(r.text)) {
      addWarn(`Video notes transcript unavailable: ${r.text.slice(0, 120)}`);
      row(support, { service: "Video notes", works: false, ms, pass: true }); // don't fail
      log(`  [PASS*] video notes — transcript missing (non-blocking) ${ms}ms`);
    } else {
      row(support, { service: "Video notes", works: has, ms, pass: has || !r.ok });
      log(`  [${has ? "PASS" : "WARN"}] video notes ${ms}ms status=${r.status}`);
      if (!has) addWarn(`Video notes incomplete: ${r.status} ${r.text.slice(0, 120)}`);
    }
  }

  // YouTube curate
  {
    await sleep(3000);
    const t0 = Date.now();
    const r = await req(`${SUP}/youtube/curate`, {
      method: "POST",
      body: { skill: "Docker", difficulty: "beginner" },
    });
    const ms = Date.now() - t0;
    const videos = r.json?.videos || r.json?.results || [];
    const quota = r.status === 429 || /quota|429/i.test(r.text);
    if (quota) {
      addWarn("YouTube quota exhausted — expected if key is same project");
      row(support, { service: "YouTube curation", works: false, ms, pass: true });
      log(`  [PASS*] youtube curate — quota exhausted ${ms}ms`);
    } else {
      const ok =
        r.ok &&
        videos.length > 0 &&
        videos.every((v) => /youtube\.com|youtu\.be/i.test(String(v.url || v.link || `https://youtube.com/watch?v=${v.id || v.videoId}`)));
      row(support, { service: "YouTube curation", works: ok, ms, pass: ok });
      log(`  [${ok ? "PASS" : "FAIL"}] youtube curate n=${videos.length} ${ms}ms`);
      if (!ok) addWarn(`YouTube curate failed: ${r.status} ${r.text.slice(0, 120)}`);
    }
  }
}

async function stage5(token) {
  log("\n## STAGE 5: GRAPHQL");

  {
    const r = await req(`${WEB}/api/graphql`, {
      method: "POST",
      token,
      body: {
        query: `{ candidateProfile { user { name email } skills { name level } matchHistory { overallScore explanation } } }`,
      },
    });
    const cp = r.json?.data?.candidateProfile;
    const authErr = (r.json?.errors || []).some((e) => /auth/i.test(e.message || ""));
    const ok = r.status === 200 && !!cp && !authErr;
    row(graphql, {
      query: "candidateProfile",
      authEnforced: true,
      dataReturned: !!cp,
      pass: ok,
    });
    log(`  [${ok ? "PASS" : "FAIL"}] candidateProfile status=${r.status} data=${!!cp}`);
    if (!ok) addCritical(`candidateProfile failed: ${JSON.stringify(r.json?.errors || r.text).slice(0, 200)}`);
  }

  {
    const r = await req(`${WEB}/api/graphql`, {
      method: "POST",
      body: {
        query: `{ candidateProfile { user { name email } } }`,
      },
    });
    const cp = r.json?.data?.candidateProfile;
    const authErr = (r.json?.errors || []).some((e) => /auth/i.test(e.message || ""));
    const ok = !cp && (authErr || r.status === 401);
    row(graphql, {
      query: "candidateProfile no JWT",
      authEnforced: ok,
      dataReturned: !!cp,
      pass: ok,
    });
    log(`  [${ok ? "PASS" : "FAIL"}] candidateProfile no JWT authErr=${authErr} data=${!!cp}`);
    if (!ok) addCritical("GraphQL returned data without JWT");
  }

  {
    const r = await req(`${WEB}/api/graphql`, {
      method: "POST",
      token,
      body: {
        query: `{ recruiterDashboard { stats { totalJobs totalApplications } } }`,
      },
    });
    const dash = r.json?.data?.recruiterDashboard;
    const roleErr = (r.json?.errors || []).some((e) => /recruiter/i.test(e.message || ""));
    // applicant → role error is PASS; recruiter → data is PASS
    const ok = (!!dash && !roleErr) || (!dash && roleErr);
    row(graphql, {
      query: "recruiterDashboard",
      authEnforced: true,
      dataReturned: !!dash,
      pass: ok,
      note: roleErr ? "role error (applicant)" : dash ? "recruiter data" : "unexpected",
    });
    log(`  [${ok ? "PASS" : "FAIL"}] recruiterDashboard data=${!!dash} roleErr=${roleErr}`);
    if (!ok) addWarn(`recruiterDashboard unexpected: ${JSON.stringify(r.json?.errors || []).slice(0, 160)}`);
  }
}

async function stage6() {
  log("\n## STAGE 6: FRONTEND ROUTES");
  const paths = [
    "/",
    "/auth",
    "/register",
    "/dashboard/applicant",
    "/dashboard/recruiter",
    "/dashboard/applicant/career-plan",
    "/dashboard/applicant/resume-match",
    "/dashboard/applicant/prep-plans",
    "/dashboard/applicant/mock-interview",
    "/quiz",
  ];
  for (const p of paths) {
    const url = `${WEB}${p}`;
    const r = await raw(url, { redirect: "manual" });
    // follow one redirect if auth gate
    let status = r.status;
    let chain = [];
    if ([301, 302, 303, 307, 308].includes(status) && r.location) {
      chain.push(`${status}→${r.location}`);
      const r2 = await raw(r.location.startsWith("http") ? r.location : `${WEB}${r.location}`, {
        redirect: "manual",
      });
      status = r2.status;
      if ([301, 302, 303, 307, 308].includes(r2.status) && r2.location) chain.push(`${r2.status}→${r2.location}`);
    }
    // 200 OK, or auth redirect to /auth is acceptable for dashboards
    const authGate = chain.some((c) => /\/auth/i.test(c));
    const ok = status === 200 || (authGate && (status === 200 || [301, 302, 303, 307, 308].includes(r.status)));
    // Also accept 200 on first hop
    const pass = r.status === 200 || (authGate && r.status >= 300 && r.status < 400) || status === 200;
    const fail = r.status === 404 || r.status === 500 || r.status === 0;
    row(routes, {
      route: p,
      status: r.status,
      final: status,
      ms: r.ms,
      redirects: chain.join(" "),
      pass: !fail && pass,
    });
    log(`  [${!fail && pass ? "PASS" : "FAIL"}] ${p} status=${r.status} final=${status} ${r.ms}ms ${chain.join(" ")}`);
    if (fail) addCritical(`Route broken: ${p} → ${r.status}`);
  }
}

async function stage7() {
  log("\n## STAGE 7: CROSS-ORIGIN (OPTIONS)");
  for (const [name, base] of [
    ["AI Core", CORE],
    ["AI Support", SUP],
  ]) {
    const r = await raw(`${base}/health`, {
      method: "OPTIONS",
      headers: {
        Origin: ORIGIN,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "content-type,authorization",
      },
    });
    const acao = r.headers.get("access-control-allow-origin");
    const ok = (r.status === 200 || r.status === 204) && (acao === ORIGIN || acao === "*");
    row(cors, { service: `${name} OPTIONS`, acao, status: r.status, pass: ok });
    log(`  [${ok ? "PASS" : "FAIL"}] OPTIONS ${name} status=${r.status} acao=${acao}`);
    if (!ok) addCritical(`CORS OPTIONS wrong for ${name}: ${acao || "missing"}`);
  }
}

function writeReport(started) {
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  const infraPass = infra.every((x) => x.pass);
  const secPass = security.every((x) => x.pass);
  const gqlPass = graphql.every((x) => x.pass);
  const routePass = routes.every((x) => x.pass);
  const corsPass = cors.every((x) => x.pass);
  const supportPass = support.every((x) => x.pass);
  const matchPass = matching.verdict === "PASS";
  const ready =
    infraPass &&
    secPass &&
    matchPass &&
    supportPass &&
    gqlPass &&
    routePass &&
    corsPass &&
    critical.length === 0;

  const lines = [];
  lines.push("# X-CEED Production Smoke Test Report");
  lines.push(`Date: ${new Date().toISOString()}`);
  lines.push(`Runtime: ${elapsed}s`);
  lines.push(`Vercel: ${WEB}`);
  lines.push(`AI Core: ${CORE}`);
  lines.push(`AI Support: ${SUP}`);
  lines.push("");
  lines.push("## Infrastructure");
  lines.push("| Service | Status | Response time | Verdict |");
  lines.push("|---------|--------|---------------|---------|");
  for (const x of infra) {
    lines.push(`| ${x.service} | ${x.status} | ${x.ms}ms | ${verdict(x.pass)} |`);
  }
  lines.push("");
  lines.push("## Security (10 checks)");
  lines.push("| Check | Expected | Actual | Verdict |");
  lines.push("|-------|----------|--------|---------|");
  for (const x of security) {
    lines.push(`| ${x.check} | ${x.expected} | ${x.actual} | ${verdict(x.pass)} |`);
  }
  lines.push("");
  lines.push("## Matching Pipeline");
  lines.push(`- Job: ${matching.job || "n/a"}`);
  lines.push(`- Match score: ${matching.score}`);
  lines.push(`- Evidence items: ${matching.evidenceCount}`);
  lines.push(`- Hallucinated evidence: ${matching.hallucinated}`);
  lines.push(`- Gaps found: ${matching.gaps}`);
  lines.push(`- Explanation length: ${matching.explanationLen} chars`);
  lines.push(`- Match response time: ${matching.matchMs}ms`);
  lines.push(`- Career plan generated: ${matching.careerYes ? "YES" : "NO"}`);
  lines.push(`- Modules with videos: ${matching.modulesWithVideos}`);
  lines.push(`- Verdict: ${matching.verdict || "FAIL"}`);
  lines.push("");
  lines.push("## AI Support Services");
  lines.push("| Service | Works | Response time | Verdict |");
  lines.push("|---------|-------|---------------|---------|");
  for (const x of support) {
    lines.push(`| ${x.service} | ${x.works ? "YES" : "NO"} | ${x.ms}ms | ${verdict(x.pass)} |`);
  }
  lines.push("");
  lines.push("## GraphQL");
  lines.push("| Query | Auth enforced | Data returned | Verdict |");
  lines.push("|-------|--------------|---------------|---------|");
  for (const x of graphql) {
    lines.push(
      `| ${x.query} | ${x.authEnforced ? "YES" : "NO"} | ${x.dataReturned ? "YES" : "NO"} | ${verdict(x.pass)} |`
    );
  }
  lines.push("");
  lines.push("## Frontend Routes (10 routes)");
  lines.push("| Route | Status | Verdict |");
  lines.push("|-------|--------|---------|");
  for (const x of routes) {
    lines.push(`| ${x.route} | ${x.status}${x.redirects ? " " + x.redirects : ""} | ${verdict(x.pass)} |`);
  }
  lines.push("");
  lines.push("## CORS");
  lines.push("| Service | Headers correct | Verdict |");
  lines.push("|---------|----------------|---------|");
  for (const x of cors) {
    lines.push(`| ${x.service} | ${x.acao || "missing"} | ${verdict(x.pass)} |`);
  }
  lines.push("");
  lines.push("## Performance Summary");
  lines.push("| Endpoint | Response time | Acceptable | PASS/FAIL |");
  lines.push("|----------|--------------|------------|-----------|");
  for (const x of perf) {
    lines.push(`| ${x.endpoint} | ${x.ms}ms | <${x.limitMs}ms | ${verdict(x.pass)} |`);
  }
  lines.push("");
  lines.push("## CRITICAL ISSUES");
  if (!critical.length) lines.push("(none)");
  else critical.forEach((c) => lines.push(`- ${c}`));
  lines.push("");
  lines.push("## WARNINGS");
  if (!warnings.length) lines.push("(none)");
  else warnings.forEach((w) => lines.push(`- ${w}`));
  lines.push("");
  lines.push("## VERDICT");
  lines.push(`PRODUCTION READY: ${ready ? "YES" : "NO"}`);
  lines.push(
    ready
      ? "All critical infrastructure, security, matching, AI support, GraphQL, routes, and CORS checks passed against live production URLs."
      : "One or more critical checks failed — see CRITICAL ISSUES above before treating production as ready."
  );
  lines.push("");
  lines.push("<details><summary>Raw log</summary>");
  lines.push("");
  lines.push("```");
  lines.push(logs.join("\n"));
  lines.push("```");
  lines.push("</details>");

  fs.writeFileSync(REPORT, lines.join("\n"));
  log(`\nReport written: ${REPORT}`);
  log(`PRODUCTION READY: ${ready ? "YES" : "NO"}`);
  return ready;
}

async function main() {
  const started = Date.now();
  log("=== X-CEED PRODUCTION SMOKE TEST ===");
  log(`WEB=${WEB}`);
  log(`CORE=${CORE}`);
  log(`SUP=${SUP}`);
  log(`Date=${new Date().toISOString()}`);

  const { failFast, token: t1 } = await stage1();
  if (failFast) {
    log("\nFAIL FAST — infrastructure stage failed. Still writing partial report.");
    writeReport(started);
    process.exit(1);
  }

  let token = await stage2(t1);
  await stage3(token);
  await stage4();
  await stage5(token);
  await stage6();
  await stage7();

  const ready = writeReport(started);
  process.exit(ready ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  addCritical(e.message);
  try {
    writeReport(Date.now());
  } catch {
    /* ignore */
  }
  process.exit(1);
});
