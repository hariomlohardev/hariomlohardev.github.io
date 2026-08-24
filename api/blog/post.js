/**
 * GET /api/blog/post?slug=<slug> — fetch single post from Supabase (public)
 */
module.exports = async (req, res) => {
  const slug = String(req.query.slug || '').toLowerCase().trim();
  if (!slug) return res.status(400).json({ ok:false, error:'slug required' });
  try{
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url || !key) return res.status(500).json({ ok:false, error:'Supabase not configured' });
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(url, key, { auth:{ persistSession:false } });
    const { data, error } = await sb.from('posts').select('slug,title,description,date,tags,cover,html,raw,word_count,reading_minutes,published').eq('slug', slug).eq("published",true).maybeSingle();
    if(error) return res.status(500).json({ ok:false, error: error.message });
    if(!data) return res.status(404).json({ ok:false, error:'Not found' });
    // Normalize to the shape post.html expects
    const post = {
      slug: data.slug, title: data.title, description: data.description, date: data.date, tags: data.tags||[],
      cover: data.cover, html: data.html, raw: data.raw, wordCount: data.word_count, readingMinutes: data.reading_minutes,
      url: `https://hariomlohardev.github.io/blog/p/${data.slug}/`, file: data.slug+'.md', word_count: data.word_count, reading_minutes: data.reading_minutes
    };
    return res.status(200).json({ ok:true, post });
  }catch(e){
    return res.status(500).json({ ok:false, error: e.message });
  }
};
