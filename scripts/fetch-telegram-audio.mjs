/**
 * Telegram Audio Fetcher for @DrBeyanTefseer
 *
 * Downloads all audio files from the Telegram channel and generates
 * metadata for audio.json integration.
 *
 * Prerequisites:
 *   1. Get api_id & api_hash from https://my.telegram.org/apps
 *   2. npm install telegram input
 *   3. Run: node scripts/fetch-telegram-audio.mjs
 *
 * Features:
 *   - Resumes from where it left off (skips already downloaded files)
 *   - Handles FILE_REFERENCE_EXPIRED by re-fetching messages
 *   - Auto-reconnects on timeout
 *   - Saves manifest incrementally
 */

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { Api } from 'telegram/tl/index.js';
import input from 'input';
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'telegram-audio');
const SESSION_FILE = join(__dirname, '.telegram-session');
const MANIFEST_FILE = join(OUT_DIR, 'manifest.json');

const CHANNEL = 'DrBeyanTefseer';
const MAX_RETRIES = 3;
const DELAY_BETWEEN_DOWNLOADS_MS = 1500; // avoid rate limits

// --- Config ---
const API_ID = parseInt(process.env.TELEGRAM_API_ID || '0');
const API_HASH = process.env.TELEGRAM_API_HASH || '';

if (!API_ID || !API_HASH) {
  console.error('\n❌  Set TELEGRAM_API_ID and TELEGRAM_API_HASH environment variables.');
  console.error('   Get them from https://my.telegram.org/apps\n');
  console.error('   Example:');
  console.error('   TELEGRAM_API_ID=12345 TELEGRAM_API_HASH=abc123 node scripts/fetch-telegram-audio.mjs\n');
  process.exit(1);
}

// --- Helpers ---
function slugify(text) {
  return text
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 80);
}

function formatDuration(seconds) {
  if (!seconds) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Load existing manifest to know which messageIds we already have
function loadExistingManifest() {
  if (existsSync(MANIFEST_FILE)) {
    try {
      return JSON.parse(readFileSync(MANIFEST_FILE, 'utf8'));
    } catch { /* ignore */ }
  }
  return [];
}

// Get set of already downloaded files
function getDownloadedFiles() {
  if (!existsSync(OUT_DIR)) return new Set();
  return new Set(readdirSync(OUT_DIR).filter(f => !f.endsWith('.json')));
}

// --- Main ---
async function main() {
  let sessionStr = '';
  if (existsSync(SESSION_FILE)) {
    sessionStr = readFileSync(SESSION_FILE, 'utf8').trim();
    console.log('📱 Reusing saved Telegram session...');
  }

  const session = new StringSession(sessionStr);
  const client = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 10,
    retryDelay: 2000,
    autoReconnect: true,
  });

  await client.start({
    phoneNumber: async () => await input.text('📞 Phone number (with country code, e.g. +49...): '),
    password: async () => await input.text('🔑 2FA password (if enabled): '),
    phoneCode: async () => await input.text('📨 Verification code: '),
    onError: (err) => console.error('Auth error:', err),
  });

  writeFileSync(SESSION_FILE, client.session.save());
  console.log('✅ Logged in to Telegram!\n');

  const channel = await client.getEntity(CHANNEL);
  console.log(`📢 Channel: ${channel.title} (${CHANNEL})`);

  // Phase 1: Collect all audio message metadata (lightweight, no downloads)
  console.log('📥 Scanning messages for audio files...\n');

  const audioEntries = [];
  let totalMessages = 0;

  for await (const message of client.iterMessages(channel, { limit: undefined })) {
    totalMessages++;
    const media = message.media;
    if (!media) continue;

    if (media instanceof Api.MessageMediaDocument) {
      const doc = media.document;
      if (!(doc instanceof Api.Document)) continue;

      const audioAttr = doc.attributes.find(
        (a) => a instanceof Api.DocumentAttributeAudio
      );
      const fileAttr = doc.attributes.find(
        (a) => a instanceof Api.DocumentAttributeFilename
      );

      if (audioAttr) {
        audioEntries.push({
          messageId: message.id,
          date: new Date(message.date * 1000).toISOString(),
          caption: message.message || '',
          title: audioAttr.title || '',
          performer: audioAttr.performer || '',
          duration: audioAttr.duration || 0,
          fileName: fileAttr?.fileName || `audio_${message.id}.ogg`,
          fileSize: doc.size,
          mimeType: doc.mimeType,
          isVoice: !!audioAttr.voice,
        });

        const label = audioAttr.title || message.message?.slice(0, 50) || fileAttr?.fileName;
        console.log(`  🎵 [${audioEntries.length}] ${label} (${formatDuration(audioAttr.duration)})`);
      }
    }
  }

  console.log(`\n📊 Total messages: ${totalMessages}`);
  console.log(`🎵 Audio files found: ${audioEntries.length}\n`);

  if (audioEntries.length === 0) {
    console.log('No audio files found.');
    await client.disconnect();
    return;
  }

  // Phase 2: Download files (with resume support)
  mkdirSync(OUT_DIR, { recursive: true });

  const existingManifest = loadExistingManifest();
  const downloadedMessageIds = new Set(existingManifest.map((e) => e.messageId));
  const downloadedFiles = getDownloadedFiles();

  console.log(`📂 Already downloaded: ${downloadedMessageIds.size} files`);
  console.log('⬇️  Downloading remaining files...\n');

  const manifest = [...existingManifest];
  // Files already referenced by a manifest entry (must not be claimed twice)
  const claimedFiles = new Set(existingManifest.map((e) => e.fileName));
  let downloaded = 0;
  let skipped = 0;
  let backfilled = 0;
  let failed = 0;

  // Find a file on disk for this entry regardless of its index prefix
  // (indices shift when new posts arrive, so `NNN_` cannot be trusted).
  function findUnclaimedDiskFile(slugPart, ext) {
    const suffix = `_${slugPart}.${ext}`;
    const matches = [...downloadedFiles].filter(
      (f) => f.endsWith(suffix) && !claimedFiles.has(f)
    );
    return matches.length === 1 ? matches[0] : null;
  }

  for (let i = 0; i < audioEntries.length; i++) {
    const entry = audioEntries[i];
    const num = i + 1;
    const ext = entry.fileName.split('.').pop() || 'ogg';
    const slugPart = slugify(entry.title || entry.caption || `audio_${entry.messageId}`);
    const safeFileName = `${String(num).padStart(3, '0')}_${slugPart}.${ext}`;

    // Skip if already in manifest (by messageId)
    if (downloadedMessageIds.has(entry.messageId)) {
      skipped++;
      continue;
    }

    // File already on disk from an earlier run but missing from the manifest:
    // backfill the manifest entry from scan metadata, keep the existing file.
    const existingFile = findUnclaimedDiskFile(slugPart, ext);
    if (existingFile) {
      manifest.push({
        fileName: existingFile,
        originalFileName: entry.fileName,
        messageId: entry.messageId,
        date: entry.date,
        title: entry.title,
        performer: entry.performer,
        caption: entry.caption,
        duration: formatDuration(entry.duration),
        durationSeconds: entry.duration,
        mimeType: entry.mimeType,
        fileSize: entry.fileSize,
        isVoice: entry.isVoice,
      });
      downloadedMessageIds.add(entry.messageId);
      claimedFiles.add(existingFile);
      writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
      console.log(`  ♻️  [${num}/${audioEntries.length}] Backfilled manifest for ${existingFile}`);
      backfilled++;
      continue;
    }

    // Download with retry logic
    let success = false;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`  [${num}/${audioEntries.length}] ${safeFileName} (attempt ${attempt})`);

        // Re-fetch the message to get a fresh file reference
        const messages = await client.getMessages(channel, { ids: [entry.messageId] });
        const freshMessage = messages[0];

        if (!freshMessage?.media) {
          console.log(`    ⚠️  Message ${entry.messageId} has no media, skipping`);
          break;
        }

        const buffer = await client.downloadMedia(freshMessage.media, {});
        const outPath = join(OUT_DIR, safeFileName);
        writeFileSync(outPath, buffer);

        manifest.push({
          fileName: safeFileName,
          originalFileName: entry.fileName,
          messageId: entry.messageId,
          date: entry.date,
          title: entry.title,
          performer: entry.performer,
          caption: entry.caption,
          duration: formatDuration(entry.duration),
          durationSeconds: entry.duration,
          mimeType: entry.mimeType,
          fileSize: entry.fileSize,
          isVoice: entry.isVoice,
        });

        // Save manifest after each successful download (incremental)
        writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));

        downloaded++;
        success = true;
        break;
      } catch (err) {
        const errMsg = err.errorMessage || err.message || String(err);
        console.log(`    ❌ Attempt ${attempt} failed: ${errMsg}`);

        if (attempt < MAX_RETRIES) {
          const wait = attempt * 5000;
          console.log(`    ⏳ Waiting ${wait / 1000}s before retry...`);
          await sleep(wait);
        }
      }
    }

    if (!success) {
      console.log(`    ⛔ Giving up on ${safeFileName}`);
      failed++;
    }

    // Small delay between downloads to avoid rate limits
    await sleep(DELAY_BETWEEN_DOWNLOADS_MS);
  }

  // Final manifest save
  writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));

  console.log(`\n✅ Done!`);
  console.log(`   Downloaded: ${downloaded}`);
  console.log(`   Backfilled manifest entries: ${backfilled}`);
  console.log(`   Skipped (already had): ${skipped}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total in manifest: ${manifest.length}`);
  console.log(`\n📋 Manifest: telegram-audio/manifest.json`);

  if (failed > 0) {
    console.log(`\n💡 ${failed} files failed. Run the script again to retry them.`);
  }

  await client.disconnect();
}

main().catch(console.error);
