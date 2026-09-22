import { ObjectId } from 'mongodb';
import { authMiddleware } from '../../../lib/middleware';
import clientPromise from '@/lib/mongodb';

const AI_CORE = process.env.NEXT_PUBLIC_AI_CORE_URL || 'http://localhost:8000';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const auth = await authMiddleware(req);
  if (!auth.isAuthenticated) {
    return res.status(auth.status || 401).json({ success: false, message: auth.error || 'Authentication required' });
  }
  if (auth.user.userType !== 'recruiter') {
    return res.status(403).json({ success: false, message: 'Recruiter access required' });
  }

  try {
    const { candidateId, jobId, applicationId } = req.body || {};
    if (!jobId || (!candidateId && !applicationId)) {
      return res.status(400).json({ success: false, message: 'jobId and candidateId (or applicationId) required' });
    }

    const client = await clientPromise;
    const db = client.db();

    const job = await db.collection('jobs').findOne({
      _id: ObjectId.isValid(jobId) ? new ObjectId(jobId) : jobId,
    });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    let applicant = null;
    let application = null;
    if (applicationId) {
      application = await db.collection('applications').findOne({
        _id: ObjectId.isValid(applicationId) ? new ObjectId(applicationId) : applicationId,
      });
    }
    const userId = candidateId || application?.applicantId || application?.userId;
    if (userId) {
      applicant = await db.collection('users').findOne({
        _id: ObjectId.isValid(String(userId)) ? new ObjectId(String(userId)) : userId,
      });
    }

    const candidateName = applicant?.name || applicant?.fullName || application?.applicantName || 'Candidate';
    const candidateEmail = applicant?.email || application?.applicantEmail || '';
    const skills = (applicant?.skills || application?.skills || [])
      .map((s) => (typeof s === 'string' ? s : s?.name))
      .filter(Boolean)
      .join(', ');

    const prompt = `Draft a short, personalized recruiter outreach email.
Job: ${job.title} (${job.department || 'N/A'}) at our company.
Candidate: ${candidateName}${candidateEmail ? ` <${candidateEmail}>` : ''}.
Skills: ${skills || 'not listed'}.
Job summary: ${(job.jobDescriptionText || job.description || '').slice(0, 1200)}

Return ONLY the email body with Subject: line first. Warm, specific, no fluff.`;

    const chatRes = await fetch(`${AI_CORE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: prompt, history: [] }),
    });

    if (!chatRes.ok) {
      const err = await chatRes.text();
      throw new Error(`AI Core chat failed: ${chatRes.status} ${err.slice(0, 200)}`);
    }

    const data = await chatRes.json();
    const email = data.reply || data.response || data.message || data.content || JSON.stringify(data);

    return res.status(200).json({
      success: true,
      data: { email, candidateName, candidateEmail, jobTitle: job.title },
    });
  } catch (error) {
    console.error('generate-outreach error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Outreach generation failed' });
  }
}
