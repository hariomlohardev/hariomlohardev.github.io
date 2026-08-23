/**
 * /api/admin/contact — GET returns contact data, POST saves (auth required)
 * Stores in Supabase site_content key='contact'
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

const FALLBACK = {
  hero: { eyebrow: "Get in touch — freelance & collaborations", h1: "Contact file", lede: "Backends that stay up, apps that feel native, and search over your data — or just say hi. Replies via email, usually <24h. Also on Instagram, and inside the SIGMOID lab." },
  top: { h2: "Let’s ship<br>something that<br><em>lasts.</em>", p: "Open to part-time work — backends with Django & FastAPI, Flutter apps, and search over your data with RAG. I hand over clean code and clear docs. Community host at SIGMOID.", avail: "Currently available — ask about this month" },
  clinks: [
    { no:"01 · FILE", name:"GitHub", url:"https://github.com/hariomlohardev", display:"github.com/hariomlohardev" },
    { no:"02 · FILE", name:"X / Twitter", url:"https://x.com/HariomloharAGI", display:"@HariomloharAGI" },
    { no:"03 · FILE", name:"LinkedIn", url:"https://www.linkedin.com/in/hariomlohar", display:"in/hariomlohar" },
    { no:"04 · FILE", name:"Instagram", url:"https://www.instagram.com/hariom_lohar_mp/", display:"@hariom_lohar_mp" },
    { no:"05 · FILE", name:"Hugging Face", url:"https://huggingface.co/hariomlohardev", display:"huggingface.co/hariomlohardev" },
    { no:"06 · COMMUNITY", name:"SIGMOID", url:"community.html", display:"lab community · members & batches →" }
  ]
};

module.exports = async (req, res) => {
  if(req.method==='GET'){
    try{
      const sb=await getSupabase();
      if(sb){
        const { data, error } = await sb.from('site_content').select('data').eq('key','contact').single();
        if(!error && data && data.data) return res.status(200).json({ ok:true, source:'supabase', data: data.data });
      }
    }catch{}
    return res.status(200).json({ ok:true, source:'fallback', data: FALLBACK });
  }
  if(req.method==='POST'){
    try{ verify(req); }catch(e){ return res.status(401).json({ ok:false, error:e.message }); }
    let body=req.body;
    if(typeof body==='string'){ try{ body=JSON.parse(body); }catch{ body={}; } }
    const sb=await getSupabase();
    if(!sb) return res.status(500).json({ ok:false, error:'SUPABASE not configured' });
    const { error } = await sb.from('site_content').upsert({ key:'contact', data: body, updated_at: new Date().toISOString() }, { onConflict:'key' });
    if(error) return res.status(500).json({ ok:false, error: error.message });
    try{ await sb.from('admin_edits').insert({ key:'contact', edited_by: verify(req).user||'admin' }); }catch{}
    return res.status(200).json({ ok:true });
  }
  return res.status(405).json({ error:'Method not allowed' });
};
