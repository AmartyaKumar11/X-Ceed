import { ObjectId } from 'mongodb';
import { authMiddleware } from '../../../lib/middleware';
import clientPromise from '@/lib/mongodb';
import { DEFAULT_WEIGHTS } from '@/lib/normalizeWeights';

const AI_CORE = process.env.NEXT_PUBLIC_AI_CORE_URL || 'http://localhost:8000';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const auth = await authMiddleware(req);
  if (!auth.isAuthenticated) {
    return res.status(auth.status || 401).json({ success: false, message: auth.error || 'Authentication required' });
  }

  try {
    const {
      jobId,
      jobDescription,
      jobTitle,
      jobRequirements,
      resumeText,
      candidateProfile,
      weights,
    } = req.body || {};

    let resolvedWeights = weights;
    if (!resolvedWeights && jobId) {
      try {
        const client = await clientPromise;
        const db = client.db();
        const job = await db.collection('jobs').findOne({
          _id: ObjectId.isValid(jobId) ? new ObjectId(jobId) : jobId,
        });
        if (job?.evaluationWeights) resolvedWeights = job.evaluationWeights;
      } catch (e) {
        console.warn('Could not load job weights:', e.message);
      }
    }

    let profile = candidateProfile;
    if (!profile && resumeText) {
      const analyzeRes = await fetch(`${AI_CORE}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume_text: resumeText }),
      });
      if (!analyzeRes.ok) {
        throw new Error(`AI Core analyze failed: ${analyzeRes.status}`);
      }
      profile = await analyzeRes.json();
    }

    if (!profile) {
      return res.status(400).json({ success: false, message: 'resumeText or candidateProfile required' });
    }

    const matchRes = await fetch(`${AI_CORE}/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidate_profile: profile,
        job_requirements: {
          title: jobTitle,
          description: jobDescription,
          requirements: jobRequirements || [],
          jobId,
        },
        weights: resolvedWeights || DEFAULT_WEIGHTS,
      }),
    });

    if (!matchRes.ok) {
      const errText = await matchRes.text();
      throw new Error(`AI Core match failed: ${matchRes.status} ${errText.slice(0, 200)}`);
    }

    const match = await matchRes.json();
    return res.status(200).json({
      success: true,
      data: {
        ...match,
        profile,
        jobId,
        weights: resolvedWeights || DEFAULT_WEIGHTS,
      },
    });
  } catch (error) {
    console.error('resume-match/analyze error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Analysis failed' });
  }
}
