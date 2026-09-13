/**
 * /api/admin/opensource — GET returns curated PRs, POST saves (auth required)
 * Stores in Supabase site_content key='opensource', the only Open Source source of truth.
 */
const jwt = require('jsonwebtoken');
const cookie = require('cookie');

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
        const { data, error } = await sb.from('site_content').select('data,updated_at').eq('key','opensource').single();
        if(!error && data && data.data){
          const prs = Array.isArray(data.data) ? data.data : (data.data.prs || []);
          if(prs.length) return res.status(200).json({ ok:true, source:'supabase', updated_at:data.updated_at||(data.data&&data.data.updated_at)||null, prs });
        }
      }
      return res.status(200).json({ ok:true, source:'supabase-empty', prs: [] });
    }catch(e){
      return res.status(500).json({ ok:false, error:e.message });
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

    // Audit
    try{ await sb.from('admin_edits').insert({ key:'opensource', edited_by: verify(req).user||'admin' }); }catch{}
    return res.status(200).json({ ok:true, count: prs.length });
  }

  return res.status(405).json({ error:'Method not allowed' });
};
