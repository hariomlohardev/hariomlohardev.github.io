/**
 * POST /api/admin/upload
 * Auth: Bearer <admin_token> (JWT)
 *
 * Two body shapes, both accepted:
 *   JSON    { filename, contentType, data: <base64> }             — what the image path has always sent
 *   binary  Content-Type: application/octet-stream + X-Filename   — no base64 inflation, used for attachments
 *
 * ?kind=image (default) — image/* only, 8MB, key  <date>/<ts>-<slug>.<ext>
 * ?kind=file            — any type but HTML-ish, 25MB, key  files/<date>/<ts>-<slug>.<ext>,
 *                         and the returned url carries ?download=<name> so a click downloads
 *                         the file instead of navigating to it.
 *
 * Both land in the public bucket 'blog-images' (no extra bucket/SQL to run).
 * Returns { ok:true, url, key, name, contentType, size, kind }
 */

const jwt = require('jsonwebtoken');
const cookie = require('cookie');

const IMAGE_MAX = 8 * 1024 * 1024;
const FILE_MAX = 25 * 1024 * 1024;

// the bucket is public, so never store anything a browser would execute as a page
const BLOCKED_EXT = ['html','htm','xhtml','shtml','phtml','php','php3','php4','php5','phps','svgz','hta'];
const BLOCKED_CT = ['text/html','application/xhtml+xml','application/x-httpd-php'];

// enough of a map that common downloads get a real content type
const CT_BY_EXT = {
  pdf:'application/pdf', txt:'text/plain; charset=utf-8', md:'text/markdown; charset=utf-8',
  csv:'text/csv; charset=utf-8', tsv:'text/tab-separated-values; charset=utf-8',
  json:'application/json', xml:'application/xml', yml:'text/yaml', yaml:'text/yaml',
  zip:'application/zip', gz:'application/gzip', tgz:'application/gzip', bz2:'application/x-bzip2',
  '7z':'application/x-7z-compressed', rar:'application/vnd.rar', tar:'application/x-tar',
  py:'text/x-python', js:'text/javascript', mjs:'text/javascript', ts:'text/plain; charset=utf-8',
  sh:'text/x-shellscript', ps1:'text/plain; charset=utf-8', bat:'text/plain; charset=utf-8',
  c:'text/x-c', h:'text/x-c', cpp:'text/x-c', rs:'text/plain; charset=utf-8', go:'text/plain; charset=utf-8',
  ipynb:'application/json', sql:'application/sql', patch:'text/x-diff', diff:'text/x-diff',
  doc:'application/msword', docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls:'application/vnd.ms-excel', xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt:'application/vnd.ms-powerpoint', pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  mp3:'audio/mpeg', wav:'audio/wav', mp4:'video/mp4', webm:'video/webm', mov:'video/quicktime',
  ttf:'font/ttf', otf:'font/otf', woff:'font/woff', woff2:'font/woff2',
  epub:'application/epub+zip', apk:'application/vnd.android.package-archive', exe:'application/octet-stream',
  png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp', gif:'image/gif', avif:'image/avif', svg:'image/svg+xml'
};

function getToken(req){
  let t=null;
  if(req.headers.cookie){ try{ t=cookie.parse(req.headers.cookie).admin_token; }catch{} }
  if(!t && req.headers.authorization){ const m=req.headers.authorization.match(/^Bearer\s+(.+)$/); if(m) t=m[1]; }
  // deliberately NOT reading ?token= (leak)
  return t;
}

function slugify(s, fallback){
  return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60) || (fallback||'file');
}
function extOf(name){
  const m = String(name||'').match(/\.([A-Za-z0-9]{1,12})$/);
  return m ? m[1].toLowerCase() : '';
}
function headerName(req){
  const raw = req.headers['x-filename'] || req.headers['x-file-name'] || '';
  try{ return decodeURIComponent(String(raw)); }catch{ return String(raw); }
}

// Vercel may hand us a parsed body, a Buffer, or nothing at all — cover all three.
function readBody(req, max){
  if(Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if(req.body && typeof req.body === 'object') return Promise.resolve(Buffer.from(JSON.stringify(req.body)));
  if(typeof req.body === 'string' && req.body) return Promise.resolve(Buffer.from(req.body));
  return new Promise((resolve, reject)=>{
    const chunks=[]; let n=0, done=false;
    req.on('data', c=>{
      if(done) return;
      n += c.length;
      if(n > max){ done=true; reject(new Error('Payload too large (max '+Math.round(max/1048576)+'MB)')); try{ req.destroy(); }catch{} return; }
      chunks.push(c);
    });
    req.on('end', ()=> { if(!done){ done=true; resolve(Buffer.concat(chunks)); } });
    req.on('error', e=> { if(!done){ done=true; reject(e); } });
  });
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

  const kind = String((req.query && (req.query.kind || req.query.as)) || '').toLowerCase() === 'file' ? 'file' : 'image';
  const MAX = kind === 'file' ? FILE_MAX : IMAGE_MAX;
  const reqCT = String(req.headers['content-type'] || '').toLowerCase();
  // a body Vercel already parsed into an object is JSON no matter what the header says
  const preParsed = !!req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body);
  const isJson = reqCT.includes('json') || preParsed;
  // base64 costs ~4/3 of the bytes it carries, so the JSON path needs the roomier ceiling
  const readMax = isJson ? Math.ceil(MAX * 1.4) + 4096 : MAX + 4096;

  const declared = Number(req.headers['content-length'] || 0);
  if(declared && declared > readMax){
    return res.status(413).json({ ok:false, error:(kind==='file'?'File':'Image')+' too large (max '+Math.round(MAX/1048576)+'MB), got '+Math.round(declared/1048576)+'MB' });
  }

  let raw;
  try{ raw = await readBody(req, readMax); }
  catch(e){ return res.status(413).json({ ok:false, error: e.message || 'Payload too large' }); }
  if(!raw || !raw.length) return res.status(400).json({ ok:false, error:'Empty body' });

  let name='', ct='', buf=null;

  if(isJson){
    let payload;
    try{ payload = JSON.parse(raw.toString('utf8')); }
    catch{ return res.status(400).json({ ok:false, error:'Invalid JSON body — expected {filename, contentType, data: base64}' }); }
    const { filename, contentType, data } = payload || {};
    if(!data) return res.status(400).json({ ok:false, error:'Missing data (base64)' });
    name = String(filename||'');
    ct = String(contentType||'').toLowerCase().split(';')[0].trim();
    try{
      let b64 = String(data);
      const comma = b64.indexOf(',');
      if(b64.startsWith('data:') && comma !== -1) b64 = b64.slice(comma+1); // data: URL
      buf = Buffer.from(b64.replace(/\s/g,''), 'base64');
      if(!buf.length) throw new Error('empty');
    }catch(e){ return res.status(400).json({ ok:false, error:'Invalid base64: '+e.message }); }
  }else{
    name = headerName(req);
    ct = String(req.headers['x-file-type'] || reqCT || '').toLowerCase().split(';')[0].trim();
    if(ct === 'application/octet-stream') ct = '';
    buf = raw;
  }

  if(buf.length > MAX){
    return res.status(413).json({ ok:false, error:(kind==='file'?'File':'Image')+' too large (max '+Math.round(MAX/1048576)+'MB), got '+Math.round(buf.length/1024)+'KB' });
  }

  let ext = extOf(name);
  if(BLOCKED_EXT.includes(ext) || BLOCKED_CT.includes(ct)){
    return res.status(400).json({ ok:false, error:'That type is not allowed here (it would be served as a live page): .'+(ext||ct) });
  }

  if(kind === 'image'){
    const allowed = ['image/jpeg','image/png','image/webp','image/gif','image/svg+xml','image/avif'];
    if(ct && !allowed.includes(ct) && !ct.startsWith('image/')){
      return res.status(400).json({ ok:false, error:'Only image/* allowed here — use ?kind=file for other files (got '+ct+')' });
    }
    if(!ext) ext = ct==='image/jpeg'?'jpg':ct==='image/png'?'png':ct==='image/webp'?'webp':ct==='image/gif'?'gif':ct==='image/avif'?'avif':ct==='image/svg+xml'?'svg':'jpg';
  }

  if(!ct) ct = CT_BY_EXT[ext] || (kind==='image' ? 'image/jpeg' : 'application/octet-stream');

  const base = slugify(String(name||'').replace(/\.[^.]+$/,''), kind==='image'?'image':'file');
  const dlName = base + (ext ? '.' + ext : '');  // clean enough to sit inside a markdown link
  const stamp = new Date().toISOString().slice(0,10);
  const key = (kind==='file' ? 'files/' : '') + stamp + '/' + Date.now() + '-' + base + '.' + (ext || 'bin');

  try{
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(SUPA_URL, SERVICE_KEY, { auth:{ persistSession:false } });

    const { error } = await sb.storage.from('blog-images').upload(key, buf, {
      contentType: ct,
      upsert: false,
      cacheControl: '31536000',
    });
    if(error) return res.status(500).json({ ok:false, error:'Supabase upload failed: '+error.message });

    const { data: pub } = sb.storage.from('blog-images').getPublicUrl(key);
    let url = (pub && pub.publicUrl) || (SUPA_URL + '/storage/v1/object/public/blog-images/' + key);
    // ?download makes Storage answer with Content-Disposition: attachment, so the link
    // saves the file under its own name instead of opening it in a tab.
    if(kind === 'file') url += (url.indexOf('?')===-1 ? '?' : '&') + 'download=' + encodeURIComponent(dlName);

    return res.status(200).json({ ok:true, url, key, name: dlName, original: String(name||''), contentType: ct, size: buf.length, kind });
  }catch(e){
    return res.status(500).json({ ok:false, error: e.message || 'Upload failed' });
  }
};
