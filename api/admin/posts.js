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
 */
const jwt=require('jsonwebtoken');
const cookie=require('cookie');

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
// a block that opens with a block-level tag can still end with plain text
// (a list followed by a sign-off line) — wrap that tail so it gets .prose p spacing.
function tailP(b){
  var m = b.match(/^([\s\S]*<\/(?:ul|ol|blockquote|pre|h[1-6])>)([\s\S]*)$/);
  if(!m || !m[2].trim()) return b;
  return m[1] + "\n<p>" + m[2].trim().replace(/\n/g, "<br />\n") + "</p>";
}
// a link to an uploaded file (…?download=name) reads as a download chip, not a bare link
function linkTag(text, href){
  if(/[?&]download=/.test(href)) return '<a class="dl-file" href="' + href + '" download rel="noopener">' + text + '</a>';
  return '<a href="' + href + '" rel="noopener">' + text + '</a>';
}
function mdToHtml(md){
  let s=String(md||'').replace(/\r\n/g,'\n');
  const codes=[];
  s=s.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g,(m,lang,code)=>{
    const i=codes.length;
    codes.push(`<pre><code class="lang-${lang||''}">${code.trimEnd().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code></pre>`);
    return `__CODE_${i}__`;
  });
  s=s.replace(/`([^`]+?)`/g,(m,c)=>`<code>${c.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</code>`);
  s=s.replace(/^######\s+(.+)$/gm,"<h6>$1</h6>");
  s=s.replace(/^#####\s+(.+)$/gm,"<h5>$1</h5>");
  s=s.replace(/^####\s+(.+)$/gm,"<h4>$1</h4>");
  s=s.replace(/^###\s+(.+)$/gm,"<h3>$1</h3>");
  s=s.replace(/^##\s+(.+)$/gm,"<h2>$1</h2>");
  s=s.replace(/^#\s+(.+)$/gm,"<h1>$1</h1>");
  s=s.replace(/!\[([^\]]*?)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/g,'<img src="$2" alt="$1" loading="lazy" decoding="async" />');
  s=s.replace(/^>[ \t]?(.*)$/gm,'<blockquote>$1</blockquote>');
  s=s.replace(/<\/blockquote>\n<blockquote>/g,'<br />\n');
  s=s.replace(/\[([^\]]+?)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g,function(m,t,h){ return linkTag(t,h); });
  s=s.replace(/\*\*([^*]+?)\*\*/g,"<strong>$1</strong>");
  s=s.replace(/^[ \t]*(\*\*\*|---)[ \t]*$/gm,'<hr />');
  s=s.split("\n").map(l=> l.match(/^[ \t]*[-*][ \t]+/) ? l.replace(/^[ \t]*[-*][ \t]+(.+)/,"<li>$1</li>") : l.match(/^[ \t]*\d+\.[ \t]+/) ? l.replace(/^[ \t]*\d+\.[ \t]+(.+)/,"<li>$1</li>") : l).join("\n");
  s=s.replace(/(?:<li>.*<\/li>\n?)+/g, m=> `<ul>\n${m.trim().split("\n").join("\n")}\n</ul>`);
  const blocks=s.split(/\n{2,}/).map(b=>{
    b=b.trim(); if(!b) return "";
    if(b.startsWith("<h")||b.startsWith("<pre")||b.startsWith("<ul")||b.startsWith("<hr")||b.startsWith("<blockquote")||b.startsWith("<img")||b.startsWith("__CODE_")) return tailP(b);
    return `<p>${b.replace(/\n/g,"<br />\n")}</p>`;
  }).join("\n\n");
  let out=blocks; codes.forEach((h,i)=> out=out.replace(`__CODE_${i}__`, h));
  return out;
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
    return res.status(200).json({ok:true, deleted:id});
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
      return res.status(200).json({ok:true, trick:data});
    }
    const {data,error}=await sb.from('tricks').insert(row).select('*').single();
    if(error) return res.status(500).json({ok:false, error:error.message});
    return res.status(200).json({ok:true, trick:data});
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
    return res.status(200).json({ok:true});
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
      return res.status(200).json({ok:true, post:data});
    }else{
      if(!id) return res.status(400).json({ok:false, error:'id required for update'});
      const {data,error}=await sb.from('posts').update(row).eq('id',id).select().single();
      if(error) return res.status(500).json({ok:false, error:error.message});
      return res.status(200).json({ok:true, post:data});
    }
  }

  return res.status(400).json({ok:false, error:'Unknown action'});
  }catch(e){ console.error(e); return res.status(500).json({ok:false, error: e.message || 'A server error occurred'}); }
};
