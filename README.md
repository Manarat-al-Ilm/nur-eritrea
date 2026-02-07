# nur-eritrea - Islamische Wissensplattform

Dreisprachige islamische Plattform (Arabisch, Englisch, Tigrinya) mit Büchern, Videos, Audio und Gelehrten-Biografien.

**Live:** https://nur-eritrea.pages.dev

## Tech Stack

- **Framework:** Astro (Static Site Generator)
- **Styling:** Tailwind CSS
- **Hosting:** Cloudflare Pages
- **PDF-Speicher:** Cloudflare R2
- **Schriften:** Amiri (Arabisch), Noto Sans Ethiopic (Tigrinya), Tajawal (Body)

## Farben

| Farbe | Hex | Verwendung |
|-------|-----|------------|
| Primary | `#1A5C5A` | Teal - Hauptfarbe |
| Accent | `#C8A45C` | Gold - Akzente |
| Cream | `#FAF6F0` | Hintergrund |

## Projektstruktur

```
src/
├── components/       # Astro-Komponenten
├── data/            # JSON-Datenbank
│   ├── books.json   # 5 Bücher
│   ├── videos.json  # 58 Videos + Gelehrte
│   ├── audio.json   # 8 Audio-Einträge
│   └── scholars.json # 5 historische Gelehrte
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
├── og-image.svg     # Social Media Bild
└── robots.txt

# PDFs werden auf Cloudflare R2 gehostet (nicht im Git)
```

## Installation & Entwicklung

```bash
# Dependencies installieren
npm install

# Entwicklungsserver starten
npm run dev

# Für Produktion bauen
npm run build

# Build lokal testen
npm run preview
```

## Deployment

Push zu GitHub → Cloudflare Pages baut automatisch.

**Build-Einstellungen auf Cloudflare:**
- Build command: `npm run build`
- Build output directory: `dist`

## SEO

- Sitemap wird automatisch generiert (`/sitemap-index.xml`)
- Open Graph & Twitter Cards konfiguriert
- Canonical URLs gesetzt
- robots.txt vorhanden

## TODO bei eigener Domain

Wenn du eine eigene Domain verwendest, ändere:

1. `astro.config.mjs` → `site: 'https://DEINE-DOMAIN.com'`
2. `public/robots.txt` → Sitemap URL anpassen

## TODO: Admin-Seite

Wenn die manuelle JSON-Bearbeitung zu unübersichtlich wird (50+ Einträge):

- Admin-Interface mit GitHub API (bearbeitet JSON-Dateien direkt)
- Oder: Migration zu Cloudflare D1 Datenbank
- Login über Cloudflare Access (kostenlos)

## Daten bearbeiten

Alle Inhalte sind in `src/data/*.json`:

- **Bücher hinzufügen:** `src/data/books.json` bearbeiten, PDF auf Cloudflare R2 hochladen
- **Videos hinzufügen:** `src/data/videos.json` bearbeiten (YouTube URL/ID)
- **Audio hinzufügen:** `src/data/audio.json` bearbeiten
- **Gelehrte hinzufügen:** `src/data/scholars.json` bearbeiten

Nach Änderungen: Push zu GitHub → automatischer Rebuild.

## PDF-Hosting (Cloudflare R2)

PDFs sind zu groß für Git. Sie werden auf Cloudflare R2 gehostet:

1. **R2 Dashboard:** dash.cloudflare.com → R2 Object Storage
2. **Bucket:** `nur-eritrea-books`
3. **Upload:** PDFs im Dashboard hochladen
4. **URL-Format:** `https://pub-XXX.r2.dev/dateiname.pdf`

Die PDF-URLs werden in `src/data/books.json` unter `pdfUrl` gespeichert.

## Layout

- RTL (Rechts-nach-Links) als Standard für Arabisch
- Jeder Titel zeigt alle drei Sprachen: Arabisch → Englisch → Tigrinya
- Mobile-first responsive Design
