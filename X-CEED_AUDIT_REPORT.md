# X-CEED Status Audit Report

**Date:** 2026-09-22  
**Scope:** Codebase at `d:\x-ceed` vs `X-CEED_Detailed_Project_Document.docx`  
**Method:** Static code review, import smoke tests, git inventory — no production deploy test, no `npm run build` run in this pass  
**Verdict:** Functional **local prototype / hackathon product** with real matching, prep plans, recruiter shortlist, and learning bets. The architecture document **overstates** LangGraph, GraphQL, Express, configurable weights, AI outreach, ATS-as-product, and blockchain offer workflows.

---

## Executive Summary

| Area | Reality vs Document |
|------|---------------------|
| Applicant resume→match→prep-plan loop | **Mostly real** (LLM + keyword/prompt RAG, not true semantic ATS) |
| Recruiter jobs + shortlist + reasoning | **Mostly real** (weights hardcoded; no comparison UI; no AI outreach) |
| LangChain / LangGraph | LangChain **partial** (embeddings/RAG helpers); LangGraph **absent** |
| Express + GraphQL | **Absent** — Next.js API routes + Python FastAPI only |
| Blockchain | Learning **bets** on EduChain testnet hooks — **not** offer/commitment verification |
| Repo hygiene / secrets | **Critical** — credentials in tracked files; 100+ uploaded PDFs in git |
| Deployment readiness | **Not ready** — no Docker/CI/Vercel config; multi-process Python required |

**Honest ship label today:** “Working demo SaaS skeleton,” not “deployed production SaaS matching the spec.”

---

## Step 1: Repository Health

### 1.1 Root directory — production red flags

Root contains **~203 files**. Categories that should **not** live in a production repo:

| Category | Approx. count | Examples |
|----------|---------------|----------|
| One-off fix / success markdown | ~35 | `AUTHENTICATION_FIXED.md`, `CHAT_OPTIMIZATION_FIXES.md`, `SUCCESS_SUMMARY.md`, `VECTOR_RAG_MIGRATION_PLAN.md` |
| Ad-hoc test scripts | ~74 | `test-*.js`, `test-*.py`, `test_*.js` |
| Debug scripts | ~16 | `debug-*.js`, `debug-*.py` |
| Start/setup shell scripts | ~15 | `start-all.bat`, `start-python-services.ps1`, `quick-setup.bat` |
| Empty stub files | ~16 | `debug-job-app-mismatch.js` (0 bytes), empty fix scripts |
| Personal / test PDFs | 2+ at root | `Ayush Yadav_BMU.pdf`, `test-resume.pdf` |
| BFG history-rewriting jars | 2 | `bfg.jar`, `bfg-new.jar` |
| Local env copies | several | `.env.local`, `.env.local.backup`, `.env.local.new`, `.env.local.old` |
| Cache / venv / build dirs | present | `__pycache__/`, `.venv/`, `.next/`, `cache/`, `artifacts/` |

Also present (expected for app): `src/`, `services/`, `contracts/`, `public/`, `package.json`, `README.md`, requirements files.

### 1.2 `.gitignore` assessment

`.gitignore` **does** cover: `node_modules`, `.next`, `.env*`, `__pycache__/`, `.venv`, Hardhat `cache`/`artifacts`, upload dirs, `bfg*.jar`, GCP credential patterns.

**Gaps / failures in practice:**

| Issue | Detail |
|-------|--------|
| Ignore ≠ untrack | `bfg.jar` is still **git-tracked** despite ignore rule |
| Uploaded resumes in git | **103** paths under `public/uploads/**` are tracked; **108** PDFs tracked overall |
| Hardcoded Mongo URI in source | `test-mongo-connection.js` is tracked with live Atlas credentials |
| API key in docs | `.kiro/specs/security-vulnerability-fixes/tasks.md` contains a full OpenRouter key |
| `__pycache__` modified locally | Appears in working tree (git status); may be tracked or force-added historically |
| Root junk not ignored | `test-*.js`, `debug-*.js`, `*_FIX*.md` not ignored — clutter re-enters every commit |

### 1.3 Secrets / credential exposure

**Do not paste keys into tickets.** Rotate anything that has ever sat in git history.

| Location | What’s exposed | Severity |
|----------|----------------|----------|
| `.env.local` (+ `.backup` / `.new`) — **gitignored locally** | MongoDB Atlas URI with username/password; Gemini keys; OpenRouter keys; YouTube; Firebase; wallet `PRIVATE_KEY`; contract address | Critical if leaked via backup/share |
| `test-mongo-connection.js` (**tracked**) | Hardcoded `MONGODB_ATLAS_URI_SCHEME://…` with credentials | **Critical** |
| `.kiro/specs/security-vulnerability-fixes/tasks.md` (**likely tracked**) | Full `OPENROUTER_KEY_PREFIX-…` OpenRouter key in prose | **Critical** |
| Python service logs on import | Print key prefixes (`AIza...`) to stdout | Medium (log leakage) |
| `env.local.template` | Placeholders only | OK |

**Grep patterns that hit:** `MONGODB_ATLAS_URI_SCHEME://`, `AIza…`, `OPENROUTER_KEY_PREFIX-…`, `PRIVATE_KEY`.

### 1.4 Size metrics

| Metric | Value |
|--------|------:|
| Files (excl. `node_modules`, `.git`, `.next`, `.venv`, lockfiles, jars/pdfs/pyc) | **~833** |
| Lines of code (same exclusions) | **~118,494** |
| Breakdown (approx.) | `.js` 55k · `.jsx` 25k · `.py` 15k · `.md` 6k · `.sol` 0.6k |
| TypeScript in `src/` | **0** `.ts`/`.tsx` files (doc claims TypeScript; codebase is JS/JSX) |
| Root junk test/debug scripts | **~90** |

---

## Step 2: Feature Completeness Matrix

Status legend: **DONE** · **PARTIAL** · **STUB** · **MISSING**

### 2.1 Applicant side

| # | Feature | Status | Evidence | Notes |
|---|---------|--------|----------|-------|
| A1 | Resume upload + AI parsing → structured profiles | PARTIAL | `src/app/api/upload/resume/route.js`, `src/lib/pdfExtractor.js`, `src/lib/models/user.js`, register forms | Upload works. Profile fields mostly **manual**. Analysis extracts text for matching; durable structured profile write-back is weak. |
| A2 | Skill / experience / education / project / communication extraction | PARTIAL | `services/python/simplified_rag_service.py`, `src/app/api/resume-rag-python/route.js`, `src/pages/api/resume-match/analyze.js` | Skills/experience/projects in LLM JSON. **Communication profile largely absent**; soft skills often de-emphasized. |
| A3 | JD analysis + requirement normalization | PARTIAL | `services/python/job_description_service.py`, `src/pages/api/parse-job-description.js`, `src/pages/api/jobs/index.js` | PDF/text extract works. Jobs store raw description — **no required/preferred skill schema** on job records. |
| A4 | Semantic resume↔job matching (not keyword) | PARTIAL | `resume_analyzer_core.py` (Chroma), `simplified_rag_service.py`, `VECTOR_RAG_MIGRATION_PLAN.md`, `resume-match/analyze.js` | Vectors exist for RAG/chat. Primary match path = **LLM prompt + keyword/regex fallback**. Not embedding-scored matching. |
| A5 | ATS scoring with explainable factors | PARTIAL | `resume-match/page.jsx`, match APIs | Scores + explanations exist. **Not real ATS** (parseability, formatting, section detection). “ATS” is branding. |
| A6 | Skill-gap detection (missing / weak / under-evidenced) | DONE | `simplified_rag_service.py` (`criticalMissing`, gap analysis), resume-match UI | Implemented; quality depends on LLM JSON reliability. |
| A7 | AI resume improvement suggestions (editable) | PARTIAL | resume-match UI, `resume-chat/route.js`, `SkillsEditor.jsx` | Suggestions shown. **No apply-to-resume / export edited resume** workflow. |
| A8 | Personalized study plans from skill gaps | DONE | `prep-plans/generate.js`, `prep-plans/index.js`, `prep-plans/page.jsx` | Real, duration-aware prep plans. |
| A9 | Project recommendations for weak areas | PARTIAL | Prep-plan prompts (`specificProjects`) | Prompt fields inside plans — not a first-class project engine/tracker. |
| A10 | Curated resources (books, courses, videos, YouTube) | PARTIAL | `youtubeContentCurator.js`, `content/curate.js`, prep-plan generators | **YouTube curation real**. Books/courses often LLM placeholder strings. |
| A11 | Career guidance workflows | PARTIAL | Mock interview, resume chat, prep plans | Career-adjacent features exist; **no dedicated multi-step career workflow/state machine**. |
| A12 | Progress + commitment tracking | PARTIAL | Prep-plan progress PUT, `SmartVideoTracker.jsx`, `useLearningBets.js`, `XCeedLearningBets.sol` | Progress % + video quality for **bets**. Not general milestone commitment ledger from the doc. |

### 2.2 Recruiter side

| # | Feature | Status | Evidence | Notes |
|---|---------|--------|----------|-------|
| R1 | Job creation + JD management | DONE | `CreateJobDialog.jsx`, `jobs/index.js`, recruiter jobs page | Create/list/manage with text or file JD. |
| R2 | Automated skill extraction from JDs | STUB | `job_description_service.py` (`/parse-job-description` → text) | Extracts text, **not** structured required/preferred skills persisted on jobs. |
| R3 | Ranking with configurable evaluation weights | STUB | `ai/shortlist-candidates/route.js` (hardcoded 0.5/0.3/0.2) | Ranking exists. Weights **not recruiter-configurable**; no UI. |
| R4 | Recruiter dashboard / pipeline | DONE | `dashboard/recruiter/*`, application status APIs | Usable jobs + applicants + status + shortlist. Not a rich kanban. |
| R5 | Candidate comparison + AI fit explanations | STUB | `CandidateShortlist.jsx`, shortlist pages | Per-candidate reasoning on a list. **No side-by-side comparison**. |
| R6 | Candidate-specific reasoning | DONE | shortlist route (`reasoning`, score breakdown) | Real for shortlisting. |
| R7 | AI-assisted outreach generation | MISSING | `email/send.js`, interview invite APIs | Manual/template email only. No AI outreach composer. |
| R8 | Offer workflow + blockchain verification | MISSING | Contracts are learning bets only | **No offer issuance/acceptance on-chain path.** |

### 2.3 AI architecture claims

| # | Claim | Status | Evidence | Notes |
|---|-------|--------|----------|-------|
| AI1 | LangChain-structured LLM ops | PARTIAL | `resume_analyzer_core.py`, `@langchain/*` in package.json | Used for embeddings/Chroma/retrieval. Most prod prompts = **raw Gemini/OpenRouter HTTP**. |
| AI2 | LangGraph stateful workflows | MISSING | Spec/doc only | **Zero** `langgraph` imports / StateGraph usage. |
| AI3 | Resume analysis pipeline | PARTIAL | Multiple overlapping Python/JS routes | Real but fragmented; auth sometimes bypassed. |
| AI4 | Job analysis pipeline | STUB | JD text parse + ad-hoc match prompts | Not normalize → weighted representation pipeline. |
| AI5 | Matching workflow + evidence | PARTIAL | Structured LLM JSON + UI | Exists as prompts, not formal workflow graph. |
| AI6 | Gap analysis workflow | PARTIAL | Gap sections in analysis + prep plans | Prompt stages, not orchestrated state. |
| AI7 | Career planning workflow | PARTIAL | `prep-plans/generate.js` | Prep-plan generation stands in for career planning. |
| AI8 | Explanation workflow | PARTIAL | Shortlist reasoning; match explanations | Embedded in prompts, not separate service. |
| AI9 | Bulk processing + retry/failure handling | PARTIAL | Shortlist batching; some retries in prep-plan gen | No stateful bulk resume graph as claimed. |
| AI10 | AI outputs as structured data | PARTIAL | JSON-in-prompt + fragile parse/fallbacks | Intent yes; end-to-end schema contracts no. |

### 2.4 Platform / data / security claims (from doc)

| # | Claim | Status | Evidence | Notes |
|---|-------|--------|----------|-------|
| P1 | Next.js/React frontend | DONE | `src/app/**` | Next 15 + React 19. |
| P2 | Node.js/Express backend | MISSING | No `express` dependency | **Next.js API routes** instead. |
| P3 | MongoDB Atlas | DONE | `src/lib/mongodb.js`, init scripts | Used extensively. |
| P4 | JWT + RBAC | PARTIAL | `src/lib/auth.js`, `middleware.js`, ad-hoc `userType` | JWT works. RBAC = string checks, not a matrix. Frontend role from **localStorage**. |
| P5 | REST APIs | DONE | ~79 non-empty routes | Heavy REST surface. |
| P6 | GraphQL for dashboards | MISSING | No graphql server/schema | Spec fiction. |
| P7 | Python AI services from backend | DONE | FastAPI on 8000/8002/8003/8004/8006/8008 | Invoked from Next routes. |
| P8 | Blockchain commitment + milestone hashing | STUB | Learning bets only | Wrong product shape vs doc. |
| P9 | Betting system (stake on goals) | PARTIAL | `XCeedLearningBets.sol`, wagmi/rainbowkit | Implemented for learning bets; contract default address may be zero if env unset. |
| P10 | Solidity + Hardhat + ethers | DONE | `contracts/`, `hardhat.config.js`, `scripts/deploy.js` | EduChain testnet configured. |
| P11 | Data model entities | PARTIAL | users/jobs/applications/notifications + runtime collections | Schemaless; Match Results / Commitments incomplete vs doc. |
| P12 | Security (JWT, validation, upload, hash-on-chain) | PARTIAL | Mixed auth coverage; uploads in git | See Steps 3 & 9. |

### Scoreboard

| Bucket | Count (approx.) |
|--------|----------------:|
| DONE | ~10 |
| PARTIAL | ~28 |
| STUB | ~6 |
| MISSING | ~8+ |

---

## Step 3: API Completeness

### 3.1 Inventory summary

| Tree | Non-empty | Empty stubs |
|------|----------:|------------:|
| `src/pages/api/` | ~48 | 6 |
| `src/app/api/` | ~31 | 6 |
| **Total** | **~79** | **12** |

**Auth rough split:** ~45 with live auth · ~3 with auth **imported but bypassed** · ~31 with no auth.

### 3.2 Auth-bypassed / debug routes (must fix before SaaS)

| Route | Issue |
|-------|--------|
| `src/app/api/resume-rag-python/route.js` | Comment: auth **temporarily bypassed for testing** |
| `src/app/api/resume-rag/route.js` | Same pattern (`no*`) |
| `src/app/api/ai/shortlist-candidates/route.js` | Auth bypassed |
| `src/app/api/debug-applications/route.js` | Unauthenticated application dump |
| `src/app/api/debug/parse-resume/route.js` | Unauthenticated debug parse |
| `src/app/api/test-folder/route.js` | Test endpoint |
| `src/app/api/upload/resume/route.js` | Resume upload without auth |
| `src/app/api/resume/view/[filename]/route.js` | Serve resume PDF without auth |
| Interview schedule/upcoming app routes | Query by id without solid auth |
| Empty stubs | 12 zero-byte route files still in tree |

### 3.3 Domain coverage vs document

| Documented area | Present? | Notes |
|-----------------|----------|-------|
| Auth register/login/me/reset | Yes | Complete enough for demo |
| Jobs CRUD | Yes | |
| Applications / pipeline | Yes | Multiple submit variants (clean/debug) = smell |
| Resume match / RAG | Yes | Overlapping JS + Python proxies |
| Prep plans / learning | Yes | |
| Notifications | Yes | |
| Recruiter shortlist AI | Yes | |
| GraphQL | **No** | |
| Offer / commitment APIs | **No** | |
| Configurable weights API | **No** | |
| AI outreach | **No** | |

### 3.4 Extra / undocumented surface

Jobicy/Remotive proxies, YouTube, news, quiz, video AI, Google Drive notes, scrape-job, payout/calculate, mock interview proxies, many root-level `test-*` scripts calling APIs.

Full per-route tables (methods / purpose / auth / validation) were inventoried during audit; highest-risk items are listed above. Representative auth-gated domains: jobs, applications submit, prep-plans, notifications, applicant profile.

---

## Step 4: Python Services Health

### 4.1 Import smoke test (this environment)

| Service | Import | Notes |
|---------|--------|-------|
| `simplified_rag_service` | OK | Warns vector RAG unavailable when import path wrong; continues prompt-based |
| `gemini_resume_chat_service` | OK | Gemini |
| `job_description_service` | OK | Connects Mongo; Gemini |
| `video_ai_service_enhanced` | OK | Gemini 2.5 Flash |
| `ai_service` | OK | Wraps `AIResumeAnalyzer` |
| `quiz_generation_service_optimized` | OK | Gemini quiz key |
| `resume_analyzer_core` | OK | LangChain embeddings; deprecation warnings |
| `ai_resume_analyzer` | OK | |
| `simple_mock_interview_service` | OK | |
| `fastapi_rag_service` | **FAIL** | Missing `sentence_transformers` |

### 4.2 Endpoints & models

| File | Port (npm script) | Endpoints (high level) | LLM stack | LangChain? |
|------|-------------------|------------------------|-----------|------------|
| `simplified_rag_service.py` | 8000 | `/analyze`, `/chat`, `/status`, `/clear-session` | OpenRouter `liquidai/lfm2.5-1.2b-thinking:free` | Optional via core |
| `video_ai_service_enhanced.py` | 8002 | `/chat`, `/generate-notes`, `/suggest-clips`, `/health` | Gemini 2.5 Flash chain | No (direct genai) |
| `gemini_resume_chat_service.py` | 8003 | `/chat`, `/analyze` | Gemini | Partial (imports core) |
| `ai_service.py` | 8004 | `/analyze-candidates`, `/health` | Via analyzer (Gemini/OpenRouter) | Indirect |
| `quiz_generation_service_optimized.py` | 8006 | `/generate-quiz`, `/submit-quiz`, `/health` | Gemini | No |
| `job_description_service.py` | 8008 | `/parse-job-description`, `/generate-question`, `/analyze-answers` | Gemini | No |
| `simple_mock_interview_service.py` | 8009 | `/generate-question`, `/debug/env` | Gemini/OpenRouter | No |
| `fastapi_rag_service.py` | (legacy) | Similar to simplified | — | Yes (broken deps) |
| `quiz_generation_service.py` | duplicate of optimized | Same ports | Gemini | No |

### 4.3 Cross-cutting Python issues

- **Error handling:** Present on most FastAPI routes (`HTTPException`, try/except); quality uneven.
- **Hardcoded credentials:** Services load `.env.local` (good); no hardcoded keys found in the main service bodies. Credential risk is env files + tracked JS/docs.
- **CORS:** Mostly `localhost:3000/3002`; `job_description_service` and `simple_mock_interview_service` use `allow_origins=["*"]`.
- **Debug endpoints:** `/debug/env` on job-desc and mock-interview services — leak env presence in prod if exposed.
- **LangGraph:** Not used anywhere.
- **Deployability:** Six+ long-lived processes; no unified Dockerfile; local-only CORS.

---

## Step 5: Frontend Completeness

### 5.1 Pages / routes

| Route | Role | Real API vs mock | Notes |
|-------|------|------------------|-------|
| `/` → `/loading` → `/landing-simple` | Marketing | N/A | Landing exists (`landing`, `landing-simple`, `landing-video`) |
| `/auth`, `/register`, `/register/recruiter` | Auth | Real | Register + login |
| `/dashboard` | Router | **localStorage role** | Comment admits demo redirect |
| `/dashboard/applicant/*` | Applicant | Mostly real | jobs, applications, resume-match, prep-plans, youtube, video-plan, mock-interview, saved-jobs |
| `/dashboard/applicant/earnings` | Applicant | **Mock data** | Explicit mock earnings |
| `/dashboard/recruiter/*` | Recruiter | Real | dashboard, jobs, shortlist |
| `/candidates` | Mixed | Check usage | Present |
| `/quiz`, `/video-ai-assistant` | Tools | Real proxies | |

### 5.2 UX / auth / RBAC

| Check | Status |
|-------|--------|
| Landing / marketing | Yes (`landing-simple` after loading animation) |
| Register → login → dashboard → logout | Present end-to-end |
| Role-based routing | **Client-side** `localStorage.userRole` — spoofable; not middleware-enforced at page level (`src/middleware.js` **missing**) |
| Loading / error / empty states | Present on major dashboards unevenly |
| Responsive design | Tailwind + shadcn-style components; not fully audited viewport-by-viewport |
| TypeScript | Document claims it; **zero** TS source files |

---

## Step 6: Database

| Item | Status |
|------|--------|
| Seed / init | `scripts/init-database.js` creates `users`, `jobs`, `applications`, `notifications` |
| Other scripts | `seed-applications.js`, migrate/fix scripts under `scripts/` |
| Formal migrations | **No** versioned migration system |
| ODM / schemas | Native Mongo driver; loose `src/lib/models/user.js` object — **schemaless** |
| Collections used at runtime (beyond init) | e.g. prep plans, resume analyses, notifications, saved jobs — created ad hoc |
| API-layer validation | Mixed: Zod on some register forms; many routes use ad-hoc `if (!field)` checks |
| Doc entities missing or weak | Match Results as first-class collection; Commitments; Learning Plans as formal schema; evaluation weights on Jobs |

---

## Step 7: Blockchain

| Item | Status |
|------|--------|
| Contracts | `XCeedLearningBets.sol`, `LearningBets.sol`, `Lock.sol` (Hardhat sample) |
| Compilable | Hardhat 0.8.19 configured; not recompiled in this audit |
| Deploy script | `scripts/deploy.js` → EduChain testnet (`chainId` 656476) |
| Frontend | wagmi + RainbowKit (`Web3Provider.jsx`, `LearningBetInterface.jsx`, `useLearningBets.js`) |
| Network | **EduChain testnet** (not mainnet; not Ethereum L1) |
| Contract address | Env `NEXT_PUBLIC_LEARNING_BETS_CONTRACT` present locally; code defaults to `0x000…000` if unset |
| Offer / commitment hashing | **Not implemented** — betting on learning completion only |
| Doc alignment | Partial stack match; **wrong product feature** vs “offer workflow verification” |

---

## Step 8: Deployment Readiness

| Item | Status |
|------|--------|
| Dockerfile / docker-compose | **MISSING** |
| Vercel / Netlify / Railway / Render config | **MISSING** |
| GitHub Actions CI/CD | **MISSING** (no project `.github/workflows`) |
| Env documentation | Partial: `env.local.template`, `SETUP_GUIDE.md`, `FACTORY_RESET_SETUP.md` — incomplete vs real `.env.local` surface |
| `npm run build` | Not executed this pass; likely needs env + may trip on empty routes / dual router quirks — treat as **unverified** |
| Python deploy story | Multiple uvicorn processes; CORS localhost-only — **not** production-ready as-is |
| CORS for prod domains | Not configured |
| Multi-service orchestration | `concurrently` / `.bat` / `.ps1` for local only |

---

## Step 9: Top 10 Critical Blockers for “Live SaaS”

Ranked by severity:

1. **Secrets in git / history** — Hardcoded Mongo URI in `test-mongo-connection.js`; OpenRouter key in `.kiro/.../tasks.md`; 100+ resume PDFs tracked; `bfg.jar` tracked. Rotate Atlas password, all AI keys, wallet `PRIVATE_KEY`; purge history.
2. **Auth bypassed on AI & debug routes** — `resume-rag*`, shortlist, debug-applications, unauthenticated resume upload/view. Anyone who can hit the URL can abuse AI spend and read data.
3. **No edge middleware / spoofable roles** — Dashboard routing trusts `localStorage`; ~31 unauthenticated APIs.
4. **No deployment architecture** — Six Python services + Next with localhost CORS; no Docker/CI/host config.
5. **Spec features sold but missing** — LangGraph, GraphQL, Express, configurable weights, AI outreach, blockchain offers — cannot market as complete.
6. **Fragile / overlapping AI stack** — Multiple duplicate routes/services; `fastapi_rag_service` won’t start; vector RAG optional and often degraded; free LiquidAI model dependency for core matching.
7. **PII in repository** — Applicant/recruiter uploaded PDFs in `public/uploads` committed to git.
8. **Schemaless data + no migrations** — Production data integrity and upgrades are high-risk.
9. **Repo hygiene** — ~90 root test/debug scripts, empty stubs, jar tools — blocks professional deploy and review.
10. **Build / prod unverified** — `npm run build` not proven; earnings page mock; contract may point to zero address.

---

## Step 10: 48-Hour Sprint Plan

Goal: **deployable honest MVP** — ship what works; cut or clearly label what doesn’t. Estimates assume 1–2 engineers.

| # | Task | Hours | Difficulty | Blocks deploy? |
|---|------|------:|------------|----------------|
| 1 | Rotate all exposed secrets (Mongo, Gemini, OpenRouter, YouTube, Firebase, wallet key); invalidate old keys | 2 | Easy | **Yes** |
| 2 | Remove tracked uploads/PDFs/jars/test Mongo file from git; strengthen `.gitignore`; BFG/filter-repo if already pushed | 3 | Medium | **Yes** |
| 3 | Re-enable auth on `resume-rag*`, shortlist; delete or gate `debug-*` / `test-folder`; auth resume upload/view | 3 | Easy | **Yes** |
| 4 | Add `src/middleware.js` protecting `/dashboard/**` via JWT cookie; stop trusting localStorage alone | 2 | Medium | **Yes** |
| 5 | Strip empty API stubs; remove duplicate submit/debug routes from production tree | 2 | Easy | No (hygiene) |
| 6 | Single deploy path: Next on Vercel **or** one Docker Compose with Next + 2–3 Python services; fix CORS to prod origin | 6 | Hard | **Yes** |
| 7 | Document real env vars; ship `.env.example` matching production; remove secrets from markdown | 1 | Easy | **Yes** |
| 8 | Prove `npm run build` + smoke: register, login, create job, apply, resume-match, prep-plan, shortlist | 4 | Medium | **Yes** |
| 9 | Product honesty pass: hide/disable earnings mock, zero-address bets, or mark “beta”; update README to match reality | 2 | Easy | Soft |
| 10 | Cut scope from marketing: explicitly defer GraphQL, LangGraph, Express, AI outreach, offer-chain, configurable weights | 1 | Easy | Soft |
| 11 | (Stretch) Persist structured skills on jobs from JD parse; store match results in Mongo | 4 | Medium | No |
| 12 | (Stretch) Recruiter weight UI wired to shortlist scoring | 4 | Medium | No |

**48-hour recommended sequence:** 1 → 2 → 3 → 4 → 7 → 6 → 8 → 9 → 10. Stretch 11–12 only if core deploy is green.

**What to ship in the MVP narrative:** JWT auth, job CRUD, applications pipeline, LLM resume–JD match + gaps, prep plans + YouTube, AI shortlist with reasoning, optional EduChain learning bets (testnet).

**What not to claim until built:** LangGraph orchestration, GraphQL dashboards, Express backend, true semantic/ATS engine, configurable evaluation weights, AI outreach, blockchain offer verification.

---

## Appendix A — Spec vs Reality (one-liners)

| Spec promise | Reality |
|--------------|---------|
| LangChain + LangGraph workflows | Some LangChain embeddings; **no LangGraph** |
| Express + GraphQL | **Next API + FastAPI only** |
| Semantic matching | LLM + keywords; vectors secondary |
| ATS scoring | Branded scores, not ATS parseability |
| Configurable recruiter weights | Hardcoded 0.5 / 0.3 / 0.2 |
| AI outreach | Missing |
| Blockchain offers | Learning **bets** only |
| TypeScript | JavaScript/JSX only |
| Docker / GitHub | Not present |
| Structured AI data contracts | Best-effort JSON parse |

---

## Appendix B — Key paths

```
src/app/**                     Next App Router pages + some APIs
src/pages/api/**               Pages Router APIs (majority of REST)
src/lib/auth.js                JWT (jose)
src/lib/middleware.js          authMiddleware
services/python/*.py           FastAPI AI services
contracts/XCeedLearningBets.sol
scripts/deploy.js              EduChain deploy
scripts/init-database.js       Mongo bootstrap
env.local.template             Incomplete env template
```

---

## Appendix C — Audit limitations

- Did not run full `npm run build` or end-to-end browser QA.
- Did not compile Hardhat contracts in this session.
- Did not verify remote EduChain deployment state beyond local env key presence.
- Secret **values** intentionally redacted in this report; treat listed files as compromised until rotated and history cleaned.

---

*End of report. No code fixes applied — analysis only, as requested.*
