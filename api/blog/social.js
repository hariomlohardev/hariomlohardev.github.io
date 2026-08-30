/**
 * /api/blog/social — consolidated comments + ratings (Hobby 12-function limit)
 * GET  ?type=comments&slug=xxx       → comments list
 * POST ?type=comments  body{slug,content,author_name,parent_id,client_id}
 * GET  ?type=ratings&slug=xxx&client_id=xxx → ratings stats
 * POST ?type=ratings  body{slug,score,client_id,author_name}
 * POST ?type=contact  body{name,email,message,page} → mails the note (Resend first)
 * Rewrites in vercel.json keep old /api/blog/comments and /api/blog/ratings working:
 *   /api/blog/comments → /api/blog/social?type=comments
 *   /api/blog/ratings  → /api/blog/social?type=ratings
 *   /api/contact       → /api/blog/social?type=contact
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
function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
// One mail path for the whole site. Resend first: it is a plain API call, so the
// sender gets a real yes/no on the page instead of a bounce through a third party.
// SendGrid then FormSubmit sit behind it so a note is never silently dropped.
async function sendMail({subject, text, html, replyTo, refUrl, fields}){
  const to = process.env.NOTIFY_EMAIL || process.env.ADMIN_EMAIL || 'hariomlohar.new@gmail.com';
  const from = process.env.NOTIFY_FROM || 'onboarding@resend.dev';
  if(process.env.RESEND_API_KEY){
    try{
      const payload={from, to, subject, text, html};
      if(replyTo) payload.reply_to=replyTo;
      const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if(r.ok){ console.log('mail sent via resend to',to); return {ok:true, via:'resend'}; }
      console.error('resend failed', r.status, await r.text().catch(()=>''));
    }catch(e){ console.error('resend error',e.message); }
  }
  if(process.env.SENDGRID_API_KEY){
    try{
      const body={personalizations:[{to:[{email:to}]}],from:{email:from},subject,content:[{type:'text/plain',value:text},{type:'text/html',value:html}]};
      if(replyTo) body.reply_to={email:replyTo};
      const r=await fetch('https://api.sendgrid.com/v3/mail/send',{method:'POST',headers:{'Authorization':'Bearer '+process.env.SENDGRID_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
      if(r.ok){ console.log('mail sent via sendgrid'); return {ok:true, via:'sendgrid'}; }
      console.error('sendgrid failed', r.status, await r.text().catch(()=>''));
    }catch(e){ console.error('sendgrid error',e.message); }
  }
  // FormSubmit — free and keyless, but it only delivers after its one-time
  // confirmation link is clicked, which is why it is last and not first.
  try{
    const fd=new URLSearchParams();
    fd.append('_subject', subject);
    fd.append('_template','table');
    fd.append('_captcha','false');
    if(replyTo) fd.append('_replyto', replyTo);
    Object.keys(fields||{}).forEach(k=>{ if(fields[k]) fd.append(k, String(fields[k])); });
    const r=await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(to)}`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json','Origin':'https://hariomlohardev.github.io','Referer': refUrl||'https://hariomlohardev.github.io/contact','User-Agent':'Mozilla/5.0 (compatible; Vercel; +https://hariomlohardev.github.io)','X-Requested-With':'XMLHttpRequest'},body: fd.toString()});
    const txt=await r.text().catch(()=> '');
    if(r.ok) return {ok:true, via:'formsubmit'};
    console.error('formsubmit failed', r.status, txt.slice(0,400));
  }catch(e){ console.error('formsubmit error',e.message); }
  return {ok:false, via:'none'};
}

async function sendCommentMail({slug,title,url,author,content}){
  return sendMail({
    subject: `New comment on "${title}" — ${slug}`,
    text: `New comment on "${title}"\n\nPost: ${url}\nAuthor: ${author}\n\nComment:\n${content}\n\n---\nView: ${url}#comments`,
    html: `<p>New comment on <b>${escHtml(title)}</b></p><p><a href="${escHtml(url)}">${escHtml(url)}</a></p><p><b>Author:</b> ${escHtml(author)}</p><blockquote style="border-left:3px solid #B93A13;padding:8px 12px;background:#F6F4EE">${escHtml(content).replace(/\n/g,'<br>')}</blockquote><p><a href="${escHtml(url)}#comments">View comment →</a></p>`,
    refUrl: url,
    fields: {Post:`${title} — ${slug}`, URL:url, Author:author, Comment:content, View:`${url}#comments`}
  });
}

// ---- contact: the "Send a note" form posts here so the visitor stays on the
// page and gets a real answer. Mail only — no table, no Supabase. Honeypot plus
// a per-instance throttle is the whole spam story; one inbox needs no more.
const noteHits=new Map();
function throttled(ip){
  const now=Date.now(), win=10*60*1000;
  const list=(noteHits.get(ip)||[]).filter(t=> now-t<win);
  list.push(now);
  if(noteHits.size>500) noteHits.clear();
  noteHits.set(ip, list);
  return list.length>3;
}
async function handleContact(req,res){
  if(req.method!=='POST') return res.status(405).json({ok:false, error:'method not allowed'});
  let body=req.body;
  if(typeof body==='string'){
    try{ body=JSON.parse(body); }catch{ body=Object.fromEntries(new URLSearchParams(body)); }
  }
  body=body||{};
  // honeypot — a bot fills the hidden field, a person never sees it. Answer ok
  // so it learns nothing, and send nothing.
  if(String(body._honey||'').trim()) return res.status(200).json({ok:true});
  const name=String(body.name||'').trim().replace(/[<>]/g,'').slice(0,80);
  const email=String(body.email||'').trim().slice(0,120);
  const message=String(body.message||'').trim().slice(0,4000);
  if(!name) return res.status(400).json({ok:false, error:'name required'});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ok:false, error:'valid email required'});
  if(message.length<2) return res.status(400).json({ok:false, error:'message required'});
  const ip=String(req.headers['x-forwarded-for']||'').split(',')[0].trim()||'unknown';
  if(throttled(ip)) return res.status(429).json({ok:false, error:'too many notes — try again in a few minutes'});
  const page=String(body.page||'').slice(0,200);
  const out=await sendMail({
    subject: `New note — ${name}`,
    text: `New note from ${name} <${email}>\n\n${message}\n\n---\nSent from: ${page||'—'}`,
    html: `<p><b>${escHtml(name)}</b> &lt;<a href="mailto:${escHtml(email)}">${escHtml(email)}</a>&gt;</p><blockquote style="border-left:3px solid #B93A13;padding:8px 12px;background:#F6F4EE">${escHtml(message).replace(/\n/g,'<br>')}</blockquote><p style="color:#6E7D9A;font-size:12px">Sent from ${escHtml(page||'—')} · reply straight to this mail</p>`,
    replyTo: email,
    refUrl: page||'https://hariomlohardev.github.io/contact',
    fields: {Name:name, Email:email, Message:message, Page:page}
  });
  // 502 tells the page to fall back to the plain FormSubmit POST, so a note
  // survives even a total provider outage.
  if(!out.ok) return res.status(502).json({ok:false, error:'mail provider unavailable'});
  return res.status(200).json({ok:true, via:out.via});
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
      const {data:post,error:postErr}=await sbRead.from('posts').select('slug,title,published').eq('slug',slug).eq('published',true).maybeSingle();
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
      // notify email (fire-and-forget)
      const postTitle = post.title || slug;
      const postUrl = `https://hariomlohardev.github.io/blog/p/${slug}/`;
      sendCommentMail({slug, title: postTitle, url: postUrl, author: authorName, content}).catch(()=>{});
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
  // detect type via ?type= or URL path
  const urlStr=String(req.url||'');
  const qType=String(req.query.type||req.query.t||'').toLowerCase();
  // contact is mail-only — answered before Supabase, which it does not need
  if(qType==='contact' || urlStr.includes('/contact')) return handleContact(req,res);
  const sbRead=getSb('anon');
  const sbWrite=getSb('service');
  if(!sbRead||!sbWrite) return res.status(500).json({ok:false,error:'Supabase not configured'});
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
  return res.status(400).json({ok:false, error:'type must be comments, ratings or contact'});
};
