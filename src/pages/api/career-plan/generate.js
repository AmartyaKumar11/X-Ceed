import { authMiddleware } from '../../../lib/middleware';

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
    const { gaps, targetRole } = req.body || {};
    if (!targetRole) {
      return res.status(400).json({ success: false, message: 'targetRole required' });
    }

    const planRes = await fetch(`${AI_CORE}/career-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gaps: gaps || [], target_role: targetRole }),
    });

    if (!planRes.ok) {
      const err = await planRes.text();
      throw new Error(`AI Core career-plan failed: ${planRes.status} ${err.slice(0, 200)}`);
    }

    const plan = await planRes.json();
    return res.status(200).json({ success: true, data: plan });
  } catch (error) {
    console.error('career-plan/generate error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Career plan failed' });
  }
}
