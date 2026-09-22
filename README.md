# X-CEED

### What happens when you refuse to ship “resume goes into ChatGPT, score comes out”

**Live:** [x-ceed.vercel.app](https://x-ceed.vercel.app) · **AI Core:** [Railway](https://ai-core-production-2826.up.railway.app/health) · **AI Support:** [Railway](https://ai-support-production-81a3.up.railway.app/health)

If you are a recruiter hiring for AI systems — platform, applied ML, agentic workflows — this README is written for you. Not as a feature brochure. As a record of how I thought while building something that had to survive production, quota limits, cold starts, and the temptation to fake the hard parts.

Scroll if you want the journey. Jump to [Key decisions](#key-decisions-at-a-glance) if you only have five minutes. Run `node scripts/production-smoke-test.mjs` if you want proof instead of prose.

---

## The problem I actually cared about

Recruiting tools love the word “AI.” Most of them mean one of two things:

1. **Keyword ATS with a new coat of paint** — brittle, gameable, zero explanation.
2. **One giant prompt** — “here is a resume and a JD, give me a score from 0–100 and a paragraph.”

I have used both. Both fail the moment you ask: *show me the sentence in the resume that justified that score.* Or: *why is this mechanical engineer somehow an 87 for a React role?* Or: *if I change the weight on communication from 10% to 25%, does anything real change?*

X-CEED started as a recruitment SaaS. It became an obsession with a narrower question:

> **Can I build a match loop that is explainable, weightable, and dishonest-to-itself when the evidence is thin — without pretending a single LLM call is a hiring brain?**

Everything else in the product — career plans, mock interviews, quizzes, YouTube modules — grows out of that loop. Gaps are not a sidebar. They are the bridge from “you don’t match yet” to “here is what to do next.”

---

## How the thinking evolved (the journey)

### Phase 1 — “Just make matching work”

Early versions did what every hackathon does: shove text into a model, parse JSON, hope. It demoed well. It did not *think* well.

What broke first:

- Scores clustered. Everyone looked “pretty good.”
- Explanations sounded HR-polite and cited nothing.
- Gaps were generic (“improve your skills”) instead of named requirements.
- One bad JSON parse and the whole UX lied or crashed.

I learned the boring lesson early: **generation and judgment are different jobs.** Asking one model to do both is how you get confident nonsense.

### Phase 2 — Split the brain on purpose

I stopped asking “which LLM?” and started asking “what kind of answer do I need?”

| Kind of answer | What I need | What I use |
|----------------|-------------|------------|
| Fit level, gap class, yes/no bar | Typed, stable, cheap, batchable | **Jev (TypeSafe)** — `choice` / `score` / `noul` |
| Explanation, interview Q, quiz, plan prose | Fluent language | **DeepSeek** |
| “Is this YouTube result actually about Docker?” | Relevance gate | **Jev noul**, not vibes |
| Learning videos | Retrieval + quota reality | **YouTube API** + cache |

Jev is System-1 for this product: fast, structured, calibrated probabilities, no “extract the number from the paragraph.” DeepSeek is System-2: write the human-facing layer *after* the decisions exist.

That split is the architectural spine. If you interview me, that is the first thing I will defend.

### Phase 3 — Graphs where state matters, not everywhere

LangGraph lives in **AI Core** — analyze → match → gap → career-plan — because those steps share state, branch, and accumulate errors.

LangGraph does **not** live in AI Support (quiz, mock interview, video notes). Those are request/response. Putting a graph there is cargo cult. Stateless FastAPI is the honest shape.

I would rather explain a boring service that fits than a fashionable one that doesn’t.

### Phase 4 — Production forced honesty

Shipping to Vercel + Railway stopped being optional. That is when “it works on my machine with three Python processes” stopped counting.

Things production taught me that local never did:

- A dependency (`pdf-parse`) that opens a **test PDF at import time** can turn auth-gated routes into HTML 500s — looking like “security holes” when the real bug is a library side effect under ESM bundling. Fix: import the lib entry, not the package’s debug harness.
- YouTube `search.list` burns free quota in hours. Caching (`yt:{hash}`) and graceful degrade are product features, not afterthoughts.
- Cold starts need retries in smoke tests before you declare Railway “down.”
- CORS is not theoretical. `FRONTEND_URL` on Railway must be the real Vercel origin or the browser silently fails while curl looks fine.

The production smoke suite (`scripts/production-smoke-test.mjs`) hits **live URLs only**. No localhost. No mocked match scores. If AI is broken, the report says so.

---

## Key decisions at a glance

| Decision | Chose | Rejected | Why |
|----------|-------|----------|-----|
| Scoring brain | Jev for judgments + DeepSeek for prose | One LLM for everything | Auditable numbers vs fluent text |
| Orchestration | LangGraph in AI Core only | Graph everywhere | Statefulness where it earns its keep |
| API shape | REST mutations + GraphQL dashboard reads | GraphQL for all writes | Writes stay simple; reads get typed trees |
| GraphQL hosting | Inside Next (`/api/graphql`) | Separate Apollo service | Same origin, shared JWT/Mongo, less ops |
| Deploy split | Vercel (Next) + 2 Railway services | Monolith Node+Python | Independent scale, clear failure domains |
| Blockchain | Client-side wagmi / EduChain bets | Backend holding keys | Learning accountability ≠ server custody |
| Evidence contract | `requirement → excerpt → strength` | Score-only UX | Force grounding or fail quality audits |
| Weights | Per-job configurable components | Fixed black-box score | Recruiters can express what they value |
| Testing AI | Real providers in E2E/smoke | Mocked “AI” fixtures | Mocks hide the product |

---

## The match contract (what I refuse to ship without)

A match response is not “valid” because HTTP 200. It is valid when:

1. **Overall score** is a real number in range — not a vibes string.
2. **Five component scores** exist: skills, experience, education, projects, communication.
3. **Evidence** is non-empty; each item ties a requirement to a resume excerpt and a strength.
4. **Gaps** name requirements and classify them (`missing` / `weak` / `under-evidenced`) — not “keep learning.”
5. **Explanation** is long enough to be useful and actually mentions skills from the resume.

I also built domain-aware dampening so a resume that is clearly another field does not get a flattering software score by accident. Flat scores across unrelated candidates were an early smell; I treated them as a bug in the product, not a quirk of the model.

Quality audits and production smoke both encode this contract. If evidence is empty, that is a **fail**, not a warning.

---

## Architecture as a consequence of the thesis

```
Browser
  └─ Next.js 15 (Vercel)
        ├─ Auth, jobs, uploads (REST)
        ├─ Match / career proxies → AI Core
        ├─ Quiz / mock / video proxies → AI Support
        └─ GraphQL (Apollo) — dashboard reads, JWT required
              │
      ┌───────┴────────┐
      ▼                ▼
 AI Core (Railway)   AI Support (Railway)
 LangGraph + Jev     Stateless DeepSeek
 DeepSeek prose      Quiz · Mock · Video · YT
 Mongo cache         Quota-aware curation
```

### Why two AI services?

AI Core is heavy: graphs, Jev batches, caching, career modules.  
AI Support is bursty and simpler: generate a quiz, ask one interview question, fetch a transcript.

Coupling them would make every quiz deploy wait on matching changes. Separating them made deploy and mental models cleaner. Dockerfiles are explicit: `Dockerfile.ai-core`, `Dockerfile.ai-support`.

### Why GraphQL at all?

Recruiters and candidates both need nested reads: jobs with stats, profiles with skills and match history. REST was getting chatty. GraphQL as a **read layer** inside Next kept auth and Mongo in one place. Mutations stayed REST. That hybrid is deliberate, not incomplete.

---

## What the product does once matching is honest

**Recruiters** set weights, shortlist with live scores, read evidence-backed explanations, use a GraphQL dashboard.

**Candidates** get a score they can interrogate, gaps they can act on, a career plan (objectives, projects, modules), mock interviews that adapt, quizzes that are not stock question banks, and video notes when transcripts exist.

EduChain learning bets sit on the side as client-side accountability — interesting, but **not** the load-bearing AI path. I will not pretend blockchain is the matching engine.

---

## Failure modes I design for

| Failure | What users see | What I do |
|---------|----------------|-----------|
| Model timeout / 5xx | Honest error, retry path | Smoke tests retry cold starts once |
| YouTube quota 429 | Plan still generates; videos may be thin | Cache + warn, don’t fake URLs |
| Thin job description | Weak match quality | Prefer real jobs; tests pad carefully and log it |
| Unauthenticated sensitive API | 401 | Enforced in middleware; smoke asserts it |
| Library import side effects | Would be 500 | Fixed at the import boundary |

I care more about **failing loudly and correctly** than looking “always AI-on.”

---

## How I prove it in production

```bash
node scripts/production-smoke-test.mjs
```

That script walks infrastructure, security, matching, AI Support, GraphQL, routes, and CORS against the live URLs. Latest report: `scripts/production-test-report.md`.

Local full pipeline and scoring audits:

```bash
npm run dev:full
node scripts/e2e-pipeline-test.mjs
node scripts/quality-audit.mjs
```

**Rule I hold myself to:** no mocked AI on the critical path. If DeepSeek or Jev is down, the test fails or warns. It does not invent a 78 and move on.

---

## Local setup (for people who want to touch it)

```bash
npm install
npm run setup:python
cp .env.example .env.local   # never commit secrets
npm run dev:full             # :3002 Next · :8000 Core · :8001 Support
```

Core env ideas: `MONGODB_URI`, `JWT_SECRET`, `DEEPSEEK_API_KEY`, `TYPESAFE_API_KEY`, `YOUTUBE_API_KEY`, `NEXT_PUBLIC_AI_CORE_URL`, `NEXT_PUBLIC_AI_SUPPORT_URL`, Railway `FRONTEND_URL` → Vercel origin.

Deep deploy notes live in `X-CEED_MASTER_DEPLOY_BIBLE.md` — that file is the ops brain; this README is the product brain.

---

## What I would tell you in an interview

If we talked for thirty minutes, I would not lead with “I used LangGraph.” I would lead with:

1. **Judgment ≠ generation.** I split models by job-to-be-done.
2. **Evidence is a product requirement**, not a prompt suggestion.
3. **Graphs earn their complexity**; I refused them where the flow is a single shot.
4. **Production is part of the AI system** — quota, CORS, import side effects, cold starts.
5. **Tests that hit real providers** are how I know I’m not lying to myself.

X-CEED is the artifact of that thinking: a recruitment platform whose AI path is designed to be **interrogable**.

---

## Stack snapshot

Next.js 15 · React 19 · FastAPI · LangGraph · LangChain · TypeSafe/Jev · DeepSeek · MongoDB Atlas · Apollo GraphQL · Vercel · Railway · Docker · (optional) wagmi / EduChain

---

## Closing

I built X-CEED because I was tired of AI recruiting demos that could not survive a skeptical “why this score?” question.

If you read this far, you already know how I work: start from the failure mode, choose the smallest honest architecture, put contracts on the outputs, and verify against production — not against a slide.

**Try it:** [https://x-ceed.vercel.app](https://x-ceed.vercel.app)  
**Ask it to explain itself:** run a match, open the evidence, follow a gap into a plan.

That loop — match → evidence → gap → action — is the product. Everything else is scaffolding.
