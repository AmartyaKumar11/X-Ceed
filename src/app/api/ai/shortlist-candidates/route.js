import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { createHash } from 'crypto';
import path from 'path';
import fs from 'fs';
import { PDFTextExtractor } from '@/lib/pdfExtractor';
import clientPromise from '@/lib/mongodb';
import { DEFAULT_WEIGHTS } from '@/lib/normalizeWeights';

const AI_CORE = process.env.NEXT_PUBLIC_AI_CORE_URL || 'http://localhost:8000';

export async function POST(request) {
  try {
    const { authMiddleware } = await import('@/lib/middleware');
    const auth = await authMiddleware(request);
    if (!auth.isAuthenticated) {
      return NextResponse.json(
        { success: false, message: auth.error || 'Authentication required' },
        { status: auth.status || 401 }
      );
    }
    const user = auth.user || {};
    const userType = user.userType || user.details?.userType;
    if (userType !== 'recruiter') {
      return NextResponse.json(
        { success: false, message: 'Recruiter access required' },
        { status: 403 }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
    }

    const {
      jobId,
      jobTitle,
      jobDescription,
      jobRequirements,
      candidates,
      weights: bodyWeights,
    } = body || {};

    if (!jobId) {
      return NextResponse.json({ success: false, message: 'jobId is required' }, { status: 400 });
    }
    if (!candidates?.length) {
      return NextResponse.json({ success: false, message: 'No candidates provided' }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db();

    let job = null;
    try {
      job = await db.collection('jobs').findOne({
        _id: ObjectId.isValid(String(jobId)) ? new ObjectId(String(jobId)) : jobId,
      });
    } catch {
      job = await db.collection('jobs').findOne({ _id: jobId });
    }

    const evaluationWeights = bodyWeights || job?.evaluationWeights || DEFAULT_WEIGHTS;
    const resolvedTitle = jobTitle || job?.title || 'Untitled role';
    const resolvedDescription =
      jobDescription ||
      job?.jobDescriptionText ||
      job?.description ||
      `Job posting for ${resolvedTitle}`;
    const resolvedRequirements = jobRequirements?.length
      ? jobRequirements
      : job?.requirements || [];

    const withResumes = await extractResumeTexts(candidates);

    const ranked = [];
    const errors = [];

    for (const candidate of withResumes) {
      try {
        const result = await matchCandidate({
          db,
          candidate,
          jobId: String(jobId),
          jobTitle: resolvedTitle,
          jobDescription: resolvedDescription,
          jobRequirements: resolvedRequirements,
          weights: evaluationWeights,
        });
        ranked.push(result);
      } catch (e) {
        errors.push({ candidateId: candidate.id, name: candidate.name, error: e.message });
      }
    }

    ranked.sort((a, b) => (b.score || 0) - (a.score || 0));
    const formatted = ranked.map((c, index) => ({
      rank: index + 1,
      candidateId: c.candidateId,
      name: c.name,
      email: c.email,
      score: c.score,
      recommendation: recommendationFromScore(c.score),
      breakdown: {
        skills: Math.round(c.component_scores?.skills ?? 0),
        experience: Math.round(c.component_scores?.experience ?? 0),
        projects: Math.round(c.component_scores?.projects ?? 0),
        education: Math.round(c.component_scores?.education ?? 0),
        communication: Math.round(c.component_scores?.communication ?? 0),
        overall: Math.round(c.score || 0),
      },
      component_scores: c.component_scores,
      evidence: c.evidence || [],
      explanation: c.explanation || '',
      reasoning: c.explanation || c.reasoning || '',
      strengths: (c.evidence || [])
        .filter((e) => e.strength === 'strong' || e.strength === 'moderate')
        .map((e) => e.requirement || e.resumeExcerpt)
        .filter(Boolean)
        .slice(0, 5),
      weaknesses: (c.evidence || [])
        .filter((e) => e.strength === 'weak')
        .map((e) => e.requirement)
        .filter(Boolean)
        .slice(0, 5),
      processedWith: c.cached ? 'AI Core (cache)' : 'AI Core',
      appliedAt: c.appliedAt,
      resumePath: c.resumePath,
      fromCache: !!c.cached,
    }));

    return NextResponse.json({
      success: true,
      data: {
        totalCandidates: withResumes.length,
        analyzedCandidates: formatted.length,
        topCandidates: formatted.slice(0, 10),
        allRanked: formatted,
        processingTime: new Date().toISOString(),
        weights: evaluationWeights,
        jobInfo: {
          jobId,
          jobTitle: resolvedTitle,
          requirements: resolvedRequirements,
        },
        errors: errors.length ? errors : undefined,
      },
    });
  } catch (error) {
    console.error('shortlist-candidates error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Shortlisting failed' },
      { status: 500 }
    );
  }
}

function recommendationFromScore(score) {
  if (score >= 75) return 'STRONG_MATCH';
  if (score >= 55) return 'GOOD_MATCH';
  if (score >= 40) return 'REVIEW_MANUALLY';
  return 'WEAK_MATCH';
}

function cacheKey(profile, jobId, weights) {
  return (
    'match:' +
    createHash('sha256')
      .update(JSON.stringify({ profile, jobId, weights }, (_, v) => v ?? null))
      .digest('hex')
  );
}

async function matchCandidate({
  db,
  candidate,
  jobId,
  jobTitle,
  jobDescription,
  jobRequirements,
  weights,
}) {
  const resumeText = (candidate.resumeText || '').trim();
  if (!resumeText || resumeText.length < 40) {
    throw new Error(`Insufficient resume text for ${candidate.name || candidate.id}`);
  }

  // Analyze resume → profile (AI Core)
  const analyzeRes = await fetch(`${AI_CORE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resume_text: resumeText }),
  });
  if (!analyzeRes.ok) {
    const t = await analyzeRes.text();
    throw new Error(`AI Core /analyze failed: ${analyzeRes.status} ${t.slice(0, 160)}`);
  }
  const profile = await analyzeRes.json();

  const job_requirements = {
    title: jobTitle,
    description: jobDescription,
    requirements: jobRequirements,
    jobId,
  };

  // App-level match_cache (in addition to AI Core ai_cache)
  const key = cacheKey(profile, jobId, weights);
  let cached = null;
  try {
    cached = await db.collection('match_cache').findOne({
      _id: key,
      expires_at: { $gt: new Date() },
    });
  } catch {
    /* collection may not exist yet */
  }

  let match;
  let fromCache = false;
  if (cached?.result) {
    match = cached.result;
    fromCache = true;
  } else {
    const matchRes = await fetch(`${AI_CORE}/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidate_profile: profile,
        job_requirements,
        weights,
      }),
    });
    if (!matchRes.ok) {
      const t = await matchRes.text();
      throw new Error(`AI Core /match failed: ${matchRes.status} ${t.slice(0, 160)}`);
    }
    match = await matchRes.json();
    try {
      await db.collection('match_cache').updateOne(
        { _id: key },
        {
          $set: {
            result: match,
            jobId,
            candidateId: candidate.id,
            created_at: new Date(),
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        },
        { upsert: true }
      );
    } catch (e) {
      console.warn('match_cache write failed:', e.message);
    }
  }

  // overall_score from AI Core is typically 0–1 or 0–100 — normalize to 0–100
  let score = Number(match.overall_score ?? 0);
  if (score <= 1) score = Math.round(score * 1000) / 10; // 0.442 → 44.2
  else score = Math.round(score * 10) / 10;

  const component = match.component_scores || {};
  const component_scores = {};
  for (const [k, v] of Object.entries(component)) {
    let n = Number(v) || 0;
    if (n <= 1) n = Math.round(n * 1000) / 10;
    component_scores[k] = n;
  }

  return {
    candidateId: candidate.id || candidate._id,
    name: candidate.name || 'Unknown',
    email: candidate.email || '',
    score,
    component_scores,
    evidence: match.evidence || [],
    explanation: match.explanation || '',
    reasoning: match.explanation || '',
    appliedAt: candidate.appliedAt,
    resumePath: candidate.resumePath,
    cached: fromCache,
  };
}

async function extractResumeTexts(candidates) {
  const out = [];
  for (const candidate of candidates) {
    let resumeText = candidate.resumeText || '';
    if (candidate.resumePath && (!resumeText || resumeText.length < 100)) {
      try {
        const resumePath = candidate.resumePath.startsWith('/')
          ? path.join(process.cwd(), 'public', candidate.resumePath)
          : path.join(process.cwd(), candidate.resumePath);
        if (fs.existsSync(resumePath)) {
          const extracted = await PDFTextExtractor.extractFromFile(resumePath);
          if (extracted?.trim()) resumeText = extracted;
        }
      } catch (e) {
        console.warn(`Resume extract failed for ${candidate.name}:`, e.message);
      }
    }
    out.push({ ...candidate, resumeText });
  }
  return out;
}
