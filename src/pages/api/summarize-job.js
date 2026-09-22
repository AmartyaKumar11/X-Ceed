import { authMiddleware } from '../../lib/middleware';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      message: 'Method not allowed' 
    });
  }

  try {
    // Check authentication
    const auth = await authMiddleware(req);
    if (!auth.isAuthenticated) {
      return res.status(auth.status).json({ 
        success: false, 
        message: auth.error 
      });
    }

    const { description } = req.body;

    if (!description || typeof description !== 'string') {
      return res.status(400).json({ 
        success: false, 
        message: 'Job description is required' 
      });
    }

    // If description is short, return as is
    if (description.length <= 200) {
      return res.status(200).json({
        success: true,
        summary: description
      });
    }

    try {
      // Use OpenRouter API (LiquidAI) to summarize the job description
      const openrouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3002',
          'X-Title': 'X-CEED Job Summary'
        },
        body: JSON.stringify({
          model: 'liquidai/lfm2.5-1.2b-thinking:free',
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant that summarizes job descriptions. Create a concise, professional summary in 2-3 sentences that highlights the key role, main responsibilities, and required qualifications. Keep it under 150 characters.'
            },
            {
              role: 'user',
              content: `Please summarize this job description concisely:\n\n${description}`
            }
          ],
          max_tokens: 150,
          temperature: 0.3,
        }),
      });

      if (!openrouterResponse.ok) {
        throw new Error(`OpenRouter API error: ${openrouterResponse.status}`);
      }

      const openrouterResult = await openrouterResponse.json();
      const summary = openrouterResult.choices?.[0]?.message?.content?.trim();

      if (!summary) {
        throw new Error('No summary generated');
      }

      return res.status(200).json({
        success: true,
        summary: summary
      });

    } catch (openrouterError) {
      console.error('OpenRouter API error:', openrouterError);
      
      // Fallback: create a simple truncated summary
      const sentences = description.split(/[.!?]+/).filter(s => s.trim().length > 0);
      const firstTwoSentences = sentences.slice(0, 2).join('. ').trim();
      const fallbackSummary = firstTwoSentences.length > 150 
        ? firstTwoSentences.substring(0, 147) + '...'
        : firstTwoSentences + '.';

      return res.status(200).json({
        success: true,
        summary: fallbackSummary,
        fallback: true
      });
    }

  } catch (error) {
    console.error('Error in summarize-job API:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
}
