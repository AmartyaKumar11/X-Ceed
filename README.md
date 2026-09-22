# X-CEED

**AI-powered recruitment intelligence and career enablement.**

X-CEED is not a generic job board with a chatbot bolted on. It is a production system that **scores candidates against real job requirements with evidence**, explains *why*, surfaces skill gaps, and turns those gaps into career plans, mock interviews, quizzes, and curated learning — with a clear split between **decision models** (typed, calibrated) and **generation models** (text).

| | |
|---|---|
| **Live app** | https://x-ceed.vercel.app |
| **AI Core** | https://ai-core-production-2826.up.railway.app |
| **AI Support** | https://ai-support-production-81a3.up.railway.app |
| **Stack** | Next.js 15 · FastAPI · LangGraph · MongoDB Atlas · GraphQL · Vercel + Railway |

---

## Who this README is for

You are likely evaluating this as an **AI / ML / platform engineer** (or a hiring manager for those roles). This document answers the questions those interviews actually ask:

1. What problem does the system solve, and where does AI sit in the critical path?
2. How are models chosen — and what is *not* solved with an LLM?
3. How do we reduce hallucination and black-box scores?
4. What is the architecture in production (latency, failure modes, deploy topology)?
5. How do you verify it works end-to-end without mocks on AI paths?

If you only skim one section, read **[The AI thesis](#the-ai-thesis)** and **[Matching pipeline](#matching-pipeline-ai-core)**.

---

## The AI thesis

Most “AI recruiting” products do one of two things:

- Dump a resume + JD into a chat model and ask for a score (opaque, unstable, hard to audit).
- Keyword-match skills and call it ML (brittle, gameable, no explanation).

X-CEED does neither.

**Decisions that need calibration and typing** (fit levels, gap classes, requirement bars) go through **Jev (TypeSafe)** — System-1 style primitives: `choice`, `score`, `noul`. Outputs are structured. No “parse the JSON and hope.”

**Language that needs to be written** (explanations, interview questions, quiz items, career narratives) goes through **DeepSeek** (and related OpenRouter keys where configured).

**Retrieval / grounding** pulls from the candidate’s own resume text and job requirements. Match **evidence** is tied to `requirement → resume_excerpt → strength`. Explanations that do not cite resume skills fail our quality audits.

That separation is intentional: **cheap, typed decisions** where a wrong number hurts trust; **generative text** where fluency matters.

---

## Product surfaces

### For recruiters

- Configurable **evaluation weights** (skills / experience / education / projects / communication).
- **AI Core shortlist** with live match scores and evidence-backed explanations.
- Job CRUD, applications, GraphQL **recruiter dashboard** (stats, jobs, shortlist reads).
- Outreach generation grounded in match context (via AI Core chat).

### For candidates

- Resume ↔ job **match** with component scores + evidence + gaps.
- **Career plans** from gaps (objectives, projects, modules; YouTube where quota allows).
- **Mock interviews** (adaptive questions + scored analysis).
- **Quizzes** (unique generation + submit with weak-area feedback).
- Video notes / AI assistant over transcripts (AI Support).
- Optional **EduChain** learning bets (client-side wagmi + RainbowKit — no backend chain service).

---

## Architecture (production)

```
┌──────────────────────────── Vercel ────────────────────────────┐
│  Next.js 15 (App Router) + React 19                            │
│  • Marketing + dashboards                                      │
│  • REST: auth, jobs, upload, resume-match proxy, career-plan   │
│  • GraphQL gateway: /api/graphql (Apollo, same-origin)         │
└───────────────┬────────────────────────────┬───────────────────┘
                │                            │
                ▼                            ▼
┌──────────────────────┐      ┌──────────────────────────┐
│ Railway: AI Core     │      │ Railway: AI Support      │
│ FastAPI · :8000      │      │ FastAPI · :8001          │
│ LangGraph pipelines  │      │ Stateless request/resp   │
│ Jev + DeepSeek       │      │ DeepSeek (+ YouTube API) │
│ Mongo cache / RAG    │      │ Quiz · Mock · Video · YT │
└──────────┬───────────┘      └────────────┬─────────────┘
           └──────────────┬────────────────┘
                          ▼
                    MongoDB Atlas
```

**Design choices worth calling out in an interview:**

| Choice | Why |
|--------|-----|
| GraphQL inside Next, not a separate service | Same origin, shared JWT/Mongo, simpler ops |
| LangGraph only in AI Core | Support endpoints are single-shot; graph overhead is wrong there |
| Blockchain client-side only | No server holding keys; RainbowKit talks EduChain testnet |
| REST for mutations, GraphQL for dashboard reads | Clear write path; typed read models for UI |
| Two Railway services | Independent scale/deploy; Core is heavier (LangGraph + Jev) |

Dockerfiles: `Dockerfile.ai-core`, `Dockerfile.ai-support`.

---

## Matching pipeline (AI Core)

Primary production path:

1. **Analyze** resume text → structured candidate profile (`POST /analyze`).
2. **Match** profile ↔ job requirements + optional weights (`POST /match`).
3. **Gap** classification on the match result (`POST /gap`).
4. **Career plan** from gaps (`POST /career-plan`).

Next.js proxies common UX flows (e.g. `/api/resume-match/analyze`, `/api/career-plan/generate`) so the browser hits Vercel with a JWT; Vercel calls Railway with server-side env URLs.

### What a match response must contain

We treat these as **product contracts**, not nice-to-haves:

- `overallScore` / `overall_score` ∈ `[0, 100]`
- `componentScores` for all five: skills, experience, education, projects, communication
- Non-empty **evidence**: each item has requirement + resume excerpt + strength
- Non-empty **gaps** when the fit is imperfect (expected for real JDs)
- **Explanation** long enough to be useful and grounded in resume skills

Domain-aware scoring dampens obvious mismatches (e.g. mechanical-only resume vs software SE JD) so scores are not flat or universally “everyone is an 85.”

### Caching

Mongo `ai_cache` keys such as `match:v3` and YouTube skill caches reduce cost and quota burn. Cache version bumps force recalibration after scoring changes.

---

## Model stack (interview-ready)

| Tier | Model | Role | Typical use |
|------|--------|------|-------------|
| 1 | **Jev (TypeSafe)** | Typed decisions + calibrated probs | Requirement fit, gap class, priority, quality gates |
| 2 | **DeepSeek** | Text generation | Explanations, interview Qs, quizzes, plans |
| 3 | **YouTube Data API** | Retrieval | Curated learning videos per skill/gap |

**Why not one model for everything?**

- A single LLM score is hard to regress-test and easy to game with prompt fluff.
- Typed Jev outputs plug into scoring math without brittle JSON parsing.
- Generative models stay where prose quality matters.

Keys: `TYPESAFE_API_KEY`, `DEEPSEEK_API_KEY`, `YOUTUBE_API_KEY` (plus OpenRouter keys for some Support features).

---

## AI Support service

Stateless FastAPI app (`xceed_ai_support.py`):

| Endpoint family | Purpose |
|-----------------|--------|
| `/quiz/generate`, `/quiz/submit` | Unique quizzes + scored feedback |
| `/mock-interview/question`, `/analyze`, `/report` | Adaptive interview loop |
| `/video/notes`, `/transcript`, `/chat`, `/clips` | Video learning assistant |
| `/youtube/curate` | Skill → YouTube list (quota-sensitive) |
| `/parse-job-description` | JD ingestion helper |

YouTube free-tier quota is a known operational constraint (`search.list` is expensive). The system caches aggressively and degrades gracefully (warnings in smoke tests rather than hard failure when quota is exhausted).

---

## Auth, GraphQL, and security posture

- JWT auth (`/api/auth/login`, cookie + `Authorization: Bearer`).
- Sensitive App Router routes use `authMiddleware` and return **401** when unauthenticated (upload, RAG analyze, shortlist).
- Debug/test dump routes are removed (expect **404**).
- GraphQL enforces auth; `recruiterDashboard` requires recruiter role; applicants get a role error (by design).
- CORS on Railway allows the production Vercel origin (`FRONTEND_URL`).

We do **not** claim “secure because AI.” Security here is boring middleware, deleted debug routes, and production smoke checks that fail if sensitive endpoints answer without a token.

---

## Repository map

```
src/app/                  Next App Router (UI + some API routes)
src/pages/api/            Pages API (auth, jobs, graphql, resume-match, …)
src/lib/                  Shared auth, Mongo, PDF extract, weights
services/python/          AI Core + AI Support FastAPI apps
Dockerfile.ai-core        Production image for matching / LangGraph
Dockerfile.ai-support     Production image for quiz / mock / video
scripts/                  E2E + production smoke + quality audits
X-CEED_MASTER_DEPLOY_BIBLE.md   Deep deploy / agent reference
```

---

## Local development

### Prerequisites

- Node.js 18+ (20+ recommended)
- Python 3.11+
- MongoDB Atlas (or local Mongo)
- API keys: DeepSeek, TypeSafe (Jev), optional YouTube / OpenRouter / Firebase

### Setup

```bash
npm install
npm run setup:python          # pip install both requirements files
cp .env.example .env.local    # fill secrets — never commit .env.local
```

### Run everything

```bash
npm run dev:full
# Next.js  → http://localhost:3002
# AI Core  → http://localhost:8000/health
# Support  → http://localhost:8001/health
```

Or separately:

```bash
npm run ai-core
npm run ai-support
npm run dev
```

### Environment (high level)

**Vercel / Next**

- `MONGODB_URI`, `JWT_SECRET`
- `NEXT_PUBLIC_AI_CORE_URL`, `NEXT_PUBLIC_AI_SUPPORT_URL`
- Firebase `NEXT_PUBLIC_*` as needed
- `NEXT_PUBLIC_BASE_URL`

**Railway AI Core**

- `DEEPSEEK_API_KEY`, `TYPESAFE_API_KEY`, `MONGODB_URI`, `YOUTUBE_API_KEY`
- `FRONTEND_URL=https://x-ceed.vercel.app`

**Railway AI Support**

- `DEEPSEEK_API_KEY`, `MONGODB_URI`, `YOUTUBE_API_KEY`, OpenRouter keys as used
- `FRONTEND_URL=https://x-ceed.vercel.app`

See `.env.example` and `X-CEED_MASTER_DEPLOY_BIBLE.md` §9 for the full matrix.

---

## Verification (no mocks on AI paths)

### Production smoke (live URLs)

```bash
node scripts/production-smoke-test.mjs
```

Hits **only** production:

- Infra health (Vercel + both Railway `/health` + login + GraphQL)
- Auth / security (401s, deleted debug routes)
- Full match → gap → career-plan against a live job
- Mock interview, quiz, video notes, YouTube curate
- GraphQL auth boundaries
- Frontend routes + CORS

Writes `scripts/production-test-report.md`.

### Local E2E / quality

```bash
node scripts/e2e-pipeline-test.mjs      # local ports by default
node scripts/quality-audit.mjs          # scoring / evidence quality
```

**Policy:** AI paths use real providers. If a key or quota is missing, tests log warnings or fail honestly — they do not substitute fake match scores.

---

## Deployment

| Layer | Host | Notes |
|-------|------|-------|
| Frontend + BFF | Vercel project `x-ceed` | GitHub `main` → production |
| AI Core | Railway service `ai-core` | `Dockerfile.ai-core`, health `/health` |
| AI Support | Railway service `ai-support` | `Dockerfile.ai-support`, health `/health` |

Typical flow: push `main` → Vercel rebuilds → Railway rebuilds watched services → set `NEXT_PUBLIC_AI_*` to Railway public URLs → set Railway `FRONTEND_URL` to the Vercel URL for CORS.

Known operational gotcha: `pdf-parse`’s default entry runs a debug harness that opens a test PDF; production imports the lib entry directly so auth routes do not 500 on cold start (`src/lib/pdfExtractor.js`).

---

## What “good” looks like in a demo

1. Open https://x-ceed.vercel.app → loading splash → landing.
2. Sign in → applicant **resume match** against a real job.
3. Show **component scores**, **evidence excerpts**, and **gaps** (not a single magic %).
4. Generate a **career plan**; open a module / video path.
5. Run a **mock interview** question + analysis.
6. Optionally show GraphQL `candidateProfile` in Network tab (JWT required).

If a recruiter asks “how do I know the AI isn’t lying?” — point at evidence excerpts vs resume text, gap classifications, and the production smoke report.

---

## Limitations (honest)

- **YouTube API quota** can exhaust on free tier; curation degrades with cache/fallback.
- **Generative latency** varies (quiz generation can exceed 10s under load).
- **Match quality** depends on resume text quality and JD specificity; thin JDs are padded carefully in tests but production jobs should be real.
- EduChain / learning bets require wallet + testnet config; they are not required for the core match loop.

---

## Tech snapshot

- **Frontend:** Next.js 15, React 19, Tailwind, Radix, Framer Motion  
- **API:** Next Route Handlers + Pages API, Apollo GraphQL  
- **AI:** LangGraph, LangChain, TypeSafe/Jev, DeepSeek, Chroma (RAG paths)  
- **Data:** MongoDB Atlas  
- **Infra:** Vercel, Railway, Docker  

---

## Scripts reference

| Script | Purpose |
|--------|---------|
| `npm run dev:full` | Next + AI Core + AI Support |
| `node scripts/production-smoke-test.mjs` | Live production gate |
| `node scripts/e2e-pipeline-test.mjs` | Local full pipeline |
| `node scripts/quality-audit.mjs` | Match/evidence quality |

---

## License / contact

Private project repository. For hiring conversations about this system, treat the live URLs and `scripts/production-test-report.md` as the source of truth for “does it run in production?”

Built as a serious AI product surface for recruiting — **evidence first, scores second, generation last.**
