# X-CEED AI Layer v2 — PRD

## Current State (from production audit, Sep 22 2026)

**What works well:**

| Metric | Result | Verdict |
| --- | --- | --- |
| Calibration (perfect/partial/mismatch) | 76 / 42 / 11.3 | Strong — 34pt and 31pt discrimination |
| Evidence precision | 100% (0 hallucinations) | Excellent |
| Gap classification accuracy | 88% | Good |
| Gap specificity | 4.0/5, zero fluff | Good |
| Explanation quality | Personalized, honest, actionable (5/5) | Excellent |
| Consistency (repeat runs) | 0.0 score delta, identical gaps | Perfect |
| Prep plan gap coverage | 100% | Complete |
| YouTube resource relevance | 100% of verified videos relevant | Excellent |

**What's weak:**

| Issue | Evidence | Impact |
| --- | --- | --- |
| Thin evidence output | Only 2 evidence items for a 8-skill job (should be 6-8) | Candidates see sparse proof; recruiters can't verify most claims |
| Skills component miscalibrated | 4-year full-stack engineer scored 0.225 on skills against a frontend role | Candidates with relevant experience see discouraging scores |
| Quiz generation latency | 19.6 seconds for 3 questions | Users think the app is broken |
| Auth login latency | 5 seconds first call | Cold-start friction |
| No streaming | All AI responses block until complete | 5-30 second blank screens |
| No model fallback | If DeepSeek is down, every AI feature fails | Single point of failure |
| No adaptive learning | Quiz/mock interview don't learn from user's history | Each session starts from zero |
| YouTube quota fragility | 100 searches/day exhausts in testing | Career plans return empty modules |

## Problem Statement

X-CEED's AI layer passes functional tests — it matches resumes to jobs, generates career plans, and runs mock interviews. But the output quality has specific, measurable gaps that prevent it from being a tool candidates and recruiters actually trust over doing the analysis themselves.

The core issues are output density (too few evidence items per match, leaving most requirements unaddressed in the structured output), score calibration (component scores don't reflect reality — a qualified engineer scoring 22.5% on skills erodes confidence in the entire system), and responsiveness (20-second quiz generation with no streaming makes the product feel slow and unreliable).

These are not feature gaps — they are quality gaps in existing features. A recruiter who sees 2 evidence items for an 8-requirement job won't trust the system's recommendation. A candidate who scores 22.5% on skills when they have 3 years of the required technology won't come back. A user who stares at a spinner for 20 seconds during a quiz won't finish the session.

The cost of not fixing this: X-CEED works as a demo but doesn't generate the trust needed for repeated use. The AI layer is the product — if its outputs feel thin or miscalibrated, nothing else matters.

## Goals

| # | Goal | Metric | Target | How to measure |
| --- | --- | --- | --- | --- |
| G1 | Dense, verifiable evidence on every match | Evidence items per match | ≥6 items per match (one per major requirement) | Count evidence array length across 100 test matches |
| G2 | Calibrated component scores that reflect reality | Correlation between known skill level and component score | r² > 0.85 across calibration test suite | Run 20 synthetic resumes of known quality, regress scores vs expected |
| G3 | Sub-5-second perceived response time for all AI features | P95 time-to-first-token | <2s for streaming endpoints; <5s total for non-streaming | Instrument every AI endpoint with response timing |
| G4 | Zero-downtime AI availability | Uptime during model provider outages | 99.9% AI feature availability over 30 days | Monitor DeepSeek + Jev health; track fallback activations |
| G5 | Adaptive learning that improves with use | Quiz score improvement over 3 sessions on same topic | >15% score increase by session 3 for same user | Track per-user quiz scores by topic over time |
| G6 | Every gap addressed with real learning resources | Modules with ≥2 verified YouTube videos | 100% of gaps have resources (0 empty modules) | Count empty modules across career plan generations |

## Non-Goals

| # | Non-goal | Rationale |
| --- | --- | --- |
| NG1 | New user-facing features (job aggregation, employer analytics, multi-language) | This spec is about making existing features excellent, not adding more surface area |
| NG2 | UI/UX redesign | The Vercel theme is shipped; this spec is backend/AI only |
| NG3 | Mobile app | Web-first; mobile responsive is sufficient for now |
| NG4 | Enterprise SSO / multi-tenant auth | Auth works; enterprise features are a separate initiative |
| NG5 | Replacing the model stack (Jev + DeepSeek) | The stack is correct; the issue is prompt quality and orchestration, not the models |
| NG6 | Building a proprietary matching model | LLM-based matching with Jev scoring is the right architecture; fine-tuning is P2 |

## P0: Must-Have

### P0.1 — Evidence density: one evidence item per job requirement

The matching graph's `extract_evidence` node currently returns 2 items for an 8-requirement job. It must return one evidence item per requirement, even when the candidate has no relevant experience — in that case, the evidence item explicitly states "no evidence found in resume" with strength "none."

**Root cause:** The DeepSeek prompt in `extract_evidence` doesn't enumerate the requirements or enforce one-per-requirement output structure.

**Fix:** Change the prompt to: "For EACH of the following requirements, extract the strongest evidence from the resume. If no evidence exists, say so explicitly. Return exactly N items, one per requirement." Pass the requirements list as a numbered list in the prompt. Validate the response has exactly N items; retry if not.

**Acceptance criteria:**

- Given a job with 8 requirements and a well-matched resume, when match runs, then evidence array contains 8 items
- Given a job with 8 requirements and a mismatched resume, when match runs, then evidence array contains 8 items (most with strength "none")
- Each evidence item has: requirement (string matching the job requirement), resume\_excerpt (quoted text or "no evidence found"), strength (none/weak/moderate/strong)
- Zero hallucinated excerpts (text not in the resume)

### P0.2 — Component score recalibration

The skills component scored 0.225 for a candidate with 3 years React, 4 years Python, 2 years AWS against a frontend role. Expected: 0.5-0.7.

**Root cause:** The Jev Score question levels are too strict. "Led or architected work in this area" is level 4 (max), but most qualified candidates land at level 2-3. The weighted\_score node then normalizes against the max, compressing scores.

**Fix:** Three changes:

1. Recalibrate Jev score levels to reflect realistic distribution:
   - Level 0: Not mentioned
   - Level 1: Mentioned without context (keyword only)
   - Level 2: Used in a project or role (1-2 years)
   - Level 3: Regular professional use (2-4 years, multiple projects)
   - Level 4: Deep expertise (4+ years, led/architected, taught others)
2. Change weighted\_score normalization: don't divide by max\_possible. Instead, compute average Jev score across requirements as a 0-1 fraction, then multiply by the job weight.
3. Run the calibration test suite (3 synthetic resumes) after the change. Verify: Resume A skills > 0.6, Resume B skills 0.2-0.4, Resume C skills < 0.1.

**Acceptance criteria:**

- A candidate with 3+ years in the primary required skill scores > 0.5 on the skills component
- A candidate with zero relevant skills scores < 0.15
- The spread between a perfect match and partial match on skills is > 25 percentage points
- Calibration test (3 resumes) passes with expected ranges

### P0.3 — Streaming responses for all AI endpoints

Every endpoint that takes >3 seconds must stream its response so the user sees tokens appearing progressively, not a blank screen.

**Endpoints to stream:**

- `/match` → stream the explanation as it generates (scores + evidence can come first as a JSON header, then explanation streams)
- `/career-plan` → stream objectives and plan text
- `/mock-interview/question` → stream the question
- `/mock-interview/analyze` → stream the feedback
- `/quiz/generate` → stream questions one at a time (send each question as it's generated, not all at once)
- `/chat` → already streams (verify)

**Implementation:** DeepSeek supports streaming via `stream=True` in the OpenAI-compatible API. Use Server-Sent Events (SSE) from FastAPI:

```python
from fastapi.responses import StreamingResponse

async def stream_response():
    response = deepseek.stream([...])  # ChatOpenAI with streaming=True
    for chunk in response:
        yield f"data: {json.dumps({'text': chunk.content})}\n\n"
    yield "data: [DONE]\n\n"

@app.post("/match/stream")
async def match_stream(request: MatchRequest):
    return StreamingResponse(stream_response(), media_type="text/event-stream")
```

Frontend: use EventSource or fetch with ReadableStream to render tokens as they arrive.

**Acceptance criteria:**

- Time to first visible token on any AI response < 2 seconds
- Quiz generation shows questions appearing one at a time, not all after 20 seconds
- Match explanation text appears progressively
- If streaming fails, fallback to blocking response (not an error)

### P0.4 — Jev question tuning for AWS/cloud false positives

The audit found AWS classified as "weak" for Resume B (which has zero AWS mentions). The Jev question is too permissive — it's picking up tangential signals ("Python scripting") as faint cloud evidence.

**Fix:** Change Jev questions to be explicit about named services:

- Old: "How well does the candidate demonstrate AWS experience?"
- New: "Does the candidate explicitly mention any AWS services (S3, EC2, Lambda, CloudFront, RDS, ECS, IAM) by name? Score based on named services only, not general cloud or DevOps mentions."

Apply the same specificity to all technology requirements: Docker (must mention Docker/containers, not just "deployment"), GraphQL (must mention GraphQL by name, not just "API"), etc.

**Acceptance criteria:**

- Resume B's AWS classification changes from "weak" to "missing"
- Gap classification accuracy increases from 88% to ≥95%
- No false-positive weak classifications for skills not mentioned in the resume

### P0.5 — Model fallback chain

If DeepSeek is down, every AI feature currently fails. Add a fallback chain:

1. Primary: DeepSeek V4 Flash (current)
2. Fallback: DeepSeek V3 (same API, different model string — `deepseek-reasoner` or another available model)
3. Emergency: Groq free tier (Llama 3.1 70B — OpenAI-compatible API, free)

For Jev: if TypeSafe is down, fall back to DeepSeek-based classification using structured JSON output with the same question format. Less accurate but functional.

**Implementation:** Wrap the model call in a retry-with-fallback:

```python
async def call_with_fallback(messages, models=["deepseek-chat", "deepseek-reasoner"]):
    for model in models:
        try:
            return await deepseek.ainvoke(messages, model=model)
        except Exception as e:
            logger.warning(f"{model} failed: {e}")
            continue
    raise AIServiceUnavailable("All models failed")
```

**Acceptance criteria:**

- When DeepSeek primary returns 5xx, the system automatically retries with fallback model within 2 seconds
- When all models fail, the API returns a clear error message, not a 500 with a stack trace
- Health endpoint reports which model is active
- Fallback activations are logged and counted

### P0.6 — YouTube resource resilience

Empty video modules destroy trust in career plans. Three-layer fix:

1. **API key rotation:** Support multiple YouTube API keys via comma-separated env var `YOUTUBE_API_KEYS`. Round-robin across keys. When one returns 429, move to the next.
2. **Cache-first:** Check MongoDB cache before any YouTube API call. Cache key: `yt:{skill}:{level}`. TTL: 7 days (not 24h — video results don't change daily).
3. **Curated fallback:** If all API keys are exhausted AND cache is empty, return a hand-curated map of top channels per technology: React → Fireship, Traversy Media; Python → Corey Schafer, sentdex; AWS → Be A Better Dev; Docker → TechWorld with Nana; Node.js → The Net Ninja. This is marked as "curated" not "personalized" in the UI.

**Acceptance criteria:**

- Zero empty video modules across 50 consecutive career plan generations
- When YouTube quota is exhausted on key 1, key 2 is used automatically
- When all keys exhausted, curated fallback returns ≥2 resources per gap
- Cache hit rate > 60% after the first day of operation

## P1: Nice-to-Have

### P1.1 — Adaptive quiz difficulty

Track per-user quiz history by topic in MongoDB. When generating a new quiz, include the user's past scores in the prompt: "This user scored 40% on React Hooks last time. Generate questions at a slightly higher difficulty but include 1-2 questions on the areas they got wrong."

The quiz should feel progressively harder as the user improves, and loop back to weak spots until they're consistently strong.

### P1.2 — Cross-gap learning synthesis

The current career plan treats each gap independently. A world-class system would notice when gaps overlap and synthesize them into a single learning path. Example: if a candidate is missing both TypeScript AND Next.js, the plan should recommend "Build a Next.js app in TypeScript" as one project that addresses both gaps simultaneously, rather than two separate projects.

Implement in the career planning graph's `suggest_projects` node: before generating projects, cluster gaps by technology relatedness using Jev (Choice: "Are these two skills commonly used together?"), then generate projects that address gap clusters.

### P1.3 — Resume version diffing

When a candidate uploads a new resume, show what changed: new skills added, experience updated, projects added. Then re-run matching against their previously matched jobs and show score improvements: "Your score for Senior Frontend Engineer improved from 42 → 61 after adding your React project."

This creates a feedback loop: upload → match → identify gaps → learn → update resume → match again → see improvement.

### P1.4 — Batch matching with parallel execution

When a candidate matches against 10 jobs, currently it's sequential. Run matches in parallel (asyncio.gather) with a concurrency limit of 3 to avoid rate-limiting DeepSeek. Show results as they complete (streaming), not all at once.

Same for recruiter shortlisting: 50 candidates against one job should run in parallel batches of 5.

### P1.5 — Mock interview session memory

Store mock interview sessions in MongoDB. When a user starts a new mock interview on the same role, the system reviews their past sessions: "Last time you struggled with system design questions about database scaling. This session will include a follow-up on that topic."

The mock interview becomes a long-term training tool, not a stateless generator.

### P1.6 — Confidence intervals on match scores

Jev already returns probability distributions for each Score question. Expose this as a confidence interval on the match score: "Your match score is 62 ± 8 (range: 54-70)." When confidence is low (wide interval), the explanation should say why: "This score has wide uncertainty because your resume mentions Docker but doesn't describe how you've used it — adding details would narrow the range."

This turns a single number into actionable guidance.

## P2: Future Considerations

### P2.1 — Jev calibration with labeled data

Once enough real matches exist (500+), export resume-job pairs with human-validated scores. Use these to fine-tune Jev's Score level descriptions per skill category. Backend engineering skills need different level descriptions than frontend or data science.

### P2.2 — Multi-model ensemble for high-stakes scoring

For recruiter shortlisting (high-stakes decision), run the match through both DeepSeek AND a second model (Llama via Groq, or Claude via API). If scores diverge by >15 points, flag for human review. Consensus = higher confidence.

### P2.3 — Industry-specific Jev question sets

A healthcare recruiter needs different evaluation criteria than a fintech recruiter. Allow companies to define custom Jev question sets per job category. The Score levels for "Python experience" in a data science role should mention "pandas, scikit-learn, Jupyter" — different from a web dev role's "Django, FastAPI, Celery."

### P2.4 — Candidate-to-candidate comparison

Recruiter says: "Compare Alex and Jordan for this role." The system runs both through matching, then generates a head-to-head comparison: where Alex is stronger, where Jordan is stronger, and which gaps each would need to close. This is a recruiter power feature.

### P2.5 — Employer-side analytics dashboard

Aggregate data across matches: which skills are most commonly missing in your applicant pool, what's the average match score by job seniority, which roles attract the strongest candidates. Feed this back to job description writing: "Your JD requires 7 years of Kubernetes — only 3% of applicants meet this. Consider reducing to 3 years."

## Success Metrics

### Leading indicators (days to weeks)

| Metric | Target | Measurement | Evaluation at |
| --- | --- | --- | --- |
| Evidence items per match | ≥6 (was 2) | Count evidence array across 100 test matches | Day 3 after P0.1 ships |
| Component score correlation (r²) | >0.85 | 20-resume calibration suite regression | Day 1 after P0.2 ships |
| Time to first token (P95) | <2s | Instrument all streaming endpoints | Day 1 after P0.3 ships |
| Gap classification accuracy | ≥95% (was 88%) | Calibration suite gap checks | Day 1 after P0.4 ships |
| Fallback activation rate | <5% of total calls | Monitor health endpoint model field | Week 1 after P0.5 ships |
| Empty video modules | 0% (was 37.5%) | Count across 50 career plan generations | Day 1 after P0.6 ships |
| Quiz generation P95 latency | <5s (was 19.6s) | Endpoint timing | Day 1 after P0.3 ships |

### Lagging indicators (weeks to months)

| Metric | Target | Measurement | Evaluation at |
| --- | --- | --- | --- |
| User return rate (same user, 2+ sessions) | >30% | MongoDB user activity logs | Month 1 |
| Quiz score improvement (same topic, 3+ attempts) | >15% average improvement | Per-user quiz score tracking | Month 2 (requires P1.1) |
| Resume re-upload rate | >20% | Count users who upload >1 resume version | Month 2 (requires P1.3) |
| Match-to-career-plan conversion | >50% | Count users who generate a career plan after matching | Month 1 |

## Open Questions

| # | Question | Owner | Blocking? |
| --- | --- | --- | --- |
| Q1 | What's the right DeepSeek fallback model? Is `deepseek-reasoner` available on the same API key, or do we need a Groq API key for Llama fallback? | Engineering | Yes — blocks P0.5 |
| Q2 | Should the calibration test suite be part of CI, running on every commit? Or a manual check before each deploy? | Engineering | No |
| Q3 | How many YouTube API keys can we create across GCP projects before Google flags it as quota abuse? | Engineering | No — but affects P0.6 long-term |
| Q4 | Should Jev score levels be different per job category (engineering vs design vs PM)? If yes, that's P2.3 brought forward. | Product | No |
| Q5 | For P1.6 confidence intervals — do we display the range to recruiters too, or only candidates? Recruiters might see uncertainty as a weakness. | Product | No |
| Q6 | What's the streaming behavior when a user navigates away mid-stream? Do we kill the DeepSeek call or let it complete (for caching)? | Engineering | No — but affects cost |

## Phased Rollout

### Phase 1: Evidence + Calibration (Week 1)

Ship P0.1 (evidence density), P0.2 (score recalibration), P0.4 (Jev question tuning).

These three changes are prompt-level fixes — no new infrastructure, no new dependencies, no frontend changes beyond displaying more evidence items. They transform output quality with the lowest implementation risk.

**Validation:** Run the full quality audit (scripts/quality-audit.mjs) before and after. Compare evidence counts, component scores, and gap classification accuracy.

**Expected impact:** Evidence items per match: 2 → 8. Skills component for a qualified candidate: 0.225 → 0.55+. Gap accuracy: 88% → 95%+.

### Phase 2: Streaming + Resilience (Week 2)

Ship P0.3 (streaming responses), P0.5 (model fallback), P0.6 (YouTube resilience).

These are infrastructure changes — SSE streaming from FastAPI, retry/fallback wrapper around model calls, YouTube key rotation + caching. Frontend needs EventSource integration for streaming endpoints.

**Validation:** Measure P95 latency before and after streaming. Simulate DeepSeek outage (point to bad URL) and verify fallback activates. Exhaust YouTube quota and verify career plans still return resources.

**Expected impact:** Quiz latency: 19.6s → <5s perceived (streaming). Zero empty video modules. AI uptime during provider outages: 0% → 99.9%.

### Phase 3: Adaptive Intelligence (Weeks 3-4)

Ship P1.1 (adaptive quizzes), P1.2 (cross-gap synthesis), P1.5 (interview memory), P1.6 (confidence intervals).

These turn X-CEED from a stateless analysis tool into a system that learns about each candidate over time. They require per-user state tracking in MongoDB and changes to the LangGraph graph inputs.

**Validation:** Create a test user who takes 3 quizzes on React, improving each time. Verify quiz 3 is harder than quiz 1. Verify cross-gap projects address 2+ gaps simultaneously. Verify mock interview session 2 references weaknesses from session 1.

**Expected impact:** User return rate increase. Quiz improvement over sessions becomes measurable.

### Phase 4: Power features (Weeks 5-6, if warranted)

Ship P1.3 (resume diffing), P1.4 (batch matching). Evaluate P2 items based on user data from phases 1-3.

### Success gate per phase

Each phase ships only after:

1. The quality audit passes with improved numbers
2. The production smoke test passes
3. No regression in any previously passing metric

   ## Cursor Execution Prompts

   Paste one prompt per phase into Cursor agent mode. Each prompt is self-contained with verification gates. Do NOT proceed to the next phase until gates pass.

   ---

   ### Phase 1 Prompt: Evidence + Calibration

   ````
   Reference CURSOR_BIBLE.md and the X-CEED AI Layer v2 PRD. You are implementing Phase 1: evidence density, score recalibration, and Jev prompt tuning. All changes are in services/python/xceed_ai_core.py (the LangGraph service).
   
   TASK 1: EVIDENCE DENSITY (P0.1)
   
   Find the extract_evidence node in the matching graph. The current prompt returns too few evidence items (2 for an 8-requirement job). Fix it:
   
   1. Change the DeepSeek prompt to explicitly enumerate every job requirement and demand one evidence item per requirement:
   
   ```python
   EVIDENCE_SYSTEM = """You are extracting evidence from a resume for each job requirement.
   For EACH requirement listed below, find the strongest supporting evidence in the resume.
   If no evidence exists for a requirement, return {"resume_excerpt": "No evidence found in resume", "strength": "none"}.
   
   Return a JSON array with EXACTLY {n_requirements} items, one per requirement, in the same order.
   Each item: {{"requirement": string, "resume_excerpt": string (quote the resume or say 'No evidence found'), "strength": "none"|"weak"|"moderate"|"strong"}}
   
   Requirements:
   {numbered_requirements}
   
   Return valid JSON only. No markdown fences."""
   
   def extract_evidence(state: MatchState) -> dict:
       requirements = state["job_requirements"]
       numbered = "\n".join(f"{i+1}. {r['description']}" for i, r in enumerate(requirements))
       prompt = EVIDENCE_SYSTEM.format(
           n_requirements=len(requirements),
           numbered_requirements=numbered
       )
       response = deepseek.invoke([
           {"role": "system", "content": prompt},
           {"role": "user", "content": f"Resume text:\n\n{state['candidate_profile'].get('raw_text', '')}"}
       ])
       evidence = json.loads(response.content)
       # Validate count
       if len(evidence) != len(requirements):
           # Retry with stricter prompt
           ...
       return {"evidence": evidence}
   ````
   2. Add validation: if the response doesn't have exactly N items, retry once with a stricter prompt that says "You returned {actual} items but I need exactly {expected}. Try again."
   3. Update the match response builder to include all evidence items in the API response, including "none" strength items.

   TASK 2: COMPONENT SCORE RECALIBRATION (P0.2)

   Find the score\_requirements function that calls Jev. The current Score levels are too strict.
   1. Replace the Jev score level descriptions with these calibrated levels:

   ```python
   "levels": [
       "Not mentioned anywhere in the resume",
       "Mentioned as a keyword only — no context, no project, no duration",
       "Used in at least one project or role with 1-2 years experience",
       "Regular professional use across multiple projects, 2-4 years, demonstrated impact",
       "Deep expertise — 4+ years, led or architected systems, mentored others, or open-source contributions"
   ]
   ```
   2. Find the weighted\_score / compute\_weighted\_score function. Change the normalization:

   OLD (likely): component\_score = sum(jev\_scores) / (len(requirements) \* 4)  # divided by max possible NEW: component\_score = sum(jev\_scores) / (len(requirements) \* 4)  — actually keep this BUT the issue is the levels. With recalibrated levels, a 3-year React dev should score level 3 (0.75) not level 1-2 (0.25-0.5). The level descriptions are the fix, not the math.
   3. IMPORTANT: After changing levels, verify the weighted\_score computation. Print the raw Jev scores for each requirement before weighting. A candidate with "React (3 years): Built customer-facing dashboard" should get level 3 on React, not level 1.

   TASK 3: JEV QUESTION TUNING (P0.4)

   Find every Jev question in score\_requirements and classify\_gaps. Make each technology-specific:
   1. For technology skills, change questions to require explicit naming:
      - Old: "How well does the candidate demonstrate AWS experience?"
      - New: "Does the candidate explicitly mention AWS services (S3, EC2, Lambda, CloudFront, RDS, ECS, IAM) by name? Score based only on named AWS services, not general cloud or deployment mentions."
   2. Apply the same pattern to: Docker (must mention Docker/containers by name), GraphQL (must mention GraphQL by name), TypeScript (must mention TypeScript by name, not just JavaScript), Node.js (must mention Node.js/Node by name).
   3. For the Noul must\_have questions, be equally specific:
      - Old: "Does the candidate meet the minimum bar for Docker?"
      - New: "Has the candidate used Docker in a professional or project context, with evidence of containerization work? Yes requires explicit Docker mention with context."

   VERIFICATION:

   Run the calibration test with 3 synthetic resumes (same as quality-audit.mjs uses):

   Resume A (perfect match):
   - Expected: score > 70, evidence items = number of job requirements, skills component > 0.6

   Resume B (partial match):
   - Expected: score 35-60, evidence items = number of job requirements (most with strength "none" or "weak"), skills component 0.2-0.4
   - AWS gap classified as "missing" not "weak"

   Resume C (mismatch):
   - Expected: score < 25, skills component < 0.1

   Specific gates — ALL must pass:
   - [ ] Resume A evidence count = number of job requirements (not 2)
   - [ ] Resume A skills component > 0.55 (was 0.225)
   - [ ] Resume B AWS classification = "missing" (was "weak")
   - [ ] Resume C skills component < 0.1
   - [ ] Score discrimination A→B > 20 points
   - [ ] Score discrimination B→C > 15 points
   - [ ] Zero hallucinated evidence (evidence text not in resume)
   - [ ] Run the same Resume A match twice — score delta < 3 points (consistency preserved)

   Run: node scripts/quality-audit.mjs after changes and paste the results.

   ```
   
   ---
   
   ### Phase 2 Prompt: Streaming + Resilience
   
   ```

   Reference CURSOR\_BIBLE.md and the X-CEED AI Layer v2 PRD. You are implementing Phase 2: streaming responses, model fallback, and YouTube resilience.

   TASK 1: STREAMING RESPONSES (P0.3)

   Add Server-Sent Events streaming to these endpoints in xceed\_ai\_core.py:
   1. POST /match/stream — Streams the match result progressively:
      - First event: {"type": "scores", "data": {overallScore, componentScores, weights}} (instant — from Jev, already computed)
      - Second event: {"type": "evidence", "data": \[...evidence items...\]} (after DeepSeek extract\_evidence completes)
      - Streaming events: {"type": "explanation\_chunk", "data": "...text..."} (DeepSeek explanation, token by token)
      - Final event: {"type": "complete", "data": {full result}}
      - On error: {"type": "error", "data": "message"}

   ```python
   from fastapi.responses import StreamingResponse
   import asyncio
   
   @app.post("/match/stream")
   async def match_stream(request: MatchRequest):
       async def event_generator():
           try:
               # Run Jev scoring first (fast)
               jev_result = score_requirements(state)
               weighted = compute_weighted_score({**state, **jev_result})
               yield f"data: {json.dumps({'type': 'scores', 'data': weighted})}\n\n"
               
               # Run evidence extraction
               evidence = extract_evidence({**state, **jev_result})
               yield f"data: {json.dumps({'type': 'evidence', 'data': evidence})}\n\n"
               
               # Stream explanation
               async for chunk in stream_explanation({**state, **jev_result, **evidence}):
                   yield f"data: {json.dumps({'type': 'explanation_chunk', 'data': chunk})}\n\n"
               
               yield f"data: {json.dumps({'type': 'complete'})}\n\n"
           except Exception as e:
               yield f"data: {json.dumps({'type': 'error', 'data': str(e)})}\n\n"
       
       return StreamingResponse(event_generator(), media_type="text/event-stream")
   ```
   2. Apply the same pattern to:
      - POST /career-plan/stream — stream objectives, then projects, then resources as they generate
      - POST /mock-interview/question/stream — stream the question text
      - POST /mock-interview/analyze/stream — stream the feedback
   3. For quiz generation in xceed\_ai\_support.py:
      - POST /quiz/generate/stream — generate and send each question as a separate SSE event as it's produced. Don't wait for all 5 to complete.
      - Change the DeepSeek prompt to generate questions one at a time (5 sequential calls with 1 question each) instead of one call for all 5. Each call is fast (\~2-3 seconds). Send each question event immediately.
   4. Keep the non-streaming endpoints working (don't break /match, /career-plan etc). Add /stream variants alongside them. The frontend calls the stream variant when available, falls back to blocking if SSE fails.
   5. Frontend: Update the Next.js API proxy routes to pass through SSE. In the React components:

   ```javascript
   const eventSource = new EventSource(`/api/match/stream?${params}`);
   // OR use fetch with ReadableStream:
   const response = await fetch('/api/match/stream', { method: 'POST', body: JSON.stringify(data) });
   const reader = response.body.getReader();
   const decoder = new TextDecoder();
   while (true) {
     const { done, value } = await reader.read();
     if (done) break;
     const text = decoder.decode(value);
     // Parse SSE events, update state progressively
   }
   ```

   For the match page: show scores immediately when the "scores" event arrives, then populate evidence cards when "evidence" arrives, then stream the explanation text character by character.

   For the quiz page: show each question card as it arrives, with a loading skeleton for the remaining questions.

   TASK 2: MODEL FALLBACK (P0.5)

   Create a utility wrapper in xceed\_ai\_core.py:

   ```python
   import httpx
   import logging
   
   logger = logging.getLogger("xceed")
   
   class ResilientLLM:
       def __init__(self):
           self.models = [
               {"name": "deepseek-chat", "base_url": "https://api.deepseek.com", "key_env": "DEEPSEEK_API_KEY"},
           ]
           self.active_model = self.models[0]["name"]
       
       async def invoke(self, messages, **kwargs):
           for model_config in self.models:
               try:
                   llm = ChatOpenAI(
                       model=model_config["name"],
                       base_url=model_config["base_url"],
                       api_key=os.getenv(model_config["key_env"]),
                       temperature=kwargs.get("temperature", 0.1),
                   )
                   result = await llm.ainvoke(messages)
                   self.active_model = model_config["name"]
                   return result
               except Exception as e:
                   logger.warning(f"Model {model_config['name']} failed: {e}")
                   continue
           raise Exception("All models failed")
       
       def get_status(self):
           return {"active_model": self.active_model}
   
   resilient_llm = ResilientLLM()
   ```

   Replace all direct `deepseek.invoke()` calls with `resilient_llm.invoke()`.

   For Jev fallback: if TypeSafe returns an error, fall back to DeepSeek-based classification:

   ```python
   async def jev_with_fallback(questions, state):
       try:
           return jev_client.system_one(state=state, questions=questions)
       except Exception as e:
           logger.warning(f"Jev failed: {e}, falling back to DeepSeek classification")
           # Convert Jev questions to a DeepSeek prompt that returns the same structure
           prompt = "Answer these questions about the candidate. Return JSON matching this exact structure: {question_key: {score: 0-4, probability: 0-1}}\n"
           for key, q in questions.items():
               prompt += f"- {key}: {q['text']}\n"
           response = await resilient_llm.invoke([{"role": "system", "content": prompt}, ...])
           return parse_deepseek_as_jev(response)
   ```

   Update the /health endpoint to report which model is active:

   ```json
   {"status": "ok", "active_model": "deepseek-chat", "jev": true, "mongo": true}
   ```

   TASK 3: YOUTUBE RESILIENCE (P0.6)
   1. Support multiple YouTube API keys:

   ```python
   class YouTubeKeyRotator:
       def __init__(self):
           keys = os.getenv("YOUTUBE_API_KEYS", os.getenv("YOUTUBE_API_KEY", ""))
           self.keys = [k.strip() for k in keys.split(",") if k.strip()]
           self.current_index = 0
           self.exhausted = set()
       
       def get_key(self):
           available = [k for i, k in enumerate(self.keys) if i not in self.exhausted]
           if not available:
               return None
           return available[0]
       
       def mark_exhausted(self, key):
           idx = self.keys.index(key)
           self.exhausted.add(idx)
       
       def reset(self):  # call daily
           self.exhausted.clear()
   ```
   2. Extend the MongoDB cache TTL for YouTube results from 24 hours to 7 days:

   ```python
   YT_CACHE_TTL = timedelta(days=7)
   ```
   3. Add curated fallback channels per technology:

   ```python
   CURATED_CHANNELS = {
       "react": [{"title": "React Course - Beginner's Tutorial by freeCodeCamp", "url": "https://www.youtube.com/watch?v=bMknfKXIFA8", "channel": "freeCodeCamp"}],
       "node.js": [{"title": "Node.js Tutorial by Programming with Mosh", "url": "https://www.youtube.com/watch?v=TlB_eWDSMt4", "channel": "Programming with Mosh"}],
       "typescript": [{"title": "TypeScript Full Course by freeCodeCamp", "url": "https://www.youtube.com/watch?v=SpwzRDUQ1GI", "channel": "freeCodeCamp"}],
       "python": [{"title": "Python for Beginners by Programming with Mosh", "url": "https://www.youtube.com/watch?v=kqtD5dpn9C8", "channel": "Programming with Mosh"}],
       "docker": [{"title": "Docker Tutorial by TechWorld with Nana", "url": "https://www.youtube.com/watch?v=3c-iBn73dDE", "channel": "TechWorld with Nana"}],
       "aws": [{"title": "AWS Certified Cloud Practitioner by freeCodeCamp", "url": "https://www.youtube.com/watch?v=SOTamWNgDKc", "channel": "freeCodeCamp"}],
       "graphql": [{"title": "GraphQL Course for Beginners by freeCodeCamp", "url": "https://www.youtube.com/watch?v=ed8SzALpx1Q", "channel": "freeCodeCamp"}],
       "git": [{"title": "Git Tutorial for Beginners by Mosh", "url": "https://www.youtube.com/watch?v=8JJ101D3knE", "channel": "Programming with Mosh"}],
       "next.js": [{"title": "Next.js 14 Full Course by JavaScript Mastery", "url": "https://www.youtube.com/watch?v=wm5gMKuwSYk", "channel": "JavaScript Mastery"}],
       "kubernetes": [{"title": "Kubernetes Tutorial by TechWorld with Nana", "url": "https://www.youtube.com/watch?v=X48VuDVv0do", "channel": "TechWorld with Nana"}],
   }
   ```

   In the career planning graph's search\_resources node:
   - Try cache first (7-day TTL)
   - If cache miss, try YouTube API with key rotation
   - If all keys exhausted, use curated fallback and mark resources as source: "curated"
   - Never return an empty video array

   VERIFICATION:
   - [ ] POST /match/stream returns SSE events: first "scores" event arrives within 2 seconds
   - [ ] POST /quiz/generate/stream sends each question as a separate event (not all at once)
   - [ ] Non-streaming endpoints (/match, /career-plan) still work unchanged
   - [ ] Simulate DeepSeek failure (temporarily set wrong API key) — verify fallback activates and endpoint still returns a result
   - [ ] /health reports the active model name
   - [ ] Set YOUTUBE\_API\_KEYS to two keys, exhaust the first (100 requests) — verify second key is used
   - [ ] Set all YouTube keys to invalid — verify curated fallback returns resources (not empty)
   - [ ] Generate a career plan — zero empty video modules
   - [ ] Run the full production smoke test (scripts/production-smoke-test.mjs) — all previous checks still pass

   ```
   
   ---
   
   ### Phase 3 Prompt: Adaptive Intelligence
   
   ```

   Reference CURSOR\_BIBLE.md and the X-CEED AI Layer v2 PRD. You are implementing Phase 3: adaptive quiz difficulty, cross-gap synthesis, mock interview memory, and confidence intervals.

   TASK 1: ADAPTIVE QUIZ DIFFICULTY (P1.1)
   1. Create a quiz\_history collection in MongoDB. Schema:

   ```json
   {
     "userId": "ObjectId",
     "topic": "string",
     "difficulty": "easy|medium|hard",
     "score": 0-100,
     "questionsCount": 5,
     "wrongTopics": ["closures", "useEffect cleanup"],
     "timestamp": "ISODate"
   }
   ```
   2. In the quiz generation endpoint (/quiz/generate), before generating:
      - Query quiz\_history for this user + this topic, sorted by timestamp desc, limit 3
      - If previous attempts exist, include them in the DeepSeek prompt:

   ```python
   history_context = ""
   if past_quizzes:
       history_context = f"""\n\nThis user has taken {len(past_quizzes)} previous quizzes on this topic.
       Most recent scores: {[q['score'] for q in past_quizzes]}.
       Topics they got wrong previously: {wrong_topics}.
       
       Rules based on history:
       - If their last score was below 50%: keep the same difficulty but include 2 questions specifically on their weak topics: {wrong_topics}
       - If their last score was 50-80%: increase difficulty slightly and include 1 question on their weak topics
       - If their last score was above 80%: increase difficulty significantly, test edge cases and advanced concepts
       - NEVER repeat a question they've seen before. Generate completely new questions."""
   ```
   3. On quiz submit, save the result to quiz\_history, including which specific sub-topics they got wrong.
   4. Add a GET /quiz/history?topic=X endpoint that returns the user's quiz score progression for a topic.

   TASK 2: CROSS-GAP LEARNING SYNTHESIS (P1.2)
   1. In the career planning graph, add a new node "cluster\_gaps" between load\_gaps and generate\_objectives:

   ```python
   def cluster_gaps(state: CareerState) -> dict:
       """Group related gaps that can be learned together."""
       gaps = state["gaps"]
       if len(gaps) <= 2:
           return {"gap_clusters": [[g] for g in gaps]}  # no clustering needed
       
       # Use Jev to classify relatedness
       questions = {}
       for i, g1 in enumerate(gaps):
           for j, g2 in enumerate(gaps):
               if i < j:
                   questions[f"related_{i}_{j}"] = {
                       "type": "noul",
                       "text": f"Are {g1['requirement']} and {g2['requirement']} commonly used together in the same project? Would a developer typically learn them together?"
                   }
       
       resp = jev_with_fallback(questions, {"gaps": gaps})
       
       # Cluster gaps where relatedness > 0.7
       clusters = []  # build connected components from high-relatedness pairs
       ...
       return {"gap_clusters": clusters}
   ```
   2. In suggest\_projects, generate projects per cluster rather than per gap:
      - A cluster of \[TypeScript, Next.js, React\] gets ONE project that addresses all three
      - A standalone gap like \[Docker\] gets its own project
      - Each project description explicitly states which gaps it addresses
   3. In the career plan UI, show clustered gaps together under a combined learning module.

   TASK 3: MOCK INTERVIEW MEMORY (P1.5)
   1. Create a mock\_interview\_sessions collection. Schema:

   ```json
   {
     "userId": "ObjectId",
     "role": "string",
     "interview_type": "technical|behavioral|system_design|mixed",
     "questions": [
       {
         "question": "string",
         "answer": "string",
         "score": 1-10,
         "weaknesses": ["string"],
         "strengths": ["string"]
       }
     ],
     "overall_score": 1-10,
     "key_weaknesses": ["string"],
     "timestamp": "ISODate"
   }
   ```
   2. In /mock-interview/question, before generating Q1:
      - Query mock\_interview\_sessions for this user + this role, sorted by timestamp desc, limit 3
      - If past sessions exist, add to the prompt:

   ```
   This candidate has done {n} previous mock interviews for {role}.
   Their persistent weaknesses (appeared in 2+ sessions): {recurring_weaknesses}
   Their strengths: {recurring_strengths}
   
   For this session:
   - Start with a question that probes one of their persistent weaknesses
   - If they've improved on a previously weak area, acknowledge it in feedback
   - Progressively test areas they haven't been asked about before
   ```
   3. After the session's final report, save the full session to mock\_interview\_sessions.
   4. Add GET /mock-interview/progress?role=X that returns score trend across sessions.

   TASK 4: CONFIDENCE INTERVALS (P1.6)
   1. Jev already returns probability distributions in fit\_probabilities. Use them:

   ```python
   def compute_confidence_interval(jev_scores: dict) -> dict:
       """Compute confidence interval from Jev probability distributions."""
       intervals = {}
       for req_name, scores in jev_scores.items():
           probs = scores["fit_probabilities"]
           # Expected value
           ev = sum(int(k) * v for k, v in probs.items())
           # Variance
           var = sum(v * (int(k) - ev) ** 2 for k, v in probs.items())
           std = var ** 0.5
           # 90% confidence interval (±1.645 std)
           margin = 1.645 * std / 4 * 100  # normalize to 0-100 scale
           intervals[req_name] = {
               "score": scores["fit_score"] * 100,
               "margin": round(margin, 1),
               "low": max(0, round(scores["fit_score"] * 100 - margin, 1)),
               "high": min(100, round(scores["fit_score"] * 100 + margin, 1)),
               "confidence": scores["confidence"]
           }
       return intervals
   ```
   2. Include confidence intervals in the match response alongside component scores.
   3. In the explanation generation prompt, add: "When a score has low confidence (wide interval), explain why — what information is missing from the resume that would clarify the candidate's level."
   4. In the match results UI, show component scores with ± ranges. For scores with wide intervals (margin > 15), show a tooltip: "This score could improve if you add more details about \[skill\] to your resume."

   VERIFICATION:
   - [ ] Take quiz on "React hooks" three times with improving answers. Verify:
     - Quiz 2 references topics from quiz 1's wrong answers
     - Quiz 3 is harder than quiz 1
     - No repeated questions across all 3 quizzes
     - GET /quiz/history shows score progression
   - [ ] Generate a career plan for a candidate missing TypeScript + Next.js + React:
     - These 3 gaps appear in ONE cluster, not three separate modules
     - At least one project addresses all 3 simultaneously
     - The project description mentions all 3 technologies
   - [ ] Run mock interview for "Frontend Engineer" twice:
     - Session 2's first question probes a weakness from session 1
     - GET /mock-interview/progress shows both sessions with scores
   - [ ] Match result includes confidence intervals:
     - A skill with strong evidence (e.g., "React 5 years, led migration") has a narrow interval (margin < 10)
     - A skill with weak evidence (e.g., "some Python") has a wide interval (margin > 15)
     - Explanation mentions why uncertain scores are uncertain
   - [ ] Run production smoke test — all previously passing checks still pass (no regressions)

   ```
   ```
