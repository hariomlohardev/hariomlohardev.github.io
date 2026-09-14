'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

// One post UI everywhere: unknown slugs must render through the same shell
// template — never the legacy reader.
const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
const blogRewrites = vercel.rewrites.filter(r => String(r.source).startsWith('/blog/p/'));
assert.ok(blogRewrites.length > 0, 'vercel.json must keep /blog/p/:slug rewrites');
for(const r of blogRewrites){
  assert.ok(String(r.destination).startsWith('/api/blog/render'),
    `/blog/p rewrite must target the shell renderer, got ${r.destination}`);
}
assert.ok(!fs.existsSync(path.join(__dirname, '..', 'post.html')),
  'legacy post.html reader must be gone — one UI for all blogs');

// The renderer serves the generator shell with live post identity.
const originalLoad = Module._load;
const savedEnv = { ...process.env };
Module._load = function(request, parent, isMain){
  if(request === '@supabase/supabase-js'){
    return {
      createClient(){
        return {
          from(){
            const q = {
              _eq: [],
              select(){ return q; },
              eq(k, v){ q._eq.push([k, v]); return q; },
              maybeSingle(){
                const hit = q._eq.find(([k]) => k === 'slug');
                if(hit && hit[1] === 'render-probe'){
                  return Promise.resolve({ data: { slug: 'render-probe' }, error: null });
                }
                return Promise.resolve({ data: null, error: null });
              }
            };
            return q;
          }
        };
      }
    };
  }
  return originalLoad(request, parent, isMain);
};
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-key';

function response(){
  const headers = {};
  return {
    statusCode: 200,
    headers,
    status(code){ this.statusCode = code; return this; },
    setHeader(k, v){ headers[k] = v; return this; },
    send(body){ this.body = body; return this; },
    json(body){ this.body = body; return this; },
    end(){ return this; }
  };
}

(async () => {
  try{
    const handler = require('../api/blog/render');
    const res = response();
    await handler({ method: 'GET', query: { slug: 'render-probe' }, url: '/api/blog/render?slug=render-probe', headers: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['Content-Type'] || '', /text\/html/);
    assert.ok(res.body.includes('id="postBody"'), 'renderer must serve the shell');
    assert.ok(res.body.includes("var POST_SLUG='render-probe'"), 'shell must carry the live slug');
    assert.ok(res.body.includes('https://hariomlohardev.github.io/blog/p/render-probe/'), 'shell must carry the canonical URL');

    const res404 = response();
    await handler({ method: 'GET', query: { slug: 'no-such-post-xyz' }, url: '/api/blog/render?slug=no-such-post-xyz', headers: {} }, res404);
    assert.equal(res404.statusCode, 404);
  } finally {
    Module._load = originalLoad;
    process.env = savedEnv;
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
