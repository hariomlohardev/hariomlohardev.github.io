'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
const calls = [];
const savedEnv = { ...process.env };

Module._load = function(request, parent, isMain){
  if(request === 'jsonwebtoken') return { verify(){ return { user: 'admin' }; } };
  if(request === 'cookie') return { parse(){ return {}; } };
  if(request === '@supabase/supabase-js'){
    return {
      createClient(){
        return {
          from(table){
            return {
              upsert(row){ calls.push({ table, row }); return Promise.resolve({ error: null }); },
              insert(){ return Promise.resolve({ error: null }); }
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

function response(){
  return {
    statusCode: 200,
    status(code){ this.statusCode = code; return this; },
    json(body){ this.body = body; return this; }
  };
}

(async () => {
  try{
    const handler = require('../api/admin/opensource');
    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer valid-test-token' },
      query: {},
      body: { prs: [{ title: 'Real contribution', html_url: 'https://github.com/org/repo/pull/1' }] }
    };
    const res = response();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.count, 1);
    assert.ok(!('rebuild' in res.body), 'Supabase-only saves must not trigger a static rebuild');
    assert.ok(!calls.some(call => call.url), 'Supabase-only saves must not call GitHub');
    assert.equal(calls.filter(call => call.table === 'site_content').length, 1);
  } finally {
    Module._load = originalLoad;
    process.env = savedEnv;
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
