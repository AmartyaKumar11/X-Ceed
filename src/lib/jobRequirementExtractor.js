/**
 * Extract requirements + evaluationWeights via AI Core.
 * Cached server-side in ai_cache by description hash.
 */
export async function extractRequirements(jobDescription, aiCoreUrl) {
  const base = (aiCoreUrl || process.env.NEXT_PUBLIC_AI_CORE_URL || '').replace(
    /\/$/,
    ''
  );
  if (!base) throw new Error('AI Core URL not configured');

  const response = await fetch(`${base}/extract-job-requirements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description: jobDescription }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `extract-job-requirements ${response.status}: ${text.slice(0, 200)}`
    );
  }

  return response.json();
}
