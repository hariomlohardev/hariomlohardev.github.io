#!/usr/bin/env bash
# vercel/build.sh — mimic Vercel's build locally
# Usage: ./vercel/build.sh  (from repo root)  or  bash vercel/build.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
echo "→ Vercel local build (mirrors vercel.json buildCommand)"
echo "  Node: $(node -v)"
echo "  Root: $ROOT"
node scripts/generate-blog.js
node scripts/generate-projects.js
node scripts/generate-llms.js
# opensource needs token for live refresh; falls back to snapshot on disk if missing
if [ -n "${GITHUB_TOKEN:-}" ]; then
  echo "→ GITHUB_TOKEN present — live opensource snapshot"
  node scripts/generate-opensource.js
else
  echo "→ GITHUB_TOKEN absent — using on-disk opensource-data.json (or fallback)"
  node scripts/generate-opensource.js || echo "  (opensource fallback ok)"
fi
echo "✓ build complete — preview with: python -m http.server 8000"
echo "  then open http://localhost:8000"
