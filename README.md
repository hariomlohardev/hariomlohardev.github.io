# Hariom Lohar — Lab Notebook No.01 · `hariomlohardev.github.io`

<div align="center">

### Python · Django · Flutter × AGI Research · India — IST (UTC+5:30) · 1 July 2026 → 31 Dec 2027

[![Website](https://img.shields.io/badge/Website-hariomlohardev.github.io-0B1220?style=flat-square&logo=googlechrome&logoColor=white)](https://hariomlohardev.github.io/)
[![Blog](https://img.shields.io/badge/Blog-Daily%20Logs-FFD400?style=flat-square&logo=rss&logoColor=0B1220)](https://hariomlohardev.github.io/blog.html)
[![RSS](https://img.shields.io/badge/RSS-feed.xml-E10600?style=flat-square&logo=rss&logoColor=white)](https://hariomlohardev.github.io/feed.xml)
[![CS50P](https://img.shields.io/badge/CS50P-Harvard%202026-A51C30?style=flat-square&logo=harvard&logoColor=white)](https://cs50.harvard.edu/certificates/544021b8-ab89-4eb2-a433-9c0b949e658f)
[![X](https://img.shields.io/badge/X-@HariomloharAGI-000000?style=flat-square&logo=x&logoColor=white)](https://x.com/HariomloharAGI)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-in%2Fhariomlohar-0A66C2?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/hariomlohar)
[![Email](https://img.shields.io/badge/Email-hariomlohar.new@gmail.com-0050FF?style=flat-square&logo=gmail&logoColor=white)](mailto:hariomlohar.new@gmail.com)

**Live:** [hariomlohardev.github.io](https://hariomlohardev.github.io/) · [Blog & Daily Logs](https://hariomlohardev.github.io/blog.html) · [Projects](https://hariomlohardev.github.io/projects.html) · [Spam Classifier — live bench](https://hariomlohardev.github.io/projects/spam_classifier.html)

> Searching **“Hariom Lohar”** or **“Hariom Lohar GitHub”** — this is the official site. Profile repo is [`hariomlohardev`](https://github.com/hariomlohardev) (overview), this repo is the site source.

</div>

---

### ◎ What this repo is

Official source for **Hariom Lohar** (`hariomlohardev` on GitHub) — Harvard **CS50P certified 2026**, Python/Django/FastAPI & Flutter builder by day, AGI researcher rebuilding intelligence from first principles since **1 July 2026**, daily in public (India, IST).

- **Lab Notebook No.01** design — `FFFEFB` paper, `F3F0E8` paper-2, `FFFFFF` sheet, `0B1220` ink, `FFD400` signal, graph `24px/120px`, washi tape, sticky header. No template.
- **Static, $0, own CMS** — GitHub Pages (`main` branch, `.nojekyll`), vanilla HTML/CSS/JS, zero deps. Posts live in Supabase (`public.posts`), written at `/admin/blog`; `scripts/generate-blog.js` mirrors them into `feed.xml` + `blog/p/<slug>/` + `og/<slug>.svg` + `sitemap.xml`.
- **SEO max for `Hariom Lohar`** — query-fronted titles, `@graph` JSON-LD (Person + WebSite + CollectionPage + BlogPosting), FAQ matching `Hariom Lohar GitHub`, `rel=me` sameAs, `og:image` per post, RSS + sitemap + `google36e315fd4176dd3d.html`.

---

### 🧠 Lab Notebook No.01 — First Principles

> **AGI Mission — 1 July 2026 → 31 Dec 2027 · 548 days · 8h/day · derive before import**

| Phase | Title | Detail | State |
| :--- | :--- | :--- | :--- |
| **01** | Math foundations | linear algebra · calculus · probability | ✅ done |
| **02** | Neural nets from scratch | backprop · optimizers · NumPy (`T=3,d=4` grad `1e-4`) | ✅ done |
| **03** | **Deep learning — now** | **CNNs · Transformers · PyTorch** · Day 040 multi-head + layernorm | ● now |
| **04** | Toward AGI | LLMs · RAG at scale · research | ○ next |

Live ruler + countdown on site: [`#mission`](https://hariomlohardev.github.io/#mission). Full day-by-day math → [`AGI_Research`](https://github.com/hariomlohardev/AGI_Research).

---

### 📝 Blog & Daily Logs — Supabase is the source of truth

Write a post at [`/admin/blog`](https://hariomlohardev.vercel.app/admin/blog) — title, body
(Markdown), tags, cover, published. It lands in Supabase `public.posts` and shows up on
`/blog` immediately, because the page reads Supabase live.

The build only ever *mirrors* Supabase:

```bash
# needs SUPABASE_URL + SUPABASE_ANON_KEY (or SERVICE_ROLE_KEY) in .env
node scripts/generate-blog.js
# → feed.xml · blog/p/<slug>/index.html · og/<slug>.svg (if no cover) · sitemap.xml patch
```

There is no file fallback — no `posts.json`, no `posts/*.md`. Delete a post in Supabase and
the next build deletes its page, its og image and its sitemap entry. A build that cannot
reach Supabase fails loudly rather than quietly rewriting pages from stale data.

- `published: false` keeps a post out of every public surface (list, feed, sitemap, static page).
- `cover` (`/og/<slug>.svg`, `/certificates/1.png`, or an `https://…` url) wins as `og:image` + JSON-LD `image`; otherwise a Lab Notebook `og/<slug>.svg` is generated (1200×630).
- Uploads (images and any other file) go to the Supabase `blog-images` bucket straight from the editor.

### 🛠️ Stack — ship vs mastered

**Ship** — Django · FastAPI · REST APIs · Flutter · Dart · LangChain · RAG · Pyodide (live bench)
**Mastered** — CS50P · Linear Algebra · Calculus · Probability · NumPy · PyTorch · Backprop derived by hand · SGD → Adam

Live on site: [`#stack`](https://hariomlohardev.github.io/#stack) · [`#services`](https://hariomlohardev.github.io/#services) (Backend Systems · Mobile Apps · AI Features · Automation)

---

### 📁 Structure

```
.
├── index.html                  # Lab Notebook — hero Hariom Lohar, mission ruler (IST), work grid, latest logs, newsletter, contact
├── blog.html                   # Blog listing — search/clear/highlight + filter/tag + pagination + skeleton
├── post.html                   # Fallback reader ?slug= (also loads Giscus)
├── projects.html               # Project archive
├── projects/spam_classifier.html # Live Naive Bayes bench (Pyodide, in-browser)
├── admin/blog/edit.html        # Post editor — writes Supabase public.posts
├── scripts/generate-blog.js    # Zero-dep builder — Supabase → feed.xml + og/*.svg + blog/p/* + sitemap
├── blog/p/<slug>/index.html    # SEO-crawlable static pages (BlogPosting JSON-LD, canonical)
├── og/<slug>.svg               # Per-post OG 1200×630 Lab Notebook (no cover → auto)
├── certificates/1.png          # Harvard CS50P cert 2246×1588 (verify via QR / link)
├── data.json / projects-data.json # Lab notebook data (mission 2026-07-01, 548 days)
├── sitemap.xml / robots.txt / site.webmanifest / humans.txt / 404.html / .nojekyll
├── google36e315fd4176dd3d.html # Search Console verification
├── SEO_CHECKLIST.md            # Entity closure checklist
├── thanks.html                 # FormSubmit _next target (noindex)
└── .github/workflows/
    └── pages.yml               # Pages deploy — Setup Node → npm run build (Supabase) → deploy-pages
```

Two clones, no mix:
- `D:\temp\demo` → this repo (`hariomlohardev.github.io` — the site)
- `D:\temp\hariomlohardev-profile` → profile repo (`hariomlohardev` — GitHub overview card)

---

### 🚀 Local dev

```bash
git clone https://github.com/hariomlohardev/hariomlohardev.github.io.git
cd hariomlohardev.github.io
npx serve .                    # or python -m http.server 3000
node scripts/generate-blog.js  # mirrors Supabase posts into static pages
```

Workflow is `actions/deploy-pages` (permissions `pages:write` + `id-token:write`, concurrency `pages`). `.nojekyll` keeps Pages from Jekyll.

---

### 🔍 SEO — verify `Hariom Lohar`

- Titles front-load `Hariom Lohar` · `@graph` Person (sameAs GitHub/X/LinkedIn) + WebSite + FAQPage · visible FAQ `Who is Hariom Lohar?` etc.
- Per-post `og:image` is `cover` or `og/<slug>.svg` (1200×630) + `og:image:alt` + `twitter:image` · `BlogPosting` JSON-LD `image`.
- Check: `curl -s https://hariomlohardev.github.io/feed.xml | head` · then any `<slug>` from that feed: `curl -s https://hariomlohardev.github.io/blog/p/<slug>/ | grep -i og:image`
- Search Console (`google36e315fd4176dd3d.html` + `sitemap.xml` submitted) → URL Inspection → **Request Indexing** for `/`, `/blog.html`, each new `blog/p/<slug>/`, `/feed.xml` after push. Bios on GitHub/LinkedIn/X already point to `hariomlohardev.github.io` — closes entity for `Hariom Lohar` / `Hariom Lohar GitHub`.

---

### 📜 Credentials — Harvard CS50P 2026

Hariom Lohar — **CS50's Introduction to Programming with Python (CS50P)**, Harvard University, Cambridge, MA — 9 problem sets + final project, awarded 2026 by Prof. David J. Malan.

- Verify: [cs50.harvard.edu/certificates/544021b8-ab89-4eb2-a433-9c0b949e658f](https://cs50.harvard.edu/certificates/544021b8-ab89-4eb2-a433-9c0b949e658f) (QR on cert) — also on site [`#credentials`](https://hariomlohardev.github.io/#credentials) and [`certificates/1.png`](certificates/1.png) (2246×1588).

---

### 📬 Contact & Growth — $0, free tiers only

- **Contact form** `#contact` → `https://formsubmit.co/hariomlohar.new@gmail.com` (honeypot `_honey`, `_captcha=false`, `_next=thanks.html`) — first send triggers confirm email, then open. Alt: Formspree `https://formspree.io/f/XXXX`.
- **Newsletter** `#newsletter` + `blog.html` → `https://buttondown.email/api/emails/embed-subscribe/hariomlohar` ([buttondown.com/hariomlohar](https://buttondown.com/hariomlohar)) + RSS fallback [`/feed.xml`](https://hariomlohardev.github.io/feed.xml) → email free.
- **Analytics placeholder** (commented in `index.html`/`blog.html`/`post.html`/`generate-blog.js`): `<!-- <script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "REPLACE_WITH_YOUR_CLOUDFLARE_TOKEN"}'></script> -->` — paste Cloudflare Web Analytics token, uncomment. Fallback: GoatCounter `gc.zgo.at/count.js`.
- **Comments** — Giscus via Discussions (free) `R_kgDOTkm3vQ` / `DIC_kwDOTkm3vc4DDAjC` + Utterances fallback via Issues — per `blog/p/*` (`giscus.app` → `preferred_color_scheme`, `pathname`).
- **Graph** — live GitHub contributions `github-contributions-api.jogruber.de/v4/hariomlohardev?y=last` (6h `localStorage`, `mulberry32` fallback, 30 weeks ×7, a11y `role=img`).

---

### 📊 Status

Currently available — part-time for Django/FastAPI backends, Flutter apps, RAG over your data. → [`#contact`](https://hariomlohardev.github.io/#contact) · [hariomlohar.new@gmail.com](mailto:hariomlohar.new@gmail.com)

© Hariom Lohar — Lab Notebook No.01 · Built from first principles. See also [`humans.txt`](humans.txt) · [`SEO_CHECKLIST.md`](SEO_CHECKLIST.md).
