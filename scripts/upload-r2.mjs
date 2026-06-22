/**
 * Uploads the encoded lecture MP3s to the Cloudflare R2 bucket.
 *
 * Reads telegram-audio/upload-map.json (written by generate-audio-json.mjs),
 * uploads telegram-audio-encoded/<key> to <bucket>/<key> via wrangler.
 * Runs a few uploads in parallel and retries transient failures.
 *
 * Prerequisites:
 *   - `npx wrangler login` (or CLOUDFLARE_API_TOKEN set)
 *   - CLOUDFLARE_ACCOUNT_ID set when the login has more than one account
 *
 * Resume-safe: when R2_BASE (the public bucket URL) is set, objects that
 * already return HTTP 200 there are skipped, so an interrupted run can be
 * re-started without re-uploading what is already up.
 *
 * Usage:
 *   CLOUDFLARE_ACCOUNT_ID=xxxx \
 *   R2_BASE=https://pub-xxxx.r2.dev node scripts/upload-r2.mjs
 */

import { spawn } from 'child_process';
import { existsSync, readFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ENCODED_DIR = join(ROOT, 'telegram-audio-encoded');
const UPLOAD_MAP = join(ROOT, 'telegram-audio', 'upload-map.json');

const BUCKET = process.env.R2_BUCKET || 'nur-eritrea-audio';
const R2_BASE = (process.env.R2_BASE || '').replace(/\/$/, '');
const CONCURRENCY = 4;
const MAX_RETRIES = 3;

const map = JSON.parse(readFileSync(UPLOAD_MAP, 'utf8'));

// Returns true if the object is already publicly reachable (resume support).
async function alreadyUploaded(key) {
  if (!R2_BASE) return false;
  try {
    const res = await fetch(`${R2_BASE}/${key}`, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

function uploadOne(key, attempt = 1) {
  return new Promise((resolve) => {
    const file = join(ENCODED_DIR, key);
    if (!existsSync(file) || statSync(file).size === 0) {
      resolve({ key, status: 'missing-file' });
      return;
    }
    const args = [
      'wrangler', 'r2', 'object', 'put', `${BUCKET}/${key}`,
      '--file', file,
      '--content-type', 'audio/mpeg',
      '--remote',
    ];
    const proc = spawn('npx', args, { env: process.env });
    let err = '';
    proc.stderr.on('data', (d) => (err += d));
    proc.stdout.on('data', (d) => (err += d));
    proc.on('close', async (code) => {
      if (code === 0) {
        resolve({ key, status: 'uploaded' });
      } else if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, attempt * 3000));
        resolve(await uploadOne(key, attempt + 1));
      } else {
        resolve({ key, status: 'failed', error: err.trim().slice(-300) });
      }
    });
  });
}

const queue = map.map((m) => m.key);
const results = { uploaded: 0, skipped: 0, failed: 0, 'missing-file': 0 };
const failures = [];
let done = 0;

async function worker() {
  while (queue.length > 0) {
    const key = queue.shift();
    const r = (await alreadyUploaded(key))
      ? { key, status: 'skipped' }
      : await uploadOne(key);
    results[r.status]++;
    done++;
    if (r.status === 'failed') failures.push(r);
    console.log(`[${done}/${map.length}] ${r.status}: ${key}`);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log('\nDone:', JSON.stringify(results));
for (const f of failures) console.error(`FAILED ${f.key}\n  ${f.error}`);
process.exit(failures.length > 0 ? 1 : 0);
