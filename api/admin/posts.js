/**
 * /api/admin/posts — CRUD for blog posts (Supabase `posts` table)
 * GET  ?token=... → list (public can also GET without auth, but admin needs it)
 * POST {action:'create', post:{slug,title,description,date,tags,raw}} → create
 * POST {action:'update', id, post:{...}} → update
 * POST {action:'delete', id} → delete
 * Auth via ADMIN_JWT_SECRET (Bearer token)
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
  s=s.replace(/\[([^\]]+?)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/g,'<a href="$2" rel="noopener">$1</a>');
  s=s.replace(/\*\*([^*]+?)\*\*/g,"<strong>$1</strong>");
  s=s.replace(/^\s*(\*\*\*|---)\s*$/gm,'<hr />');
  s=s.split("\n").map(l=> l.match(/^\s*[-*]\s+/) ? l.replace(/^\s*[-*]\s+(.+)/,"<li>$1</li>") : l.match(/^\s*\d+\.\s+/) ? l.replace(/^\s*\d+\.\s+(.+)/,"<li>$1</li>") : l).join("\n");
  s=s.replace(/(?:<li>.*<\/li>\n?)+/g, m=> `<ul>\n${m.trim().split("\n").join("\n")}\n</ul>`);
  const blocks=s.split(/\n{2,}/).map(b=>{
    b=b.trim(); if(!b) return "";
    if(b.startsWith("<h")||b.startsWith("<pre")||b.startsWith("<ul")||b.startsWith("<hr")||b.startsWith("__CODE_")) return b;
    return `<p>${b.replace(/\n/g,"<br />\n")}</p>`;
  }).join("\n\n");
  let out=blocks; codes.forEach((h,i)=> out=out.replace(`__CODE_${i}__`, h));
  return out;
}

module.exports=async(req,res)=>{
  try{
  const sb=await getSb();
  if(!sb) return res.status(500).json({ok:false, error:'SUPABASE not configured — add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel'});

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
