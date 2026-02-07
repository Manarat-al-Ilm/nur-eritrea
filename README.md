# nur-eritrea - Islamic Knowledge Platform

Trilingual Islamic platform (Arabic, English, Tigrinya) featuring books, videos, audio, and scholar biographies.

**Live:** https://nur-eritrea.pages.dev

## Tech Stack

- **Framework:** Astro (Static Site Generator)
- **Styling:** Tailwind CSS
- **Hosting:** Cloudflare Pages
- **PDF Storage:** GitHub Releases
- **Fonts:** Amiri (Arabic), Noto Sans Ethiopic (Tigrinya), Tajawal (Body)

## Colors

| Color | Hex | Usage |
|-------|-----|-------|
| Primary | `#1A5C5A` | Teal - Main color |
| Accent | `#C8A45C` | Gold - Accents |
| Cream | `#FAF6F0` | Background |

## Project Structure

```
src/
├── components/       # Astro components
├── data/            # JSON database
│   ├── books.json   # 5 books
│   ├── videos.json  # 58 videos + scholars
│   ├── audio.json   # 8 audio entries
│   └── scholars.json # 5 historical scholars
├── layouts/
│   └── BaseLayout.astro
├── pages/
│   ├── index.astro
│   ├── books/
│   ├── videos/
│   ├── audio/
│   └── scholars/
└── styles/
    └── global.css

public/
├── favicon.svg
├── og-image.svg     # Social media image
└── robots.txt

# PDFs are hosted on GitHub Releases (not in Git)
```

## Installation & Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview build locally
npm run preview
```

## Deployment

Push to GitHub → Cloudflare Pages builds automatically.

**Cloudflare Build Settings:**
- Build command: `npm run build`
- Build output directory: `dist`

## SEO

- Sitemap auto-generated (`/sitemap-index.xml`)
- Open Graph & Twitter Cards configured
- Canonical URLs set
- robots.txt present

## TODO: Custom Domain

When using a custom domain, update:

1. `astro.config.mjs` → `site: 'https://YOUR-DOMAIN.com'`
2. `public/robots.txt` → Update sitemap URL

## TODO: Admin Panel

When manual JSON editing becomes unwieldy (50+ entries):

- Admin interface using GitHub API (edits JSON files directly)
- Or: Migrate to Cloudflare D1 database
- Login via Cloudflare Access (free)

## Editing Content

All content is in `src/data/*.json`:

- **Add books:** Edit `src/data/books.json`, upload PDF to GitHub Releases
- **Add videos:** Edit `src/data/videos.json` (YouTube URL/ID)
- **Add audio:** Edit `src/data/audio.json`
- **Add scholars:** Edit `src/data/scholars.json`

After changes: Push to GitHub → automatic rebuild.

## PDF Hosting (GitHub Releases)

PDFs are too large for Git. They are hosted on GitHub Releases:

1. Go to GitHub → Releases → Create new release
2. Tag: `v1.0-books` (or similar)
3. Upload PDFs as release assets
4. URL format: `https://github.com/Manarat-al-Ilm/nur-eritrea/releases/download/TAG/filename.pdf`

PDF URLs are stored in `src/data/books.json` under `pdfUrl`.

## Layout

- RTL (Right-to-Left) as default for Arabic
- Each title shows all three languages: Arabic → English → Tigrinya
- Mobile-first responsive design
