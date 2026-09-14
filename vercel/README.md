# Vercel — under GitHub Pages
# Lab Notebook No.01 · hariomlohardev.github.io

This folder is the **Vercel build layer** that runs *under* GitHub Pages.
GitHub Pages still serves `hariomlohardev.github.io` — Vercel just does the
heavy lifting (previews, edge cache, rollback) and can optionally push the same
static output back to Pages so both stay in sync.

## What lives where

- `../vercel.json` — Vercel project config (framework: null, output: `.`, build: `npm run build`)
- `../package.json` — build scripts for blog, projects, LLM indexes, tricks, prerendering, and OG assets (same as `.github/workflows/pages.yml`)
- `./README.md` — this file (how to link + deploy)
- `./build.sh` — local mimic of Vercel's build (for debugging)
- `../.vercelignore` — what Vercel shouldn't upload

## Quick start (one-time Vercel link)

```bash
# 1) install Vercel CLI (once, globally)
npm i -g vercel

# 2) from repo root D:\temp\demo
vercel link
# → Scope: your Vercel team
# → Link to existing project? N
# → Project name: hariomlohardev
# → In which directory is your code? ./
# → Override settings? N (uses vercel.json)

# 3) pull Supabase env values
vercel env pull .env.local

# 4) preview deploy
vercel

# 5) production deploy (what GitHub Pages will mirror)
vercel --prod
```

Then in Vercel dashboard:
- **Settings → Git → Connected Git Repository** → `hariomlohardev/hariomlohardev.github.io` → **Enable** (every `push to main` gets a Preview + Production deploy).
- **Settings → Domains** → leave `hariomlohardev.vercel.app` as preview; **do NOT add** `hariomlohardev.github.io` (that stays on Pages). Vercel is the builder, Pages is the face.
- **Settings → Environment Variables** → add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Open Source content is read only from Supabase `site_content (key=opensource)`.

## How the dual deploy stays in sync

Two paths, same `npm run build`:

1. **GitHub Pages (existing, keeps working)**
   `.github/workflows/pages.yml` on `push: main` does:
   `generate-blog → generate-projects → generate-llms → generate-tricks → upload-pages-artifact → deploy-pages`
   → `https://hariomlohardev.github.io`

2. **Vercel (new, underneath)**
   Vercel on `push: main` runs `vercel.json → buildCommand: npm run build` → `outputDirectory: .` → serves at `https://hariomlohardev.vercel.app`
   Vercel's own GitHub integration does this on every push, so no Actions workflow is involved.

Blog/tricks posts are static snapshots, so both hosts must rebuild on publish:
- **GitHub Pages** rebuilds via `content-changed` repository_dispatch (needs `GITHUB_TOKEN` in the Vercel project env).
- **Vercel** redeploys via a Deploy Hook (one-time setup below). Without it, vercel.app keeps serving its last build's `/blog/p/*` files while github.io is already fresh.
- Open Source is the exception: both hosts read Supabase `site_content (key=opensource)` live, so no rebuild is needed there.

One-time Vercel setup: Dashboard → Project → **Settings → Git → Deploy Hooks** → create one for `main` → **Settings → Environment Variables** → add it as `VERCEL_DEPLOY_HOOK_URL` → Redeploy once.

## Local Vercel build mimic

```bash
# same as Vercel does
./vercel/build.sh
# or
npm run build
python -m http.server 8000
# open http://localhost:8000
```

## Adding a new project / post

No Vercel config change needed. Just:

```bash
# add markdown
# posts/2026-08-23-my-new-log.md  or  projects-data.json edit

npm run build
# or let Vercel do it:
vercel --prod
```

## Troubleshooting

- **Build fails on Vercel but passes locally** → check Node 20 (`engines.node 20.x` in package.json) and that `scripts/generate-*.js` are zero-deps.
- **OG images 404** → ensure `og/*.svg` is committed or generated before deploy (build does it).
- **Open Source data missing** → verify the `site_content` row with `key=opensource` exists and the public-select RLS policy from `supabase/admin.sql` is applied.
- **Clean URLs 404 on Vercel but work on Pages** → `vercel.json → cleanUrls:true` + `rewrites` for `/blog/p/:slug` already handle it.

## Why this shape?

- **Zero framework tax** (`framework: null`) — we ship the same static files Pages ships.
- **Live content from one source** — Open Source entries are stored in Supabase and both hosts read that row directly.
- **Edge + Pages** — Vercel gives instant rollback + preview URLs; Pages keeps the `github.io` canonical you already rank for.

See also: `../vercel.json` (routing/headers), `../.vercelignore`, `../package.json` (build).
