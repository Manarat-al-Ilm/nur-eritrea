/**
 * Builds src/data/videos.json from the fetched channel list.
 *
 * Inputs:
 *   scripts/data/hemona-videos.json   - raw channel list (fetch-youtube-channel.mjs)
 *   scripts/data/curated-videos.json  - the 58 hand-maintained records (overlay)
 *
 * Principles:
 *   - Never invent. A speaker is only assigned when the title names them.
 *     Everything else goes to the neutral "unassigned" collection.
 *   - A date is only kept when the channel title proves it.
 *   - Hand-written fields of the curated records always win.
 *   - Fails loudly on anything unexpected instead of guessing.
 *
 * Usage: node scripts/generate-videos-json.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const RAW_FILE = join(__dirname, 'data', 'hemona-videos.json');
const CURATED_FILE = join(__dirname, 'data', 'curated-videos.json');
const OUT_FILE = join(ROOT, 'src', 'data', 'videos.json');

// --- Speakers ---------------------------------------------------------------
// `keys` are matched against the normalized title. A key with a space is a
// token SEQUENCE and must appear adjacently — "عبد" and "الرحيم" scattered
// across a title must not count as a match. Order matters: "بيان صالح" is
// checked before "صالح سعيد", otherwise the shared word "صالح" steals hits.
const SPEAKERS = [
  {
    id: 'dr-bayan-saleh',
    nameAr: 'الدكتور بيان صالح',
    nameTi: 'ዶክቶር በያን ሳልሕ',
    byline: 'د. بيان صالح',
    keys: ['بيان صالح', 'دكتور بيان', 'በያን ሳልሕ', 'bayan', 'beyan'],
  },
  {
    id: 'sheikh-abdelaliim-idris',
    nameAr: 'الشيخ عبد العليم إدريس',
    nameTi: 'ሸይኽ ዓብደልዓሊም ኢድሪስ',
    byline: 'ش. عبد العليم إدريس',
    keys: ['عبد العليم', 'ادريس', 'ዓብደልዓሊም', 'ኢድሪስ', 'idris'],
  },
  {
    id: 'sheikh-adam-abdullah',
    nameAr: 'الشيخ آدم عبد الله',
    nameTi: 'ሸይኽ ኣደም ዓብደላ',
    byline: 'ش. آدم عبد الله',
    keys: ['ادم عبد الله', 'ابو حنيفه', 'حنيفه', 'ኣደም ዓብደላ', 'ሓኒፋ', 'ሕኒፋ'],
  },
  {
    id: 'sheikh-saleh-said',
    nameAr: 'الشيخ صالح سعيد',
    nameTi: 'ሸይኽ ሳልሕ ሲዒድ',
    byline: 'ش. صالح سعيد',
    keys: ['صالح سعيد', 'ابو عبد العزيز', 'ሳልሕ ሲዒድ', 'saleh said'],
  },
  {
    id: 'ustadh-ahmed-othman',
    nameAr: 'الأستاذ أحمد عثمان',
    nameTi: 'ኣሕመድ ዑስማን',
    byline: 'أ. أحمد عثمان',
    keys: ['احمد عثمان', 'بخيت', 'ኣሕመድ ዑስማን'],
  },
  {
    id: 'ustadh-abdurrahim-yahya',
    nameAr: 'الأستاذ عبد الرحيم يحيى',
    nameTi: '',
    byline: 'أ. عبد الرحيم يحيى',
    keys: ['عبد الرحيم', 'ابو يحي', 'ዓብደልራሒም', 'ዓብደረሒም', 'ኣቡ የሕያ'],
  },
  {
    id: 'ustadha-asmahan-ali',
    nameAr: 'الأستاذة أسمهان علي نعمان',
    nameTi: '',
    byline: 'أ. أسمهان علي نعمان',
    keys: ['اسمهان', 'ኣስመሃን'],
  },
  {
    id: 'ustadha-numa-abdurrahman',
    nameAr: 'الأستاذة نعمة عبد الرحمن',
    nameTi: '',
    byline: 'أ. نعمة عبد الرحمن',
    // Deliberately no bare "عبد الرحمن" key: it is one letter away from
    // "عبد الرحيم" and would make her videos ambiguous with Abu Yahya's.
    keys: ['ام رجاء', 'نعمه عبد الرحمن'],
  },
  {
    id: 'sheikh-muhammad-abdo',
    nameAr: 'الشيخ محمد عبده',
    nameTi: '',
    byline: 'ش. محمد عبده',
    keys: ['محمد عبده'],
  },
];

// Videos whose speaker the title does not name. Not a person — a neutral
// bucket so nothing is lost and nobody is misattributed.
const COLLECTION = {
  id: 'unassigned',
  nameAr: 'محاضرات لم يُحدَّد المتحدث فيها',
  nameTi: '', // to be filled in by a Tigrinya speaker
  byline: '',
};

// youtubeId -> { scholarId?, date?, titleAr? } for manual corrections.
const OVERRIDES = {};

// Speakers whose videos are not published on the site for now (community
// decision pending). They must stay in SPEAKERS so their videos are still
// recognized — removing them from the table would drop their videos into
// the public "unassigned" collection instead of hiding them.
const EXCLUDED_SPEAKERS = new Set(['ustadha-numa-abdurrahman', 'ustadha-asmahan-ali']);

// --- Normalization ----------------------------------------------------------

const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

function asciiDigits(s) {
  return s.replace(ARABIC_DIGITS, (d) => {
    const c = d.codePointAt(0);
    return String(c >= 0x06f0 ? c - 0x06f0 : c - 0x0660);
  });
}

/** Fold Arabic spelling variants so typo-ridden titles still match. */
function normalize(s) {
  return asciiDigits(s)
    .replace(/[ً-ْٰۖ-ۭ]/g, '') // diacritics
    .replace(/ـ/g, '') // tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase()
    .replace(/[^؀-ۿሀ-፿a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const squeeze = (s) => s.replace(/\s+/g, '');

/** Levenshtein distance, aborted once it exceeds `max`. */
function withinDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

// A single edit at most. Arabic names differ by exactly that much
// ("عبد العزيز" vs "عبد العليم"), so a wider budget confuses speakers.
const FUZZY_BUDGET = 1;

function matchesExact(title, key) {
  return title.includes(key);
}

function matchesSqueezed(title, key) {
  const sq = squeeze(key);
  return sq.length >= 5 && squeeze(title).includes(sq);
}

function matchesFuzzy(title, key) {
  if (squeeze(key).length < 5) return false; // short keys exactly or not at all
  const keyTokens = key.split(' ').length;
  const words = title.split(' ');
  for (let i = 0; i + keyTokens <= words.length; i++) {
    if (withinDistance(words.slice(i, i + keyTokens).join(' '), key, FUZZY_BUDGET)) return true;
  }
  return false;
}

/**
 * Layered matching: a clear exact hit always beats a fuzzy one. Within a
 * layer, two candidates mean the title is genuinely ambiguous — then nobody
 * is assigned rather than guessing.
 */
function matchSpeaker(rawTitle) {
  const title = normalize(rawTitle);
  for (const layer of [matchesExact, matchesSqueezed, matchesFuzzy]) {
    const hits = SPEAKERS.filter((s) => s.keys.some((k) => layer(title, normalize(k))));
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return null;
  }
  return null;
}

// --- Date parsing -----------------------------------------------------------
// Only dates the channel title actually states. Never derived, never guessed.

const SEP = '[\\s._\\-/]+';
const MIN_YEAR = 2015;
const MAX_YEAR = new Date().getFullYear() + 1;

function valid(y, m, d) {
  if (y < MIN_YEAR || y > MAX_YEAR) return false;
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(y, m, 0).getDate();
}

const pad = (n) => String(n).padStart(2, '0');

/**
 * Returns { date, matched } where `date` is "DD-MM-YYYY" or "".
 * `matched` is the exact substring, so it can be stripped from the title.
 */
function parseDate(rawTitle) {
  const t = asciiDigits(rawTitle).replace(/\.(mp4|mov|mkv|m4v|avi)\b/gi, ' ');

  // Zoom-style recordings start with the date: "2021 10 28 20 15 33 درس ..."
  const head = t.match(new RegExp(`^\\s*(\\d{4})${SEP}(\\d{1,2})${SEP}(\\d{1,2})`));
  if (head) {
    const [y, m, d] = [+head[1], +head[2], +head[3]];
    if (valid(y, m, d)) return { date: `${pad(d)}-${pad(m)}-${y}`, matched: head[0] };
  }

  // Otherwise take the RIGHTMOST valid candidate — a leftmost match would
  // grab verse ranges like "من اية 8 18  30 09 2026".
  const re = new RegExp(`(?<![0-9])(\\d{1,4})${SEP}(\\d{1,2})${SEP}(\\d{2,4})(?![0-9])`, 'g');
  const cands = [...t.matchAll(re)];
  for (let i = cands.length - 1; i >= 0; i--) {
    const [whole, a, b, c] = cands[i];
    if (a.length === 4) {
      const [y, m, d] = [+a, +b, +c];
      if (valid(y, m, d)) return { date: `${pad(d)}-${pad(m)}-${y}`, matched: whole };
    } else {
      const year = c.length === 2 ? 2000 + +c : +c;
      if (valid(year, +b, +a)) return { date: `${pad(+a)}-${pad(+b)}-${year}`, matched: whole };
    }
  }
  return { date: '', matched: '' };
}

// --- Title cleanup ----------------------------------------------------------
// The speaker is already shown on the card, so the attribution prefix is
// redundant. Strip only up to an explicit blessing ("حفظه الله"), which
// unambiguously ends the attribution. Typos are never rewritten.

const BLESSING = /^.{0,70}?(?:حفظه\s*الله|حفظة\s*الله|خفظه\s*الله|حظفه\s*الله|حفيظه\s*الله|يحفظه\s*الله|رحمه\s*الله|ሓፊዘሁ\s*ኣላህ)\s*/u;

function cleanTitle(rawTitle, dateMatch) {
  let t = rawTitle;

  const stripped = t.replace(BLESSING, '');
  if (stripped.trim().length >= 5) t = stripped;

  if (dateMatch) t = t.split(dateMatch).join(' ');
  // leading numeric run left over from Zoom-style titles
  t = t.replace(/^[\d\s._:\-/]+/, '');

  t = t.replace(/\s+/g, ' ').trim();
  return t.length >= 3 ? t : rawTitle.replace(/\s+/g, ' ').trim();
}

// --- Build ------------------------------------------------------------------

const raw = JSON.parse(readFileSync(RAW_FILE, 'utf8'));
const curatedList = JSON.parse(readFileSync(CURATED_FILE, 'utf8'));
const curated = new Map(curatedList.map((v) => [v.youtubeId, v]));

const rawIds = new Set(raw.map((r) => r.youtubeId));
const problems = [];
const dateDisagreements = [];
const records = [];
const excluded = [];

for (const item of raw) {
  const override = OVERRIDES[item.youtubeId] || {};
  const cur = curated.get(item.youtubeId);

  // Speaker
  let speaker = null;
  if (override.scholarId) {
    speaker = [...SPEAKERS, COLLECTION].find((s) => s.id === override.scholarId) || null;
    if (!speaker) problems.push(`OVERRIDE verweist auf unbekannte id: ${override.scholarId}`);
  } else if (cur?.scholarId) {
    speaker = SPEAKERS.find((s) => s.id === cur.scholarId) || null;
  } else {
    speaker = matchSpeaker(item.rawTitle);
  }
  const assigned = speaker || COLLECTION;

  if (EXCLUDED_SPEAKERS.has(assigned.id)) {
    excluded.push({ youtubeId: item.youtubeId, scholarId: assigned.id });
    continue;
  }

  // Date: only what the channel title proves.
  const { date: parsedDate, matched } = parseDate(item.rawTitle);
  let date = override.date ?? parsedDate;
  if (cur?.date && parsedDate && cur.date !== parsedDate) {
    dateDisagreements.push(`${item.youtubeId}: kuratiert ${cur.date} vs Titel ${parsedDate}`);
  }

  // Title: hand-written wins, otherwise derived from the raw title.
  const titleAr = override.titleAr || cur?.titleAr || cleanTitle(item.rawTitle, matched);

  records.push({
    order: item.order,
    slug: cur?.slug || `v-${item.youtubeId}`,
    youtubeId: item.youtubeId,
    titleAr,
    titleTi: cur?.titleTi || '',
    scholarId: assigned.id,
    scholarName: assigned.byline,
    seriesName: cur?.seriesName || '',
    date,
    duration: item.duration || '',
  });
}

// Oldest first so the newest end up last (the homepage uses slice(-3)).
records.sort((a, b) => b.order - a.order);
const videos = records.map(({ order, ...rest }) => rest);

// --- Checks -----------------------------------------------------------------

if (videos.length + excluded.length !== rawIds.size) {
  problems.push(
    `${videos.length} Datensätze + ${excluded.length} ausgeschlossen ≠ ${rawIds.size} Rohvideos — Verlust!`
  );
}
for (const id of EXCLUDED_SPEAKERS) {
  if (!SPEAKERS.some((s) => s.id === id)) problems.push(`EXCLUDED_SPEAKERS: unbekannte id ${id}`);
}
const seenIds = new Set();
const seenSlugs = new Set();
for (const v of videos) {
  if (seenIds.has(v.youtubeId)) problems.push(`doppelte youtubeId: ${v.youtubeId}`);
  if (seenSlugs.has(v.slug)) problems.push(`doppelter slug: ${v.slug}`);
  seenIds.add(v.youtubeId);
  seenSlugs.add(v.slug);
  if (!v.scholarId) problems.push(`ohne scholarId: ${v.youtubeId}`);
  if (!v.titleAr) problems.push(`ohne titleAr: ${v.youtubeId}`);
  if (v.date && !/^\d{2}-\d{2}-\d{4}$/.test(v.date)) problems.push(`Datumsformat: ${v.youtubeId}`);
}
for (const v of curatedList) {
  if (!rawIds.has(v.youtubeId)) problems.push(`kuratiertes Video nicht im Kanal: ${v.youtubeId}`);
}

if (problems.length) {
  console.error(`❌ ${problems.length} Problem(e):\n` + problems.map((p) => '  ' + p).join('\n'));
  process.exit(1);
}

const countFor = (id) => videos.filter((v) => v.scholarId === id).length;

const out = {
  scholars: SPEAKERS.filter((s) => !EXCLUDED_SPEAKERS.has(s.id)).map((s) => ({
    id: s.id,
    nameAr: s.nameAr,
    nameTi: s.nameTi,
    specialty: '', // deliberately empty: unverified
    videoCount: countFor(s.id),
  })).sort((a, b) => b.videoCount - a.videoCount || a.id.localeCompare(b.id)),
  collections: [
    {
      id: COLLECTION.id,
      nameAr: COLLECTION.nameAr,
      nameTi: COLLECTION.nameTi,
      videoCount: countFor(COLLECTION.id),
    },
  ],
  videos,
};

writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + '\n');

// --- Report -----------------------------------------------------------------

console.log(`✅ ${videos.length} Videos -> src/data/videos.json\n`);
console.log('Videos je Sprecher (Ist-Zahlen):');
for (const s of out.scholars) console.log(`  ${String(s.videoCount).padStart(4)}  ${s.nameAr}`);
console.log(`  ${String(out.collections[0].videoCount).padStart(4)}  ${COLLECTION.nameAr}`);

const dated = videos.filter((v) => v.date).length;
if (excluded.length) {
  console.log(`\nBewusst nicht veröffentlicht (${excluded.length}, siehe EXCLUDED_SPEAKERS):`);
  excluded.forEach((e) => console.log(`  ${e.youtubeId}  ${e.scholarId}`));
}

console.log(`\nMit Datum: ${dated} / ${videos.length} (ohne Beleg bleibt es leer)`);
console.log(`Mit Laufzeit: ${videos.filter((v) => v.duration).length} / ${videos.length}`);

if (dateDisagreements.length) {
  console.log(`\n⚠️  ${dateDisagreements.length} Datum weicht vom kuratierten ab (Kanal gewinnt):`);
  dateDisagreements.forEach((d) => console.log('   ' + d));
}

const unassigned = videos.filter((v) => v.scholarId === COLLECTION.id);
if (unassigned.length) {
  console.log(`\nNicht zugeordnet (${unassigned.length}) — zum Nachtragen in OVERRIDES:`);
  unassigned.forEach((v) => console.log(`  '${v.youtubeId}': { scholarId: '' }, // ${v.titleAr.slice(0, 55)}`));
}
