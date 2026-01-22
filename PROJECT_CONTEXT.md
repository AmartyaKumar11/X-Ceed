# PROJECT_CONTEXT.md

## Project Overview

**X-ceed** is a full-stack, AI-powered recruitment and learning platform designed to streamline hiring, upskilling, and accountability for recruiters, candidates, and educational institutions. It automates resume parsing, candidate-job matching, and learning plan generation using advanced AI models and embeddings. The platform features blockchain-based commitment tracking to motivate and verify student progress, integrated productivity tools (study plan generator, notes AI, Google Drive/YouTube sync), and explainable analytics for recruiters.

---

## Detailed Feature List

### 1. AI-Powered Resume Shortlisting
- Parses and analyzes resumes using LLMs (Gemini, Groq, OpenRouter) and embeddings.
- Matches candidate skills, experience, and projects against job descriptions.
- Generates explainable match scores and recommendations for recruiters.
- Provides breakdowns (skills, experience, projects) and highlights strengths/weaknesses.

### 2. Recruiter Dashboard
- Job posting and management (create, edit, archive jobs).
- Candidate tracking: view applicants, shortlist, and update statuses.
- Access to AI-ranked candidate lists and detailed analysis.
- Analytics dashboard for hiring metrics and trends.

### 3. Applicant Dashboard
- Application tracking: view status of applied jobs.
- Resume upload and management (PDF parsing and feedback).
- Access to AI-powered resume improvement suggestions.
- Personalized study plan selection and progress tracking.
- Notes-making AI for study topics and interview preparation.

### 4. Study Plan Generator & Learning Module
- AI-generated personalized study plans based on candidate goals and history.
- Option to choose or customize study plans.
- Progress tracking and reminders for study plan completion.
- Notes-making AI: generates concise, topic-wise notes for learning and revision.
- Integration with Google Drive for syncing and managing study materials.
- YouTube Data API integration for curated video suggestions per study topic.

### 5. Blockchain Commitment System
- Smart contract records student commitments to study plans on EduChain.
- Immutable, verifiable audit trail of learning commitments and progress.
- Recruiters and educators can verify candidate dedication and completion.
- Blockchain-based offer and acceptance verification for transparency.

### 6. Mock Interview Module
- AI-driven mock interviews with structured Q&A.
- Automated feedback on candidate responses.
- Strengths, weaknesses, and improvement suggestions provided post-interview.

### 7. Job Search Integration
- Aggregates external job listings via Adzuna API.
- Candidates can search and apply for jobs beyond the platform’s internal postings.

### 8. Notifications & Scheduling
- Real-time notifications for application updates, interview scheduling, and study plan reminders.
- Calendar integration for interview and study plan events.

### 9. Microservices Architecture
- FastAPI microservices for NLP, RAG (Retrieval-Augmented Generation), and file processing.
- Modular backend for scalability and performance.

### 10. Security & Authentication
- JWT-based authentication for secure user sessions.
- Role-based access control for recruiters, candidates, and admins.
- Encrypted data storage and secure API endpoints.

### 11. Analytics & Reporting
- Dashboard analytics for recruiters (time-to-hire, candidate engagement, etc.).
- Study plan completion rates and learning progress metrics for candidates.

### 12. Admin & Platform Management
- Admin panel for user management, job moderation, and platform analytics.
- System health monitoring and error logging.

---

## Architecture Overview

- **Root Directory**
  - `src/` – Main source code (frontend, backend, APIs)
  - `scripts/` – Utility scripts (e.g., blockchain gas estimation)
  - `public/` – Static assets and uploaded files
  - `.env.local` – Environment variables and API keys
  - `package.json` – Node.js dependencies and scripts
  - `requirements.txt` – Python dependencies for microservices
  - `README.md` – Basic project info

- **Frontend (`src/app/`)**
  - `dashboard/` – Recruiter and applicant dashboards
  - `components/` – Reusable UI components
  - `api/` – API route handlers (Next.js API routes)
  - `utils/` – Helper functions and utilities

- **Backend / Microservices**
  - `src/api/` – Node.js/Express backend logic
  - `src/lib/` – PDF parsing, AI model integration, and data processing
  - `python-services/` – FastAPI microservices for NLP, RAG, and file handling

- **Blockchain**
  - `contracts/` – Solidity smart contracts (EduChain)
  - `scripts/estimate-gas.js` – Hardhat script for gas estimation

---

## Technology Stack

- **Frontend:** Next.js, React, Tailwind CSS, Chart.js, Lucide icons
- **Backend:** Node.js, Express, FastAPI (Python), pdf-parse, JWT
- **Database:** MongoDB Atlas
- **AI/ML:** Gemini 1.5 Flash, Groq LLMs, OpenRouter, Cohere, custom FastAPI endpoints
- **Real-time:** Socket.IO
- **Cloud/DevOps:** Vercel/AWS/Heroku (configurable), dotenv for secrets
- **Blockchain:** Solidity, Hardhat, ethers.js (EduChain)
- **Integrations:** Adzuna API (job search), Google Drive API, YouTube Data API, Firebase

---

## Core Functionality Breakdown

- **Resume Shortlisting:**  
  Automated parsing and scoring of resumes against job descriptions using LLMs and embeddings.  
  *Files:* `src/app/api/ai/shortlist-candidates/route.js`, `src/lib/pdfExtractor.js`

- **Recruiter Dashboard:**  
  Job posting, candidate tracking, analytics, and AI recommendations.  
  *Files:* `src/app/dashboard/recruiter/`

- **Applicant Dashboard:**  
  Application status, resume upload, study plan selection, notes AI, and feedback.  
  *Files:* `src/app/dashboard/applicant/`

- **Study Plan Generator & Notes AI:**  
  Personalized study plans and automated notes creation using AI models.  
  *Files:* `src/app/api/ai/study-plan/`, `src/app/api/ai/notes/`

- **Blockchain Commitment:**  
  Smart contract records for study plan commitments and offer verification.  
  *Files:* `contracts/OfferCommitments.sol`, `scripts/estimate-gas.js`

- **Integrations:**  
  Google Drive sync, YouTube video suggestions, Adzuna job search.  
  *Files:* `src/app/api/integrations/`

- **Microservices:**  
  FastAPI endpoints for NLP, RAG, and file processing.  
  *Files:* `python-services/`, `requirements.txt`

---

## Data Flow / API Flow

- **Frontend** interacts with **Next.js API routes** for user actions (resume upload, job posting, study plan selection).
- **API routes** call backend logic or microservices (FastAPI) for AI analysis, PDF parsing, and data processing.
- **Database (MongoDB Atlas)** stores user profiles, job postings, resumes, study plans, and blockchain commitment records.
- **Blockchain** smart contracts are invoked for commitment verification and offer tracking.
- **External APIs** (Adzuna, Google Drive, YouTube) are called for job search, file sync, and learning resources.

**Typical Request/Response Patterns:**
- `POST /api/ai/shortlist-candidates` – Receives candidate data, returns ranked list with AI analysis.
- `POST /api/ai/study-plan` – Receives user preferences, returns personalized study plan.
- `POST /api/blockchain/commit` – Records commitment on-chain, returns transaction hash.

---

## Important Algorithms / Logic

- **Resume Parsing & Embedding:**  
  Extracts text from PDFs, generates embeddings, and matches against job descriptions using LLMs.
- **AI Scoring:**  
  Uses Gemini/Groq/OpenRouter to analyze skills, experience, and project relevance.
- **Study Plan Generation:**  
  AI models generate personalized learning paths based on user goals and history.
- **Blockchain Commitment:**  
  Smart contracts record and verify user commitments to study plans, ensuring accountability.

---

## Setup and Run Instructions

```bash
# 1. Clone the repository
git clone <repo-url>
cd x-ceed

# 2. Install Node.js dependencies
npm install

# 3. Install Python dependencies (for microservices)
pip install -r requirements.txt

# 4. Configure environment variables
cp .env.example .env.local
# Fill in API keys, DB URIs, etc.

# 5. Start backend microservices
# Example: FastAPI service
uvicorn python-services.main:app --reload --port 8003

# 6. Start frontend (Next.js)
npm run dev

# 7. (Optional) Deploy smart contracts
npx hardhat run scripts/deploy.js --network <network>
```

---

## Limitations / Future Improvements

- Not yet deployed; currently in MVP and pilot phase.
- Needs more robust error handling and security hardening.
- Mobile UI and accessibility improvements.
- Expand integrations (more job boards, learning APIs).
- Enhance blockchain UX (transaction feedback, wallet integration).
- Add more analytics and reporting features.

---

## Key Files and Functions Summary

| File/Directory                        | Role/Function                                              |
|---------------------------------------|------------------------------------------------------------|
| `src/app/api/ai/shortlist-candidates/route.js` | Resume parsing, AI ranking, candidate analysis             |
| `src/lib/pdfExtractor.js`             | PDF resume text extraction                                 |
| `src/app/dashboard/recruiter/`        | Recruiter dashboard UI and logic                           |
| `src/app/dashboard/applicant/`        | Applicant dashboard UI and logic                           |
| `src/app/api/ai/study-plan/`          | Study plan generation API                                  |
| `src/app/api/ai/notes/`               | Notes-making AI API                                        |
| `contracts/OfferCommitments.sol`      | Blockchain smart contract for commitments                  |
| `scripts/estimate-gas.js`             | Hardhat script for gas estimation                          |
| `python-services/`                    | FastAPI microservices for NLP, RAG, file processing        |
| `.env.local`                          | Environment variables and API keys                         |
| `package.json`                        | Node.js dependencies and scripts                           |
| `requirements.txt`                    | Python dependencies for microservices                      |

---

## Example Use Cases / User Flow

- **Recruiter posts a job:**  
  Job is created in dashboard, candidates apply, resumes are parsed and ranked by AI, recruiter reviews top matches.

- **Candidate applies for a job:**  
  Uploads resume, receives AI-powered feedback and improvement suggestions, selects a study plan, commits on blockchain.

- **Student chooses a study plan:**  
  AI generates personalized plan, student commits via blockchain, progress is tracked and verified.

- **Notes and learning resources:**  
  Candidate generates notes using AI, syncs materials with Google Drive, receives YouTube video suggestions.

- **Offer verification:**  
  Recruiter sends offer, candidate accepts, commitment is recorded on-chain for transparency.

---
