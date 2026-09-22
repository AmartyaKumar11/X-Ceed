#!/usr/bin/env node
/**
 * Local seed — bypasses Vercel function timeout.
 * Uses MONGODB_URI + AI Core from .env.local / production Railway.
 * Usage: node scripts/sync-jobs-local.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { MongoClient } from 'mongodb';
import {
  fetchRemotiveJobs,
  fetchJobicyJobs,
} from '../src/lib/jobFetcher.js';
import { extractRequirements } from '../src/lib/jobRequirementExtractor.js';

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const val = m[2].trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

const MAX_EXTRACT = Number(process.env.JOB_SYNC_MAX_EXTRACT || 40);
const DELAY = 1500;
const AI =
  process.env.AI_CORE_URL ||
  process.env.NEXT_PUBLIC_AI_CORE_URL ||
  'https://ai-core-production-2826.up.railway.app';
// Prefer production AI even if .env points at localhost
const AI_CORE =
  AI.includes('localhost') || AI.includes('127.0.0.1')
    ? 'https://ai-core-production-2826.up.railway.app'
    : AI;

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI missing');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const client = new MongoClient(uri);
await client.connect();
const db = client.db();
const col = db.collection('aggregated_jobs');

await Promise.all([
  col
    .createIndex(
      { title: 'text', company: 'text', description: 'text' },
      { name: 'aggregated_jobs_search' }
    )
    .catch(() => {}),
  col.createIndex({ source_id: 1 }, { unique: true }).catch(() => {}),
  col.createIndex({ active: 1, published_at: -1 }).catch(() => {}),
  col.createIndex({ expires_at: 1 }).catch(() => {}),
]);

let fetched = 0,
  inserted = 0,
  skipped = 0,
  extracted = 0;

const all = [];
try {
  all.push(...(await fetchRemotiveJobs()));
} catch (e) {
  console.error('Remotive:', e.message);
}
try {
  all.push(...(await fetchJobicyJobs()));
} catch (e) {
  console.error('Jobicy:', e.message);
}
fetched = all.length;
console.log(`Fetched ${fetched} jobs`);

for (const job of all) {
  const existing = await col.findOne({ source_id: job.source_id });
  if (existing) {
    skipped++;
    await col.updateOne(
      { _id: existing._id },
      {
        $set: {
          fetched_at: new Date(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          active: true,
          title: job.title,
          company: job.company,
          company_logo: job.company_logo,
          description: job.description,
          description_raw: job.description_raw,
          location: job.location,
          job_type: job.job_type,
          salary_range: job.salary_range,
          tags: job.tags,
          source_url: job.source_url,
        },
      }
    );
    continue;
  }
  await col.insertOne(job);
  inserted++;
}

const pending = await col
  .find({
    active: true,
    $or: [{ requirements: null }, { requirements: { $exists: false } }],
  })
  .sort({ fetched_at: -1 })
  .limit(MAX_EXTRACT)
  .toArray();

console.log(`Extracting requirements for ${pending.length} jobs via ${AI_CORE}`);

for (const job of pending) {
  try {
    const result = await extractRequirements(job.description || '', AI_CORE);
    await col.updateOne(
      { _id: job._id },
      {
        $set: {
          requirements: result.requirements || [],
          evaluationWeights: result.evaluationWeights || null,
          requirements_extracted_at: new Date(),
        },
      }
    );
    extracted++;
    console.log(`  ✓ ${job.title} (${extracted}/${pending.length})`);
    await sleep(DELAY);
  } catch (e) {
    console.error(`  ✗ ${job.title}: ${e.message}`);
  }
}

const expired = await col.updateMany(
  { expires_at: { $lt: new Date() }, active: true },
  { $set: { active: false } }
);
const total_active = await col.countDocuments({ active: true });
const with_req = await col.countDocuments({
  active: true,
  requirements: { $ne: null, $exists: true },
});

console.log({
  fetched,
  inserted,
  skipped,
  extracted,
  expired: expired.modifiedCount,
  total_active,
  with_requirements: with_req,
});

await client.close();
