/**
 * Re-encodes the Telegram lecture MP3s to 64 kbps mono for hosting on R2.
 *
 * Reads telegram-audio/upload-map.json (written by generate-audio-json.mjs),
 * writes telegram-audio-encoded/<key>. Skips outputs that already exist
 * (resume-safe), runs 4 ffmpeg processes in parallel.
 *
 * Usage: node scripts/encode-audio.mjs
 */

import { spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, statSync, renameSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC_DIR = join(ROOT, 'telegram-audio');
const OUT_DIR = join(ROOT, 'telegram-audio-encoded');
const UPLOAD_MAP = join(SRC_DIR, 'upload-map.json');

const CONCURRENCY = Math.min(4, Math.max(1, os.cpus().length - 1));
const BITRATE = '64k';

const map = JSON.parse(readFileSync(UPLOAD_MAP, 'utf8'));

function encode({ src, key }) {
  return new Promise((resolve) => {
    const srcPath = join(SRC_DIR, src);
    const outPath = join(OUT_DIR, key);
    const tmpPath = outPath + '.tmp.mp3';

    if (!existsSync(srcPath)) {
      resolve({ key, status: 'missing-source' });
      return;
    }
    if (existsSync(outPath) && statSync(outPath).size > 0) {
      resolve({ key, status: 'skipped' });
      return;
    }

    mkdirSync(dirname(outPath), { recursive: true });
    const ff = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', srcPath,
      '-ac', '1',
      '-b:a', BITRATE,
      '-map_metadata', '0',
      tmpPath,
    ]);
    let stderr = '';
    ff.stderr.on('data', (d) => (stderr += d));
    ff.on('close', (code) => {
      if (code === 0) {
        renameSync(tmpPath, outPath);
        resolve({ key, status: 'encoded' });
      } else {
        rmSync(tmpPath, { force: true });
        resolve({ key, status: 'failed', error: stderr.trim().slice(0, 300) });
      }
    });
  });
}

const queue = [...map];
const results = { encoded: 0, skipped: 0, failed: 0, 'missing-source': 0 };
const failures = [];
let done = 0;

async function worker() {
  while (queue.length > 0) {
    const job = queue.shift();
    const r = await encode(job);
    results[r.status]++;
    done++;
    if (r.status === 'failed') failures.push(r);
    if (r.status !== 'skipped' || done % 25 === 0) {
      console.log(`[${done}/${map.length}] ${r.status}: ${r.key}`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log('\nDone:', JSON.stringify(results));
for (const f of failures) console.error(`FAILED ${f.key}\n  ${f.error}`);
if (results['missing-source'] > 0) {
  console.error('\n⚠️  Some source files are missing — re-run scripts/fetch-telegram-audio.mjs first.');
}
process.exit(failures.length > 0 ? 1 : 0);
