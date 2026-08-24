/**
 * /api/blog/social — consolidated comments + ratings (Hobby 12-function limit)
 * GET  ?type=comments&slug=xxx       → comments list
 * POST ?type=comments  body{slug,content,author_name,parent_id,client_id}
 * GET  ?type=ratings&slug=xxx&client_id=xxx → ratings stats
 * POST ?type=ratings  body{slug,score,client_id,author_name}
 * Rewrites in vercel.json keep old /api/blog/comments and /api/blog/ratings working:
 *   /api/blog/comments → /api/blog/social?type=comments
 *   /api/blog/ratings  → /api/blog/social?type=ratings
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
function isUuid(s){ return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s||'')); }
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

async function handleComments(req,res,sbRead,sbWrite){
  if(req.method==='GET'){
    const slug=String(req.query.slug||'').toLowerCase().trim();
    if(!slug || !isSlug(slug)) return res.status(400).json({ok:false, error:'valid slug required'});
    try{
      const {data,error}=await sbRead.from('comments').select('id,post_slug,parent_id,client_id,author_name,content,created_at').eq('post_slug', slug).order('created_at',{ascending:true}).limit(500);
      if(error) return res.status(500).json({ok:false, error:error.message});
      return res.status(200).json({ok:true, comments:data||[]});
    }catch(e){ return res.status(500).json({ok:false, error:e.message}); }
  }
  if(req.method==='POST'){
    let body=req.body;
    if(typeof body==='string'){ try{ body=JSON.parse(body);}catch{ body={}; } }
    const slug=String(body.slug||'').toLowerCase().trim();
    const content=String(body.content||'').trim();
    let authorName=String(body.author_name||body.authorName||'').trim().slice(0,32);
    let clientId=normalizeCid(body.client_id||body.clientId||'');
    if(!clientId && req.headers.cookie){ try{ const c=cookie.parse(req.headers.cookie); if(c.hl_cid) clientId=normalizeCid(c.hl_cid); }catch{} }
    const parentId=body.parent_id||body.parentId||null;
    if(!isSlug(slug)) return res.status(400).json({ok:false, error:'valid slug required'});
    if(!content || content.length>2000) return res.status(400).json({ok:false, error:'content 1..2000 chars required'});
    if(!clientId || clientId.length<6) return res.status(400).json({ok:false, error:'client_id required (cookie hl_cid)'});
    if(parentId && !isUuid(parentId)) return res.status(400).json({ok:false, error:'invalid parent_id'});
    if(content.length<2) return res.status(400).json({ok:false, error:'too short'});
    try{
      const {data:post,error:postErr}=await sbRead.from('posts').select('slug,published').eq('slug',slug).eq('published',true).maybeSingle();
      if(postErr) return res.status(500).json({ok:false, error:postErr.message});
      if(!post) return res.status(404).json({ok:false, error:'post not found'});
      const since=new Date(Date.now()-60*1000).toISOString();
      const {count}=await sbWrite.from('comments').select('id',{count:'exact', head:true}).eq('client_id', clientId).gte('created_at', since);
      if((count||0)>=5) return res.status(429).json({ok:false, error:'too many comments — wait a minute'});
      const twoAgo=new Date(Date.now()-120*1000).toISOString();
      const {data:dup}=await sbWrite.from('comments').select('content').eq('client_id', clientId).eq('post_slug', slug).gte('created_at', twoAgo).limit(5);
      if(dup && dup.some(r=>r.content.trim()===content)) return res.status(429).json({ok:false, error:'duplicate comment'});
      if(parentId){
        const {data:parent, error:parErr}=await sbWrite.from('comments').select('id,post_slug').eq('id', parentId).maybeSingle();
        if(parErr) return res.status(500).json({ok:false, error:parErr.message});
        if(!parent) return res.status(400).json({ok:false, error:'parent not found'});
        if(parent.post_slug!==slug) return res.status(400).json({ok:false, error:'parent belongs to different post'});
      }
      if(!authorName) authorName='Anonymous';
      authorName=authorName.replace(/[<>]/g,'').trim().slice(0,32) || 'Anonymous';
      const row={post_slug:slug, parent_id: parentId||null, client_id: clientId, author_name: authorName, content: content.slice(0,2000)};
      const {data,error}=await sbWrite.from('comments').insert(row).select('id,post_slug,parent_id,client_id,author_name,content,created_at').single();
      if(error) return res.status(500).json({ok:false, error:error.message});
      res.setHeader('Set-Cookie', cookie.serialize('hl_cid', clientId, {path:'/', maxAge:60*60*24*365, sameSite:'Lax'}));
      return res.status(200).json({ok:true, comment:data});
    }catch(e){ return res.status(500).json({ok:false, error:e.message||'server error'}); }
  }
  return res.status(405).json({ok:false, error:'method not allowed'});
}

async function handleRatings(req,res,sbRead,sbWrite){
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
      const {data:all}=await sbRead.from('ratings').select('score,client_id').eq('post_slug',slug);
      const s=stats(all||[]);
      res.setHeader('Set-Cookie', cookie.serialize('hl_cid', cid, {path:'/', maxAge:60*60*24*365, sameSite:'Lax'}));
      return res.status(200).json({ok:true, rating:result, ...s, myScore:score});
    }catch(e){ return res.status(500).json({ok:false,error:e.message||'server error'}); }
  }
  return res.status(405).json({ok:false,error:'method not allowed'});
}

module.exports=async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  if(req.method==='OPTIONS') return res.status(204).end();
  const sbRead=getSb('anon');
  const sbWrite=getSb('service');
  if(!sbRead||!sbWrite) return res.status(500).json({ok:false,error:'Supabase not configured'});
  // detect type via ?type= or URL path
  const urlStr=String(req.url||'');
  const qType=String(req.query.type||req.query.t||'').toLowerCase();
  let type=qType;
  if(!type){
    if(urlStr.includes('ratings') || urlStr.includes('rating')) type='ratings';
    else if(urlStr.includes('comments') || urlStr.includes('comment')) type='comments';
    else {
      // fallback: try to infer from body for POST without type
      let body=req.body;
      if(typeof body==='string'){ try{ body=JSON.parse(body);}catch{ body={}; } }
      if(body && body.score!=null) type='ratings';
      else type='comments';
    }
  }
  // normalize plural
  if(type==='comment') type='comments';
  if(type==='rating') type='ratings';
  if(type==='comments') return handleComments(req,res,sbRead,sbWrite);
  if(type==='ratings') return handleRatings(req,res,sbRead,sbWrite);
  return res.status(400).json({ok:false, error:'type must be comments or ratings'});
};
