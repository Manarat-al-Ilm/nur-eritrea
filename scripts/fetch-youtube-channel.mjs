/**
 * Fetches the full video list of the Hemona YouTube channel.
 *
 * Uses YouTube's public InnerTube browse endpoint (same one the website
 * itself calls) — no API key of our own, no auth, no dependencies.
 * Writes scripts/data/hemona-videos.json, newest first.
 *
 * Keeping fetch and transform separate (like fetch-telegram-audio.mjs ->
 * manifest.json) means generate-videos-json.mjs can be re-run offline and
 * a re-fetch produces a reviewable diff.
 *
 * Usage: node scripts/fetch-youtube-channel.mjs
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(__dirname, 'data', 'hemona-videos.json');

const CHANNEL_HANDLE = '@Hemona2015';
// "Videos" tab of a channel
const VIDEOS_TAB_PARAMS = 'EgZ2aWRlb3PyBgQKAjoA';
const MIN_EXPECTED = 600;
const MAX_PAGES = 45;
const PAGE_DELAY_MS = 150;

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Fallbacks so a YouTube layout change degrades to a warning, not a failure.
const FALLBACK_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const FALLBACK_CLIENT_VERSION = '2.20240101.00.00';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Scrape the channel page once for API key, client version and channelId. */
async function bootstrap() {
  const res = await fetch(`https://www.youtube.com/${CHANNEL_HANDLE}/videos`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
  });
  const html = await res.text();

  const key = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
  const clientVersion = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1];
  const channelId = html.match(/"(?:externalId|channelId)":"(UC[\w-]{22})"/)?.[1];

  if (!channelId) {
    throw new Error(
      'Could not determine channelId from the channel page (consent redirect or layout change).'
    );
  }
  if (!key) console.warn('⚠️  INNERTUBE_API_KEY not found, using fallback.');
  if (!clientVersion) console.warn('⚠️  client version not found, using fallback.');

  return {
    key: key || FALLBACK_KEY,
    clientVersion: clientVersion || FALLBACK_CLIENT_VERSION,
    channelId,
  };
}

function ctx(clientVersion) {
  return { client: { clientName: 'WEB', clientVersion, hl: 'en', gl: 'US' } };
}

async function browse(key, body) {
  const res = await fetch(
    `https://www.youtube.com/youtubei/v1/browse?key=${key}&prettyPrint=false`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) throw new Error(`browse failed: HTTP ${res.status}`);
  return res.json();
}

/** Pull {youtubeId, rawTitle, duration, publishedText, views} out of a lockup. */
function parseLockup(lockup) {
  const youtubeId = lockup?.contentId;
  const rawTitle = lockup?.metadata?.lockupMetadataViewModel?.title?.content;
  if (!youtubeId || !rawTitle) return null;

  let duration = '';
  const overlays = lockup?.contentImage?.thumbnailViewModel?.overlays || [];
  for (const o of overlays) {
    const badge = o?.thumbnailBottomOverlayViewModel?.badges?.[0]?.thumbnailBadgeViewModel;
    if (badge?.text && /^\d+(:\d{2})+$/.test(badge.text.trim())) {
      duration = badge.text.trim();
      break;
    }
  }

  const rows =
    lockup?.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel
      ?.metadataRows || [];
  const parts = rows.flatMap((r) => (r.metadataParts || []).map((p) => p?.text?.content || ''));
  const views = parts.find((t) => /view/i.test(t)) || '';
  const publishedText = parts.find((t) => /ago/i.test(t)) || '';

  return { youtubeId, rawTitle: rawTitle.replace(/\s+/g, ' ').trim(), duration, publishedText, views };
}

/** Collect lockups out of either a first page or a continuation payload. */
function extractItems(nodes) {
  const out = [];
  let continuation = null;
  for (const node of nodes || []) {
    const lockup = node?.richItemRenderer?.content?.lockupViewModel;
    if (lockup) {
      const rec = parseLockup(lockup);
      if (!rec) throw new Error('lockupViewModel without contentId/title — format change.');
      out.push(rec);
      continue;
    }
    const token = node?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
    if (token) continuation = token;
  }
  return { items: out, continuation };
}

async function main() {
  console.log('🔎 Bootstrapping from the channel page ...');
  const { key, clientVersion, channelId } = await bootstrap();
  console.log(`   channelId: ${channelId}`);

  const first = await browse(key, {
    context: ctx(clientVersion),
    browseId: channelId,
    params: VIDEOS_TAB_PARAMS,
  });

  const tabs = first?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
  const grid = tabs
    .map((t) => t?.tabRenderer)
    .filter((t) => t?.selected)
    .map((t) => t?.content?.richGridRenderer?.contents)
    .find(Boolean);
  if (!grid) throw new Error('No richGridRenderer on the videos tab — format change.');

  let { items: records, continuation } = extractItems(grid);
  console.log(`   page 1: ${records.length}`);

  let page = 1;
  while (continuation && page < MAX_PAGES) {
    await sleep(PAGE_DELAY_MS);
    const data = await browse(key, { context: ctx(clientVersion), continuation });
    const nodes =
      data?.onResponseReceivedActions?.[0]?.appendContinuationItemsAction?.continuationItems;
    const got = extractItems(nodes);
    records = records.concat(got.items);
    continuation = got.continuation;
    page++;
    process.stdout.write(`\r   page ${page}: ${records.length} videos`);
  }
  console.log('');

  if (continuation) throw new Error(`Page cap ${MAX_PAGES} hit with a continuation still pending.`);

  const ids = records.map((r) => r.youtubeId);
  const unique = new Set(ids);
  if (unique.size !== ids.length) throw new Error(`Duplicate youtubeId: ${ids.length - unique.size}`);
  if (records.length < MIN_EXPECTED)
    throw new Error(`Only ${records.length} videos (expected >= ${MIN_EXPECTED}).`);

  const withOrder = records.map((r, i) => ({ order: i, ...r }));
  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(withOrder, null, 2) + '\n');

  const noDuration = withOrder.filter((r) => !r.duration).length;
  console.log(`\n✅ ${withOrder.length} videos -> scripts/data/hemona-videos.json`);
  if (noDuration) console.log(`   ⚠️  ${noDuration} without a duration badge`);
  console.log(`   newest: ${withOrder[0].rawTitle.slice(0, 60)}`);
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});
