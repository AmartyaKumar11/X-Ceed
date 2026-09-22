import { getDatabase } from '../../../lib/mongodb';
import {
  fetchRemotiveJobs,
  fetchJobicyJobs,
} from '../../../lib/jobFetcher';
import { extractRequirements } from '../../../lib/jobRequirementExtractor';

// ponytail: Vercel hobby ~10s / pro ~60–300s — cap AI extracts per sync; cron fills rest
export const config = {
  maxDuration: 300,
};

const MAX_EXTRACT_PER_SYNC = Number(process.env.JOB_SYNC_MAX_EXTRACT || 20);
const EXTRACT_DELAY_MS = 2000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureIndexes(db) {
  const col = db.collection('aggregated_jobs');
  await Promise.all([
    col.createIndex(
      { title: 'text', company: 'text', description: 'text' },
      { name: 'aggregated_jobs_search', background: true }
    ).catch(() => {}),
    col.createIndex({ source_id: 1 }, { unique: true, background: true }).catch(() => {}),
    col.createIndex({ active: 1, published_at: -1 }, { background: true }).catch(() => {}),
    col.createIndex({ expires_at: 1 }, { background: true }).catch(() => {}),
  ]);
}

async function extractAndSave(db, jobDoc, aiCoreUrl) {
  const { requirements, evaluationWeights } = await extractRequirements(
    jobDoc.description || '',
    aiCoreUrl
  );
  await db.collection('aggregated_jobs').updateOne(
    { _id: jobDoc._id },
    {
      $set: {
        requirements: requirements || [],
        evaluationWeights: evaluationWeights || null,
        requirements_extracted_at: new Date(),
      },
    }
  );
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end();
  }

  const syncSecret = process.env.JOB_SYNC_SECRET;
  if (syncSecret && req.headers['x-sync-secret'] !== syncSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const db = await getDatabase();
    await ensureIndexes(db);

    const aiCoreUrl =
      process.env.AI_CORE_URL ||
      process.env.NEXT_PUBLIC_AI_CORE_URL ||
      'https://ai-core-production-2826.up.railway.app';
    let fetched = 0;
    let inserted = 0;
    let skipped = 0;
    let extracted = 0;
    let extractFailed = 0;

    const allJobs = [];
    try {
      const remotive = await fetchRemotiveJobs();
      allJobs.push(...remotive);
    } catch (e) {
      console.error('Remotive fetch failed:', e.message);
    }
    try {
      const jobicy = await fetchJobicyJobs();
      allJobs.push(...jobicy);
    } catch (e) {
      console.error('Jobicy fetch failed:', e.message);
    }

    fetched = allJobs.length;

    for (const job of allJobs) {
      const existing = await db
        .collection('aggregated_jobs')
        .findOne({ source_id: job.source_id });
      if (existing) {
        skipped++;
        // Refresh expiry / active on re-fetch of same listing
        await db.collection('aggregated_jobs').updateOne(
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

      const result = await db.collection('aggregated_jobs').insertOne(job);
      inserted++;
      job._id = result.insertedId;
    }

    // Extract requirements for jobs still missing them (new + prior failures)
    const pending = await db
      .collection('aggregated_jobs')
      .find({
        active: true,
        $or: [{ requirements: null }, { requirements: { $exists: false } }],
      })
      .sort({ fetched_at: -1 })
      .limit(MAX_EXTRACT_PER_SYNC)
      .toArray();

    for (const job of pending) {
      try {
        await extractAndSave(db, job, aiCoreUrl);
        extracted++;
        await sleep(EXTRACT_DELAY_MS);
      } catch (e) {
        extractFailed++;
        console.error(
          `Requirement extraction failed for ${job.title}:`,
          e.message
        );
      }
    }

    const expireResult = await db.collection('aggregated_jobs').updateMany(
      { expires_at: { $lt: new Date() }, active: true },
      { $set: { active: false } }
    );

    const total_active = await db
      .collection('aggregated_jobs')
      .countDocuments({ active: true });

    return res.json({
      fetched,
      inserted,
      skipped,
      extracted,
      extractFailed,
      expired: expireResult.modifiedCount,
      total_active,
      pending_extract: Math.max(0, pending.length - extracted),
    });
  } catch (error) {
    console.error('Job sync error:', error);
    return res.status(500).json({ error: error.message || 'Sync failed' });
  }
}
