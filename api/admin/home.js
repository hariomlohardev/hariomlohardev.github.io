/**
 * /api/admin/home — GET returns home data, POST saves it (auth required)
 * Uses Supabase site_content table (key='home') with service_role, falls back to data.json
 */
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const fs = require('fs');
const path = require('path');

function getToken(req){
  let token=null;
  if(req.headers.cookie){
    try{ token=cookie.parse(req.headers.cookie).admin_token; }catch{}
  }
  if(!token && req.headers.authorization){
    const m=req.headers.authorization.match(/^Bearer\s+(.+)$/);
    if(m) token=m[1];
  }
  if(!token && req.query && req.query.token) token=req.query.token;
  return token;
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
  // Allow GET without auth for public read (home is public), but POST requires auth
  if (req.method === 'GET') {
    try{
      const sb = await getSupabase();
      if(sb){
        const { data, error } = await sb.from('site_content').select('data,updated_at').eq('key','home').single();
        if(!error && data && data.data){
          return res.status(200).json({ ok:true, source:'supabase', data: data.data, updated_at: data.updated_at });
        }
      }
    }catch(e){ /* fallback to file */ }
    // Fallback to data.json on disk (for local / Pages without Supabase)
    try{
      const file=path.join(process.cwd(),'data.json');
      const raw=fs.readFileSync(file,'utf8');
      const j=JSON.parse(raw);
      return res.status(200).json({ ok:true, source:'file', data: j });
    }catch(e){
      return res.status(500).json({ ok:false, error: 'No Supabase and no data.json: '+e.message });
    }
  }

  if (req.method === 'POST') {
    // Auth required
    try{ verify(req); }catch(e){ return res.status(401).json({ ok:false, error: e.message }); }

    let body=req.body;
    if(typeof body==='string'){ try{ body=JSON.parse(body); }catch{ body={}; } }
    // Expect { mission, stats, taglines, ... } or full data object
    const sb = await getSupabase();
    if(!sb) return res.status(500).json({ ok:false, error: 'SUPABASE_URL / SERVICE_ROLE_KEY not set on Vercel' });

    // Upsert into site_content
    const { error } = await sb.from('site_content').upsert({ key:'home', data: body, updated_at: new Date().toISOString() }, { onConflict:'key' });
    if(error) return res.status(500).json({ ok:false, error: error.message });

    // Optional audit
    try{
      const user=verify(req).user || 'admin';
      await sb.from('admin_edits').insert({ key:'home', edited_by: user });
    }catch{}

    return res.status(200).json({ ok:true });
  }

  return res.status(405).json({ error:'Method not allowed' });
};
