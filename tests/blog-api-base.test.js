'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const gen = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'generate-blog.js'), 'utf8');
const postApi = fs.readFileSync(path.join(__dirname, '..', 'api', 'blog', 'post.js'), 'utf8');

// Static post pages are served from github.io where /api does not exist
// (Pages build deletes api/). API calls must target the Vercel backend there.
assert.ok(gen.includes("location.hostname==='hariomlohardev.github.io'") && gen.includes('hariomlohardev.vercel.app'),
  'scripts/generate-blog.js must route API calls to the Vercel backend when on github.io');
assert.ok(gen.includes("API_BASE+'/api/blog/social"),
  'scripts/generate-blog.js must send social API calls through the host-aware base');
assert.ok(!gen.includes("fetch('/api/blog/social"),
  'scripts/generate-blog.js must not call same-origin /api/blog/social (404/405 on github.io)');
assert.ok(postApi.includes('Access-Control-Allow-Origin'),
  'api/blog/post.js must send CORS headers for cross-origin calls from github.io');
