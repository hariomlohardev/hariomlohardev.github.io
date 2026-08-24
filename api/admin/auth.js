/**
 * /api/admin/auth — consolidated login + verify (Hobby 12-function limit)
 * POST ?action=login (or POST /api/admin/login via rewrite) → {ok, token}
 *   Body: {username, password}
 * GET  ?action=verify (or GET /api/admin/verify via rewrite) → {ok, user}
 *   Checks cookie admin_token or Authorization: Bearer
 * Rewrites in vercel.json keep old URLs working.
 */
const jwt = require('jsonwebtoken');
const cookie = require('cookie');

function getToken(req){
  let t=null;
  if(req.headers.cookie){ try{ t=cookie.parse(req.headers.cookie).admin_token; }catch{} }
  if(!t && req.headers.authorization){ const m=req.headers.authorization.match(/^Bearer\s+(.+)$/); if(m) t=m[1]; }
  return t;
}

module.exports = async (req, res) => {
  const action = String(req.query.action||'').toLowerCase();
  const isLogin = req.method==='POST' && (action==='login' || req.url.includes('/login') || !action);
  const isVerify = req.method==='GET' && (action==='verify' || req.url.includes('/verify') || !action);
  // Fallback: detect by method alone if no action and url is /api/admin/auth
  // POST -> login, GET -> verify
  if (req.method==='POST') {
    // LOGIN
    let body=req.body;
    if(typeof body==='string'){ try{ body=JSON.parse(body);}catch{ body={}; } }
    const {username, password}=body||{};
    const ADMIN_USER=process.env.ADMIN_USERNAME;
    const ADMIN_PASS=process.env.ADMIN_PASSWORD;
    const JWT_SECRET=process.env.ADMIN_JWT_SECRET;
    if(!ADMIN_USER||!ADMIN_PASS||!JWT_SECRET) return res.status(500).json({error:'Admin env not configured on Vercel (ADMIN_USERNAME / ADMIN_PASSWORD / ADMIN_JWT_SECRET)'});
    if(username!==ADMIN_USER || password!==ADMIN_PASS) return res.status(401).json({error:'Invalid username or password'});
    const token=jwt.sign({user:username}, JWT_SECRET, {expiresIn:'7d'});
    res.setHeader('Set-Cookie', cookie.serialize('admin_token', token, {
      httpOnly:true,
      secure:process.env.NODE_ENV==='production',
      sameSite:'lax',
      path:'/api',
      maxAge:60*60*24*7
    }));
    return res.status(200).json({ok:true, token, user:username});
  }
  if (req.method==='GET') {
    // VERIFY
    const JWT_SECRET=process.env.ADMIN_JWT_SECRET;
    if(!JWT_SECRET) return res.status(500).json({ok:false, error:'ADMIN_JWT_SECRET not set'});
    res.setHeader('Cache-Control','no-store');
    const token=getToken(req);
    if(!token) return res.status(401).json({ok:false, error:'No token'});
    try{
      const payload=jwt.verify(token, JWT_SECRET);
      return res.status(200).json({ok:true, user:payload.user});
    }catch(e){
      return res.status(401).json({ok:false, error:'Invalid or expired token'});
    }
  }
  return res.status(405).json({error:'Method not allowed'});
};
