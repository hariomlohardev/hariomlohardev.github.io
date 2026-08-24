/**
 * POST /api/admin/upload
 * Auth: Bearer <admin_token> (JWT)
 * Body: { filename, contentType, data: base64 }
 * Uploads to Supabase Storage bucket 'blog-images' (public) and returns { ok:true, url }
 */

const jwt = require('jsonwebtoken');
const cookie = require('cookie');

function getToken(req){
  let t=null;
  if(req.headers.cookie){ try{ t=cookie.parse(req.headers.cookie).admin_token; }catch{} }
  if(!t && req.headers.authorization){ const m=req.headers.authorization.match(/^Bearer\s+(.+)$/); if(m) t=m[1]; }
  // deliberately NOT reading ?token= (leak)
  return t;
}

function slugify(s){
  return String(s||'image').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40) || 'image';
}

module.exports = async (req, res) => {
  if(req.method !== 'POST') return res.status(405).json({ ok:false, error:'Method not allowed' });

  const JWT_SECRET = process.env.ADMIN_JWT_SECRET;
  if(!JWT_SECRET) return res.status(500).json({ ok:false, error:'ADMIN_JWT_SECRET not set' });

  const token = getToken(req);
  if(!token) return res.status(401).json({ ok:false, error:'No token' });
  try{ jwt.verify(token, JWT_SECRET); }catch(e){ return res.status(401).json({ ok:false, error:'Invalid token' }); }

  const SUPA_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!SUPA_URL || !SERVICE_KEY) return res.status(500).json({ ok:false, error:'Supabase not configured (need SERVICE_ROLE for upload)' });

  let body='';
  try{
    // Vercel may have already parsed JSON into req.body, but handle raw as well
    if(req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)){
      body = JSON.stringify(req.body);
    } else {
      body = await new Promise((resolve, reject)=>{
        let data='';
        req.on('data', c=> { data+=c; if(data.length> 12*1024*1024) reject(new Error('Payload too large (12MB max)')); });
        req.on('end', ()=> resolve(data));
        req.on('error', reject);
      });
      if(!body && req.body) body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }
  }catch(e){ return res.status(413).json({ ok:false, error:e.message || 'Payload too large' }); }

  let payload;
  try{ payload = JSON.parse(body); }catch{ return res.status(400).json({ ok:false, error:'Invalid JSON body — expected {filename, contentType, data: base64}' }); }

  const { filename, contentType, data } = payload || {};
  if(!data) return res.status(400).json({ ok:false, error:'Missing data (base64)' });

  // Validate content type
  const allowed = ['image/jpeg','image/png','image/webp','image/gif','image/svg+xml','image/avif'];
  const ct = String(contentType||'').toLowerCase().split(';')[0].trim();
  if(ct && !allowed.includes(ct) && !ct.startsWith('image/')){
    return res.status(400).json({ ok:false, error:'Only image/* allowed, got '+ct });
  }

  // Decode base64
  let buf;
  try{
    // data may be data URL like data:image/png;base64,....
    let b64 = String(data);
    const comma = b64.indexOf(',');
    if(b64.startsWith('data:') && comma!==-1) b64 = b64.slice(comma+1);
    // Remove whitespace
    b64 = b64.replace(/\s/g,'');
    buf = Buffer.from(b64, 'base64');
    if(!buf.length) throw new Error('empty');
    if(buf.length > 8*1024*1024) return res.status(413).json({ ok:false, error:'Image too large (8MB max), got '+Math.round(buf.length/1024)+'KB' });
  }catch(e){ return res.status(400).json({ ok:false, error:'Invalid base64: '+e.message }); }

  const ext = (String(filename||'').split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g,'') || (ct==='image/jpeg'?'jpg':ct==='image/png'?'png':ct==='image/webp'?'webp':ct==='image/gif'?'gif':'jpg');
  const base = slugify((filename||'image').replace(/\.[^.]+$/,''));
  const key = `${new Date().toISOString().slice(0,10)}/${Date.now()}-${base}.${ext}`;

  try{
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(SUPA_URL, SERVICE_KEY, { auth:{ persistSession:false } });

    const { error } = await sb.storage.from('blog-images').upload(key, buf, {
      contentType: ct || 'image/jpeg',
      upsert: false,
      cacheControl: '31536000',
    });
    if(error) return res.status(500).json({ ok:false, error:'Supabase upload failed: '+error.message });

    const { data: pub } = sb.storage.from('blog-images').getPublicUrl(key);
    const url = pub?.publicUrl || `${SUPA_URL}/storage/v1/object/public/blog-images/${key}`;

    return res.status(200).json({ ok:true, url, key, contentType: ct, size: buf.length });
  }catch(e){
    return res.status(500).json({ ok:false, error: e.message || 'Upload failed' });
  }
};
