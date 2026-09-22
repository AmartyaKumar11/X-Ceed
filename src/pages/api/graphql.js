import { ApolloServer } from '@apollo/server';
import { startServerAndCreateNextHandler } from '@as-integrations/next';
import { jwtVerify } from 'jose';
import { ObjectId } from 'mongodb';
import clientPromise from '@/lib/mongodb';

const typeDefs = `#graphql
type Query {
  recruiterDashboard: RecruiterDashboard!
  candidateProfile: CandidateProfile!
  jobWithCandidates(jobId: ID!): JobWithCandidates!
  matchResult(applicationId: ID!): MatchResult!
  jobs(limit: Int, source: String): [Job!]!
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

type Requirement {
  description: String!
  priority: String!
}

type SalaryRange {
  min: Int
  max: Int
  currency: String!
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
  requirements: [Requirement!]!
  evaluationWeights: EvaluationWeights
  applicationCount: Int!
  status: String
  department: String
  location: String
  createdAt: String!
  source: String!
  sourceUrl: String
  salaryRange: SalaryRange
  tags: [String!]
  publishedAt: String
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
`;

const DEFAULT_WEIGHTS = {
  skills: 0.35,
  experience: 0.25,
  education: 0.15,
  projects: 0.15,
  communication: 0.1,
};

function requireUser(context) {
  if (!context.user) throw new Error('Authentication required');
  return context.user;
}

function requireRecruiter(context) {
  const user = requireUser(context);
  if (user.userType !== 'recruiter') throw new Error('Recruiter access required');
  return user;
}

function mapUser(doc) {
  if (!doc) {
    return { id: '', name: 'Unknown', email: '', userType: '' };
  }
  const name =
    doc.personal?.name ||
    doc.recruiter?.name ||
    doc.name ||
    doc.email ||
    'Unknown';
  return {
    id: String(doc._id),
    name,
    email: doc.email || '',
    userType: doc.userType || '',
  };
}

function mapWeights(w) {
  return { ...DEFAULT_WEIGHTS, ...(w || {}) };
}

function mapComponentScores(c) {
  return {
    skills: Number(c?.skills ?? 0),
    experience: Number(c?.experience ?? 0),
    education: Number(c?.education ?? 0),
    projects: Number(c?.projects ?? 0),
    communication: Number(c?.communication ?? 0),
  };
}

function mapMatch(doc = {}) {
  const evidence = (doc.evidence || []).map((e) => ({
    requirement: e.requirement || e.skill || '',
    resumeExcerpt: e.resumeExcerpt || e.resume_excerpt || e.excerpt || '',
    strength: e.strength || 'moderate',
  }));
  const gaps = (doc.gaps || []).map((g) => ({
    requirement: g.requirement || '',
    classification: String(g.classification || 'weak'),
    priority: String(g.priority ?? g.classification ?? 'medium'),
  }));
  return {
    overallScore: Number(doc.overallScore ?? doc.overall_score ?? doc.matchScore ?? 0),
    componentScores: mapComponentScores(doc.componentScores || doc.component_scores),
    evidence,
    gaps,
    explanation: doc.explanation || doc.reasoning || '',
  };
}

function mapRequirement(r) {
  if (typeof r === 'string') {
    return { description: r, priority: 'must_have' };
  }
  return {
    description: r?.description || r?.name || r?.skill || String(r || ''),
    priority: r?.priority || 'must_have',
  };
}

function mapJob(doc, applicationCount = 0) {
  const requirements = Array.isArray(doc.requirements)
    ? doc.requirements.map(mapRequirement)
    : [];
  const published =
    doc.published_at || doc.publishedAt || doc.createdAt || null;
  return {
    id: String(doc._id),
    title: doc.title || '',
    company: doc.company || doc.companyName || '',
    description: doc.description || '',
    requirements,
    evaluationWeights: mapWeights(doc.evaluationWeights),
    applicationCount,
    status: doc.status || (doc.active === false ? 'inactive' : 'active'),
    department: doc.department || '',
    location: doc.location || '',
    createdAt: doc.createdAt
      ? new Date(doc.createdAt).toISOString()
      : published
        ? new Date(published).toISOString()
        : '',
    source: doc.source || 'recruiter',
    sourceUrl: doc.source_url || doc.sourceUrl || null,
    salaryRange: doc.salary_range
      ? {
          min: doc.salary_range.min ?? null,
          max: doc.salary_range.max ?? null,
          currency: doc.salary_range.currency || 'USD',
        }
      : doc.salaryMin != null
        ? {
            min: doc.salaryMin,
            max: doc.salaryMax ?? null,
            currency: doc.currency || 'USD',
          }
        : null,
    tags: doc.tags || [],
    publishedAt: published ? new Date(published).toISOString() : null,
  };
}

const resolvers = {
  Query: {
    recruiterDashboard: async (_parent, _args, context) => {
      const user = requireRecruiter(context);
      const db = (await clientPromise).db(
        (process.env.MONGODB_URI || '').split('/')[3]?.split('?')[0] || 'x-ceed-db'
      );
      const recruiterId = user.userId || user.id || user.sub;

      const jobs = await db
        .collection('jobs')
        .find({
          $or: [
            { recruiterId },
            { recruiterId: new ObjectId(recruiterId) },
            { 'recruiter.id': recruiterId },
          ],
        })
        .sort({ createdAt: -1 })
        .toArray()
        .catch(async () =>
          db.collection('jobs').find({ recruiterId: String(recruiterId) }).sort({ createdAt: -1 }).toArray()
        );

      const jobIds = jobs.map((j) => j._id);
      const jobIdStrs = jobIds.map(String);

      const applications = await db
        .collection('applications')
        .find({
          $or: [{ jobId: { $in: jobIdStrs } }, { jobId: { $in: jobIds } }],
        })
        .sort({ appliedAt: -1, createdAt: -1 })
        .limit(50)
        .toArray();

      const shortlisted = applications.filter((a) =>
        ['shortlisted', 'interview', 'offered', 'hired'].includes(String(a.status || '').toLowerCase())
      );

      const jobTitleById = Object.fromEntries(jobs.map((j) => [String(j._id), j.title || '']));

      const recentApplications = applications.slice(0, 20).map((a) => ({
        id: String(a._id),
        jobId: String(a.jobId),
        jobTitle: jobTitleById[String(a.jobId)] || a.jobTitle || '',
        status: a.status || 'pending',
        appliedAt: a.appliedAt || a.createdAt ? new Date(a.appliedAt || a.createdAt).toISOString() : '',
        matchScore: a.matchScore ?? a.overallScore ?? null,
      }));

      const shortlistedCandidates = [];
      for (const a of shortlisted.slice(0, 20)) {
        let applicant = null;
        try {
          applicant = await db.collection('users').findOne({ _id: new ObjectId(a.applicantId || a.userId) });
        } catch {
          applicant = await db.collection('users').findOne({ _id: a.applicantId || a.userId });
        }
        shortlistedCandidates.push({
          user: mapUser(applicant || { _id: a.applicantId, email: a.applicantEmail, personal: { name: a.applicantName } }),
          jobTitle: jobTitleById[String(a.jobId)] || a.jobTitle || '',
          score: Number(a.matchScore ?? a.overallScore ?? a.score ?? 0),
          reasoning: a.reasoning || a.explanation || a.shortlistReasoning || '',
        });
      }

      const counts = await Promise.all(
        jobs.map(async (j) => {
          const c = await db.collection('applications').countDocuments({
            $or: [{ jobId: String(j._id) }, { jobId: j._id }],
          });
          return [String(j._id), c];
        })
      );
      const countMap = Object.fromEntries(counts);

      const activeJobs = jobs.filter((j) => (j.status || 'active') === 'active').length;

      return {
        jobs: jobs.map((j) => mapJob(j, countMap[String(j._id)] || 0)),
        recentApplications,
        shortlistedCandidates,
        stats: {
          totalJobs: jobs.length,
          totalApplications: applications.length,
          shortlistedCount: shortlisted.length,
          activeJobs,
        },
      };
    },

    candidateProfile: async (_parent, _args, context) => {
      const user = requireUser(context);
      const db = (await clientPromise).db(
        (process.env.MONGODB_URI || '').split('/')[3]?.split('?')[0] || 'x-ceed-db'
      );
      const userId = user.userId || user.id || user.sub;

      let userDoc = null;
      try {
        userDoc = await db.collection('users').findOne({ _id: new ObjectId(userId) });
      } catch {
        userDoc = await db.collection('users').findOne({ _id: userId });
      }

      const prepPlans = await db
        .collection('prepPlans')
        .find({ $or: [{ userId: String(userId) }, { userId }] })
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray();

      const matchHistoryDocs = await db
        .collection('matchResults')
        .find({ $or: [{ userId: String(userId) }, { applicantId: String(userId) }] })
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray();

      const bets = await db
        .collection('learningBets')
        .find({ $or: [{ userId: String(userId) }, { userId }] })
        .limit(20)
        .toArray()
        .catch(() => []);

      const skills = (userDoc?.skills || userDoc?.profile?.skills || []).map((s) =>
        typeof s === 'string'
          ? { name: s, level: 'intermediate', evidence: null }
          : { name: s.name || '', level: s.level || 'intermediate', evidence: s.evidence || null }
      );

      const gaps = (userDoc?.gaps || []).map((g) => ({
        requirement: g.requirement || g.skill || '',
        classification: String(g.classification || 'weak'),
        priority: String(g.priority || 'medium'),
      }));

      return {
        user: mapUser(userDoc || { _id: userId, email: user.email, userType: user.userType }),
        skills,
        gaps,
        prepPlans: prepPlans.map((p) => ({
          id: String(p._id),
          targetRole: p.targetRole || p.jobTitle || '',
          phases: (p.phases || p.plan?.phases || []).map((ph) => ({
            name: ph.name || '',
            duration: ph.duration || '',
            topics: ph.topics || [],
            milestones: (ph.milestones || []).map((m) =>
              typeof m === 'string'
                ? { description: m, completed: false, verifiedOnChain: false }
                : {
                    description: m.description || '',
                    completed: !!m.completed,
                    verifiedOnChain: !!m.verifiedOnChain,
                  }
            ),
          })),
          progress: Number(p.progress ?? 0),
          createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : '',
        })),
        learningBets: bets.map((b) => ({
          id: String(b._id),
          goal: b.goal || b.courseId || '',
          stakeAmount: String(b.stakeAmount ?? b.stake ?? '0'),
          deadline: b.deadline ? new Date(b.deadline).toISOString() : '',
          status: b.status || 'active',
        })),
        matchHistory: matchHistoryDocs.map(mapMatch),
      };
    },

    jobs: async (_parent, { limit = 50, source = null }, context) => {
      requireUser(context);
      const db = (await clientPromise).db(
        (process.env.MONGODB_URI || '').split('/')[3]?.split('?')[0] || 'x-ceed-db'
      );
      const lim = Math.min(Number(limit) || 50, 100);
      const sourceFilter = (source || '').toLowerCase();

      let recruiterJobs = [];
      if (!sourceFilter || sourceFilter === 'all' || sourceFilter === 'recruiter' || sourceFilter === 'direct') {
        const now = new Date();
        recruiterJobs = await db
          .collection('jobs')
          .find({
            status: 'active',
            $or: [
              { applicationEnd: { $gte: now } },
              { applicationEnd: { $exists: false } },
              { applicationEnd: null },
            ],
          })
          .sort({ createdAt: -1 })
          .limit(lim)
          .toArray();
      }

      let aggregated = [];
      if (!sourceFilter || sourceFilter === 'all' || sourceFilter === 'remotive' || sourceFilter === 'jobicy') {
        const q = { active: true };
        if (sourceFilter === 'remotive' || sourceFilter === 'jobicy') q.source = sourceFilter;
        aggregated = await db
          .collection('aggregated_jobs')
          .find(q)
          .sort({ published_at: -1 })
          .limit(lim)
          .toArray();
      }

      const merged = [
        ...recruiterJobs.map((j) => ({ ...j, source: 'recruiter' })),
        ...aggregated,
      ]
        .sort(
          (a, b) =>
            new Date(b.published_at || b.createdAt || 0) -
            new Date(a.published_at || a.createdAt || 0)
        )
        .slice(0, lim);

      return merged.map((j) => mapJob(j, j.applicationsCount || 0));
    },

    jobWithCandidates: async (_parent, { jobId }, context) => {
      const user = requireRecruiter(context);
      const db = (await clientPromise).db(
        (process.env.MONGODB_URI || '').split('/')[3]?.split('?')[0] || 'x-ceed-db'
      );
      const recruiterId = user.userId || user.id || user.sub;

      let job = null;
      let isAggregated = false;
      try {
        job = await db.collection('jobs').findOne({ _id: new ObjectId(jobId) });
      } catch {
        job = await db.collection('jobs').findOne({ _id: jobId });
      }
      if (!job) {
        try {
          job = await db.collection('aggregated_jobs').findOne({ _id: new ObjectId(jobId) });
        } catch {
          job = await db.collection('aggregated_jobs').findOne({ _id: jobId });
        }
        if (job) isAggregated = true;
      }
      if (!job) throw new Error('Job not found');

      if (!isAggregated) {
        const owns =
          String(job.recruiterId) === String(recruiterId) ||
          String(job.recruiter?.id || '') === String(recruiterId);
        if (!owns) throw new Error('Not authorized for this job');
      }

      if (isAggregated) {
        return {
          job: mapJob({ ...job, source: job.source || 'remotive' }, 0),
          candidates: [],
          weights: mapWeights(job.evaluationWeights),
        };
      }

      const applications = await db
        .collection('applications')
        .find({ $or: [{ jobId: String(jobId) }, { jobId: job._id }] })
        .toArray();

      const candidates = [];
      for (const a of applications) {
        let applicant = null;
        try {
          applicant = await db.collection('users').findOne({ _id: new ObjectId(a.applicantId || a.userId) });
        } catch {
          applicant = null;
        }
        const matchDoc = a.matchResult || a.aiAnalysis || {};
        const mapped = mapMatch({
          ...matchDoc,
          overallScore: a.matchScore ?? matchDoc.overallScore,
          explanation: a.reasoning || matchDoc.explanation,
          gaps: a.gaps || matchDoc.gaps,
          evidence: a.evidence || matchDoc.evidence,
          componentScores: a.componentScores || matchDoc.componentScores,
        });
        candidates.push({
          user: mapUser(applicant || { _id: a.applicantId, email: a.applicantEmail, personal: { name: a.applicantName } }),
          overallScore: mapped.overallScore,
          componentScores: mapped.componentScores,
          evidence: mapped.evidence,
          explanation: mapped.explanation,
          gaps: mapped.gaps,
        });
      }
      candidates.sort((a, b) => b.overallScore - a.overallScore);

      return {
        job: mapJob({ ...job, source: 'recruiter' }, applications.length),
        candidates,
        weights: mapWeights(job.evaluationWeights),
      };
    },

    matchResult: async (_parent, { applicationId }, context) => {
      const user = requireUser(context);
      const db = (await clientPromise).db(
        (process.env.MONGODB_URI || '').split('/')[3]?.split('?')[0] || 'x-ceed-db'
      );
      let appDoc = null;
      try {
        appDoc = await db.collection('applications').findOne({ _id: new ObjectId(applicationId) });
      } catch {
        appDoc = await db.collection('applications').findOne({ _id: applicationId });
      }
      if (!appDoc) {
        const stored = await db.collection('matchResults').findOne({
          $or: [{ applicationId: String(applicationId) }, { _id: applicationId }],
        });
        if (!stored) throw new Error('Match result not found');
        return mapMatch(stored);
      }

      const userId = String(user.userId || user.id || user.sub);
      const isOwner = String(appDoc.applicantId || appDoc.userId) === userId;
      const isRecruiter = user.userType === 'recruiter';
      if (!isOwner && !isRecruiter) throw new Error('Not authorized');

      return mapMatch({
        ...(appDoc.matchResult || appDoc.aiAnalysis || {}),
        overallScore: appDoc.matchScore ?? appDoc.overallScore,
        explanation: appDoc.reasoning || appDoc.explanation,
        gaps: appDoc.gaps,
        evidence: appDoc.evidence,
        componentScores: appDoc.componentScores,
      });
    },
  },
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
  introspection: process.env.NODE_ENV !== 'production',
});

export default startServerAndCreateNextHandler(server, {
  context: async (req, res) => {
    const cookieHeader = req.headers?.cookie || '';
    const cookieMatch = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]+)/);
    const token =
      (typeof req.headers?.authorization === 'string'
        ? req.headers.authorization.replace(/^Bearer\s+/i, '')
        : null) ||
      cookieMatch?.[1] ||
      req.cookies?.auth_token ||
      req.cookies?.token;

    if (!token) return { user: null, req, res };
    try {
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(process.env.JWT_SECRET)
      );
      return {
        req,
        res,
        user: {
          ...payload,
          userId: payload.userId || payload.id || payload.sub,
          userType: payload.userType,
        },
      };
    } catch {
      return { user: null, req, res };
    }
  },
});
