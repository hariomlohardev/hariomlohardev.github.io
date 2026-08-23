/**
 * /api/admin/community — GET returns community data, POST saves (auth required)
 * Stores in Supabase site_content key='community' and also syncs to community-data.json fallback
 */
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const fs = require('fs');
const path = require('path');

function getToken(req){
  let t=null;
  if(req.headers.cookie){ try{ t=cookie.parse(req.headers.cookie).admin_token; }catch{} }
  if(!t && req.headers.authorization){ const m=req.headers.authorization.match(/^Bearer\s+(.+)$/); if(m) t=m[1]; }
  if(!t && req.query && req.query.token) t=req.query.token;
  return t;
}
function verify(req){
  const secret=process.env.ADMIN_JWT_SECRET;
  if(!secret) throw new Error('ADMIN_JWT_SECRET not set');
  const token=getToken(req);
  if(!token) throw new Error('No token');
  return jwt.verify(token, secret);
}
async function getSupabase(){
  const url=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if(!url || !key) return null;
  const { createClient } = require('@supabase/supabase-js');
  return createClient(url, key,{ auth:{ persistSession:false, autoRefreshToken:false }, realtime:{ transport: undefined }});
}

module.exports = async (req, res) => {
  if(req.method==='GET'){
    try{
      const sb=await getSupabase();
      if(sb){
        const { data, error } = await sb.from('site_content').select('data').eq('key','community').single();
        if(!error && data && data.data) return res.status(200).json({ ok:true, source:'supabase', data: data.data });
      }
    }catch{}
    try{
      const file=path.join(process.cwd(),'community-data.json');
      const raw=fs.readFileSync(file,'utf8');
      const j=JSON.parse(raw);
      return res.status(200).json({ ok:true, source:'file', data: j });
    }catch(e){
      return res.status(500).json({ ok:false, error: e.message });
    }
  }
  if(req.method==='POST'){
    try{ verify(req); }catch(e){ return res.status(401).json({ ok:false, error:e.message }); }
    let body=req.body;
    if(typeof body==='string'){ try{ body=JSON.parse(body); }catch{ body={}; } }
    const sb=await getSupabase();
    if(!sb) return res.status(500).json({ ok:false, error:'SUPABASE not configured' });
    const { error } = await sb.from('site_content').upsert({ key:'community', data: body, updated_at: new Date().toISOString() }, { onConflict:'key' });
    if(error) return res.status(500).json({ ok:false, error: error.message });
    // Also try to write to community-data.json on disk for Pages fallback (best-effort, won't persist on Vercel)
    try{
      const file=path.join(process.cwd(),'community-data.json');
      fs.writeFileSync(file, JSON.stringify(body,null,2));
    }catch{}
    try{ await sb.from('admin_edits').insert({ key:'community', edited_by: verify(req).user||'admin' }); }catch{}
    return res.status(200).json({ ok:true });
  }
  return res.status(405).json({ error:'Method not allowed' });
};
