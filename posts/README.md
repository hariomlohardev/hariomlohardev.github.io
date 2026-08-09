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
---
```

- `date` drives sort order (newest first) and URL date.
- `tags` — use `daily-log` for daily logs, plus topic tags.
- `draft: true` → hidden until you flip it.
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
5. Paste them into `scripts/generate-blog.js` (search `data-repo-id`) — two empty strings `''` → your IDs. Commit that file.
6. Run `node scripts/generate-blog.js` locally to regenerate `blog/p/*/index.html` with Giscus, preview `blog/p/<slug>/`, commit + push when ready.

Until you paste IDs, posts use Utterances automatically (comments stored as Issues, still free, no extra config). After you paste, it switches to Giscus (Discussions).

— Lab Notebook No.01
