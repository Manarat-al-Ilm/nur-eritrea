/**
 * Generates src/data/audio.json and telegram-audio/upload-map.json
 * from telegram-audio/manifest.json.
 *
 * - Parses Tigrinya lesson titles into surah / episode / verse range.
 * - Fails loudly on titles it cannot match to exactly one surah, on
 *   duplicate slugs and on duplicate R2 keys — fix the surah table or
 *   the title parser, then re-run. Never guesses silently.
 * - Idempotent: re-run any time new lessons are fetched.
 *
 * Usage: node scripts/generate-audio-json.mjs
 *        R2_BASE=https://pub-xxxx.r2.dev node scripts/generate-audio-json.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MANIFEST_FILE = join(ROOT, 'telegram-audio', 'manifest.json');
const AUDIO_JSON = join(ROOT, 'src', 'data', 'audio.json');
const UPLOAD_MAP = join(ROOT, 'telegram-audio', 'upload-map.json');

// Public R2 bucket base URL (no trailing slash) and key prefix for this series.
const R2_BASE = process.env.R2_BASE || 'https://pub-PLACEHOLDER.r2.dev';
const R2_PREFIX = 'tafsir-beyan';

// --- Surah table -----------------------------------------------------------
// keys: distinctive Tigrinya substrings that identify the surah inside a
// normalized title. Every title must match EXACTLY ONE table entry.
// nameTi for surahs not yet seen in the channel are best guesses — the
// loud-failure check will surface them for correction when they appear.
const SURAHS = [
  { number: 1,  slug: 'al-fatiha',   nameAr: 'الفاتحة',   nameTi: 'ሱረቱል ፋቲሓ',   keys: ['ፋቲሓ'] },
  { number: 2,  slug: 'al-baqara',   nameAr: 'البقرة',    nameTi: 'ሱረቱል በቐራ',   keys: ['በቐራ'] },
  { number: 3,  slug: 'aali-imran',  nameAr: 'آل عمران',  nameTi: 'ሱራ ኣሊ ዒምራን', keys: ['ዒምራን'] },
  { number: 4,  slug: 'an-nisa',     nameAr: 'النساء',    nameTi: 'ሱረቱ ኒሳእ',    keys: ['ኒሳእ'] },
  { number: 5,  slug: 'al-maida',    nameAr: 'المائدة',   nameTi: 'ሱረቱል ማኢዳ',   keys: ['ማኢዳ'] },
  { number: 6,  slug: 'al-anam',     nameAr: 'الأنعام',   nameTi: 'ሱረቱል ኣንዓም',  keys: ['ኣንዓም'] },
  { number: 7,  slug: 'al-araf',     nameAr: 'الأعراف',   nameTi: 'ሱረቱል ኣዕራፍ',  keys: ['ኣዕራፍ'] },
  { number: 8,  slug: 'al-anfal',    nameAr: 'الأنفال',   nameTi: 'ሱረቱል ኣንፋል',  keys: ['ኣንፋል'] },
  { number: 9,  slug: 'at-tawba',    nameAr: 'التوبة',    nameTi: 'ሱረቱ ተውባ',    keys: ['ተውባ'] },
  { number: 10, slug: 'yunus',       nameAr: 'يونس',      nameTi: 'ሱረቱ ዩኑስ',    keys: ['ዩኑስ'] },
  { number: 11, slug: 'hud',         nameAr: 'هود',       nameTi: 'ሱረቱ ሁድ',     keys: ['ሁድ'] },
  { number: 12, slug: 'yusuf',       nameAr: 'يوسف',      nameTi: 'ሱረቱ ዩሱፍ',    keys: ['ዩሱፍ'] },
  { number: 13, slug: 'ar-rad',      nameAr: 'الرعد',     nameTi: 'ሱረቱ ራዕድ',    keys: ['ራዕድ'] },
  { number: 14, slug: 'ibrahim',     nameAr: 'إبراهيم',   nameTi: 'ሱረቱ ኢብራሂም',  keys: ['ኢብራሂም'] },
  { number: 15, slug: 'al-hijr',     nameAr: 'الحجر',     nameTi: 'ሱረቱል ሒጅር',   keys: ['ሒጅር'] },
  { number: 16, slug: 'an-nahl',     nameAr: 'النحل',     nameTi: 'ሱረቱ ነሕል',    keys: ['ነሕል'] },
  { number: 17, slug: 'al-isra',     nameAr: 'الإسراء',   nameTi: 'ሱረቱል ኢስራእ',  keys: ['ኢስራእ'] },
  { number: 18, slug: 'al-kahf',     nameAr: 'الكهف',     nameTi: 'ሱረቱል ከህፍ',   keys: ['ከህፍ'] },
  { number: 19, slug: 'maryam',      nameAr: 'مريم',      nameTi: 'ሱረቱ መርየም',   keys: ['መርየም'] },
  { number: 20, slug: 'taha',        nameAr: 'طه',        nameTi: 'ሱረቱ ጣህ',     keys: ['ጣህ'] },
  { number: 21, slug: 'al-anbiya',   nameAr: 'الأنبياء',  nameTi: 'ሱረቱል ኣንቢያእ', keys: ['ኣንቢያእ'] },
  { number: 22, slug: 'al-hajj',     nameAr: 'الحج',      nameTi: 'ሱረቱል ሓጅ',    keys: ['ሓጅ'] },
  { number: 23, slug: 'al-muminun',  nameAr: 'المؤمنون',  nameTi: 'ሱረቱል ሙእሚኑን', keys: ['ሙእሚኑን'] },
  { number: 24, slug: 'an-nur',      nameAr: 'النور',     nameTi: 'ሱረቱ ኑር',     keys: ['ኑር'] },
  { number: 25, slug: 'al-furqan',   nameAr: 'الفرقان',   nameTi: 'ሱረቱል ፉርቓን',  keys: ['ፉርቓን'] },
  { number: 26, slug: 'ash-shuara',  nameAr: 'الشعراء',   nameTi: 'ሱረቱ ሹዓራእ',   keys: ['ሹዓራእ'] },
  { number: 27, slug: 'an-naml',     nameAr: 'النمل',     nameTi: 'ሱረቱ ነምል',    keys: ['ነምል'] },
  { number: 28, slug: 'al-qasas',    nameAr: 'القصص',     nameTi: 'ሱረቱል ቐሰስ',   keys: ['ቐሰስ'] },
  { number: 29, slug: 'al-ankabut',  nameAr: 'العنكبوت',  nameTi: 'ሱረቱል ዓንከቡት', keys: ['ዓንከቡት'] },
  { number: 30, slug: 'ar-rum',      nameAr: 'الروم',     nameTi: 'ሱረቱ ሩም',     keys: ['ሩም'] },
  { number: 31, slug: 'luqman',      nameAr: 'لقمان',     nameTi: 'ሱረቱ ሉቕማን',   keys: ['ሉቕማን'] },
  { number: 32, slug: 'as-sajda',    nameAr: 'السجدة',    nameTi: 'ሱረቱ ሰጅዳ',    keys: ['ሰጅዳ'] },
  { number: 33, slug: 'al-ahzab',    nameAr: 'الأحزاب',   nameTi: 'ሱረቱል ኣሕዛብ',  keys: ['ኣሕዛብ'] },
  { number: 34, slug: 'saba',        nameAr: 'سبأ',       nameTi: 'ሱረቱ ሰባእ',    keys: ['ሰባእ'] },
  { number: 35, slug: 'fatir',       nameAr: 'فاطر',      nameTi: 'ሱረቱ ፋጢር',    keys: ['ፋጢር'] },
  { number: 36, slug: 'yasin',       nameAr: 'يس',        nameTi: 'ሱረቱ ያሲን',    keys: ['ያሲን'] },
  { number: 37, slug: 'as-saffat',   nameAr: 'الصافات',   nameTi: 'ሱረቱ ሳፋት',    keys: ['ሳፋት'] },
  { number: 38, slug: 'sad',         nameAr: 'ص',         nameTi: 'ሱረቱ ሷድ',     keys: ['ሷድ'] },
  { number: 39, slug: 'az-zumar',    nameAr: 'الزمر',     nameTi: 'ሱረቱ ዙመር',    keys: ['ዙመር'] },
  { number: 40, slug: 'ghafir',      nameAr: 'غافر',      nameTi: 'ሱረቱ ጋፊር',    keys: ['ጋፊር'] },
];

// Manual corrections for mislabeled channel posts, keyed by messageId.
// Use only when the caption/originalFileName cross-check below cannot
// resolve a post automatically.
const OVERRIDES = {};

const SERIES_META = {
  slug: 'tafsir-dr-beyan',
  titleAr: 'تفسير القرآن الكريم',
  titleTi: 'ተፍሲር ቁርኣን',
  scholarAr: 'د. بيان صالح',
  scholarTi: 'ዶክተር በያን ሳልሕ',
  descriptionAr: 'دروس في تفسير القرآن الكريم باللغة التجرينية',
  descriptionTi: 'ትምህርቲ ተፍሲር ቁርኣን ብቋንቋ ትግርኛ',
};

// --- Title parsing ----------------------------------------------------------

function normalizeTitle(raw) {
  return raw
    .replace(/['’ʼ]/g, '')          // apostrophe variants in ሱረቱ'ል etc.
    .replace(/\([^)]*\)/g, ' ')     // parenthetical subtitles
    .replace(/\s+/g, ' ')
    .trim();
}

// Verse range out of any text: "ኣያ 80-88", "ኣያ  174 - 177", "Aya 1 - 5",
// double-dash typos ("72--83") or a bare "100-106" (Tawba-style titles).
function extractVerses(text) {
  const m =
    text.match(/(?:ኣያ|Aya)\s*(\d+(?:\s*[-–—]+\s*\d+)?)/i) ||
    text.match(/(?:^|\s)(\d+\s*[-–—]+\s*\d+)(?:\s|$)/);
  return m ? m[1].replace(/\s*[-–—]+\s*/, '-') : null;
}

function parseTitle(raw) {
  let t = normalizeTitle(raw).replace(/\.mp3$/i, '');

  // Leading episode: "10. …", "8 ሱረቱ…", ". ሱረቱ…" (broken dot, no number)
  let episode = null;
  const lead = t.match(/^(\d+)\s*[.)]?\s+/) || t.match(/^(\d+)[.)]\s*/);
  if (lead) {
    episode = parseInt(lead[1], 10);
    t = t.slice(lead[0].length);
  } else {
    t = t.replace(/^[.)\s]+/, '');
  }

  const verses = extractVerses(t);
  if (verses) t = t.replace(/(?:ኣያ|Aya)?\s*\d+\s*(?:[-–—]+\s*\d+)?\s*$/i, ' ');

  // Trailing episode (Baqara/Ali-Imran style): "ሱረቱል በቐራ 45"
  if (episode === null) {
    const trail = t.match(/(?:^|\s)(\d+)\s*$/);
    if (trail) {
      episode = parseInt(trail[1], 10);
      t = t.slice(0, t.length - trail[0].length);
    }
  }

  // Surah lookup: exactly one key must match the remaining text
  const matches = SURAHS.filter((s) => s.keys.some((k) => t.includes(k)));
  return { episode, verses, surah: matches.length === 1 ? matches[0] : null, matches };
}

// --- Main -------------------------------------------------------------------

const manifest = JSON.parse(readFileSync(MANIFEST_FILE, 'utf8'));

const problems = [];
const parsed = [];

for (const entry of manifest) {
  const fromTitle = parseTitle(entry.title || entry.caption || '');
  const { surah, matches } = fromTitle;
  if (!surah) {
    problems.push(
      `  ${matches.length === 0 ? 'NO MATCH' : 'AMBIGUOUS (' + matches.map((m) => m.slug).join(', ') + ')'}: ` +
      `"${entry.title}" (messageId ${entry.messageId})`
    );
    continue;
  }

  // Cross-check the three metadata sources. The embedded audio title is the
  // least reliable (stale copy-paste numbers on the channel); the post
  // caption carries the authoritative verse range and the uploader's
  // original filename a usable episode number.
  const fromOrig = parseTitle(entry.originalFileName || '');
  const capVerses = extractVerses(entry.caption || '');

  let verses = capVerses ?? fromTitle.verses ?? fromOrig.verses;
  let episode = fromTitle.episode ?? fromOrig.episode;
  let titleTi = entry.title;

  // When the uploader's original filename names the same surah (Ethiopic,
  // per-surah numbering), its episode number is authoritative — the channel
  // renumbered some title tags incorrectly (Anbiya, Hud, Taha). Latin or
  // junk original filenames don't match a surah and are ignored here.
  if (fromOrig.surah === surah && fromOrig.episode !== null) {
    episode = fromOrig.episode;
  }
  // Title verse range contradicting the caption also marks the title stale.
  const stale = fromTitle.verses && capVerses && fromTitle.verses !== capVerses;

  // Rebuild the display title whenever the title tag was corrected.
  if (stale || episode !== fromTitle.episode) {
    titleTi = `${episode !== null ? episode + '. ' : ''}${surah.nameTi}${verses ? ' ኣያ ' + verses : ''}`;
  }

  const override = OVERRIDES[entry.messageId];
  if (override) {
    episode = override.episode ?? episode;
    verses = override.verses ?? verses;
    titleTi = override.titleTi ?? titleTi;
  }

  parsed.push({ entry, surah, episode, verses, titleTi });
}

if (problems.length > 0) {
  console.error(`❌ ${problems.length} title(s) could not be assigned to exactly one surah:\n`);
  console.error(problems.join('\n'));
  console.error('\nFix the SURAHS table or the parser in scripts/generate-audio-json.mjs and re-run.');
  process.exit(1);
}

// Sort: Quran order, then episode (nulls last, date ascending as tiebreaker)
parsed.sort((a, b) =>
  a.surah.number - b.surah.number ||
  (a.episode ?? Infinity) - (b.episode ?? Infinity) ||
  a.entry.date.localeCompare(b.entry.date)
);

const slugs = new Set();
const items = [];
const uploadMap = [];

for (const { entry, surah, episode, verses, titleTi } of parsed) {
  let slug = episode !== null ? `${surah.slug}-${episode}` : `${surah.slug}-m${entry.messageId}`;
  if (slugs.has(slug)) {
    console.error(`❌ Duplicate slug "${slug}" ("${entry.title}", messageId ${entry.messageId}).`);
    console.error(`   Two lessons parse to the same surah+episode — inspect the manifest. Aborting.`);
    process.exit(1);
  }
  slugs.add(slug);

  const key = `${R2_PREFIX}/${slug}.mp3`;
  uploadMap.push({ src: entry.fileName, key });

  const titleArParts = [`تفسير سورة ${surah.nameAr}`];
  if (verses) titleArParts.push(`الآيات ${verses}`);
  else if (episode !== null) titleArParts.push(`الدرس ${episode}`);

  items.push({
    slug,
    group: surah.number,
    episode,
    titleTi,
    titleAr: titleArParts.join(' - '),
    verses,
    duration: entry.duration,
    durationSeconds: entry.durationSeconds,
    date: entry.date,
    audioUrl: `${R2_BASE}/${key}`,
  });
}

const groupNumbers = [...new Set(items.map((i) => i.group))].sort((a, b) => a - b);
const groups = groupNumbers.map((n) => {
  const s = SURAHS.find((x) => x.number === n);
  return { number: s.number, slug: s.slug, nameAr: s.nameAr, nameTi: s.nameTi };
});

const audioJson = {
  series: [{ ...SERIES_META, groups, items }],
  items: [],
};

writeFileSync(AUDIO_JSON, JSON.stringify(audioJson, null, 2) + '\n');
writeFileSync(UPLOAD_MAP, JSON.stringify(uploadMap, null, 2) + '\n');

if (R2_BASE.includes('PLACEHOLDER')) {
  console.warn('⚠️  R2_BASE is still the placeholder — re-run with R2_BASE=https://pub-….r2.dev before committing!');
}
console.log(`✅ ${items.length} lessons across ${groups.length} surahs`);
console.log(`   → ${AUDIO_JSON}`);
console.log(`   → ${UPLOAD_MAP}`);
