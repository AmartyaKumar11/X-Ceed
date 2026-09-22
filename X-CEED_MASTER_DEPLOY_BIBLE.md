# X-CEED Master Deploy Bible

> **Purpose:** Single authoritative reference for the 48-hour deployment sprint. Drop this file in the repo root as `CURSOR_BIBLE.md`. Every Cursor agent session references this file. No other document overrides it.
>
> **What X-CEED is:** AI-powered recruitment intelligence and career enablement platform. Multi-agentic LangGraph pipelines, GraphQL dashboard layer, EduChain blockchain accountability, deployed as microservices on Vercel + Railway.

---

## 1. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        VERCEL                           │
│                                                         │
│  Next.js 15 + React 19                                  │
│  ├── Frontend (App Router)                              │
│  ├── REST API Routes (Auth, Jobs, Apps, Upload)         │
│  └── GraphQL Gateway (/api/graphql — Apollo Server)     │
│                                                         │
│  Client-side: wagmi + RainbowKit → EduChain Testnet     │
└──────────┬──────────────────────┬───────────────────────┘
           │                      │
           ▼                      ▼
┌─────────────────────┐  ┌─────────────────────┐
│  RAILWAY: AI CORE   │  │  RAILWAY: AI SUPPORT │
│  Port 8000           │  │  Port 8001           │
│                      │  │                      │
│  FastAPI + LangGraph │  │  FastAPI (stateless) │
│  4 StateGraphs:      │  │                      │
│  • Resume Analysis   │  │  • Quiz generation   │
│  • Matching          │  │  • Mock interview    │
│  • Gap Analysis      │  │  • Video AI          │
│  • Career Planning   │  │  • YouTube curation  │
│  + RAG Chat (Chroma) │  │                      │
│                      │  │                      │
│  Models:             │  │  Model:              │
│  Jev (decisions)     │  │  DeepSeek V4 Flash   │
│  DeepSeek (text gen) │  │                      │
└──────────────────────┘  └──────────────────────┘
           │                      │
           ▼                      ▼
    ┌──────────────┐      ┌──────────────┐
    │ MongoDB Atlas │      │  YouTube API │
    └──────────────┘      └──────────────┘
```

**Key decisions:**
- GraphQL lives as a Next.js API route (`/api/graphql`), NOT a separate service. Same origin = no CORS. Shares MongoDB connection and auth middleware.
- LangGraph only in AI Core. AI Support services are stateless request-response — LangGraph overhead is wrong there.
- Blockchain is client-side only. wagmi + RainbowKit call the EduChain contract directly from the browser. No backend blockchain service.
- REST stays for mutations (auth, job CRUD, application submit, file upload). GraphQL is read-only for dashboards.

---

## 2. Model Stack

Three-tier inference. Each model does what it's built for.

### Tier 1: Jev (TypeSafe) — System 1 decisions

- **Cost:** $0.04/M input tokens, free output
- **Latency:** 70–500ms
- **What it does:** Returns typed decisions with calibrated probabilities. No text generation. Three primitives: `choice` (pick one from options), `score` (rate against ordered levels), `noul` (yes/no probability 0–1).
- **Why:** Eliminates JSON parsing risk. Typed answers go straight into code. Sub-second. Near-zero cost.

**Used for these LangGraph nodes:**
- `classify_skill_levels` — Score per skill (5 levels: not mentioned → led architecture)
- `score_requirements` — Noul per must-have, Score per skill requirement
- `classify_gaps` — Choice per gap: missing / weak / under-evidenced
- `prioritize_gaps` — Score per gap: priority level
- `filter_resources` — Noul per YouTube result: is this relevant?
- `quality_gate` — Noul: is this actually a resume / educational content / not clickbait?

**Integration pattern:**

```python
from typesafe_sdk import TypeSafeClient
import os

jev_client = TypeSafeClient(api_key=os.getenv("TYPESAFE_API_KEY"))

def score_requirements(state: MatchState) -> dict:
    """Jev scores each job requirement against the candidate profile."""
    questions = {}
    for i, req in enumerate(state["job_requirements"]):
        questions[f"req_{i}_fit"] = {
            "type": "score",
            "text": f"How well does the candidate demonstrate: {req['description']}?",
            "levels": [
                "Not mentioned anywhere in the resume",
                "Mentioned but no evidence of depth",
                "Some relevant experience shown",
                "Strong demonstrated experience",
                "Led or architected work in this area"
            ]
        }
        questions[f"req_{i}_must_have"] = {
            "type": "noul",
            "text": f"Does the candidate meet the minimum bar for: {req['description']}?"
        }

    resp = jev_client.system_one(
        state={"resume": state["candidate_profile"], "job": state["job_requirements"]},
        questions=questions
    )

    scores = {}
    for i, req in enumerate(state["job_requirements"]):
        scores[req["name"]] = {
            "fit_level": resp.answers[f"req_{i}_fit"].score,
            "fit_probabilities": resp.answers[f"req_{i}_fit"].probabilities,
            "meets_minimum": resp.answers[f"req_{i}_must_have"].probability,
            "confidence": resp.answers[f"req_{i}_fit"].confidence
        }

    return {"requirement_scores": scores}
```

**Critical:** Always batch all questions for one candidate-job pair into a single `system_one` call. One call with 15 questions, not 15 calls with 1 question.

### Tier 2: DeepSeek V4 Flash — System 2 text generation

- **Cost:** $0.14/M input, $0.28/M output. Cache hits: $0.0028/M input (50x cheaper).
- **Latency:** 1–5s
- **API:** OpenAI-compatible. `base_url="https://api.deepseek.com"`, `model="deepseek-chat"`
- **What it does:** Structured JSON extraction from resumes, explanation generation, study plans, project recommendations, career guidance, AI outreach drafts, interview questions.

**Used for these LangGraph nodes:**
- `extract_entities` — Extract skills/experience/education/projects as JSON from resume text
- `semantic_compare` — Compare profile against job requirements, generate comparison text
- `extract_evidence` — Pull specific resume lines that support each match claim
- `generate_explanation` — Write human-readable match explanation
- `generate_objectives` — Create learning objectives from gaps
- `create_study_plan` — Generate time-bound study plan
- `suggest_projects` — Recommend portfolio projects for weak areas
- AI outreach drafts, interview questions (support service)

**Integration pattern:**

```python
from langchain_openai import ChatOpenAI

deepseek = ChatOpenAI(
    model="deepseek-chat",
    base_url="https://api.deepseek.com",
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    temperature=0.1,
    model_kwargs={"response_format": {"type": "json_object"}}  # for extraction nodes
)
```

**Critical prompt structure for cache hits:**

```python
# System prompt is LONG and STABLE — identical across all calls to this node.
# Variable data (resume, job) goes at the END.
# DeepSeek auto-caches matching prefixes → 50x input cost reduction.

RESUME_EXTRACTION_SYSTEM = """You are X-CEED's resume analysis engine.
Extract structured entities from the candidate resume below.
Return a JSON object with exactly these keys:

- skills: array of {name: string, level: "beginner"|"intermediate"|"advanced"|"expert", evidence: string}
- experience: array of {title: string, company: string, duration_months: int, description: string, technologies: string[]}
- education: array of {degree: string, institution: string, year: int, field: string}
- projects: array of {name: string, description: string, technologies: string[], impact: string}
- communication_profile: {writing_quality: 1-5, detail_level: "sparse"|"moderate"|"detailed", clarity: 1-5}

Rules:
- Only extract what is explicitly stated in the resume text.
- evidence must quote or closely paraphrase the resume text that supports the skill claim.
- If a field cannot be determined, use null.
- Return valid JSON only. No markdown fences. No explanatory text."""

def extract_entities(state: ResumeState) -> dict:
    response = deepseek.invoke([
        {"role": "system", "content": RESUME_EXTRACTION_SYSTEM},
        {"role": "user", "content": f"Resume text:\n\n{state['raw_text']}"}
    ])
    return {"entities": json.loads(response.content)}
```

### Tier 3: Code-only nodes (no model)

These nodes are pure Python — no AI call, no cost, no latency:
- `extract_text` — PDF parsing (pdf-parse / pdfplumber)
- `normalize_sections` — Regex + heuristics to split resume into sections
- `build_profile` — Assemble extracted entities into a candidate profile document
- `weighted_score` — Multiply Jev's requirement scores by the job's configurable weights
- `curate_resources` — YouTube Data API search + format results
- `persist` — Write results to MongoDB

### Node-to-model mapping (complete)

| Graph | Node | Model | Cost per call |
|---|---|---|---|
| Resume Analysis | extract_text | Code | $0 |
| Resume Analysis | normalize_sections | Code | $0 |
| Resume Analysis | extract_entities | DeepSeek | ~$0.0005 |
| Resume Analysis | classify_skill_levels | Jev | ~$0.0001 |
| Resume Analysis | build_profile | Code | $0 |
| Resume Analysis | persist | Code | $0 |
| Matching | semantic_compare | DeepSeek | ~$0.0006 |
| Matching | score_requirements | Jev | ~$0.0001 |
| Matching | weighted_score | Code | $0 |
| Matching | extract_evidence | DeepSeek | ~$0.0004 |
| Matching | generate_explanation | DeepSeek | ~$0.0003 |
| Gap Analysis | classify_gaps | Jev | ~$0.0001 |
| Gap Analysis | prioritize_gaps | Jev | ~$0.0001 |
| Gap Analysis | persist | Code | $0 |
| Career Planning | generate_objectives | DeepSeek | ~$0.0004 |
| Career Planning | create_study_plan | DeepSeek | ~$0.0005 |
| Career Planning | suggest_projects | DeepSeek | ~$0.0004 |
| Career Planning | filter_resources | Jev | ~$0.0001 |
| Career Planning | curate_resources | Code + YouTube API | $0 |
| Career Planning | persist | Code | $0 |
| **TOTAL per candidate cycle** | | | **~$0.003** |

---

## 3. Cost Optimization + Caching

Four layers. Each cuts cost independently.

### Layer 1: DeepSeek prefix caching (automatic)

No code needed. DeepSeek auto-caches repeated prompt prefixes. Cache hits drop input cost from $0.14/M to $0.0028/M (50x).

**Requirement:** Every DeepSeek node must structure prompts as LONG STABLE SYSTEM PROMPT + SHORT VARIABLE USER DATA. The system prompt is identical across all calls to that node. The variable data (resume text, job description) goes in the user message at the end.

After the first call to each node type, all subsequent calls hit the cache on the system prompt portion.

### Layer 2: Application-level result caching (MongoDB)

Don't re-run AI calls when inputs haven't changed.

```python
import hashlib
import json
from datetime import datetime, timedelta

CACHE_TTL = timedelta(hours=24)

def cached_invoke(graph, inputs: dict, cache_collection, cache_prefix: str):
    """Wrap any LangGraph invoke with MongoDB caching."""
    cache_key = cache_prefix + ":" + hashlib.sha256(
        json.dumps(inputs, sort_keys=True, default=str).encode()
    ).hexdigest()

    cached = cache_collection.find_one({"_id": cache_key})
    if cached and cached.get("expires_at", datetime.min) > datetime.utcnow():
        return cached["result"]

    result = graph.invoke(inputs)

    cache_collection.update_one(
        {"_id": cache_key},
        {"$set": {
            "result": result,
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + CACHE_TTL
        }},
        upsert=True
    )
    return result
```

**What to cache:**

| Operation | Cache key | TTL | Impact |
|---|---|---|---|
| Resume analysis | `resume:{hash(resume_text)}` | 24h | Same resume never re-parsed |
| Job requirement extraction | `job:{hash(job_description)}` | 24h | Same JD never re-extracted |
| Match scoring | `match:{hash(profile + job_id + weights)}` | 24h | Same pair never re-scored |
| Gap analysis | `gap:{hash(match_result_id)}` | 24h | Same match, same gaps |
| Career plan | `career:{hash(gap_ids + target_role)}` | 24h | Same gaps, same plan |
| YouTube curation | `yt:{hash(skill + difficulty)}` | 24h | Same search, same videos |

**Impact:** 50 candidates applying to the same job → job analysis runs once, not 50 times. A candidate matching against 10 jobs → resume analysis runs once.

### Layer 3: Jev batching

Already built into the architecture. One `system_one()` call with 8–15 questions per candidate-job pair. Not one call per question.

| Pattern | API calls | Latency |
|---|---|---|
| One call per requirement (10 reqs) | 10 | ~2s |
| One batched call | 1 | ~200ms |

### Layer 4: Prompt token optimization

Strip before sending:
- **Resume text:** Remove headers, footers, page numbers, repeated whitespace. Typical savings: 3,000 tokens → 1,500 tokens.
- **Job descriptions:** Extract requirements section only. Don't send salary, benefits, company boilerplate, EEO statements. Typical savings: 2,000 tokens → 800 tokens.
- **System prompts:** Tight and direct. "Return JSON with these keys" not a paragraph explaining why JSON matters.

```python
import re

def clean_resume_text(text: str) -> str:
    """Strip noise from resume text before sending to AI."""
    text = re.sub(r'\n{3,}', '\n\n', text)           # collapse blank lines
    text = re.sub(r'[ \t]{2,}', ' ', text)            # collapse whitespace
    text = re.sub(r'Page \d+ of \d+', '', text)       # page numbers
    text = re.sub(r'^\s*[-–—]{3,}\s*$', '', text, flags=re.MULTILINE)  # horizontal rules
    text = text.strip()
    return text

def extract_requirements_section(jd_text: str) -> str:
    """Extract only the requirements/qualifications from a job description."""
    # Send full JD to DeepSeek once for extraction, cache the result
    # Or use regex heuristics for common JD formats
    patterns = [
        r'(?i)(requirements|qualifications|what you.ll need|must have|skills).*?(?=\n\n(?:benefits|salary|about|equal|eeo)|$)',
    ]
    for pattern in patterns:
        match = re.search(pattern, jd_text, re.DOTALL)
        if match:
            return match.group(0).strip()
    return jd_text  # fallback: send full text
```

### Projected cost

| Scale | DeepSeek | Jev | Total |
|---|---|---|---|
| 100 candidates × 10 jobs (dev/testing) | ~$0.15 | ~$0.01 | **~$0.16** |
| 1,000 candidates × 50 jobs (launch) | ~$0.80 | ~$0.08 | **~$0.88** |
| 10,000 candidates × 200 jobs (growth) | ~$4.00 | ~$0.60 | **~$4.60** |

500 INR (~$6) DeepSeek top-up handles the entire sprint and months of low-volume production.

---

## 4. LangGraph Pipeline Specification

### 4.1 Shared state schemas

```python
from typing import TypedDict, Optional
from langgraph.graph import StateGraph, END

class ResumeState(TypedDict):
    raw_text: str
    cleaned_text: str
    sections: dict
    skills: list[dict]          # [{name, level, evidence}]
    experience: list[dict]      # [{title, company, duration_months, description, technologies}]
    education: list[dict]       # [{degree, institution, year, field}]
    projects: list[dict]        # [{name, description, technologies, impact}]
    communication_profile: dict # {writing_quality, detail_level, clarity}
    skill_levels: dict          # Jev output: {skill_name: {score, probabilities, confidence}}
    errors: list[str]
    retry_count: int

class MatchState(TypedDict):
    candidate_profile: dict
    job_requirements: dict
    weights: dict               # {skills: 0.35, experience: 0.25, education: 0.15, projects: 0.15, communication: 0.10}
    requirement_scores: dict    # Jev output per requirement
    semantic_comparison: str    # DeepSeek output
    evidence: list[dict]        # [{requirement, resume_excerpt, strength}]
    explanation: str            # DeepSeek output
    overall_score: float
    component_scores: dict      # {skills: float, experience: float, ...}
    confidence: float
    errors: list[str]

class GapState(TypedDict):
    match_result: dict
    gaps: list[dict]            # [{requirement, classification, priority, evidence}]
    prioritized_gaps: list[dict]
    errors: list[str]

class CareerState(TypedDict):
    gaps: list[dict]
    target_role: str
    objectives: list[dict]      # [{objective, related_gaps, timeline}]
    study_plan: dict            # {phases: [{name, duration, topics, milestones}]}
    projects: list[dict]        # [{name, description, technologies, addresses_gaps}]
    resources: list[dict]       # [{title, url, type, relevance_score}]
    errors: list[str]
```

### 4.2 Graph definitions

```python
# Resume Analysis Graph
resume_graph = StateGraph(ResumeState)
resume_graph.add_node("extract_text", extract_text)           # Code
resume_graph.add_node("normalize_sections", normalize_sections) # Code
resume_graph.add_node("extract_entities", extract_entities)     # DeepSeek
resume_graph.add_node("classify_skills", classify_skill_levels) # Jev
resume_graph.add_node("build_profile", build_profile)           # Code

resume_graph.set_entry_point("extract_text")
resume_graph.add_edge("extract_text", "normalize_sections")
resume_graph.add_edge("normalize_sections", "extract_entities")
resume_graph.add_conditional_edges(
    "extract_entities",
    lambda s: "retry" if s.get("errors") and s.get("retry_count", 0) < 3 else "continue",
    {"retry": "extract_entities", "continue": "classify_skills"}
)
resume_graph.add_edge("classify_skills", "build_profile")
resume_graph.add_edge("build_profile", END)

resume_app = resume_graph.compile()

# Matching Graph
match_graph = StateGraph(MatchState)
match_graph.add_node("semantic_compare", semantic_compare)       # DeepSeek
match_graph.add_node("score_requirements", score_requirements)   # Jev
match_graph.add_node("weighted_score", compute_weighted_score)   # Code
match_graph.add_node("extract_evidence", extract_evidence)       # DeepSeek
match_graph.add_node("generate_explanation", generate_explanation) # DeepSeek

match_graph.set_entry_point("semantic_compare")
match_graph.add_edge("semantic_compare", "score_requirements")
match_graph.add_edge("score_requirements", "weighted_score")
match_graph.add_edge("weighted_score", "extract_evidence")
match_graph.add_edge("extract_evidence", "generate_explanation")
match_graph.add_edge("generate_explanation", END)

match_app = match_graph.compile()

# Gap Analysis Graph
gap_graph = StateGraph(GapState)
gap_graph.add_node("classify_gaps", classify_gaps)       # Jev
gap_graph.add_node("prioritize_gaps", prioritize_gaps)   # Jev

gap_graph.set_entry_point("classify_gaps")
gap_graph.add_edge("classify_gaps", "prioritize_gaps")
gap_graph.add_edge("prioritize_gaps", END)

gap_app = gap_graph.compile()

# Career Planning Graph
career_graph = StateGraph(CareerState)
career_graph.add_node("generate_objectives", generate_objectives)   # DeepSeek
career_graph.add_node("create_study_plan", create_study_plan)       # DeepSeek
career_graph.add_node("suggest_projects", suggest_projects)         # DeepSeek
career_graph.add_node("search_resources", search_youtube_resources) # YouTube API
career_graph.add_node("filter_resources", filter_resources)         # Jev
career_graph.add_node("curate_resources", curate_final_resources)   # Code

career_graph.set_entry_point("generate_objectives")
career_graph.add_edge("generate_objectives", "create_study_plan")
career_graph.add_edge("create_study_plan", "suggest_projects")
career_graph.add_edge("suggest_projects", "search_resources")
career_graph.add_edge("search_resources", "filter_resources")
career_graph.add_edge("filter_resources", "curate_resources")
career_graph.add_edge("curate_resources", END)

career_app = career_graph.compile()
```

### 4.3 Retry and error handling

Every DeepSeek node that expects JSON:

```python
def extract_entities(state: ResumeState) -> dict:
    retry_count = state.get("retry_count", 0)
    try:
        response = deepseek.invoke([
            {"role": "system", "content": RESUME_EXTRACTION_SYSTEM},
            {"role": "user", "content": f"Resume text:\n\n{state['cleaned_text']}"}
        ])
        entities = json.loads(response.content)
        # Validate required keys exist
        for key in ["skills", "experience", "education", "projects"]:
            if key not in entities:
                raise ValueError(f"Missing key: {key}")
        return {"entities": entities, "errors": [], "retry_count": 0}
    except (json.JSONDecodeError, ValueError) as e:
        if retry_count < 3:
            return {
                "errors": [f"Attempt {retry_count + 1}: {str(e)}"],
                "retry_count": retry_count + 1
            }
        # Final fallback: regex-based extraction
        return {
            "entities": regex_fallback_extraction(state["cleaned_text"]),
            "errors": [f"Used regex fallback after {retry_count} LLM failures"],
            "retry_count": retry_count
        }
```

---

## 5. GraphQL Layer

### 5.1 Setup

Apollo Server as a Next.js API route. NOT a separate service.

**Install:** `npm install @apollo/server @as-integrations/next graphql`

**File:** `src/pages/api/graphql.js`

### 5.2 Schema

```graphql
type Query {
  recruiterDashboard: RecruiterDashboard!
  candidateProfile: CandidateProfile!
  jobWithCandidates(jobId: ID!): JobWithCandidates!
  matchResult(applicationId: ID!): MatchResult!
}

type RecruiterDashboard {
  jobs: [Job!]!
  recentApplications: [Application!]!
  shortlistedCandidates: [ShortlistEntry!]!
  stats: DashboardStats!
}

type DashboardStats {
  totalJobs: Int!
  totalApplications: Int!
  shortlistedCount: Int!
  activeJobs: Int!
}

type CandidateProfile {
  user: User!
  skills: [Skill!]!
  gaps: [Gap!]!
  prepPlans: [PrepPlan!]!
  learningBets: [LearningBet!]!
  matchHistory: [MatchResult!]!
}

type JobWithCandidates {
  job: Job!
  candidates: [RankedCandidate!]!
  weights: EvaluationWeights!
}

type RankedCandidate {
  user: User!
  overallScore: Float!
  componentScores: ComponentScores!
  evidence: [EvidenceItem!]!
  explanation: String!
  gaps: [Gap!]!
}

type MatchResult {
  overallScore: Float!
  componentScores: ComponentScores!
  evidence: [EvidenceItem!]!
  gaps: [Gap!]!
  explanation: String!
}

type ComponentScores {
  skills: Float!
  experience: Float!
  education: Float!
  projects: Float!
  communication: Float!
}

type EvaluationWeights {
  skills: Float!
  experience: Float!
  education: Float!
  projects: Float!
  communication: Float!
}

type EvidenceItem {
  requirement: String!
  resumeExcerpt: String!
  strength: String!
}

type Skill {
  name: String!
  level: String!
  evidence: String
}

type Gap {
  requirement: String!
  classification: String!
  priority: String!
}

type PrepPlan {
  id: ID!
  targetRole: String!
  phases: [PlanPhase!]!
  progress: Float!
  createdAt: String!
}

type PlanPhase {
  name: String!
  duration: String!
  topics: [String!]!
  milestones: [Milestone!]!
}

type Milestone {
  description: String!
  completed: Boolean!
  verifiedOnChain: Boolean!
}

type LearningBet {
  id: ID!
  goal: String!
  stakeAmount: String!
  deadline: String!
  status: String!
}

type Job {
  id: ID!
  title: String!
  company: String!
  description: String!
  requirements: [String!]!
  evaluationWeights: EvaluationWeights
  applicationCount: Int!
  createdAt: String!
}

type Application {
  id: ID!
  jobId: ID!
  jobTitle: String!
  status: String!
  appliedAt: String!
  matchScore: Float
}

type ShortlistEntry {
  user: User!
  jobTitle: String!
  score: Float!
  reasoning: String!
}

type User {
  id: ID!
  name: String!
  email: String!
  userType: String!
}
```

### 5.3 Resolver auth pattern

```javascript
import { ApolloServer } from '@apollo/server';
import { startServerAndCreateNextHandler } from '@as-integrations/next';
import { jwtVerify } from 'jose';
import clientPromise from '@/lib/mongodb';

const resolvers = {
  Query: {
    recruiterDashboard: async (_, __, context) => {
      if (!context.user || context.user.userType !== 'recruiter') {
        throw new Error('Recruiter access required');
      }
      const db = (await clientPromise).db();
      const jobs = await db.collection('jobs')
        .find({ recruiterId: context.user.userId })
        .sort({ createdAt: -1 })
        .toArray();
      // ... resolve nested fields
    },
    candidateProfile: async (_, __, context) => {
      if (!context.user) throw new Error('Authentication required');
      // Scoped to authenticated user's own data only
    },
  }
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
  introspection: process.env.NODE_ENV !== 'production',
});

export default startServerAndCreateNextHandler(server, {
  context: async (req) => {
    const token = req.headers.authorization?.replace('Bearer ', '')
      || req.cookies?.token;
    if (!token) return { user: null };
    try {
      const { payload } = await jwtVerify(token,
        new TextEncoder().encode(process.env.JWT_SECRET));
      return { user: payload };
    } catch {
      return { user: null };
    }
  }
});
```

---

## 6. Auth + Security

### 6.1 Next.js middleware

**File:** `src/middleware.js`

```javascript
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

export async function middleware(request) {
  const token = request.cookies.get('token')?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/auth', request.url));
  }

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(process.env.JWT_SECRET)
    );
    const headers = new Headers(request.headers);
    headers.set('x-user-id', payload.userId);
    headers.set('x-user-type', payload.userType);
    return NextResponse.next({ request: { headers } });
  } catch {
    return NextResponse.redirect(new URL('/auth', request.url));
  }
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
```

### 6.2 API auth rules

- **Always authenticated:** All `/api/*` routes except `/api/auth/register`, `/api/auth/login`, `/api/graphql` (has its own resolver-level auth).
- **Recruiter-only:** Job create/update/delete, shortlist, outreach generation.
- **Applicant-only:** Application submit, prep plan generate, career plan, learning bets.
- **Owner-scoped:** Candidate can only see their own profile, applications, match results.
- **DELETE these routes entirely:** `debug-applications`, `debug/parse-resume`, `test-folder`, any route under `/api/debug/`.
- **RE-ENABLE auth on:** `resume-rag-python`, `resume-rag`, `ai/shortlist-candidates`, `upload/resume`, `resume/view/[filename]`.

### 6.3 Python service CORS

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3002")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

No wildcard `*` in production. No `/debug/env` endpoints in production.

---

## 7. Blockchain

### 7.1 Contract

`XCeedLearningBets.sol` on EduChain testnet (chainId 656476).

**Add this function to the existing contract:**

```solidity
event MilestoneVerified(address indexed user, bytes32 indexed milestoneHash, uint256 timestamp);

mapping(address => bytes32[]) public userMilestones;

function verifyMilestone(bytes32 milestoneHash) external {
    userMilestones[msg.sender].push(milestoneHash);
    emit MilestoneVerified(msg.sender, milestoneHash, block.timestamp);
}

function getMilestones(address user) external view returns (bytes32[] memory) {
    return userMilestones[user];
}
```

### 7.2 Frontend integration

wagmi + RainbowKit. Contract calls from the browser. When a prep plan milestone is marked complete:

```javascript
// In useLearningBets.js
const verifyMilestone = async (milestoneData) => {
  const hash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(milestoneData)));
  const tx = await writeContract({
    address: contractAddress,
    abi: learningBetsABI,
    functionName: 'verifyMilestone',
    args: [hash],
  });
  return tx;
};
```

### 7.3 Frontend fallback

If `NEXT_PUBLIC_LEARNING_BETS_CONTRACT` is not set or is `0x000...000`:
- Show "Blockchain features unavailable" in the UI
- All bet/milestone features are disabled but the rest of the app works
- Never silently fail or call a zero address

---

## 8. Configurable Evaluation Weights

### 8.1 Data model

Add `evaluationWeights` to job documents:

```javascript
{
  // ...existing job fields...
  evaluationWeights: {
    skills: 0.35,
    experience: 0.25,
    education: 0.15,
    projects: 0.15,
    communication: 0.10
  }
}
```

Defaults applied if not set. Weights must sum to 1.0.

### 8.2 Frontend

5 range sliders in job creation/edit form. Auto-normalize on change:

```javascript
const normalizeWeights = (weights, changedKey) => {
  const total = Object.values(weights).reduce((s, v) => s + v, 0);
  if (total === 0) return weights;
  const normalized = {};
  for (const [key, value] of Object.entries(weights)) {
    normalized[key] = Math.round((value / total) * 100) / 100;
  }
  return normalized;
};
```

### 8.3 Backend flow

1. Job creation API stores weights on the job document.
2. Match endpoint reads weights from the job document and passes them to the LangGraph Matching Graph.
3. `weighted_score` node multiplies Jev's per-requirement scores by these weights.
4. Shortlist endpoint uses the same weights.
5. GraphQL `jobWithCandidates` resolver returns the weights alongside ranked candidates.

---

## 9. Environment Variables

### Vercel (Next.js)

```
MONGODB_URI=MONGODB_ATLAS_URI_SCHEME://...
JWT_SECRET=<random-64-char>
NEXT_PUBLIC_BASE_URL=https://your-app.vercel.app
NEXT_PUBLIC_AI_CORE_URL=https://xceed-ai-core.up.railway.app
NEXT_PUBLIC_AI_SUPPORT_URL=https://xceed-ai-support.up.railway.app
NEXT_PUBLIC_LEARNING_BETS_CONTRACT=0x<deployed-address>
YOUTUBE_API_KEY=<key>
FIREBASE_API_KEY=<key>
FIREBASE_AUTH_DOMAIN=<domain>
FIREBASE_PROJECT_ID=<id>
```

### Railway: AI Core

```
DEEPSEEK_API_KEY=<key>
TYPESAFE_API_KEY=<key>
MONGODB_URI=MONGODB_ATLAS_URI_SCHEME://...
YOUTUBE_API_KEY=<key>
FRONTEND_URL=https://your-app.vercel.app
```

### Railway: AI Support

```
DEEPSEEK_API_KEY=<key>
MONGODB_URI=MONGODB_ATLAS_URI_SCHEME://...
FRONTEND_URL=https://your-app.vercel.app
```

---

## 10. Deployment

### Dockerfiles

**AI Core (`Dockerfile.ai-core`):**

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY services/python/requirements-ai-core.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY services/python/ ./
EXPOSE 8000
CMD ["uvicorn", "xceed_ai_core:app", "--host", "0.0.0.0", "--port", "8000"]
```

**AI Support (`Dockerfile.ai-support`):**

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY services/python/requirements-ai-support.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY services/python/ ./
EXPOSE 8001
CMD ["uvicorn", "xceed_ai_support:app", "--host", "0.0.0.0", "--port", "8001"]
```

### Requirements files

**`requirements-ai-core.txt`:**

```
fastapi>=0.110.0
uvicorn>=0.29.0
langgraph>=0.2.0
langchain>=0.2.0
langchain-openai>=0.1.0
typesafe-sdk>=0.1.0
chromadb>=0.5.0
pymongo>=4.7.0
python-dotenv>=1.0.0
pdf2image>=1.16.0
pdfplumber>=0.10.0
httpx>=0.27.0
```

**`requirements-ai-support.txt`:**

```
fastapi>=0.110.0
uvicorn>=0.29.0
pymongo>=4.7.0
python-dotenv>=1.0.0
httpx>=0.27.0
google-generativeai>=0.5.0
```

### Deploy sequence

1. Push clean code to GitHub (after Phase 1 security cleanup).
2. Connect GitHub repo to Vercel. Set framework: Next.js. Add env vars.
3. Create Railway project. Add Service 1 from GitHub, set Dockerfile path to `Dockerfile.ai-core`. Add env vars.
4. Add Service 2 from same GitHub repo, set Dockerfile path to `Dockerfile.ai-support`. Add env vars.
5. Copy Railway public URLs into Vercel env vars (`NEXT_PUBLIC_AI_CORE_URL`, `NEXT_PUBLIC_AI_SUPPORT_URL`).
6. Trigger Vercel redeploy.
7. Run verification matrix.

---

## 11. Sprint Phases (Cursor Prompts)

Each phase below is a self-contained Cursor agent prompt. Run them in order. Do NOT proceed to the next phase until the verification gate passes.

---

### PHASE 1: Security + Repo Cleanup (Hours 0–4)

```
You are performing a security and repo cleanup on the X-CEED project. Reference CURSOR_BIBLE.md for architecture context. Do NOT write any new features. Only cleanup.

1. Check if current API keys work:
   - Test MongoDB: try connecting with the URI in .env.local
   - Test DeepSeek: curl https://api.deepseek.com/chat/completions with the key
   - Test Jev/TypeSafe: check console.typesafe.ai or test with the SDK
   - Test YouTube API key
   - Log which keys work and which need replacement.

2. Delete from git tracking (git rm --cached):
   - All files matching public/uploads/**/*.pdf
   - bfg.jar, bfg-new.jar
   - test-mongo-connection.js
   - .env.local.backup, .env.local.new, .env.local.old
   - Any file containing hardcoded credentials

3. Move all root-level test-*.js, debug-*.js, *_FIX*.md, *_FIXED.md, *_SUMMARY.*, *_COMPLETE.md, *_GUIDE.md (except README, SETUP_GUIDE) files to a _dev/ directory.

4. Update .gitignore to include: _dev/, *.pdf (root level), bfg*.jar, __pycache__/, .venv/, artifacts/, cache/

5. Remove the OpenRouter API key from .kiro/specs/security-vulnerability-fixes/tasks.md — replace value with <REDACTED>.

6. Remove any hardcoded MONGODB_ATLAS_URI_SCHEME:// URIs from any tracked .js or .py file.

7. Create .env.example with every env var from .env.local using placeholder values and comments. Use the env var list from Section 9 of CURSOR_BIBLE.md.

8. Delete all empty 0-byte API route files under src/.

9. Copy CURSOR_BIBLE.md to the project root if not already there.

VERIFICATION — confirm ALL pass before reporting done:
- grep -r 'MONGODB_ATLAS_URI_SCHEME://' . --include='*.js' --include='*.py' --include='*.md' | grep -v node_modules | grep -v .env | grep -v _dev returns 0 hits
- grep -r 'OPENROUTER_KEY_PREFIX' . --include='*.js' --include='*.py' --include='*.md' | grep -v node_modules | grep -v .env | grep -v _dev returns 0 hits
- find . -name '*.pdf' -not -path './node_modules/*' -not -path './_dev/*' returns 0
- .env.example exists and documents all variables from CURSOR_BIBLE.md Section 9
- git status shows the deletions/moves staged
```

---

### PHASE 2: LangGraph Consolidation (Hours 4–12)

```
You are consolidating X-CEED's Python AI services into 2 services with LangGraph orchestration. Reference CURSOR_BIBLE.md Sections 2, 3, and 4 for the complete model stack, caching strategy, and pipeline specification.

SERVICE 1: Create services/python/xceed_ai_core.py (port 8000)

Build exactly the architecture described in CURSOR_BIBLE.md Section 4:

1. Define state schemas: ResumeState, MatchState, GapState, CareerState — use the TypedDict definitions from Section 4.1.

2. Build 4 LangGraph StateGraphs with the exact node-to-model mapping from Section 2:
   - Resume Analysis Graph (Section 4.2): extract_text → normalize_sections → extract_entities (DeepSeek) → classify_skill_levels (Jev) → build_profile
   - Matching Graph: semantic_compare (DeepSeek) → score_requirements (Jev) → weighted_score (code) → extract_evidence (DeepSeek) → generate_explanation (DeepSeek)
   - Gap Analysis Graph: classify_gaps (Jev) → prioritize_gaps (Jev)
   - Career Planning Graph: generate_objectives (DeepSeek) → create_study_plan (DeepSeek) → suggest_projects (DeepSeek) → search_resources (YouTube API) → filter_resources (Jev) → curate_resources (code)

3. Use the EXACT integration patterns from CURSOR_BIBLE.md Section 2:
   - Jev: TypeSafeClient with batched questions per the score_requirements example
   - DeepSeek: ChatOpenAI with base_url="https://api.deepseek.com", model="deepseek-chat"
   - Prompt structure: LONG STABLE SYSTEM PROMPT prefix + variable user data at end (for DeepSeek cache hits)

4. Implement retry logic per Section 4.3: conditional edges retry DeepSeek nodes up to 3 times on JSON parse failure, then fallback to regex extraction.

5. Implement the caching layer from Section 3, Layer 2: wrap each graph.invoke() with cached_invoke() using MongoDB. Cache keys per the table in Section 3.

6. Implement prompt token optimization from Section 3, Layer 4: clean_resume_text() and extract_requirements_section() before sending to models.

7. Port the existing RAG chat endpoint (Chroma-based) from simplified_rag_service.py. Keep it as a separate endpoint, not a graph.

8. CORS: use the pattern from CURSOR_BIBLE.md Section 6.3. Read FRONTEND_URL from env.

Endpoints: POST /analyze, POST /match, POST /gap, POST /career-plan, POST /chat, GET /health

SERVICE 2: Create services/python/xceed_ai_support.py (port 8001)

Consolidate quiz + mock interview + video AI + YouTube from the existing services. No LangGraph — stateless request-response. Use DeepSeek (not Gemini) for all LLM calls. Same ChatOpenAI integration pattern.

Endpoints: POST /quiz/generate, POST /quiz/submit, POST /mock-interview/question, POST /mock-interview/analyze, POST /video/chat, POST /video/notes, POST /video/clips, POST /youtube/curate, GET /health

Create requirements-ai-core.txt and requirements-ai-support.txt per CURSOR_BIBLE.md Section 10.

Update all Next.js API routes that currently proxy to the old Python services (ports 8000/8002/8003/8004/8006/8008) to point to the new consolidated endpoints on ports 8000 and 8001.

VERIFICATION:
- pip install -r requirements-ai-core.txt succeeds
- pip install -r requirements-ai-support.txt succeeds
- python -c "from xceed_ai_core import app" succeeds (no import errors)
- python -c "from xceed_ai_support import app" succeeds
- curl -X POST http://localhost:8000/analyze -H 'Content-Type: application/json' -d '{"resume_text": "John Doe, Software Engineer with 5 years experience in Python, React, AWS. Built analytics dashboard processing 1M events/day."}' returns JSON with skills, experience, education arrays
- curl -X POST http://localhost:8000/match with a profile + job + weights returns score + evidence + explanation
- curl -X POST http://localhost:8000/gap with a match result returns classified gaps
- curl http://localhost:8001/health returns 200
- No Gemini or OpenRouter imports remain in the new service files
```

---

### PHASE 3: GraphQL Layer (Hours 12–18)

```
Add a GraphQL layer to X-CEED using Apollo Server. Reference CURSOR_BIBLE.md Section 5 for the complete schema and resolver pattern.

1. Install: npm install @apollo/server @as-integrations/next graphql

2. Create src/pages/api/graphql.js using the exact schema from CURSOR_BIBLE.md Section 5.2 and the resolver auth pattern from Section 5.3.

3. Implement resolvers that query MongoDB directly using the existing src/lib/mongodb.js connection:
   - recruiterDashboard: scoped to authenticated recruiter's jobs, their applications, shortlisted candidates, and stats
   - candidateProfile: scoped to authenticated user's own data — profile, skills, gaps, prep plans, learning bets, match history
   - jobWithCandidates: returns a specific job with ranked candidates, their scores, evidence, and the job's evaluation weights
   - matchResult: returns detailed match result for a specific application

4. Auth: follow the context function pattern from Section 5.3. Extract JWT from Authorization header or cookie. Every resolver checks auth. Recruiter queries require userType === 'recruiter'. Candidate queries scope to the authenticated user.

5. Disable introspection when NODE_ENV === 'production'.

6. Do NOT remove existing REST routes — GraphQL supplements REST for dashboard reads. REST stays for mutations.

VERIFICATION:
- POST /api/graphql with { "query": "{ recruiterDashboard { jobs { title } stats { totalApplications } } }" } and valid recruiter JWT returns nested data
- Same query without JWT returns auth error
- Applicant JWT on recruiterDashboard returns role error
- candidateProfile with applicant JWT returns profile with nested prep plans and match history
- matchResult with a valid applicationId returns scores, evidence, gaps, explanation
```

---

### PHASE 4: Auth + Blockchain (Hours 18–26)

```
Harden auth and deploy blockchain for X-CEED. Reference CURSOR_BIBLE.md Sections 6 and 7.

AUTH:
1. Create src/middleware.js using the exact code from CURSOR_BIBLE.md Section 6.1. Matcher: /dashboard/:path*

2. Audit every route in src/pages/api/ and src/app/api/. Follow the rules in CURSOR_BIBLE.md Section 6.2:
   - Re-enable auth on: resume-rag-python, resume-rag, ai/shortlist-candidates, upload/resume, resume/view/[filename]
   - Delete entirely: debug-applications, debug/parse-resume, test-folder, any route under /api/debug/
   - Remove /debug/env endpoints from both Python services

3. In dashboard layout components, read user role from JWT via /api/auth/me call instead of localStorage. Remove localStorage.getItem('userRole') and localStorage.getItem('userType') from auth decisions.

4. Add Zod validation to top 10 API routes: register, login, job create, job update, application submit, resume upload, prep-plan generate, match analyze, shortlist, graphql.

BLOCKCHAIN:
1. Add the verifyMilestone function and MilestoneVerified event to XCeedLearningBets.sol per CURSOR_BIBLE.md Section 7.1.

2. Run npx hardhat compile — fix any errors.

3. Deploy to EduChain testnet: npx hardhat run scripts/deploy.js --network educhain. Record the contract address.

4. Set NEXT_PUBLIC_LEARNING_BETS_CONTRACT in .env.local to the deployed address.

5. Remove any 0x000...000 fallback in frontend. If env var is missing, show "Blockchain features unavailable" per Section 7.3.

6. Add verifyMilestone to useLearningBets.js per Section 7.2.

7. Wire milestone verification to prep plan completion: when a user marks a milestone complete, hash the milestone data and call verifyMilestone on the contract.

VERIFICATION:
- Navigate to /dashboard/* without cookie → redirected to /auth
- curl any /api/debug-* route → 404
- curl /api/resume-rag-python without auth → 401
- curl /api/upload/resume without auth → 401
- npx hardhat compile succeeds
- Contract address set and resolves on EduChain explorer
- MilestoneVerified event exists in compiled ABI
```

---

### PHASE 5: Frontend Integration (Hours 26–36)

```
Integrate frontend with new backend services. Reference CURSOR_BIBLE.md Sections 5, 8 for GraphQL and configurable weights.

CONFIGURABLE WEIGHTS (Section 8):
1. Add 5 range sliders to CreateJobDialog.jsx: Skills, Experience, Education, Projects, Communication. Defaults: 0.35, 0.25, 0.15, 0.15, 0.10. Auto-normalize to sum to 1.0 using the normalizeWeights function from Section 8.2.
2. Store evaluationWeights on job documents in MongoDB.
3. Pass weights to match endpoint and shortlist endpoint. No more hardcoded 0.5/0.3/0.2.

GRAPHQL DASHBOARDS:
1. Create a lightweight GraphQL client utility using fetch + @tanstack/react-query.
2. Refactor recruiter dashboard to use recruiterDashboard GraphQL query.
3. Refactor candidate profile to use candidateProfile query.
4. Refactor job detail + candidates view to use jobWithCandidates query.

AI OUTREACH:
1. Create src/pages/api/ai/generate-outreach.js — takes candidateId + jobId, loads both, calls AI Core with a prompt to generate a personalized recruiter-to-candidate email.
2. Add "AI Draft Outreach" button on candidate cards in shortlist view.
3. Modal with generated email in editable textarea + "Copy to Clipboard" button.

CAREER PLAN PAGE:
1. Create src/app/dashboard/applicant/career-plan/page.jsx
2. Calls POST /career-plan on AI Core with user's latest gap analysis.
3. Displays: objectives checklist, project recommendations, YouTube videos, progress tracker.
4. Milestone checkboxes persist to MongoDB and optionally verify on-chain.

CLEANUP:
1. Replace mock earnings page with real learning bet data from contract (wagmi useContractRead).
2. Remove duplicate application submit routes — keep one canonical path.
3. Every dashboard page must have loading, error, and empty states.

VERIFICATION:
- Create job with weights 0.5/0.2/0.1/0.1/0.1 → apply → match → score breakdown reflects weights
- Recruiter dashboard network tab: single GraphQL POST, not multiple REST calls
- "AI Draft Outreach" → modal with personalized email
- Career plan page renders with objectives, projects, YouTube videos
- Earnings page shows real bet data or clean empty state
```

---

### PHASE 6: Deploy (Hours 36–44)

```
Deploy X-CEED to Vercel + Railway. Reference CURSOR_BIBLE.md Sections 9 and 10.

VERCEL:
1. Run npm run build locally. Fix all build errors (unused imports, empty files, missing env refs).
2. Set all env vars per CURSOR_BIBLE.md Section 9 — Vercel section.
3. Deploy from GitHub.

RAILWAY — SERVICE 1 (xceed-ai-core):
1. Create Dockerfile.ai-core per CURSOR_BIBLE.md Section 10.
2. Create Railway service, point to this Dockerfile.
3. Set env vars per Section 9 — Railway AI Core section.
4. Set FRONTEND_URL to Vercel production URL.

RAILWAY — SERVICE 2 (xceed-ai-support):
1. Create Dockerfile.ai-support per CURSOR_BIBLE.md Section 10.
2. Create Railway service, point to this Dockerfile.
3. Set env vars per Section 9 — Railway AI Support section.

POST-DEPLOY:
1. Copy Railway URLs into Vercel env vars: NEXT_PUBLIC_AI_CORE_URL, NEXT_PUBLIC_AI_SUPPORT_URL.
2. Trigger Vercel redeploy.
3. Test cross-origin calls from Vercel to both Railway services.

VERIFICATION:
- Vercel URL loads landing page
- /api/auth/login works on production
- /api/graphql returns data with valid JWT on production
- Railway Service 1 /health returns 200
- Railway Service 2 /health returns 200
- Browser console: zero CORS errors
- npm run build log: zero errors
```

---

### PHASE 7: Verify + Launch (Hours 44–48)

```
Final verification and launch. Run ALL tests on the PRODUCTION URL.

TEST MATRIX:
1. Register as applicant → applicant dashboard
2. Register as recruiter → recruiter dashboard
3. Recruiter creates job with custom weights (0.4/0.3/0.1/0.15/0.05)
4. Applicant uploads resume → parsed text visible
5. Applicant runs resume-job match → score + evidence + explanation + gaps
6. Applicant generates prep plan → study plan with YouTube resources
7. Applicant views career plan → objectives, projects, resources
8. Recruiter views shortlisted candidates → ranked with reasoning (via GraphQL)
9. Recruiter clicks AI Draft Outreach → personalized email in modal
10. Applicant creates learning bet on EduChain → transaction confirmed
11. Applicant marks milestone complete → hash verified on-chain
12. Visit /dashboard without auth → redirected to /auth

For each test: document pass/fail. If fail: document error, screenshot, fix.

README:
Rewrite README.md to match the deployed product:
- Title: X-CEED — AI-Powered Recruitment Intelligence & Career Enablement Platform
- Architecture: Vercel + Railway, LangGraph pipelines, Jev + DeepSeek model stack, GraphQL, EduChain
- Tech stack as deployed
- Live URL
- Local setup with .env.example reference
- Feature list matching reality

FINAL:
- git status is clean
- All 12 tests pass
- Production URL is shareable
- No console errors on any page
```

---

## 12. Files Created/Modified Reference

After all phases, these files should exist:

```
NEW FILES:
├── CURSOR_BIBLE.md                          # This file
├── .env.example                             # All env vars documented
├── src/middleware.js                         # JWT edge middleware
├── src/pages/api/graphql.js                 # Apollo Server
├── src/pages/api/ai/generate-outreach.js    # AI outreach endpoint
├── src/app/dashboard/applicant/career-plan/page.jsx
├── services/python/xceed_ai_core.py         # LangGraph service
├── services/python/xceed_ai_support.py      # Stateless AI service
├── services/python/requirements-ai-core.txt
├── services/python/requirements-ai-support.txt
├── Dockerfile.ai-core
├── Dockerfile.ai-support

MODIFIED FILES:
├── src/lib/auth.js                          # Auth updates
├── src/components/CreateJobDialog.jsx       # Weight sliders
├── src/components/recruiter dashboard       # GraphQL integration
├── src/components/candidate profile         # GraphQL integration
├── contracts/XCeedLearningBets.sol          # verifyMilestone added
├── scripts/deploy.js                        # Verified
├── package.json                             # Apollo + GraphQL deps
├── .gitignore                               # Expanded
├── README.md                                # Rewritten

DELETED FILES:
├── All root test-*.js, debug-*.js
├── All *_FIX*.md, *_FIXED.md, *_SUMMARY.*
├── bfg.jar, bfg-new.jar
├── test-mongo-connection.js
├── Empty 0-byte route stubs
├── /api/debug-* routes
├── /api/test-folder route
```
