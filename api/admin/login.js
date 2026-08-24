/**
 * POST /api/admin/login
 * Body: { username, password }
 * Env: ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_JWT_SECRET
 * Returns: { ok: true, token } and sets HttpOnly cookie
 */
const jwt = require('jsonwebtoken');
const cookie = require('cookie');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  // Vercel may give string body if not parsed
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { username, password } = body || {};

  const ADMIN_USER = process.env.ADMIN_USERNAME;
  const ADMIN_PASS = process.env.ADMIN_PASSWORD;
  const JWT_SECRET = process.env.ADMIN_JWT_SECRET;

  if (!ADMIN_USER || !ADMIN_PASS || !JWT_SECRET) {
    return res.status(500).json({ error: 'Admin env not configured on Vercel (ADMIN_USERNAME / ADMIN_PASSWORD / ADMIN_JWT_SECRET)' });
  }

  if (username !== ADMIN_USER || password !== ADMIN_PASS) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = jwt.sign({ user: username }, JWT_SECRET, { expiresIn: '7d' });

  // Set HttpOnly cookie for server verification + return token for localStorage
  // Rate-limit hint: protect this endpoint with Vercel Firewall (Rate Limit rule)
  // or edge middleware using @upstash/ratelimit (e.g. 5 req/min per IP).
  // See https://vercel.com/docs/firewall/rate-limiting
  res.setHeader('Set-Cookie', cookie.serialize('admin_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api',
    maxAge: 60 * 60 * 24 * 7 // 7 days
  }));

  return res.status(200).json({ ok: true, token, user: username });
};
