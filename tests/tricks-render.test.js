'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../api/blog/render');
const response=()=>({statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.statusCode=s;return this;},send(v){this.body=v;return this;},end(){return this;}});
test('live trick URLs serve the existing complete template and accurate indexing',async()=>{
  const originalFetch=global.fetch, savedUrl=process.env.SUPABASE_URL,savedKey=process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_ANON_KEY='test';
  try{
    global.fetch=async url=>{
      assert(url.includes('published=eq.true'));
      const id=Number(new URL(url).searchParams.get('id').slice(3));
      return {ok:true,json:async()=>id===999?[]:[{id,title:'Live trick',raw:'## Useful technique\n\nA real published technique.',published:true,created_at:'2026-10-06T00:00:00Z',updated_at:'2026-10-07T00:00:00Z'}]};
    };
    for(const id of ['3','1']){
      const res=response();await handler({method:'GET',query:{type:'trick',id}},res);
      assert.equal(res.statusCode,200);assert.match(res.body,/Useful technique/);
      assert.match(res.body,/class="trick-title">Live trick/);
      assert(res.body.includes('href="https://hariomlohardev.github.io/tricks/p/'+id+'/"'));
      assert(res.body.includes('content="'+(id==='1'?'noindex, follow':'index, follow')));
      const graph=JSON.parse(res.body.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
      assert.equal(graph['@graph'].find(n=>n['@type']==='TechArticle').dateModified,'2026-10-07T00:00:00.000Z');
    }
    const missing=response();await handler({method:'GET',query:{type:'trick',id:'999'}},missing);assert.equal(missing.statusCode,404);
    const invalid=response();await handler({method:'GET',query:{type:'trick',id:'../3'}},invalid);assert.equal(invalid.statusCode,400);
    global.fetch=async()=>({ok:false});
    const unavailable=response();await handler({method:'GET',query:{type:'trick',id:'3'}},unavailable);assert.equal(unavailable.statusCode,503);
  }finally{
    global.fetch=originalFetch;
    if(savedUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=savedUrl;
    if(savedKey===undefined)delete process.env.SUPABASE_ANON_KEY;else process.env.SUPABASE_ANON_KEY=savedKey;
  }
});
