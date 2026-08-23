/**
 * /api/admin/opensource — GET returns curated PRs, POST saves (auth required)
 * Stores in Supabase site_content key='opensource' (and also keeps opensource-curated.json in sync via file fallback)
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
  return createClient(url, key);
}

module.exports = async (req, res) => {
  if(req.method==='GET'){
    try{
      const sb=await getSupabase();
      if(sb){
        const { data, error } = await sb.from('site_content').select('data').eq('key','opensource').single();
        if(!error && data && data.data){
          const prs = Array.isArray(data.data) ? data.data : (data.data.prs || []);
          if(prs.length) return res.status(200).json({ ok:true, source:'supabase', prs });
        }
      }
    }catch{}
    // Fallback to opensource-curated.json
    try{
      const file=path.join(process.cwd(),'opensource-curated.json');
      const raw=fs.readFileSync(file,'utf8');
      const j=JSON.parse(raw);
      return res.status(200).json({ ok:true, source:'file-curated', prs: j.prs||[] });
    }catch{}
    // Fallback to opensource-data.json
    try{
      const file=path.join(process.cwd(),'opensource-data.json');
      const raw=fs.readFileSync(file,'utf8');
      const j=JSON.parse(raw);
      return res.status(200).json({ ok:true, source:'file-data', prs: j.prs||[] });
    }catch(e){
      return res.status(200).json({ ok:true, source:'fallback', prs: [] });
    }
  }

  if(req.method==='POST'){
    try{ verify(req); }catch(e){ return res.status(401).json({ ok:false, error:e.message }); }
    let body=req.body;
    if(typeof body==='string'){ try{ body=JSON.parse(body); }catch{ body={}; } }
    const prs = Array.isArray(body) ? body : (body.prs || []);
    if(!Array.isArray(prs)) return res.status(400).json({ ok:false, error:'No prs' });

    const sb=await getSupabase();
    if(!sb) return res.status(500).json({ ok:false, error:'SUPABASE not configured' });

    const payload = { prs, updated_at: new Date().toISOString() };
    const { error } = await sb.from('site_content').upsert({ key:'opensource', data: payload, updated_at: new Date().toISOString() }, { onConflict:'key' });
    if(error) return res.status(500).json({ ok:false, error: error.message });

    // Also update opensource-curated.json on disk if writable (for GitHub Pages fallback)
    try{
      const file=path.join(process.cwd(),'opensource-curated.json');
      const existing = JSON.parse(fs.readFileSync(file,'utf8'));
      existing.prs = prs;
      existing.generated_at = new Date().toLocaleString('en-GB',{timeZone:'Asia/Kolkata'});
      fs.writeFileSync(file, JSON.stringify(existing,null,2));
    }catch{}

    try{ await sb.from('admin_edits').insert({ key:'opensource', edited_by: verify(req).user||'admin' }); }catch{}
    return res.status(200).json({ ok:true, count: prs.length });
  }

  return res.status(405).json({ error:'Method not allowed' });
};
