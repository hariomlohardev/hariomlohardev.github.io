/**
 * /api/admin/posts — CRUD for blog posts (Supabase `posts` table)
 * GET  ?token=... → list (public can also GET without auth, but admin needs it)
 * POST {action:'create', post:{slug,title,description,date,tags,raw}} → create
 * POST {action:'update', id, post:{...}} → update
 * POST {action:'delete', id} → delete
 * Auth via ADMIN_JWT_SECRET (Bearer token)
 *
 * Tricks share this function (Vercel Hobby 12-function cap):
 * GET  ?type=tricks         -> published tricks (all when authed)
 * GET  ?type=tricks&id=12   -> single trick
 * POST ?type=tricks {action:'create'|'update'|'delete', id, trick:{title,raw,tags,published}}
 * vercel.json rewrites /api/tricks -> /api/admin/posts?type=tricks
 *
 * GET  ?type=inbox          -> last 100 blog comments (authed) — the /admin inbox
 */
const jwt=require('jsonwebtoken');
const cookie=require('cookie');
// one renderer for the whole site — see assets/md.js
const {mdToHtml}=require('../../assets/md.js');

function getToken(req){
  let t=null;
  if(req.headers.cookie){ try{ t=cookie.parse(req.headers.cookie).admin_token; }catch{} }
  if(!t && req.headers.authorization){ const m=req.headers.authorization.match(/^Bearer\s+(.+)$/); if(m) t=m[1]; }
  if(!t && req.query && req.query.token) t=req.query.token;
  return t;
}
function verify(req){
  const s=process.env.ADMIN_JWT_SECRET;
  if(!s) throw new Error('ADMIN_JWT_SECRET not set');
  const tok=getToken(req);
  if(!tok) throw new Error('No token');
  return jwt.verify(tok,s);
}
async function getSb(){
  const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if(!url||!key) return null;
  try{ global.WebSocket = require('ws'); }catch{}
  const {createClient}=require('@supabase/supabase-js');
  return createClient(url,key,{ auth:{ persistSession:false, autoRefreshToken:false }, realtime:{ transport: undefined }});
}

// Publishing from /admin only writes Supabase; the static copy (feed.xml, /blog/p/*,
// sitemap, llms.txt) is built by GitHub Actions. Nudge it so a new post is live in a
// minute instead of waiting for the 6-hourly cron. Best effort by design — a failed
// ping must never fail the save.
async function pingRebuild(){
  const tok=process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const repo=process.env.GITHUB_REPO || 'hariomlohardev/hariomlohardev.github.io';
  if(!tok) return {ok:false, skipped:'no GITHUB_TOKEN'};
  try{
    const r=await fetch('https://api.github.com/repos/'+repo+'/dispatches',{
      method:'POST',
      headers:{
        Authorization:'Bearer '+tok,
        Accept:'application/vnd.github+json',
        'Content-Type':'application/json',
        'User-Agent':'hariomlohardev-admin'
      },
      body: JSON.stringify({event_type:'content-changed'})
    });
    return {ok:r.status===204, status:r.status};
  }catch(e){ return {ok:false, error:String(e && e.message || e)}; }
}

// ---- comments inbox: /admin reads them here, because notification mail needs a
// verified sender and this needs nothing. Read-only, authed, newest first.
async function handleInbox(req,res,sb){
  if(req.method!=='GET') return res.status(405).json({ok:false, error:'method not allowed'});
  try{ verify(req); }catch(e){ return res.status(401).json({ok:false, error:e.message}); }
  const {data,error}=await sb.from('comments')
    .select('id,post_slug,parent_id,author_name,content,created_at')
    .order('created_at',{ascending:false}).limit(100);
  if(error) return res.status(500).json({ok:false, error:error.message});
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({ok:true, comments:data||[], count:(data||[]).length});
}


// ---- tricks: Title + full markdown body, no cover ----------------------
async function handleTricks(req,res,sb){
  if(req.method==='GET'){
    let authed=false;
    try{ verify(req); authed=true; }catch{}
    const idRaw=String((req.query&&(req.query.id||req.query.trick))||'').trim();
    if(idRaw && !/^[0-9]{1,18}$/.test(idRaw)) return res.status(400).json({ok:false, error:'invalid id'});
    const cols=authed ? '*' : 'id,title,raw,html,tags,published,word_count,reading_minutes,created_at,updated_at';
    let q=sb.from('tricks').select(cols);
    if(!authed) q=q.eq('published',true);
    if(idRaw) q=q.eq('id',Number(idRaw));
    const {data,error}=await q.order('created_at',{ascending:false}).limit(idRaw?1:200);
    if(error) return res.status(500).json({ok:false, error:error.message});
    const list=data||[];
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({ok:true, tricks:list, trick:list[0]||null, count:list.length});
  }
  if(req.method!=='POST') return res.status(405).json({ok:false, error:'method not allowed'});
  try{ verify(req); }catch(e){ return res.status(401).json({ok:false, error:e.message}); }
  let body=req.body;
  if(typeof body==='string'){ try{ body=JSON.parse(body); }catch{ body={}; } }
  body=body||{};
  const action=String(body.action||'').toLowerCase();
  const id=body.id;
  const t=body.trick||body.post||{};

  if(action==='delete'){
    if(!id) return res.status(400).json({ok:false, error:'id required'});
    const {error}=await sb.from('tricks').delete().eq('id',id);
    if(error) return res.status(500).json({ok:false, error:error.message});
    return res.status(200).json({ok:true, deleted:id, rebuild:await pingRebuild()});
  }
  if(action==='create'||action==='update'){
    const title=String(t.title||'').trim().replace(/\s+/g,' ').slice(0,200);
    if(!title) return res.status(400).json({ok:false, error:'title required'});
    const raw=String(t.raw||'');
    if(raw.length>200000) return res.status(400).json({ok:false, error:'body too long (200k max)'});
    const wc=raw.split(/\s+/).filter(Boolean).length;
    const row={
      title,
      raw,
      html: mdToHtml(raw),
      tags: Array.isArray(t.tags) ? t.tags.map(x=>String(x).trim().slice(0,32)).filter(Boolean).slice(0,8) : [],
      published: t.published!==false,
      word_count: wc,
      reading_minutes: Math.max(1, Math.ceil(wc/200))
    };
    if(action==='update'){
      if(!id) return res.status(400).json({ok:false, error:'id required'});
      const {data,error}=await sb.from('tricks').update(row).eq('id',id).select('*').single();
      if(error) return res.status(500).json({ok:false, error:error.message});
      return res.status(200).json({ok:true, trick:data, rebuild:await pingRebuild()});
    }
    const {data,error}=await sb.from('tricks').insert(row).select('*').single();
    if(error) return res.status(500).json({ok:false, error:error.message});
    return res.status(200).json({ok:true, trick:data, rebuild:await pingRebuild()});
  }
  return res.status(400).json({ok:false, error:'unknown action'});
}

module.exports=async(req,res)=>{
  try{
  const sb=await getSb();
  if(!sb) return res.status(500).json({ok:false, error:'SUPABASE not configured — add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel'});

  let type=String((req.query&&(req.query.type||req.query.t))||'').toLowerCase();
  if(!type && req.method==='POST'){
    let b=req.body;
    if(typeof b==='string'){ try{ b=JSON.parse(b); }catch{ b=null; } }
    if(b && b.type) type=String(b.type).toLowerCase();
  }
  if(type==='trick'||type==='tricks') return handleTricks(req,res,sb);
  if(type==='inbox'||type==='comments') return handleInbox(req,res,sb);

  if(req.method==='GET'){
    // Public read — return published posts for admin list (all if authed)
    let authed=false;
    try{ verify(req); authed=true; }catch{}
    let q;
    if(authed){
      q=sb.from('posts').select('*').order('date',{ascending:false});
    }else{
      q=sb.from('posts').select('slug,title,description,date,tags,cover,word_count,reading_minutes,published').eq("published",true).order('date',{ascending:false}).limit(50);
    }
    const {data,error}=await q;
    if(error) return res.status(500).json({ok:false, error:error.message});
    return res.status(200).json({ok:true, posts:data});
  }

  // POST needs auth
  try{ verify(req); }catch(e){ return res.status(401).json({ok:false, error:e.message}); }
  let body=req.body;
  if(typeof body==='string'){ try{ body=JSON.parse(body); }catch{ body={}; } }
  const {action, id, post}=body;

  if(action==='delete' && id){
    const {error}=await sb.from('posts').delete().eq('id',id);
    if(error) return res.status(500).json({ok:false, error:error.message});
    return res.status(200).json({ok:true, rebuild:await pingRebuild()});
  }

  if((action==='create' || action==='update') && post){
    const slug=String(post.slug||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64);
    if(!slug || !post.title) return res.status(400).json({ok:false, error:'slug and title required'});
    const html=mdToHtml(post.raw||post.description||'');
    const wc=String(post.raw||'').trim().split(/\s+/).filter(Boolean).length;
    const reading=Math.max(1, Math.ceil(wc/200));
    const row={
      slug, title:String(post.title), description:String(post.description||''), date:post.date, tags: Array.isArray(post.tags)?post.tags:[], cover: post.cover||null,
      html, raw: String(post.raw||''), word_count:wc, reading_minutes:reading, published: post.published!==false
    };
    if(action==='create'){
      const {data,error}=await sb.from('posts').insert(row).select().single();
      if(error) return res.status(500).json({ok:false, error:error.message});
      return res.status(200).json({ok:true, post:data, rebuild:await pingRebuild()});
    }else{
      if(!id) return res.status(400).json({ok:false, error:'id required for update'});
      const {data,error}=await sb.from('posts').update(row).eq('id',id).select().single();
      if(error) return res.status(500).json({ok:false, error:error.message});
      return res.status(200).json({ok:true, post:data, rebuild:await pingRebuild()});
    }
  }

  return res.status(400).json({ok:false, error:'Unknown action'});
  }catch(e){ console.error(e); return res.status(500).json({ok:false, error: e.message || 'A server error occurred'}); }
};
