#!/usr/bin/env node
/**
 * Trigger job aggregation sync (Remotive + Jobicy).
 * Usage: node scripts/sync-jobs.mjs
 * Env: NEXT_PUBLIC_BASE_URL (or VERCEL_URL), JOB_SYNC_SECRET
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let val = m[2].trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

const base =
  process.env.NEXT_PUBLIC_BASE_URL ||
  process.env.VERCEL_URL ||
  'https://x-ceed.vercel.app';
const SYNC_URL = `${base.replace(/\/$/, '').replace(/^(?!https?:)/, 'https://')}/api/jobs/sync`;
const SYNC_SECRET = process.env.JOB_SYNC_SECRET || '';

console.log('POST', SYNC_URL);
const res = await fetch(SYNC_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(SYNC_SECRET ? { 'x-sync-secret': SYNC_SECRET } : {}),
  },
});

const text = await res.text();
let result;
try {
  result = JSON.parse(text);
} catch {
  result = { raw: text };
}

if (!res.ok) {
  console.error('Job sync failed:', res.status, result);
  process.exit(1);
}

console.log('Job sync result:', result);
