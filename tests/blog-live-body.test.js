'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const gen = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'generate-blog.js'), 'utf8');
const postHtml = fs.readFileSync(path.join(__dirname, '..', 'post.html'), 'utf8');

// A deployed static snapshot can be older than the last admin edit (Vercel only
// rebuilds on push). The baked page must self-correct from the live backend.
assert.ok(gen.includes('/api/blog/post?slug='),
  'generated post pages must live-refresh from the backend API');
assert.ok(gen.includes("document.querySelector('.prose')"),
  'generated post pages must re-render the baked body with live data');

// Readers must prefer the live Supabase body; the static snapshot is fallback only.
const liveAt = postHtml.indexOf('liveHtml');
const staticAt = postHtml.indexOf("fetch('/blog/p/'");
assert.ok(liveAt >= 0 && staticAt >= 0 && liveAt < staticAt,
  'post.html must try the live Supabase body before the static snapshot');
