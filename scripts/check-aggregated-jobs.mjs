import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { MongoClient } from 'mongodb';

const p = resolve('.env.local');
if (existsSync(p)) {
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    let v = m[2].trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}

const c = new MongoClient(process.env.MONGODB_URI);
await c.connect();
const col = c.db().collection('aggregated_jobs');
const active = await col.countDocuments({ active: true });
const withReq = await col.countDocuments({
  active: true,
  requirements: { $ne: null, $exists: true },
});
const dups = await col
  .aggregate([
    { $group: { _id: '$source_id', c: { $sum: 1 } } },
    { $match: { c: { $gt: 1 } } },
  ])
  .toArray();
console.log(JSON.stringify({ active, withReq, duplicate_source_ids: dups.length }));
await c.close();
