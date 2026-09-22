const DEFAULT_WEIGHTS = {
  skills: 0.35,
  experience: 0.25,
  education: 0.15,
  projects: 0.15,
  communication: 0.1,
};

export function normalizeWeights(weights) {
  const src = { ...DEFAULT_WEIGHTS, ...weights };
  const total = Object.values(src).reduce((s, v) => s + Number(v || 0), 0);
  if (!total) return { ...DEFAULT_WEIGHTS };
  const normalized = {};
  for (const [key, value] of Object.entries(src)) {
    normalized[key] = Math.round((Number(value) / total) * 100) / 100;
  }
  return normalized;
}

export { DEFAULT_WEIGHTS };
