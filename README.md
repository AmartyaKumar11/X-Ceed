# X-CEED

<p align="center">
  <strong>Evidence-backed AI recruitment</strong> — weighted matching, grounded explanations, and a path from gap → career plan.
</p>

<p align="center">
  <a href="https://x-ceed.vercel.app"><img src="https://img.shields.io/badge/Live-x--ceed.vercel.app-000?style=for-the-badge&logo=vercel&logoColor=white" alt="Live demo" /></a>
  <a href="https://ai-core-production-2826.up.railway.app/health"><img src="https://img.shields.io/badge/AI%20Core-Railway-0B0D0E?style=for-the-badge&logo=railway&logoColor=white" alt="AI Core" /></a>
  <a href="https://github.com/AmartyaKumar11/X-Ceed/actions/workflows/sync-jobs.yml"><img src="https://img.shields.io/badge/Jobs%20Sync-GitHub%20Actions-2088FF?style=for-the-badge&logo=githubactions&logoColor=white" alt="Job sync" /></a>
</p>

<p align="center">
  <a href="https://x-ceed.vercel.app">Live App</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#tech-stack">Tech Stack</a> ·
  <a href="#getting-started">Getting Started</a> ·
  <a href="#verification">Verification</a>
</p>

---

## What it is

X-CEED is a full-stack job portal for **recruiters** and **candidates** with an AI layer that refuses score-only matching.

| Role | What you get |
|------|----------------|
| **Recruiter** | Weighted evaluation, shortlists, evidence-backed explanations, GraphQL dashboard |
| **Candidate** | Resume↔job match, gaps you can act on, career plans, mock interviews, quizzes, aggregated remote jobs |

**Live:** [https://x-ceed.vercel.app](https://x-ceed.vercel.app)

---

## Why it exists

Most “AI hiring” tools are either keyword ATS or one opaque prompt. X-CEED is built around a stricter contract:

1. **Overall + component scores** (skills, experience, education, projects, communication)
2. **Evidence** — requirement → resume excerpt → strength
3. **Gaps** — named requirements (`missing` / `weak` / `under-evidenced`)
4. **Explanation** grounded in the resume, not HR filler

Judgment and generation are split on purpose: **TypeSafe Jev** for typed decisions, **DeepSeek** for prose.

---

## Features

- **Explainable match** — scores, evidence, gaps, weights per job  
- **Career plans** — objectives, projects, modules, curated videos (quota-aware)  
- **Adaptive mock interviews & quizzes** — AI Support service  
- **Job aggregation** — Remotive + Jobicy synced into Mongo every 6h (GitHub Actions)  
- **GraphQL reads** — recruiter/candidate dashboards over shared JWT auth  

---

## Architecture

```
Browser
  └─ Next.js 15 (Vercel)
        ├─ REST — auth, jobs, uploads, match proxies
        ├─ GraphQL — dashboard reads (JWT)
        └─ Job sync cron → aggregated_jobs
              │
      ┌───────┴────────┐
      ▼                ▼
 AI Core (Railway)   AI Support (Railway)
 LangGraph + Jev     Quiz · Mock · Video
 DeepSeek prose      YouTube curation
 Mongo ai_cache
```

| Service | Host | Role |
|---------|------|------|
| Web | Vercel | Next.js 15 app + API routes |
| AI Core | Railway | Match / analyze / career / extract |
| AI Support | Railway | Quiz, mock interview, video notes |

---

## Tech stack

<p align="center">
  <img src="https://cdn.simpleicons.org/nextdotjs/000000" height="28" alt="Next.js" />&nbsp;&nbsp;
  <img src="https://cdn.simpleicons.org/react/61DAFB" height="28" alt="React" />&nbsp;&nbsp;
  <img src="https://cdn.simpleicons.org/typescript/3178C6" height="28" alt="TypeScript" />&nbsp;&nbsp;
  <img src="https://cdn.simpleicons.org/python/3776AB" height="28" alt="Python" />&nbsp;&nbsp;
  <img src="https://cdn.simpleicons.org/fastapi/009688" height="28" alt="FastAPI" />&nbsp;&nbsp;
  <img src="https://cdn.simpleicons.org/langchain/1C3C3C" height="28" alt="LangChain / LangGraph" />&nbsp;&nbsp;
  <img src="https://cdn.simpleicons.org/mongodb/47A248" height="28" alt="MongoDB" />&nbsp;&nbsp;
  <img src="https://cdn.simpleicons.org/graphql/E10098" height="28" alt="GraphQL" />&nbsp;&nbsp;
  <img src="https://cdn.simpleicons.org/apollographql/311C87" height="28" alt="Apollo" />&nbsp;&nbsp;
  <img src="https://cdn.simpleicons.org/vercel/000000" height="28" alt="Vercel" />&nbsp;&nbsp;
  <img src="https://cdn.simpleicons.org/railway/0B0D0E" height="28" alt="Railway" />&nbsp;&nbsp;
  <img src="https://cdn.simpleicons.org/docker/2496ED" height="28" alt="Docker" />&nbsp;&nbsp;
  <img src="https://cdn.simpleicons.org/youtube/FF0000" height="28" alt="YouTube" />
</p>

| Layer | Tech |
|-------|------|
| Frontend | Next.js 15, React 19, Tailwind, Framer Motion |
| API | Next.js Routes, Apollo GraphQL |
| AI Core | FastAPI, LangGraph, LangChain, TypeSafe Jev, DeepSeek |
| AI Support | FastAPI, DeepSeek, YouTube Data API |
| Data | MongoDB Atlas (`jobs`, `aggregated_jobs`, `ai_cache`, …) |
| Deploy | Vercel · Railway · Docker · GitHub Actions |

---

## Getting started

```bash
npm install
npm run setup:python
cp .env.example .env.local   # never commit secrets
npm run dev:full             # :3002 Next · :8000 Core · :8001 Support
```

**Required env (high level):** `MONGODB_URI`, `JWT_SECRET`, `DEEPSEEK_API_KEY`, `TYPESAFE_API_KEY`, `YOUTUBE_API_KEY`, `NEXT_PUBLIC_AI_CORE_URL`, `NEXT_PUBLIC_AI_SUPPORT_URL`, `JOB_SYNC_SECRET`

Full ops notes: [`X-CEED_MASTER_DEPLOY_BIBLE.md`](./X-CEED_MASTER_DEPLOY_BIBLE.md)

---

## Key design decisions

| Decision | Chose | Rejected | Why |
|----------|-------|----------|-----|
| Scoring | Jev judgments + DeepSeek prose | One LLM for everything | Auditable numbers vs fluent text |
| Orchestration | LangGraph in AI Core only | Graphs everywhere | State where it earns complexity |
| API | REST writes + GraphQL reads | GraphQL for all mutations | Simple writes, typed nested reads |
| Deploy | Vercel + 2 Railway services | Monolith | Independent scale & failure domains |
| Evidence | requirement → excerpt → strength | Score-only UX | Force grounding or fail audits |
| External jobs | Remotive + Jobicy → `aggregated_jobs` | Empty board for new users | Always something to match against |

---

## Verification

```bash
# Live production (no localhost, no mocked AI)
node scripts/production-smoke-test.mjs

# Local pipeline / quality
node scripts/e2e-pipeline-test.mjs
node scripts/quality-audit.mjs

# Refresh aggregated jobs (needs JOB_SYNC_SECRET)
node scripts/sync-jobs.mjs
# or: GitHub Actions → Sync External Jobs → Run workflow
```

Latest smoke report: [`scripts/production-test-report.md`](./scripts/production-test-report.md)

---

## Project links

| | |
|--|--|
| Production | https://x-ceed.vercel.app |
| AI Core health | https://ai-core-production-2826.up.railway.app/health |
| AI Support health | https://ai-support-production-81a3.up.railway.app/health |
| Job sync workflow | [Actions → Sync External Jobs](https://github.com/AmartyaKumar11/X-Ceed/actions/workflows/sync-jobs.yml) |

---

## Author

Built by [Amartya Kumar](https://github.com/AmartyaKumar11) — AI full-stack systems where the match loop is **interrogable**, not decorative.

---

<p align="center">
  <sub>Match → evidence → gap → action. Everything else is scaffolding.</sub>
</p>
