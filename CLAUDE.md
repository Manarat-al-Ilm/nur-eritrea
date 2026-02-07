# منارة العلم | መናረት ኣልዒልም - Islamic Knowledge Platform

## Project Overview
An Islamic knowledge platform (website) featuring Fatawa (Q&A), articles, video lessons, and scholar profiles. The site serves Arabic and Tigrinya speaking communities. Headers and titles are displayed in BOTH languages simultaneously (not a language switcher).

## Tech Stack
- **Framework:** Astro (static site generator)
- **CMS:** Decap CMS (free, browser-based admin panel for scholars)
- **Hosting:** Cloudflare Pages (free tier) – chosen for best performance in Middle East & East Africa (servers in Dubai, Riyadh, Addis Ababa, Djibouti, etc.)
- **Styling:** Tailwind CSS + custom CSS for RTL/Arabic typography
- **Fonts:** Amiri (Arabic headings), Noto Sans Ethiopic (Tigrinya), Tajawal (Arabic body)

## Design Direction
- **Color palette:** Deep teal (#1A5C5A) as primary, gold (#C8A45C) as accent, cream (#FAF6F0) background
- **Typography:** Amiri for Arabic headings, Noto Sans Ethiopic for Tigrinya, Tajawal for body text
- **Layout:** RTL (right-to-left) as default
- **Aesthetic:** Warm, scholarly, Islamic geometric patterns as subtle backgrounds. NOT generic AI look.
- **Bilingual display:** Every heading/title shows Arabic FIRST, then Tigrinya below it in smaller text. NOT a language toggle.

## Content Sections (Pages needed)

### 1. Homepage (الرئيسية | መበገሲ)
- Hero with search bar and Bismillah
- Stats bar (fatawa count, articles count, videos count, scholars count)
- Latest Fatawa cards (3-4)
- Latest Articles cards (3)
- Latest Video lessons (3)
- Featured Scholars

### 2. Fatawa Page (الفتاوى | ፈታዋ)
- Filterable by category (العبادات, المعاملات, الأسرة, الأخلاق, العقيدة)
- Search functionality
- Each fatwa card shows: category badge, question (AR + TI), answer preview, scholar name, date
- Individual fatwa detail page

### 3. Articles Page (المقالات | ጽሑፋት)
- Filterable by category (التزكية, العقيدة, الفقه, السيرة, الأخلاق)
- Article cards with: tag, title (AR + TI), excerpt, author, reading time
- Individual article detail page

### 4. Video Lessons Page (الدروس المرئية | ቪድዮ ትምህርቲ)
- YouTube video embeds
- Organized by series (سلسلة)
- Video cards with: thumbnail/play button, series name, title (AR + TI), scholar, view count
- Duration badge

### 5. Scholars Page (العلماء | ዑለማእ)
- Scholar cards with: avatar, name (AR + TI), specialty, bio, stats (fatawa/articles/lessons count)
- Individual scholar profile page showing all their content

### 6. About Page (من نحن)
### 7. Contact Page (تواصل معنا)

## CMS Configuration (Decap CMS)

### Content Types needed in CMS:

**Fatwa:**
- category (select: العبادات, المعاملات, الأسرة, الأخلاق, العقيدة)
- question_ar (string, required)
- question_ti (string)
- answer (markdown, required)
- sources (string)
- keywords (list)
- scholar (relation to scholars)
- date (datetime)

**Article:**
- category (select: التزكية, العقيدة, الفقه, السيرة, الأخلاق)
- title_ar (string, required)
- title_ti (string)
- body (markdown, required)
- excerpt (string)
- scholar (relation to scholars)
- reading_time (number)
- date (datetime)

**Video:**
- youtube_url (string, required)
- title_ar (string, required)
- title_ti (string)
- series_name (string)
- episode_number (number)
- duration (string)
- scholar (relation to scholars)
- date (datetime)

**Scholar:**
- name_ar (string, required)
- name_ti (string)
- specialty (string)
- bio (text)
- avatar (image)

## CMS Admin Access
- Scholars log in at /admin
- Uses Cloudflare Access (free) for authentication
- Each scholar can create/edit their own content
- Admin user can manage everything

## Important Notes
- ALL text direction is RTL
- Placeholder brand name: منارة العلم | መናረት ኣልዒልም (can be changed later)
- The site must work well on mobile (many users will access from phones)
- YouTube videos are embedded, NOT hosted on the site
- Keep everything as simple as possible for non-technical scholars
- Tigrinya text uses Noto Sans Ethiopic font
- Arabic text uses Amiri (headings) and Tajawal (body)

## Sample Content
Use Islamic placeholder content (real topics like prayer, fasting, family, etc.) for demo purposes. Use proper Arabic and Tigrinya text.

## File Structure Target
```
/
├── src/
│   ├── layouts/
│   │   └── BaseLayout.astro
│   ├── pages/
│   │   ├── index.astro
│   │   ├── fatawa/
│   │   ├── articles/
│   │   ├── videos/
│   │   ├── scholars/
│   │   └── admin/
│   ├── components/
│   │   ├── Header.astro
│   │   ├── Footer.astro
│   │   ├── FatwaCard.astro
│   │   ├── ArticleCard.astro
│   │   ├── VideoCard.astro
│   │   ├── ScholarCard.astro
│   │   └── SearchBar.astro
│   ├── content/
│   │   ├── fatawa/
│   │   ├── articles/
│   │   ├── videos/
│   │   └── scholars/
│   └── styles/
│       └── global.css
├── public/
│   └── admin/
│       ├── index.html
│       └── config.yml
├── astro.config.mjs
├── tailwind.config.mjs
├── package.json
└── CLAUDE.md
```
