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

— Lab Notebook No.01
