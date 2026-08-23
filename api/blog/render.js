/**
 * GET /api/blog/render?slug=<slug> — returns full HTML for a post (for Vercel rewrite fallback)
 * Used when /blog/p/:slug/index.html doesn't exist (Supabase-only posts)
 */
module.exports = async (req, res) => {
  const slug = String(req.query.slug || '').toLowerCase().trim();
  if(!slug) return res.status(400).send('slug required');
  try{
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url||!key) return res.status(500).send('Supabase not configured');
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(url, key, { auth:{persistSession:false}});
    const { data, error } = await sb.from('posts').select('*').eq('slug', slug).maybeSingle();
    if(error) return res.status(500).send(error.message);
    if(!data) return res.status(404).send('Not found');
    // Reuse the same HTML as static generator would — minimal shell that then hydrates via post.html JS
    // Instead of duplicating, just redirect to post.html?slug=
    res.setHeader('Content-Type','text/html');
    return res.status(200).send(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=/post.html?slug=${encodeURIComponent(slug)}" /></head><body>Redirecting to <a href="/post?slug=${encodeURIComponent(slug)}">/post.html?slug=${slug}</a></body></html>`);
  }catch(e){
    return res.status(500).send(e.message);
  }
};
