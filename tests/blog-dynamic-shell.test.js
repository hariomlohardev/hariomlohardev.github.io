'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const gen = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'generate-blog.js'), 'utf8');
const postHtml = fs.readFileSync(path.join(__dirname, '..', 'post.html'), 'utf8');
const Module = require('node:module');

// Shell pages bake no post content — everything renders from the database.
assert.ok(!gen.includes('${post.html}'),
  'generated post pages must not bake the post body');
assert.ok(!gen.includes('<title>${escHtml(post.title)}'),
  'generated post pages must not bake the post title');
assert.ok(!gen.includes('"@type":"BlogPosting"'),
  'generated post pages must not bake per-post structured data');

// The shell mounts empty containers and loads the post from the database.
assert.ok(gen.includes('id="postBody"'),
  'generated shell must have a body mount point');
assert.ok(gen.includes('/api/blog/post?slug=') && gen.includes('POST_SLUG'),
  'generated shell must fetch the post from the database');

// post.html is dynamic-only: no static-snapshot fallback.
assert.ok(!postHtml.includes("fetch('/blog/p/'"),
  'post.html must not fall back to static snapshots');

// The shell template must actually render: mount points, baked identifiers,
// loader with the slug — and no uninterpolated placeholders or post content.
{
  const genPath = path.join(__dirname, '..', 'scripts', 'generate-blog.js');
  const src = gen.replace(/main\(\)\.catch[\s\S]*$/, 'module.exports={postPage};');
  const m = new Module(genPath, module);
  m.filename = genPath;
  m.paths = Module._nodeModulePaths(path.dirname(genPath));
  m._compile(src, genPath);
  const html = m.exports.postPage({
    slug: 'probe-post', url: 'https://hariomlohardev.github.io/blog/p/probe-post/',
    title: 'Probe Title', description: 'Probe desc', date: '2026-09-14',
    tags: ['test'], html: '<p>STALE-BODY-MUST-NOT-APPEAR</p>', raw: '',
    wordCount: 5, readingMinutes: 1, cover: null
  });
  assert.ok(html.includes('id="postBody"'), 'rendered shell must mount the body');
  assert.ok(html.includes('id="postTitle"'), 'rendered shell must mount the title');
  assert.ok(html.includes("var POST_SLUG='probe-post'"), 'rendered shell must bake the slug');
  assert.ok(html.includes('rel="canonical" href="https://hariomlohardev.github.io/blog/p/probe-post/"'),
    'rendered shell must bake the canonical URL');
  assert.ok(!html.includes('${'), 'rendered shell must have no uninterpolated placeholders');
  assert.ok(!html.includes('STALE-BODY-MUST-NOT-APPEAR'), 'rendered shell must not bake the body');
  assert.ok(!html.includes('Probe Title — Hariom Lohar'), 'rendered shell must not bake the title');
}
