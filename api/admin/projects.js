/**
 * /api/admin/projects — GET returns projects, POST saves (auth required)
 * Stores in Supabase site_content key='projects' (array) and also syncs to data.json's site_content home.projects for Home
 * Falls back to projects-data.json / data.json on disk
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
    // Try Supabase site_content key='projects' first
    try{
      const sb=await getSupabase();
      if(sb){
        const { data, error } = await sb.from('site_content').select('data').eq('key','projects').single();
        if(!error && data && data.data){
          const arr = Array.isArray(data.data) ? data.data : (data.data.projects || []);
          if(arr.length) return res.status(200).json({ ok:true, source:'supabase', projects: arr });
        }
      }
    }catch{}
    // Fallback to projects-data.json
    try{
      const file=path.join(process.cwd(),'projects-data.json');
      const raw=fs.readFileSync(file,'utf8');
      const j=JSON.parse(raw);
      const arr = j.projects || j;
      return res.status(200).json({ ok:true, source:'file-projects-data', projects: arr });
    }catch{}
    // Fallback to data.json
    try{
      const file=path.join(process.cwd(),'data.json');
      const raw=fs.readFileSync(file,'utf8');
      const j=JSON.parse(raw);
      return res.status(200).json({ ok:true, source:'file-data', projects: j.projects||[] });
    }catch(e){
      return res.status(500).json({ ok:false, error: e.message });
    }
  }

  if(req.method==='POST'){
    try{ verify(req); }catch(e){ return res.status(401).json({ ok:false, error:e.message }); }
    let body=req.body;
    if(typeof body==='string'){ try{ body=JSON.parse(body); }catch{ body={}; } }
    const projects = Array.isArray(body) ? body : (body.projects || []);
    if(!Array.isArray(projects) || !projects.length) return res.status(400).json({ ok:false, error:'No projects' });

    const sb=await getSupabase();
    if(!sb) return res.status(500).json({ ok:false, error:'SUPABASE not configured' });

    // Save to site_content key='projects'
    const { error } = await sb.from('site_content').upsert({ key:'projects', data: projects, updated_at: new Date().toISOString() }, { onConflict:'key' });
    if(error) return res.status(500).json({ ok:false, error: error.message });

    // Also sync to site_content home.projects for Home Featured (keep home in sync)
    try{
      const { data: homeRow } = await sb.from('site_content').select('data').eq('key','home').single();
      if(homeRow && homeRow.data){
        const homeData = homeRow.data;
        // Keep only 5 home keys, update its projects to first 4 of this list (featured)
        homeData.projects = projects.slice(0,4).map(p=> ({
          name: p.name, url: p.detailUrl || p.url, status: p.status, statusLabel: p.statusLabel, description: p.description, chips: p.chips||[], languages: p.languages||[]
        }));
        await sb.from('site_content').upsert({ key:'home', data: homeData, updated_at: new Date().toISOString() }, { onConflict:'key' });
      }
    }catch{}

    // Audit
    try{ await sb.from('admin_edits').insert({ key:'projects', edited_by: verify(req).user||'admin' }); }catch{}

    return res.status(200).json({ ok:true, count: projects.length });
  }

  return res.status(405).json({ error:'Method not allowed' });
};
