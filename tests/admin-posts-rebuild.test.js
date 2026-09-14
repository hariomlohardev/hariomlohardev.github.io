'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
const calls = [];
const savedEnv = { ...process.env };
const savedFetch = global.fetch;

Module._load = function(request, parent, isMain){
  if(request === 'jsonwebtoken') return { verify(){ return { user: 'admin' }; } };
  if(request === 'cookie') return { parse(){ return {}; } };
  if(request === '@supabase/supabase-js'){
    return {
      createClient(){
        const chain = {
          select(){ return chain; },
          single(){ return Promise.resolve({ data: { id: 1, slug: 'test-post' }, error: null }); },
          eq(){ return chain; },
          order(){ return chain; },
          limit(){ return chain; }
        };
        return {
          from(table){
            calls.push({ table });
            return {
              insert(row){ calls.push({ op: 'insert', row }); return chain; },
              update(row){ calls.push({ op: 'update', row }); return chain; },
              delete(){ calls.push({ op: 'delete' }); return chain; },
              select(){ return chain; }
            };
          }
        };
      }
    };
  }
  return originalLoad(request, parent, isMain);
};

process.env.ADMIN_JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.GITHUB_TOKEN = 'test-github-token';
process.env.VERCEL_DEPLOY_HOOK_URL = 'https://api.vercel.com/v1/integrations/deploy/test-hook';

global.fetch = async (url, options) => {
  calls.push({ url, options });
  if(String(url).includes('api.github.com')) return { status: 204 };
  return { ok: true, status: 201, json: async () => ({}) };
};

function response(){
  return {
    statusCode: 200,
    status(code){ this.statusCode = code; return this; },
    json(body){ this.body = body; return this; }
  };
}

(async () => {
  try{
    const handler = require('../api/admin/posts');
    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer valid-test-token' },
      query: {},
      body: { action: 'create', post: { slug: 'test-post', title: 'Test', description: 'd', date: '2026-09-14', tags: [], raw: 'hello' } }
    };
    const res = response();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    const github = calls.find(call => call.url && call.url.includes('api.github.com/repos/'));
    assert.ok(github, 'publishing a post should dispatch a GitHub Pages rebuild');
    const vercel = calls.find(call => call.url === process.env.VERCEL_DEPLOY_HOOK_URL);
    assert.ok(vercel, 'publishing a post should trigger a Vercel redeploy via the deploy hook');
    assert.equal(vercel.options.method, 'POST');
  } finally {
    Module._load = originalLoad;
    process.env = savedEnv;
    global.fetch = savedFetch;
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
