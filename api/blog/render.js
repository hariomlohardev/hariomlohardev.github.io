/**
 * GET /api/blog/render?slug=<slug> — server-render the post shell for a slug
 * (Vercel rewrite target for /blog/p/:slug when no static file exists, e.g. a
 * post published after the last build). Uses the SAME shell template as the
 * static generator, so every post URL shows one UI on every host.
 */
const SITE = 'https://hariomlohardev.github.io';

function toSlug(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64); }

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  if(req.method==='OPTIONS') return res.status(204).end();
  const slug = toSlug(req.query.slug || '');
  if(!slug) return res.status(400).send('slug required');
  try{
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url||!key) return res.status(500).send('Supabase not configured');
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(url, key, { auth:{persistSession:false}});
    const { data, error } = await sb.from('posts').select('slug').eq('slug', slug).eq('published',true).maybeSingle();
    if(error) return res.status(500).send(error.message);
    if(!data) return res.status(404).send('Not found');
    const { postPage } = require('../../scripts/generate-blog.js');
    const html = postPage({ slug: data.slug, url: `${SITE}/blog/p/${data.slug}/` });
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).send(html);
  }catch(e){
    return res.status(500).send(e.message);
  }
};
