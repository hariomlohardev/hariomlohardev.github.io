# Vercel — under GitHub Pages
# Lab Notebook No.01 · hariomlohardev.github.io

This folder is the **Vercel build layer** that runs *under* GitHub Pages.
GitHub Pages still serves `hariomlohardev.github.io` — Vercel just does the
heavy lifting (previews, edge cache, rollback) and can optionally push the same
static output back to Pages so both stay in sync.

## What lives where

- `../vercel.json` — Vercel project config (framework: null, output: `.`, build: `npm run build`)
- `../package.json` — `build` = `generate-blog + generate-projects + generate-llms + generate-opensource` (same as `.github/workflows/pages.yml`)
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

# 3) pull env (if you add GITHUB_TOKEN for opensource snapshot)
vercel env pull .env.local

# 4) preview deploy
vercel

# 5) production deploy (what GitHub Pages will mirror)
vercel --prod
```

Then in Vercel dashboard:
- **Settings → Git → Connected Git Repository** → `hariomlohardev/hariomlohardev.github.io` → **Enable** (every `push to main` gets a Preview + Production deploy).
- **Settings → Domains** → leave `hariomlohardev.vercel.app` as preview; **do NOT add** `hariomlohardev.github.io` (that stays on Pages). Vercel is the builder, Pages is the face.
- **Settings → Environment Variables** → add `GITHUB_TOKEN` (classic PAT, `public_repo` scope) if you want live `opensource-data.json` from the GitHub API; otherwise the snapshot on disk is used.

## How the dual deploy stays in sync

Two paths, same `npm run build`:

1. **GitHub Pages (existing, keeps working)**
   `.github/workflows/pages.yml` on `push: main` does:
   `generate-blog → generate-projects → generate-llms → generate-opensource → upload-pages-artifact → deploy-pages`
   → `https://hariomlohardev.github.io`

2. **Vercel (new, underneath)**
   Vercel on `push: main` runs `vercel.json → buildCommand: npm run build` → `outputDirectory: .` → serves at `https://hariomlohardev.vercel.app`
   *and* (optional) the workflow `.github/workflows/vercel.yml` can, after a successful Vercel deploy, re-trigger Pages so both URLs serve the identical `og/*.svg` + `feed.xml`.

Pick one:
- **Keep them independent** (simplest): both build from the same commit, they will match 99% of the time — no extra wiring.
- **Vercel → Pages mirror** (strict sync): let Vercel be the *only* builder, and have Pages just serve Vercel's output. Enable by giving Vercel a `GITHUB_TOKEN` + `VERCEL_TOKEN` and uncommenting the `vercel deploy --prebuilt` step in `vercel.yml`.

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
- **opensource-data.json stale** → set `GITHUB_TOKEN` in Vercel env, or run `node scripts/generate-opensource.js` locally before `vercel --prod`.
- **Clean URLs 404 on Vercel but work on Pages** → `vercel.json → cleanUrls:true` + `rewrites` for `/blog/p/:slug` already handle it.

## Why this shape?

- **Zero framework tax** (`framework: null`) — we ship the same static files Pages ships.
- **One build command** — single source of truth, no drift between Pages and Vercel.
- **Edge + Pages** — Vercel gives instant rollback + preview URLs; Pages keeps the `github.io` canonical you already rank for.

See also: `../vercel.json` (routing/headers), `../.vercelignore`, `../package.json` (build).
