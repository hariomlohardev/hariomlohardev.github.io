/**
 * GET /api/admin/verify
 * Checks cookie or Authorization: Bearer <token>
 * Returns { ok: true, user } if valid
 */
const jwt = require('jsonwebtoken');
const cookie = require('cookie');

module.exports = async (req, res) => {
  const JWT_SECRET = process.env.ADMIN_JWT_SECRET;
  if (!JWT_SECRET) return res.status(500).json({ ok: false, error: 'ADMIN_JWT_SECRET not set' });

  let token = null;
  // From cookie
  if (req.headers.cookie) {
    const cookies = cookie.parse(req.headers.cookie);
    token = cookies.admin_token;
  }
  // From Authorization header (for fetch)
  if (!token && req.headers.authorization) {
    const m = req.headers.authorization.match(/^Bearer\s+(.+)$/);
    if (m) token = m[1];
  }
  // From query ?token= (fallback for localStorage)
  if (!token && req.query && req.query.token) token = req.query.token;
  if (!token && req.url && req.url.includes('token=')) {
    try { token = new URL(req.url, 'http://localhost').searchParams.get('token'); } catch {}
  }

  if (!token) return res.status(401).json({ ok: false, error: 'No token' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return res.status(200).json({ ok: true, user: payload.user });
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
  }
};
