export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const base = process.env.NEXT_PUBLIC_AI_SUPPORT_URL || 'http://localhost:8001';

  if (req.body?.test) {
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return res.status(200).json({ status: 'online' });
      return res.status(503).json({ status: 'offline', error: 'AI Support unhealthy' });
    } catch (error) {
      return res.status(503).json({ status: 'offline', error: error.message });
    }
  }

  try {
    const body = req.body || {};
    const previous_qa_pairs =
      body.previous_qa_pairs ||
      body.previousQaPairs ||
      (body.questionHistory || []).map((q, i) => ({
        question: typeof q === 'string' ? q : q.text || q.question,
        answer: (body.answerHistory || [])[i] || '',
        score: (body.scoreHistory || [])[i],
      }));

    const backendRequest = {
      role: body.role || body.targetRole,
      interview_type: body.interview_type || body.interviewType || 'mixed',
      question_number: body.question_number || body.questionNumber || (previous_qa_pairs.length + 1),
      previous_qa_pairs,
      job_description: body.jobDescription || body.job_description || '',
      resume_text: body.resumeText || body.resume_text || '',
      previous_questions: previous_qa_pairs.map((p) => p.question).filter(Boolean),
    };

    const response = await fetch(`${base}/mock-interview/question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backendRequest),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json({
        error: data.detail || data.error || data.message || `AI Support ${response.status}`,
      });
    }
    return res.status(200).json(data);
  } catch (error) {
    console.error('mock-interview/generate-question:', error);
    return res.status(503).json({
      error: 'AI Support unavailable',
      message: error.message,
    });
  }
}
