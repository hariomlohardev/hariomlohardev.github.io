/**
 * GET /api/blog/render?slug=<slug> — server-render the post shell for a slug
 * (Vercel rewrite target for /blog/p/:slug when no static file exists, e.g. a
 * post published after the last build). Uses the SAME shell template as the
 * static generator, so every post URL shows one UI on every host.
 */
const SITE = 'https://hariomlohardev.github.io';

async function renderTrick(req, res){
  const id=String(req.query.id || '');
  if(!/^[0-9]{1,15}$/.test(id)) return res.status(400).send('Valid trick id required');
  const url=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url || !key) return res.status(500).send('Supabase not configured');
  try{
    const response=await fetch(url.replace(/\/$/,'')+'/rest/v1/tricks?select=id,title,raw,html,tags,published,word_count,reading_minutes,created_at,updated_at&id=eq.'+id+'&published=eq.true&limit=1', {
      headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(15000)
    });
    if(!response.ok) return res.status(503).send('Temporarily unavailable');
    const {normalize,readShell,newsbandOf,pageFor}=require('../../scripts/generate-tricks');
    const trick=normalize(await response.json())[0];
    if(!trick) return res.status(404).send('Not found');
    const shell=readShell();
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).send(pageFor(shell,trick,newsbandOf(shell)));
  }catch(_){ return res.status(503).send('Temporarily unavailable'); }
}

function toSlug(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64); }

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  if(req.method==='OPTIONS') return res.status(204).end();
  if(req.method!=='GET' && req.method!=='HEAD') return res.status(405).end();
  if(req.query.type==='trick') return renderTrick(req,res);
  const slug = toSlug(req.query.slug || '');
  if(!slug) return res.status(400).send('slug required');
  try{
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url||!key) return res.status(500).send('Supabase not configured');
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(url, key, { auth:{persistSession:false}});
    const { data, error } = await sb.from('posts').select('slug,title,description,date,tags,cover,html,raw,word_count,reading_minutes,max_comment_words,updated_at,created_at').eq('slug', slug).eq('published',true).maybeSingle();
    if(error) return res.status(500).send(error.message);
    if(!data) return res.status(404).send('Not found');
    let rawLimit = data.max_comment_words ?? data.maxCommentWords ?? 2000;
    let n = parseInt(rawLimit, 10);
    let max_comment_words;
    if (n === -1) max_comment_words = -1;
    else if (isNaN(n) || n < 1) max_comment_words = 2000;
    else max_comment_words = n;
    const { postPage } = require('../../scripts/generate-blog.js');
    const html = postPage({ ...data, url: `${SITE}/blog/p/${data.slug}/`, max_comment_words });
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).send(html);
  }catch(e){
    return res.status(500).send(e.message);
  }
};
