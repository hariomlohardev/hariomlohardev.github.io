# Posts — Hariom Lohar Daily Logs & Blog

How to publish a new daily log or article in 60 seconds — $0, no CMS.

## 1) Create the file
Duplicate any `.md` in this folder and rename to `YYYY-MM-DD-slug.md`:

```
2026-08-10-day-041-transformer-block.md
```

## 2) Edit frontmatter
At the top, keep the `---` block:

```yaml
---
title: "Day 041 — Transformer block by hand"
date: 2026-08-10
description: "Built multi-head attention forward/backward in NumPy — 1 file, 0 autograd."
tags: ["daily-log", "Transformers", "NumPy"]
slug: day-041-transformer-block   # optional — defaults to filename without date
draft: false
cover: /og/day-041-transformer-block.svg   # optional — og:image. If blank, generator makes og/<slug>.svg for free
---
```

- `date` drives sort order (newest first) and URL date.
- `tags` — use `daily-log` for daily logs, plus topic tags.
- `draft: true` → hidden until you flip it. Free scheduler: set a future `date` + `draft: true`, push, and `.github/workflows/schedule-posts.yml` flips it at 05:47 IST daily (no $) — or flip by hand.
- `cover` — optional per-post OG image URL (absolute or `/path`). If omitted, `og/<slug>.svg` is auto-generated (1200×630 Lab Notebook chrome, no deps) and used as `og:image` + JSON-LD `image`. Put real covers in `/public` or `/posts/assets` and point here.
- Body below is plain Markdown (headings, lists, code fences, links, images).

## 3) Preview locally
```bash
node scripts/generate-blog.js
# then open blog.html or blog/p/<slug>/ in browser
# or: npx serve .
```

## 4) Ship (when ready)
The Pages workflow runs `node scripts/generate-blog.js` automatically on push, so you can also just commit the `.md`:

```bash
git add posts/2026-08-10-day-041-transformer-block.md
git commit -m "log: day 041 transformer block"
# push only when you approve — ask before push per repo rule
```

Build generates:
- `posts.json` (index for blog.html)
- `feed.xml` (RSS at /feed.xml)
- `blog/p/<slug>/index.html` static pages (SEO-crawlable)
- patches `sitemap.xml` to include the new post

## Writing tips
- Keep `description` ≤ 155 chars — it becomes the Google snippet + OG description.
- Use one `H1` via `title` — start markdown at `##`.
- Code: ```python fences get syntax-friendly styling.
- Images: put in `posts/assets/` and link `![alt](assets/foo.png)`.
- Tags: 2–4 is ideal. `daily-log` tags auto-show in the Daily Logs filter.

## Live features (free, no push needed to preview)

### GitHub graph — live (no setup)
`index.html` now fetches `https://github-contributions-api.jogruber.de/v4/hariomlohardev?y=last` client-side, caches 6h in `localStorage`, and falls back to an illustrative grid if offline/blocked. Nothing to do on your PC — push and it just works.

### Comments — Giscus (one-time setup, 3 min, free)
Blog posts have a “Discuss” section powered by GitHub Discussions. Until you configure it, they gracefully fall back to **Utterances** (Issues) so comments still work day 0.

**You only do this once on your PC / GitHub:**

1. On GitHub repo `hariomlohardev/hariomlohardev.github.io` → **Settings → General → Features** → tick **Discussions** (or visit `https://github.com/hariomlohardev/hariomlohardev.github.io/discussions` and click *Enable*).
2. Install Giscus: go to `https://github.com/apps/giscus` → **Install** → select `hariomlohardev.github.io`.
3. Go to `https://giscus.app`:
   - Language: English
   - Repository: `hariomlohardev/hariomlohardev.github.io` (must be public)
   - Page ↔ Discussions mapping: **pathname**
   - Discussion Category: **General** (or Announcements)
   - Features: enable reactions, input bottom, theme Light
4. Copy the two IDs it shows: `data-repo-id="R_kgDO…"` and `data-category-id="DIC_kwDO…"`
5. Paste them into `scripts/generate-blog.js` (search `data-repo-id`) — two empty strings `''` → your IDs. Commit that file. *(Already done for you: `R_kgDOTkm3vQ` / `DIC_kwDOTkm3vc4DDAjC` + `preferred_color_scheme` — just verify on giscus.app they match.)*
6. Run `node scripts/generate-blog.js` locally to regenerate `blog/p/*/index.html` with Giscus, preview `blog/p/<slug>/`, commit + push when ready.

Until you paste IDs, posts use Utterances automatically (comments stored as Issues, still free, no extra config). After you paste, it switches to Giscus (Discussions). Your 4 static pages were manually patched with the IDs so they already match the generator — future posts auto-pick up the same IDs on next `node scripts/generate-blog.js`.

### Newsletter + analytics — $0 (optional, 2 min)

- **Newsletter (free):** index.html + blog.html already wired to `hariomlohar` at `buttondown.com/hariomlohar` (`https://buttondown.email/api/emails/embed-subscribe/hariomlohar`). Test it with your own email after next push. RSS `/feed.xml` stays as backup. To swap to Substack use `https://YOURNAME.substack.com` instead.
- **Analytics (free, no cookies):** Search `REPLACE_WITH_YOUR_CLOUDFLARE_TOKEN` in `index.html`, `blog.html`, `post.html`, and `scripts/generate-blog.js`. Get a free token at `dash.cloudflare.com` → Web Analytics → Add site `hariomlohardev.github.io` → paste into `data-cf-beacon='{"token":"..."}'` and uncomment the `<script>` line. Or use GoatCounter (`goatcounter.com`, free) — comment right there shows the fallback snippet.
- **Contact form (free):** `#contact` FormSubmit → `hariomlohar.new@gmail.com` live (honeypot `_honey` + `_captcha=false` + `_next=thanks.html`). Or swap to Formspree `https://formspree.io/f/XXXX`.

### OG images — per-post, $0 (auto)

Generator emits `og/<slug>.svg` (1200×630) per post from title/desc/date/tag with Lab Notebook chrome (no deps). If you set `cover:` in frontmatter, that wins as `og:image`. SVG is committed to the repo so Pages serves it with no build. Verify `<meta property="og:image">` in `blog/p/<slug>/` after `node scripts/generate-blog.js`.

— Lab Notebook No.01
