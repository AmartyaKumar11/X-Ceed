export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const base = process.env.NEXT_PUBLIC_AI_SUPPORT_URL || 'http://localhost:8001';

  if (req.body?.test) {
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return res.status(200).json({ status: 'online' });
      return res.status(503).json({ status: 'offline' });
    } catch (error) {
      return res.status(503).json({ status: 'offline', error: error.message });
    }
  }

  try {
    const body = req.body || {};
    const action = body.action || (body.report ? 'report' : 'analyze');

    if (action === 'report') {
      const response = await fetch(`${base}/mock-interview/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: body.role || 'Software Engineer',
          interview_type: body.interview_type || body.interviewType || 'mixed',
          job_description: body.jobDescription || body.job_description || '',
          qa_pairs: body.qa_pairs || body.qaPairs || [],
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return res.status(response.status).json({ error: data.detail || data.error || 'Report failed' });
      }
      return res.status(200).json(data);
    }

    // Single-answer analysis (preferred) or legacy batch
    const backendRequest = body.question
      ? {
          question: body.question,
          answer: body.answer,
          role: body.role,
          interview_type: body.interview_type || body.interviewType || 'mixed',
          job_description: body.jobDescription || body.job_description || '',
        }
      : {
          job_description: body.jobDescription || body.job_description || '',
          questions: body.questionHistory || body.questions || [],
          answers: body.answerHistory || body.answers || [],
        };

    const response = await fetch(`${base}/mock-interview/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backendRequest),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json({ error: data.detail || data.error || 'Analyze failed' });
    }
    return res.status(200).json(data);
  } catch (error) {
    console.error('mock-interview/analyze:', error);
    return res.status(503).json({ error: 'AI Support unavailable', message: error.message });
  }
}
