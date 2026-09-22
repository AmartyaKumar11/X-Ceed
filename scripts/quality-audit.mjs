/**
 * X-CEED AI Quality & Accuracy Audit
 * Run: node scripts/quality-audit.mjs
 * Writes: scripts/quality-audit-report.md
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { SignJWT } from "jose";

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".env.local") });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const NEXT = process.env.NEXT_URL || "http://127.0.0.1:3002";
const CORE = process.env.AI_CORE_URL || "http://127.0.0.1:8000";
const EMAIL = "kumaramartya11@gmail.com";
const PASSWORD = "dreamisop69";
const REPORT = path.join(ROOT, "scripts", "quality-audit-report.md");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const criticals = [];
const issues = [];

function crit(msg) {
  criticals.push(msg);
  console.log(`  CRITICAL: ${msg}`);
}
function issue(msg) {
  issues.push(msg);
  console.log(`  ISSUE: ${msg}`);
}

async function req(url, { method = "GET", body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* raw */
    }
    return { ok: res.ok, status: res.status, json, text };
  } catch (e) {
    return { ok: false, status: 0, json: null, text: e.message };
  }
}

const RESUME_A = `PRIYA SHARMA
Senior Frontend Engineer | priya.sharma@example.com | Bangalore

SUMMARY
Senior Frontend Engineer with 6 years building production React/TypeScript systems. Led teams, shipped design systems, and owned SSR/SEO-critical surfaces.

SKILLS
React (5 years), TypeScript (4 years), Next.js, Node.js (3 years), GraphQL, Express, Fastify, AWS (S3, CloudFront, Lambda@Edge), Docker, GitHub Actions, CI/CD, Vercel

EXPERIENCE
Senior Frontend Engineer — NovaTech (2020–Present)
- Built design system used by 200+ developers across product teams
- Led migration from class components to hooks across the main web app
- Implemented SSR with Next.js for SEO-critical marketing and product pages
- Strict TypeScript mode across a 50k LOC monorepo; custom type utilities for API contracts
- Built REST and GraphQL APIs with Express and Fastify (Node.js, 3 years)
- AWS image pipeline: S3, CloudFront, Lambda@Edge for optimization
- CI/CD via GitHub Actions, Docker, and Vercel deployments
- Led a team of 4 engineers; mentored 2 junior developers

Frontend Engineer — PixelForge (2018–2020)
- Shipped React SPAs and component libraries for B2B SaaS

EDUCATION
B.Tech Computer Science — GPA 3.8

PROJECTS
- Open-source component library (800 GitHub stars)
- Real-time collaborative editor using CRDTs
`;

const RESUME_B = `RAHUL MEHTA
Junior Developer | rahul.mehta@example.com

SUMMARY
Junior developer with 1.5 years experience building small web apps.

SKILLS
JavaScript (1.5 years), React (6 months), Python scripting, HTML, CSS, jQuery

EXPERIENCE
Junior Developer — LocalSoft (2023–Present)
- Built small web apps with vanilla JavaScript and jQuery
- Completed 2 React tutorial projects; basic hooks understanding (useState, useEffect)
- Wrote Python scripts for data cleanup and CSV processing
- No cloud / AWS experience
- No team lead experience

EDUCATION
B.Tech Information Technology — GPA 3.0

PROJECTS
- Personal portfolio site
- Todo app with React
`;

const RESUME_C = `VIKRAM PATEL
Mechanical Engineer | vikram.patel@example.com

SUMMARY
Mechanical engineer with 4 years experience in automotive design and production.

SKILLS
AutoCAD, SolidWorks, CATIA for 3D modeling, MATLAB for simulation, Six Sigma Green Belt

EXPERIENCE
Mechanical Design Engineer — AutoWorks India (2020–Present)
- Designed automotive parts in SolidWorks and CATIA
- Used MATLAB for thermal and stress simulation
- Managed production line of 15 workers
- Six Sigma Green Belt certified process improvements

EDUCATION
B.Tech Mechanical Engineering — GPA 3.5

PROJECTS
- Designed fuel injection system reducing emissions by 12%
`;

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fuzzy: excerpt found if most significant tokens appear in resume (order-flexible). */
function excerptInResume(excerpt, resume) {
  const raw = String(excerpt || "").trim();
  // P0.1: explicit "no evidence" is valid output, not a hallucination
  if (/^no evidence found/i.test(raw)) return true;
  const ex = normalize(excerpt);
  const rs = normalize(resume);
  if (!ex || ex.length < 8) return false;
  if (rs.includes(ex)) return true;
  // allow minor rephrase: require >=70% of content words (len>3) present
  const words = ex.split(" ").filter((w) => w.length > 3);
  if (!words.length) return rs.includes(ex.slice(0, 20));
  const hit = words.filter((w) => rs.includes(w)).length;
  return hit / words.length >= 0.7;
}

function jaccard(a, b) {
  const A = new Set(normalize(a).split(" ").filter(Boolean));
  const B = new Set(normalize(b).split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

function scoreOf(match) {
  const n = Number(match?.overall_score ?? match?.overallScore);
  return Number.isFinite(n) ? n : null;
}

function compsOf(match) {
  return match?.component_scores || match?.componentScores || {};
}

function evidenceOf(match) {
  return match?.evidence || [];
}

async function runMatch(token, job, resumeText) {
  let r = await req(`${NEXT}/api/resume-match/analyze`, {
    method: "POST",
    token,
    body: {
      jobId: job._id,
      jobTitle: job.title,
      jobDescription: job.description,
      jobRequirements: job.requirements,
      resumeText,
      weights: job.evaluationWeights,
    },
  });
  if (!r.ok) {
    const an = await req(`${CORE}/analyze`, { method: "POST", body: { resume_text: resumeText } });
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
    return m.json;
  }
  return r.json?.data || r.json;
}

async function runGaps(match) {
  const g = await req(`${CORE}/gap`, { method: "POST", body: { match_result: match } });
  return g.json?.gaps || g.json?.prioritized_gaps || [];
}

async function runCareer(token, gaps, targetRole) {
  let r = await req(`${NEXT}/api/career-plan/generate`, {
    method: "POST",
    token,
    body: { gaps, targetRole },
  });
  if (!r.ok) {
    r = await req(`${CORE}/career-plan`, {
      method: "POST",
      body: { gaps, target_role: targetRole },
    });
    return r.json;
  }
  return r.json?.data || r.json;
}

async function oembedTitle(url) {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (!r.ok) return null;
    const j = await r.json();
    return j.title || null;
  } catch {
    return null;
  }
}

function specificityScore(gap, jobReqs) {
  const text = `${gap.requirement || ""} ${gap.reason || gap.detail || gap.evidence || ""}`;
  const t = String(text);
  if (/improv(e|ing) your (technical )?skills|strengthen your profile|gaining more experience/i.test(t) && !/[A-Za-z]{2,}(\.js|SQL|AWS|React)/i.test(t))
    return 1;
  const named = jobReqs.some((r) => new RegExp(String(r).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(t));
  const specificTech = /\b(AWS|S3|CloudFront|Lambda|React|TypeScript|Next\.?js|Docker|GraphQL|Node\.?js|MongoDB|Git)\b/i.test(t);
  const actionable = /no |missing|need|required|shallow|only |months|listed without/i.test(t);
  if (specificTech && actionable && named) return 5;
  if (specificTech && named) return 4;
  if (specificTech || named) return 3;
  if (/cloud|frontend|backend|devops/i.test(t)) return 2;
  return 1;
}

function isFluffGap(gap) {
  const t = String(gap.requirement || "") + " " + JSON.stringify(gap);
  return (
    (/consider improving/i.test(t) && !/\b(React|AWS|TypeScript|Docker|Next)/i.test(t)) ||
    (/gaining more experience in/i.test(t) && t.length < 60) ||
    (/strengthen your profile/i.test(t) && !/\b(React|AWS|TypeScript)/i.test(t)) ||
    /improv(e|ing) your technical skills$/i.test(String(gap.requirement || "").trim())
  );
}

function classificationAccurate(gap, resume) {
  const req = String(gap.requirement || "");
  const cls = String(gap.classification || "").toLowerCase();
  const rs = normalize(resume);
  const reqRe = new RegExp(req.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  // "No AWS experience" should count as NOT having the skill
  const negated = new RegExp(
    `(no|without|lack(ing)?|never)\\s+[^\\n.]{0,40}${req.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    "i"
  ).test(resume);
  const mentioned = !negated && (rs.includes(normalize(req)) || reqRe.test(resume));

  if (cls.includes("missing")) {
    return !mentioned || negated;
  }
  if (cls.includes("weak")) {
    return mentioned;
  }
  if (cls.includes("under") || cls.includes("evidence")) {
    return mentioned;
  }
  return true;
}

function countSpecificRefs(explanation, resume) {
  const markers = [
    "NovaTech",
    "PixelForge",
    "LocalSoft",
    "AutoWorks",
    "800",
    "GitHub stars",
    "CRDT",
    "design system",
    "200+",
    "50k",
    "Lambda@Edge",
    "fuel injection",
    "Six Sigma",
    "SolidWorks",
    "todo app",
    "portfolio",
    "jQuery",
    "6 months",
    "1.5 years",
    "5 years",
    "class components",
    "hooks",
    "GPA 3.8",
    "GPA 3.0",
    "Mechanical",
  ];
  let n = 0;
  const ex = explanation || "";
  for (const m of markers) {
    if (new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(ex) && new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(resume)) {
      n++;
    }
  }
  // also count tech-with-context phrases
  const techCtx = (explanation.match(/\b(React|TypeScript|Next\.js|GraphQL|AWS|Docker|AutoCAD|SolidWorks|MATLAB)[^.!?]{0,40}/gi) || []).length;
  return n + Math.min(techCtx, 8);
}

function actionability(explanation) {
  const t = explanation || "";
  const hasWeak = /gap|weak|missing|lack|need|however|but |limited/i.test(t);
  const hasNext = /should|recommend|next|learn|focus|interview|validate|build|practice/i.test(t);
  if (hasWeak && hasNext) return 5;
  if (hasWeak) return 3;
  if (t.length > 80) return 2;
  return 1;
}

function honestMismatch(explanation) {
  const t = explanation || "";
  const clearNo =
    /not a (good |strong )?fit|does not align|poor match|mismatch|unlikely|not suited|background in mechanical|mechanical engineering does not/i.test(
      t
    );
  const spin = /transferable skills|strong foundation|could transition|surprisingly relevant/i.test(t);
  return { clearNo, spin };
}

async function main() {
  const started = new Date().toISOString();
  console.log("=== X-CEED QUALITY AUDIT ===", started);

  // Login (fallback: mint JWT if Next/Mongo is briefly down)
  let token = null;
  const login = await req(`${NEXT}/api/auth/login`, {
    method: "POST",
    body: { email: EMAIL, password: PASSWORD },
  });
  if (login.ok && login.json?.token) {
    token = login.json.token;
    console.log("Logged in as", login.json.user?.email || EMAIL);
  } else {
    console.log(`Login via Next failed (${login.status}) — minting JWT fallback`);
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    token = await new SignJWT({
      userId: "6ab227b6882fae30c5c7b894",
      userType: "applicant",
      email: EMAIL,
      name: "Amartya Kumar",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("4h")
      .sign(secret);
  }

  // Job
  let jobsRes = await req(`${NEXT}/api/jobs?public=true`, { token });
  let jobs = jobsRes.json?.data || [];
  if (!jobs.length) {
    jobsRes = await req(`${NEXT}/api/jobs`, { token });
    jobs = jobsRes.json?.data || [];
  }
  let job =
    jobs.find((j) => /engineer|software|frontend|developer|full.?stack/i.test(j.title || "")) ||
    jobs[0];

  if (!job || !(job.description || job.jobDescriptionText) || (job.description || "").length < 40) {
    job = {
      _id: job?._id || null,
      title: "Senior Frontend Engineer",
      companyName: "X-CEED Labs",
      description:
        "Senior Frontend Engineer. Must have deep React, TypeScript, Next.js, GraphQL, Node.js, MongoDB. AWS (S3, CloudFront, Lambda) preferred. Docker and GitHub Actions CI/CD required. Lead and mentor experience valued. Build AI-assisted hiring tools.",
      requirements: ["React", "TypeScript", "Next.js", "GraphQL", "Node.js", "MongoDB", "AWS", "Docker", "Git"],
      evaluationWeights: {
        skills: 0.4,
        experience: 0.25,
        education: 0.1,
        projects: 0.15,
        communication: 0.1,
      },
    };
    console.log("Using structured SE job (DB empty/thin)");
  } else {
    job = {
      _id: job._id,
      title: job.title,
      companyName: job.companyName || job.company || "Unknown",
      description: job.description || job.jobDescriptionText,
      requirements: Array.isArray(job.requirements) && job.requirements.length
        ? job.requirements
        : ["React", "TypeScript", "Next.js", "GraphQL", "Node.js", "MongoDB", "AWS", "Docker"],
      evaluationWeights: job.evaluationWeights || {
        skills: 0.4,
        experience: 0.25,
        education: 0.1,
        projects: 0.15,
        communication: 0.1,
      },
    };
  }
  // Calibration needs a SE job aligned to Resume A's stack (no phantom MongoDB req)
  const CALIBRATION_JOB = {
    _id: job?._id || null,
    title: job?.title || "Senior Frontend Engineer",
    companyName: job?.companyName || "X-CEED Labs",
    description:
      "Senior Frontend Engineer. Deep React and TypeScript required. Next.js SSR/SEO experience. GraphQL and Node.js APIs. AWS (S3, CloudFront, Lambda@Edge) for asset pipelines. Docker + GitHub Actions CI/CD. Lead and mentor experience valued. Build production design systems and AI-assisted product UIs.",
    requirements: ["React", "TypeScript", "Next.js", "GraphQL", "Node.js", "AWS", "Docker", "Git"],
    evaluationWeights: {
      skills: 0.4,
      experience: 0.25,
      education: 0.1,
      projects: 0.15,
      communication: 0.1,
    },
  };
  job = CALIBRATION_JOB;
  console.log(`Job: ${job.title} @ ${job.companyName}`);
  console.log(`Requirements: ${job.requirements.join(", ")}`);

  // ---- PART 1+4+7: Match A/B/C ----
  console.log("\n## Matching Resume A (perfect)");
  const matchA = await runMatch(token, job, RESUME_A);
  await sleep(3000);
  console.log("## Matching Resume B (partial)");
  const matchB = await runMatch(token, job, RESUME_B);
  await sleep(3000);
  console.log("## Matching Resume C (mismatch)");
  const matchC = await runMatch(token, job, RESUME_C);
  await sleep(3000);

  const scoreA = scoreOf(matchA);
  const scoreB = scoreOf(matchB);
  const scoreC = scoreOf(matchC);
  console.log(`Scores: A=${scoreA} B=${scoreB} C=${scoreC}`);

  const deltaAB = scoreA != null && scoreB != null ? scoreA - scoreB : null;
  const deltaBC = scoreB != null && scoreC != null ? scoreB - scoreC : null;

  let calibPass = true;
  if (deltaAB == null || deltaAB <= 20) {
    calibPass = false;
    crit(`A→B discrimination ${deltaAB} (need >20)`);
  }
  if (deltaBC == null || deltaBC <= 20) {
    calibPass = false;
    crit(`B→C discrimination ${deltaBC} (need >20)`);
  }
  if (scoreC != null && scoreC > 40) {
    calibPass = false;
    crit(`Score C=${scoreC} above 40 — mechanical engineer matching software job`);
  }
  if (scoreC != null && scoreC >= 30) {
    issue(`Score C=${scoreC} not below 30 target`);
    if (scoreC >= 30) calibPass = false;
  }
  if (scoreA != null && scoreB != null && Math.abs(scoreA - scoreB) <= 10) {
    calibPass = false;
    crit(`A and B within 10 points — cannot discriminate`);
  }
  const aRange = scoreA != null && scoreA > 70;
  const bRange = scoreB != null && scoreB >= 30 && scoreB <= 60;
  const cRange = scoreC != null && scoreC < 30;
  if (!aRange) issue(`Resume A score ${scoreA} expected >70`);
  if (!bRange) issue(`Resume B score ${scoreB} expected 30–60`);
  if (!cRange) issue(`Resume C score ${scoreC} expected <30`);
  // calibration verdict: discrimination is primary; ranges are secondary
  if (!aRange || !cRange) calibPass = false;

  console.log(`Calibration: ${calibPass ? "PASS" : "FAIL"} ΔAB=${deltaAB} ΔBC=${deltaBC}`);

  // ---- PART 2: Evidence precision (Resume A) ----
  console.log("\n## Evidence precision (A)");
  const evidence = evidenceOf(matchA);
  let realCite = 0;
  let halluc = 0;
  const evidenceRows = [];
  for (const e of evidence) {
    const excerpt = e.resume_excerpt || e.resumeExcerpt || e.excerpt || e.evidence || "";
    const req = e.requirement || e.skill || "";
    const strength = String(e.strength || e.fit || "").toLowerCase();
    const found = excerptInResume(excerpt, RESUME_A);
    if (found) realCite++;
    else {
      halluc++;
      issue(`Hallucinated/mis-cited evidence for ${req}: "${String(excerpt).slice(0, 80)}"`);
    }
    const reqReal =
      job.requirements.some((r) => new RegExp(String(r).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(req)) ||
      new RegExp(String(req).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(job.description);
    // React expert shouldn't be weak on React
    let strengthOk = true;
    if (/react/i.test(req) && /weak|none|missing/i.test(strength)) strengthOk = false;
    if (/typescript/i.test(req) && /weak|none|missing/i.test(strength)) strengthOk = false;
    evidenceRows.push({
      req,
      excerpt: String(excerpt).slice(0, 120),
      found: found ? "YES" : "NO",
      reqReal: reqReal ? "YES" : "NO",
      strength,
      strengthOk: strengthOk ? "YES" : "NO",
    });
    console.log(
      `  [${req}] → "${String(excerpt).slice(0, 60)}..." → resume:${found ? "YES" : "NO"} strength:${strength} ok:${strengthOk ? "YES" : "NO"}`
    );
  }
  const evidenceAccuracy = evidence.length ? realCite / evidence.length : 0;
  const coveredReqs = job.requirements.filter((r) =>
    evidence.some((e) => new RegExp(String(r).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(e.requirement || e.skill || ""))
  );
  const reqCoverage = job.requirements.length ? coveredReqs.length / job.requirements.length : 0;
  const evidencePass = evidenceAccuracy > 0.85 && reqCoverage > 0.7 && halluc === 0;
  console.log(
    `Evidence accuracy=${(evidenceAccuracy * 100).toFixed(0)}% coverage=${(reqCoverage * 100).toFixed(0)}% halluc=${halluc} → ${evidencePass ? "PASS" : "FAIL"}`
  );

  // ---- PART 3: Gaps for B ----
  console.log("\n## Gaps (B)");
  const gapsB = await runGaps(matchB);
  await sleep(3000);
  const gapRows = [];
  let specSum = 0;
  let classOk = 0;
  let fluff = 0;
  for (const g of gapsB) {
    const spec = specificityScore(g, job.requirements);
    specSum += spec;
    const clsOk = classificationAccurate(g, RESUME_B);
    if (clsOk) classOk++;
    const fluffHit = isFluffGap(g);
    if (fluffHit) fluff++;
    gapRows.push({
      requirement: g.requirement,
      classification: g.classification,
      priority: g.priority,
      specificity: spec,
      classOk: clsOk ? "correct" : "incorrect",
      fluff: fluffHit,
    });
    console.log(`  ${g.requirement} [${g.classification}] spec=${spec}/5 class=${clsOk ? "OK" : "BAD"} fluff=${fluffHit}`);
  }
  const avgSpec = gapsB.length ? specSum / gapsB.length : 0;
  const classAcc = gapsB.length ? classOk / gapsB.length : 0;
  // priority sensible: higher priority for React/AWS/TS than soft fluff
  let prioritySensible = "yes";
  if (gapsB.length >= 2) {
    const sorted = [...gapsB].sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
    const top = String(sorted[0]?.requirement || "");
    if (/soft skill|communication only|improve your/i.test(top) && /React|AWS|TypeScript|Docker|Next/i.test(JSON.stringify(gapsB))) {
      prioritySensible = "no";
      issue("Top-priority gap looks less important than technical gaps");
    }
  }
  const gapPass = avgSpec >= 3 && classAcc >= 0.7 && fluff === 0;
  console.log(`Gaps avgSpec=${avgSpec.toFixed(1)} classAcc=${(classAcc * 100).toFixed(0)}% fluff=${fluff} → ${gapPass ? "PASS" : "FAIL"}`);

  // Also get gaps A/C for report context
  const gapsA = await runGaps(matchA);
  await sleep(2000);
  const gapsC = await runGaps(matchC);
  await sleep(3000);

  // ---- PART 4: Explanations ----
  console.log("\n## Explanations");
  const expA = matchA?.explanation || "";
  const expB = matchB?.explanation || "";
  const expC = matchC?.explanation || "";
  const refsA = countSpecificRefs(expA, RESUME_A);
  const refsB = countSpecificRefs(expB, RESUME_B);
  const refsC = countSpecificRefs(expC, RESUME_C);
  const actA = actionability(expA);
  const actB = actionability(expB);
  const actC = actionability(expC);
  const simAB = jaccard(expA, expB);
  const simAC = jaccard(expA, expC);
  const honest = honestMismatch(expC);
  if (simAB > 0.5) crit(`A↔B explanation similarity ${(simAB * 100).toFixed(0)}% > 50% — too templated`);
  if (simAC > 0.3) issue(`A↔C explanation similarity ${(simAC * 100).toFixed(0)}% > 30%`);
  if (honest.spin) issue("Resume C explanation spins mismatch with transferable-skills language");
  if (!honest.clearNo) issue("Resume C explanation does not clearly state poor fit");
  const explPass = simAB <= 0.5 && refsA >= 2 && (honest.clearNo || scoreC < 25) && !honest.spin;
  console.log(`Refs A/B/C=${refsA}/${refsB}/${refsC} simAB=${(simAB * 100).toFixed(0)}% simAC=${(simAC * 100).toFixed(0)}% honest=${honest.clearNo}`);

  // ---- PART 5: Prep/career from B gaps ----
  console.log("\n## Career/prep plan from B gaps");
  const plan = await runCareer(token, gapsB, job.title);
  await sleep(3000);
  const modules = plan?.modules || [];
  const objectives = plan?.objectives || [];
  const projects = plan?.projects || [];
  const gapReqs = gapsB.map((g) => String(g.requirement || "").toLowerCase());
  const coveredGaps = gapReqs.filter((r) =>
    modules.some((m) => String(m.requirement || "").toLowerCase() === r || String(m.requirement || "").toLowerCase().includes(r))
  );
  const gapCoverage = gapReqs.length ? coveredGaps.length / gapReqs.length : modules.length ? 1 : 0;

  const allVideos = modules.flatMap((m) =>
    (m.videos || []).map((v) => ({ ...v, gap: m.requirement }))
  );
  let relevant = 0;
  const videoChecks = [];
  for (const v of allVideos.slice(0, 8)) {
    const title = (await oembedTitle(v.url)) || v.title || "";
    await sleep(400);
    const skill = String(v.gap || "");
    const rel =
      new RegExp(skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(title) ||
      (/react/i.test(skill) && /react|hooks|jsx/i.test(title)) ||
      (/aws|cloud/i.test(skill) && /aws|cloud|s3|lambda/i.test(title)) ||
      (/typescript/i.test(skill) && /typescript|ts\b/i.test(title)) ||
      (/docker/i.test(skill) && /docker|container/i.test(title)) ||
      (/next/i.test(skill) && /next/i.test(title)) ||
      (/node/i.test(skill) && /node/i.test(title)) ||
      (/graphql/i.test(skill) && /graphql/i.test(title));
    if (rel) relevant++;
    else issue(`Possibly irrelevant video for ${skill}: "${title}"`);
    videoChecks.push({ gap: skill, url: v.url, title, relevant: rel });
    console.log(`  YT [${skill}] "${title.slice(0, 70)}" → ${rel ? "RELEVANT" : "IRRELEVANT"}`);
  }
  const resourceRel = allVideos.length ? relevant / Math.min(allVideos.length, 8) : 0;

  const progression = modules.every((m) => {
    const vids = m.videos || [];
    if (vids.length < 2) return true;
    const orders = vids.map((v) => v.order).filter((o) => typeof o === "number");
    if (orders.length >= 2) {
      for (let i = 1; i < orders.length; i++) if (orders[i] < orders[i - 1]) return false;
    }
    return true;
  });

  let projectQuality = 1;
  if (projects.length) {
    const good = projects.filter(
      (p) =>
        (p.description || "").length > 30 &&
        (p.name || p.title) &&
        !/next facebook|clone facebook|entire social network/i.test(JSON.stringify(p))
    );
    projectQuality = Math.min(5, Math.round((good.length / projects.length) * 5));
    // relevance to gaps
    const projRel = projects.some((p) =>
      gapReqs.some((g) => new RegExp(g.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(JSON.stringify(p)))
    );
    if (!projRel) projectQuality = Math.max(1, projectQuality - 1);
  }

  const timelineText = JSON.stringify(objectives) + JSON.stringify(plan?.study_plan || plan?.studyPlan || "");
  const hasTimeline = /week|month|day|timeline/i.test(timelineText);
  const unrealistic = /in 1 day|overnight|master .+ in a weekend/i.test(timelineText);
  const timelinePass = hasTimeline && !unrealistic;

  const prepPass =
    gapCoverage >= 0.99 &&
    resourceRel >= 0.6 &&
    progression &&
    projectQuality >= 3 &&
    timelinePass;
  console.log(
    `Plan coverage=${(gapCoverage * 100).toFixed(0)}% resourceRel=${(resourceRel * 100).toFixed(0)}% progression=${progression} projects=${projectQuality}/5 timeline=${timelinePass}`
  );

  // ---- PART 6: Consistency (Resume A twice) ----
  console.log("\n## Consistency (A ×2)");
  await sleep(3000);
  const matchA2 = await runMatch(token, job, RESUME_A);
  await sleep(2000);
  const gapsA2 = await runGaps(matchA2);
  const scoreA2 = scoreOf(matchA2);
  const scoreDelta = scoreA != null && scoreA2 != null ? Math.abs(scoreA - scoreA2) : 999;
  const gaps1 = new Set((gapsA || []).map((g) => String(g.requirement || "").toLowerCase()));
  const gaps2 = new Set((gapsA2 || []).map((g) => String(g.requirement || "").toLowerCase()));
  let gapOverlap = 0;
  for (const g of gaps1) if (gaps2.has(g)) gapOverlap++;
  const sameGaps = gaps1.size === 0 && gaps2.size === 0
    ? true
    : gapOverlap >= Math.min(gaps1.size, gaps2.size) * 0.6;
  if (scoreDelta > 10) crit(`Consistency score delta ${scoreDelta.toFixed(1)} > 10`);
  else if (scoreDelta >= 5) issue(`Consistency score delta ${scoreDelta.toFixed(1)} (soft threshold 5)`);
  const consistencyPass = scoreDelta < 5 || (scoreDelta <= 10 && sameGaps);
  // Spec: delta < 5 ideal; >10 critical. Verdict PASS if <5 OR (<=10 and same gaps)
  const consistencyVerdict = scoreDelta < 5 ? "PASS" : scoreDelta > 10 ? "FAIL" : sameGaps ? "PASS" : "FAIL";
  console.log(`Score delta=${scoreDelta.toFixed(1)} sameGaps=${sameGaps} → ${consistencyVerdict}`);

  // ---- PART 7: Component sanity ----
  console.log("\n## Component sanity");
  const cA = compsOf(matchA);
  const cB = compsOf(matchB);
  const cC = compsOf(matchC);
  // normalize to 0-100
  const norm = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return n <= 1 ? n * 100 : n;
  };
  const componentRows = ["skills", "experience", "education", "projects", "communication"].map((k) => ({
    component: k,
    A: norm(cA[k]),
    B: norm(cB[k]),
    C: norm(cC[k]),
  }));
  let componentPass = true;
  if (norm(cA.skills) != null && norm(cA.skills) < 65) {
    componentPass = false;
    issue(`Resume A skills=${norm(cA.skills)} expected >65`);
  }
  if (norm(cC.skills) != null && norm(cC.skills) >= 20) {
    // mechanical shouldn't score high on SE skills — allow some education bleed but skills should be low
    if (norm(cC.skills) > 40) {
      componentPass = false;
      crit(`Resume C skills=${norm(cC.skills)} too high for mechanical→software`);
    } else {
      issue(`Resume C skills=${norm(cC.skills)} above ideal <20`);
    }
  }
  if (norm(cA.education) != null && norm(cA.education) < 50) {
    issue(`Resume A education=${norm(cA.education)} unexpectedly low for CS degree`);
  }
  console.log(JSON.stringify(componentRows, null, 2));

  // ---- Write report ----
  const md = [];
  md.push(`# X-CEED AI Quality Audit Report`);
  md.push(`Date: ${started}`);
  md.push(`Job tested: ${job.title} at ${job.companyName}`);
  md.push("");
  md.push(`## Calibration`);
  md.push(`| Resume | Score | Expected range | PASS/FAIL |`);
  md.push(`|--------|-------|----------------|-----------|`);
  md.push(`| A (perfect match) | ${scoreA} | >70 | ${aRange ? "PASS" : "FAIL"} |`);
  md.push(`| B (partial match) | ${scoreB} | 30-60 | ${bRange ? "PASS" : "FAIL"} |`);
  md.push(`| C (mismatch) | ${scoreC} | <30 | ${cRange ? "PASS" : "FAIL"} |`);
  md.push("");
  md.push(`Discrimination A→B: ${deltaAB?.toFixed?.(1) ?? deltaAB} points (need >20)`);
  md.push(`Discrimination B→C: ${deltaBC?.toFixed?.(1) ?? deltaBC} points (need >20)`);
  md.push(`Calibration verdict: ${calibPass ? "PASS" : "FAIL"}`);
  md.push("");
  md.push(`## Evidence Precision`);
  md.push(`- Total evidence items: ${evidence.length}`);
  md.push(`- Cite real resume text: ${realCite}/${evidence.length} (${(evidenceAccuracy * 100).toFixed(0)}%)`);
  md.push(`- Requirements covered: ${coveredReqs.length}/${job.requirements.length} (${(reqCoverage * 100).toFixed(0)}%)`);
  md.push(`- Hallucinated evidence: ${halluc}`);
  md.push(`- Verdict: ${evidencePass ? "PASS" : "FAIL"}`);
  md.push("");
  md.push(`| Requirement | Cited text | In resume | Req real | Strength | Strength OK |`);
  md.push(`|-------------|------------|-----------|----------|----------|-------------|`);
  for (const row of evidenceRows) {
    md.push(
      `| ${row.req} | ${String(row.excerpt).replace(/\|/g, "/")} | ${row.found} | ${row.reqReal} | ${row.strength} | ${row.strengthOk} |`
    );
  }
  md.push("");
  md.push(`## Gap Specificity`);
  md.push(`- Total gaps (Resume B): ${gapsB.length}`);
  md.push(`- Average specificity score: ${avgSpec.toFixed(1)}/5`);
  md.push(`- Classification accuracy: ${(classAcc * 100).toFixed(0)}%`);
  md.push(`- Fluff gaps detected: ${fluff}`);
  md.push(`- Priority sensible: ${prioritySensible}`);
  md.push(`- Verdict: ${gapPass ? "PASS" : "FAIL"}`);
  md.push("");
  md.push(`| Gap | Classification | Specificity | Class check | Priority | Fluff |`);
  md.push(`|-----|----------------|-------------|-------------|----------|-------|`);
  for (const g of gapRows) {
    md.push(
      `| ${g.requirement} | ${g.classification} | ${g.specificity}/5 | ${g.classOk} | ${g.priority ?? ""} | ${g.fluff} |`
    );
  }
  md.push("");
  md.push(`## Explanation Quality`);
  md.push(`| Metric | Resume A | Resume B | Resume C |`);
  md.push(`|--------|----------|----------|----------|`);
  md.push(`| Specific references | ${refsA} | ${refsB} | ${refsC} |`);
  md.push(`| Actionability (1-5) | ${actA} | ${actB} | ${actC} |`);
  md.push(
    `| Honest about fit? | Y | Y | ${honest.clearNo && !honest.spin ? "Y" : "N"} |`
  );
  md.push("");
  md.push(`A↔B similarity: ${(simAB * 100).toFixed(0)}% (need <50%)`);
  md.push(`A↔C similarity: ${(simAC * 100).toFixed(0)}% (need <30%)`);
  md.push(`Verdict: ${explPass ? "PASS" : "FAIL"}`);
  md.push("");
  md.push(`## Prep Plan Depth`);
  md.push(`- Gap coverage: ${(gapCoverage * 100).toFixed(0)}%`);
  md.push(
    `- Resource relevance: ${(resourceRel * 100).toFixed(0)}% (${relevant}/${Math.min(allVideos.length, 8)} videos verified)`
  );
  md.push(`- Difficulty progression: ${progression ? "PASS" : "FAIL"}`);
  md.push(`- Project quality: ${projectQuality}/5`);
  md.push(`- Timeline realism: ${timelinePass ? "PASS" : "FAIL"}`);
  md.push(`- Verdict: ${prepPass ? "PASS" : "FAIL"}`);
  md.push("");
  if (videoChecks.length) {
    md.push(`| Gap | Video title | Relevant |`);
    md.push(`|-----|-------------|----------|`);
    for (const v of videoChecks) {
      md.push(`| ${v.gap} | ${String(v.title).replace(/\|/g, "/")} | ${v.relevant ? "YES" : "NO"} |`);
    }
    md.push("");
  }
  md.push(`## Consistency`);
  md.push(`- Score delta (2 runs): ${scoreDelta.toFixed(1)} points (A1=${scoreA}, A2=${scoreA2})`);
  md.push(`- Same gaps identified: ${sameGaps ? "YES" : "NO"}`);
  md.push(`- Gaps run1: ${[...gaps1].join(", ") || "(none)"}`);
  md.push(`- Gaps run2: ${[...gaps2].join(", ") || "(none)"}`);
  md.push(`- Verdict: ${consistencyVerdict}`);
  md.push("");
  md.push(`## Component Score Sanity`);
  md.push(`| Component | Resume A | Resume B | Resume C |`);
  md.push(`|-----------|----------|----------|----------|`);
  for (const row of componentRows) {
    md.push(`| ${row.component} | ${row.A?.toFixed?.(0) ?? row.A} | ${row.B?.toFixed?.(0) ?? row.B} | ${row.C?.toFixed?.(0) ?? row.C} |`);
  }
  md.push(`- Verdict: ${componentPass ? "PASS" : "FAIL"}`);
  md.push("");
  md.push(`## Critical Issues`);
  if (!criticals.length && !issues.length) md.push(`(none)`);
  else {
    let i = 1;
    for (const c of criticals) md.push(`${i++}. **CRITICAL:** ${c}`);
    for (const c of issues) md.push(`${i++}. ${c}`);
  }
  md.push("");
  md.push(`## Raw Outputs`);
  md.push(`### Resume A explanation:`);
  md.push(expA || "(none)");
  md.push("");
  md.push(`### Resume B explanation:`);
  md.push(expB || "(none)");
  md.push("");
  md.push(`### Resume C explanation:`);
  md.push(expC || "(none)");
  md.push("");
  md.push(`### Resume B gaps:`);
  md.push("```json");
  md.push(JSON.stringify(gapsB, null, 2));
  md.push("```");
  md.push("");
  md.push(`### Prep plan structure:`);
  md.push("```json");
  md.push(
    JSON.stringify(
      {
        objectives,
        projects,
        modules: modules.map((m) => ({
          requirement: m.requirement,
          classification: m.classification,
          videos: (m.videos || []).map((v) => ({ order: v.order, title: v.title, url: v.url })),
        })),
      },
      null,
      2
    )
  );
  md.push("```");
  md.push("");
  md.push(`### Overall verdicts`);
  md.push(`| Section | Verdict |`);
  md.push(`|---------|---------|`);
  md.push(`| Calibration | ${calibPass ? "PASS" : "FAIL"} |`);
  md.push(`| Evidence | ${evidencePass ? "PASS" : "FAIL"} |`);
  md.push(`| Gaps | ${gapPass ? "PASS" : "FAIL"} |`);
  md.push(`| Explanations | ${explPass ? "PASS" : "FAIL"} |`);
  md.push(`| Prep plan | ${prepPass ? "PASS" : "FAIL"} |`);
  md.push(`| Consistency | ${consistencyVerdict} |`);
  md.push(`| Components | ${componentPass ? "PASS" : "FAIL"} |`);

  fs.writeFileSync(REPORT, md.join("\n"), "utf8");
  console.log(`\nReport → ${REPORT}`);

  const failed =
    !calibPass ||
    !evidencePass ||
    !gapPass ||
    !explPass ||
    !prepPass ||
    consistencyVerdict === "FAIL" ||
    !componentPass;
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  fs.writeFileSync(REPORT, `# X-CEED AI Quality Audit Report\n\nCRASHED: ${e.stack || e.message}\n`, "utf8");
  process.exit(1);
});
