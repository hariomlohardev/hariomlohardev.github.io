/**
 * /api/blog/ratings — per-post 1..5 slider
 * GET  ?slug=<slug>&client_id=<cid> → {ok:true, avg, count, dist:{1..5}, myScore}
 * POST {slug, score:1..5, client_id, author_name?} → upsert (one per client per post)
 */
const cookie=require('cookie');
function getSb(which){
  const url=process.env.SUPABASE_URL;
  const key=which==='service' ? (process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_ANON_KEY) : (process.env.SUPABASE_ANON_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY);
  if(!url||!key) return null;
  try{ global.WebSocket=require('ws'); }catch{}
  const {createClient}=require('@supabase/supabase-js');
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},realtime:{transport:undefined}});
}
function isSlug(s){ return /^[a-z0-9-]{1,64}$/.test(String(s||'')); }
function normalizeCid(s){
  let v=String(s||'').trim();
  if(!v) return '';
  v=v.replace(/[^A-Za-z0-9_-]/g,'').slice(0,128);
  return v;
}
function stats(rows){
  const count=rows.length;
  if(!count) return {avg:0,count:0, dist:{1:0,2:0,3:0,4:0,5:0}};
  let sum=0; const dist={1:0,2:0,3:0,4:0,5:0};
  rows.forEach(r=>{ sum+=Number(r.score)||0; const k=String(r.score); if(dist[k]!=null) dist[k]++; });
  return {avg: Math.round((sum/count)*10)/10, count, dist};
}

module.exports=async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  if(req.method==='OPTIONS') return res.status(204).end();
  const sbRead=getSb('anon');
  const sbWrite=getSb('service');
  if(!sbRead||!sbWrite) return res.status(500).json({ok:false,error:'Supabase not configured'});

  if(req.method==='GET'){
    const slug=String(req.query.slug||'').toLowerCase().trim();
    if(!slug||!isSlug(slug)) return res.status(400).json({ok:false,error:'valid slug required'});
    let cid=normalizeCid(req.query.client_id||req.query.clientId||'');
    if(!cid && req.headers.cookie){ try{ const c=cookie.parse(req.headers.cookie); if(c.hl_cid) cid=normalizeCid(c.hl_cid); }catch{} }
    try{
      const {data,error}=await sbRead.from('ratings').select('score,client_id').eq('post_slug',slug);
      if(error) return res.status(500).json({ok:false,error:error.message});
      const s=stats(data||[]);
      let myScore=null;
      if(cid && data){ const mine=data.find(r=>r.client_id===cid); if(mine) myScore=mine.score; }
      return res.status(200).json({ok:true, ...s, myScore});
    }catch(e){ return res.status(500).json({ok:false,error:e.message}); }
  }

  if(req.method==='POST'){
    let body=req.body;
    if(typeof body==='string'){ try{body=JSON.parse(body);}catch{body={};} }
    const slug=String(body.slug||'').toLowerCase().trim();
    const score=Math.round(Number(body.score));
    let cid=normalizeCid(body.client_id||body.clientId||'');
    if(!cid && req.headers.cookie){ try{ const c=cookie.parse(req.headers.cookie); if(c.hl_cid) cid=normalizeCid(c.hl_cid); }catch{} }
    let authorName=String(body.author_name||body.authorName||'').trim().slice(0,32).replace(/[<>]/g,'') || null;

    if(!isSlug(slug)) return res.status(400).json({ok:false,error:'valid slug required'});
    if(!(score>=1&&score<=5)) return res.status(400).json({ok:false,error:'score 1..5 required'});
    if(!cid||cid.length<6) return res.status(400).json({ok:false,error:'client_id required'});

    try{
      const {data:post,error:postErr}=await sbRead.from('posts').select('slug,published').eq('slug',slug).eq('published',true).maybeSingle();
      if(postErr) return res.status(500).json({ok:false,error:postErr.message});
      if(!post) return res.status(404).json({ok:false,error:'post not found'});

      // upsert: one per (post_slug, client_id)
      const {data:existing}=await sbWrite.from('ratings').select('id').eq('post_slug',slug).eq('client_id',cid).maybeSingle();
      let result;
      if(existing){
        const {data,error}=await sbWrite.from('ratings').update({score, author_name:authorName}).eq('id',existing.id).select('id,post_slug,score,created_at,updated_at').single();
        if(error) return res.status(500).json({ok:false,error:error.message});
        result=data;
      } else {
        const {data,error}=await sbWrite.from('ratings').insert({post_slug:slug, client_id:cid, score, author_name:authorName}).select('id,post_slug,score,created_at,updated_at').single();
        if(error) return res.status(500).json({ok:false,error:error.message});
        result=data;
      }
      // return fresh stats
      const {data:all}=await sbRead.from('ratings').select('score,client_id').eq('post_slug',slug);
      const s=stats(all||[]);
      const ck=cookie.serialize('hl_cid', cid, {path:'/', maxAge:60*60*24*365, sameSite:'Lax'});
      res.setHeader('Set-Cookie', ck);
      return res.status(200).json({ok:true, rating:result, ...s, myScore:score});
    }catch(e){ console.error(e); return res.status(500).json({ok:false,error:e.message||'server error'}); }
  }
  return res.status(405).json({ok:false,error:'method not allowed'});
};
