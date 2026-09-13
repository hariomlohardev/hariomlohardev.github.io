'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

for(const file of ['opensource.html', 'index.html']){
  const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  assert.match(html, /\/rest\/v1\/site_content\?[^'"`]*key=eq\.opensource/,
    `${file} must load Open Source data directly from Supabase`);
  assert.ok(!html.includes("fetch('/api/admin/opensource'"),
    `${file} must not depend on the Vercel admin API`);
  assert.ok(!html.includes("fetch('opensource-curated.json'"),
    `${file} must not load checked-in curated data`);
  assert.ok(!html.includes("fetch('opensource-data.json'"),
    `${file} must not load generated GitHub data`);
}
