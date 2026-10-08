#!/usr/bin/env bash
# vercel/build.sh — mimic Vercel's build locally
# Usage: ./vercel/build.sh  (from repo root)  or  bash vercel/build.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
echo "→ Vercel local build (mirrors vercel.json buildCommand)"
echo "  Node: $(node -v)"
echo "  Root: $ROOT"
npm run build
echo "✓ build complete — preview with: python -m http.server 8000"
