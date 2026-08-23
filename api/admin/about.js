/**
 * /api/admin/about — GET returns about data, POST saves (auth required)
 * Stores in Supabase site_content key='about'
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

const FALLBACK = {
  lead: "Self-taught from India, rebuilding intelligence <em>from scratch</em> — one proof, one commit at a time.",
  body: "I finished 12th grade and chose the longer road — no bootcamp, no shortcut. I build backends with Django and FastAPI, cross-platform apps with Flutter, and retrieval pipelines with LangChain and RAG. The rest of the day I rebuild intelligence from first principles: math from axioms, neural nets and backprop by hand in NumPy, now CNNs, Transformers and PyTorch. All in public.",
  facts: [
    { dt:"Location", dd:"India · <b>IST</b>" },
    { dt:"Focus", dd:"AGI from first principles" },
    { dt:"Log", dd:"Day — of —" },
    { dt:"Open to", dd:"Freelance & collabs" }
  ],
  timeline: [
    { date:"2026 · Now", title:"CNNs, Transformers & PyTorch", desc:"Attention by hand, 4-head residual, layernorm — forward/backward in NumPy, grads checked at 1e-4. Shipping live benches." },
    { date:"2026 · Q1", title:"Math from axioms → Backprop", desc:"Linear algebra, calculus, probability, then neural nets and optimisers SGD→Adam — all derived, no autograd." },
    { date:"2026", title:"Harvard CS50P — certified", desc:"Nine problem sets + final project, David J. Malan. Verified 544021b8-ab89-4eb2-a433-9c0b949e658f." },
    { date:"After 12th", title:"Chose the long road", desc:"Self-taught — 8h/day, open notebook, proof before import. India · IST." }
  ]
};

module.exports = async (req, res) => {
  if(req.method==='GET'){
    try{
      const sb=await getSupabase();
      if(sb){
        const { data, error } = await sb.from('site_content').select('data').eq('key','about').single();
        if(!error && data && data.data) return res.status(200).json({ ok:true, source:'supabase', data: data.data });
      }
    }catch{}
    // Fallback to file or hardcoded
    return res.status(200).json({ ok:true, source:'fallback', data: FALLBACK });
  }
  if(req.method==='POST'){
    try{ verify(req); }catch(e){ return res.status(401).json({ ok:false, error:e.message }); }
    let body=req.body;
    if(typeof body==='string'){ try{ body=JSON.parse(body); }catch{ body={}; } }
    const sb=await getSupabase();
    if(!sb) return res.status(500).json({ ok:false, error:'SUPABASE not configured' });
    const { error } = await sb.from('site_content').upsert({ key:'about', data: body, updated_at: new Date().toISOString() }, { onConflict:'key' });
    if(error) return res.status(500).json({ ok:false, error: error.message });
    try{ await sb.from('admin_edits').insert({ key:'about', edited_by: verify(req).user||'admin' }); }catch{}
    return res.status(200).json({ ok:true });
  }
  return res.status(405).json({ error:'Method not allowed' });
};
