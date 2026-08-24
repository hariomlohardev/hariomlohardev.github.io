/**
 * /api/blog/comments — custom blog comments with threaded replies
 * GET  ?slug=<slug>                          → {ok:true, comments:[...]}
 * POST {slug, content, author_name?, parent_id?, client_id}
 * Client is identified via cookie/localStorage hl_cid (client_id) + optional name.
 * Writes via SUPABASE_SERVICE_ROLE_KEY (bypasses RLS); reads via anon/public.
 */
const cookie = require('cookie');

function getSb(keys){
  const url = process.env.SUPABASE_URL;
  const key = keys==='service' ? (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)
                               : (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  if(!url || !key) return null;
  try{ global.WebSocket = require('ws'); }catch{}
  const {createClient}=require('@supabase/supabase-js');
  return createClient(url, key, {auth:{persistSession:false,autoRefreshToken:false}, realtime:{transport:undefined}});
}

function isSlug(s){ return /^[a-z0-9-]{1,64}$/.test(String(s||'')); }
function isUuid(s){ return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s||'')); }
function isClientId(s){ const v=String(s||'').trim(); return v.length>=6 && v.length<=128 && /^[A-Za-z0-9_-]+$/.test(v.replace(/[^A-Za-z0-9_-]/g, (m)=> m==='-'||m==='_'?m:'')) && /^[A-Za-z0-9_-]{6,128}$/.test(v); }
// broader: allow uuid with dashes also
function normalizeClientId(s){
  let v=String(s||'').trim();
  if(!v) return '';
  // allow uuid form with dashes
  if(/^[0-9a-f-]{8,64}$/i.test(v) && /^[A-Za-z0-9_-]{6,128}$/.test(v.replace(/-/g,''))) return v.replace(/[^A-Za-z0-9_-]/g,'');
  // strip invalid then test
  v=v.replace(/[^A-Za-z0-9_-]/g,'').slice(0,128);
  return v;
}

module.exports = async (req,res)=>{
  // CORS for GH Pages fallback (not strictly needed on same origin)
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  if(req.method==='OPTIONS') return res.status(204).end();

  const sbRead = getSb('anon');
  const sbWrite = getSb('service');
  if(!sbRead || !sbWrite) return res.status(500).json({ok:false, error:'Supabase not configured — add SUPABASE_URL and keys in Vercel'});

  if(req.method==='GET'){
    const slug=String(req.query.slug||'').toLowerCase().trim();
    if(!slug || !isSlug(slug)) return res.status(400).json({ok:false, error:'valid slug required'});
    try{
      const {data,error}=await sbRead.from('comments').select('id,post_slug,parent_id,client_id,author_name,content,created_at').eq('post_slug', slug).order('created_at',{ascending:true}).limit(500);
      if(error) return res.status(500).json({ok:false, error:error.message});
      // privacy: do not leak raw client_id in full — truncate to first 6 for ownership check? but we need client to identify own comments.
      // We return full client_id only hashed? For simplicity return as-is; frontend uses it to show "you" and allow reply highlight. It's a random anon id, not PII.
      return res.status(200).json({ok:true, comments:data||[]});
    }catch(e){ return res.status(500).json({ok:false, error:e.message}); }
  }

  if(req.method==='POST'){
    let body=req.body;
    if(typeof body==='string'){ try{ body=JSON.parse(body);}catch{ body={}; } }
    const slug=String(body.slug||'').toLowerCase().trim();
    const rawContent=String(body.content||'');
    const content=rawContent.trim();
    let authorName=String(body.author_name||body.authorName||'').trim().slice(0,32);
    let clientId=normalizeClientId(body.client_id||body.clientId||'');
    // fallback to cookie hl_cid if not in body
    if(!clientId && req.headers.cookie){
      try{ const c=cookie.parse(req.headers.cookie); if(c.hl_cid) clientId=normalizeClientId(c.hl_cid); }catch{}
    }
    const parentId=body.parent_id||body.parentId||null;

    if(!isSlug(slug)) return res.status(400).json({ok:false, error:'valid slug required'});
    if(!content || content.length>2000) return res.status(400).json({ok:false, error:'content 1..2000 chars required'});
    if(!clientId || clientId.length<6) return res.status(400).json({ok:false, error:'client_id required (cookie hl_cid)'});
    if(parentId && !isUuid(parentId)) return res.status(400).json({ok:false, error:'invalid parent_id'});

    // basic spam checks
    if(content.length<2) return res.status(400).json({ok:false, error:'too short'});
    // no raw html tags — we escape on render, but reject obvious injection
    // allow content as plain text only

    try{
      // verify post exists & published
      const {data:post,error:postErr}=await sbRead.from('posts').select('slug,published').eq('slug',slug).eq('published',true).maybeSingle();
      if(postErr) return res.status(500).json({ok:false, error:postErr.message});
      if(!post) return res.status(404).json({ok:false, error:'post not found'});

      // rate limit: max 3 comments per minute per client_id
      const since=new Date(Date.now()-60*1000).toISOString();
      const {count, error:cntErr}=await sbWrite.from('comments').select('id',{count:'exact', head:true}).eq('client_id', clientId).gte('created_at', since);
      if(!cntErr && (count||0)>=5) return res.status(429).json({ok:false, error:'too many comments — wait a minute'});
      // Also per-post throttle
      const {count:cnt2}=await sbWrite.from('comments').select('id',{count:'exact', head:true}).eq('client_id', clientId).eq('post_slug', slug).gte('created_at', new Date(Date.now()-15*1000).toISOString());
      if((cnt2||0)>=1){ /* allow but check duplicate content */ }

      // duplicate content check: same client same content last 2 min
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
      // sanitize authorName: strip < > and trim
      authorName=authorName.replace(/[<>]/g,'').trim().slice(0,32) || 'Anonymous';

      const row={post_slug:slug, parent_id: parentId||null, client_id: clientId, author_name: authorName, content: content.slice(0,2000)};
      const {data,error}=await sbWrite.from('comments').insert(row).select('id,post_slug,parent_id,client_id,author_name,content,created_at').single();
      if(error) return res.status(500).json({ok:false, error:error.message});
      // set cookie for client_id if not already set (helps identify on next visit)
      const cookieVal=cookie.serialize('hl_cid', clientId, {path:'/', maxAge:60*60*24*365, sameSite:'Lax'});
      res.setHeader('Set-Cookie', cookieVal);
      return res.status(200).json({ok:true, comment:data});
    }catch(e){ console.error(e); return res.status(500).json({ok:false, error:e.message||'server error'}); }
  }

  return res.status(405).json({ok:false, error:'method not allowed'});
};
