#!/usr/bin/env node
"use strict";
/**
 * sync-posts.js — Supabase `posts` → posts.json (build artifact)
 *
 * SOURCE OF TRUTH: Supabase table `public.posts` (published=true).
 * `posts.json` is DEPRECATED as a hand-edited source — this script regenerates
 * it from Supabase so that file-based builds (sitemap, llms, OG, fallback)
 * still work locally without env. Do NOT edit posts.json by hand; edit via
 * Supabase /admin/blog instead, then re-run this script or let CI do it.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/sync-posts.js
 *   # or with service_role for private drafts:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/sync-posts.js
 *
 * Output: posts.json at repo root (array of {slug,title,date,description,tags,
 * readingMinutes,wordCount,url,file,cover} sorted date desc). Kept for
 * backwards-compat and for generate-llms.js / generate-projects.js fallback.
 * In CI (pages.yml), generate-llms.js and generate-projects.js prefer live
 * Supabase; posts.json is only used when env is missing.
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "posts.json");
const SITE = "https://hariomlohardev.github.io";

async function fetchFromSupabase(){
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if(!url || !key){
    console.error("SUPABASE_URL and SUPABASE_ANON_KEY (or SERVICE_ROLE_KEY) required");
    console.error("Example: SUPABASE_URL=https://rgmvhptebkslkjleoilc.supabase.co SUPABASE_ANON_KEY=... node scripts/sync-posts.js");
    process.exit(1);
  }
  const endpoint = `${url.replace(/\/$/,'')}/rest/v1/posts?select=slug,title,description,date,tags,cover,word_count,reading_minutes,published&published=eq.true&order=date.desc`;
  console.log(`→ fetching ${endpoint}`);
  const res = await fetch(endpoint, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if(!res.ok){
    const txt = await res.text().catch(()=> '');
    throw new Error(`Supabase fetch ${res.status}: ${txt.slice(0,400)}`);
  }
  const rows = await res.json();
  if(!Array.isArray(rows)) throw new Error("Unexpected response not array");
  return rows;
}

async function main(){
  const rows = await fetchFromSupabase();
  const out = rows.map(r=> ({
    slug: r.slug,
    title: r.title,
    date: typeof r.date === 'string' ? r.date.slice(0,10) : String(r.date).slice(0,10),
    description: r.description || '',
    tags: Array.isArray(r.tags) ? r.tags : [],
    readingMinutes: r.reading_minutes ?? r.readingMinutes ?? 3,
    wordCount: r.word_count ?? r.wordCount ?? 0,
    url: `${SITE}/blog/p/${r.slug}/`,
    file: `${(typeof r.date==='string'? r.date.slice(0,10): String(r.date).slice(0,10))}-${r.slug}.md`,
    cover: r.cover || null,
  }));
  // sort date desc (Supabase already does, but ensure)
  out.sort((a,b)=> b.date.localeCompare(a.date));
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + " \n");
  console.log(`→ ${OUT} (${out.length} posts) — regenerated from Supabase (posts.json is deprecated artifact)`);
  console.log("Note: Do not hand-edit posts.json; edit Supabase `posts` and re-run sync-posts.js");
}

main().catch(e=>{ console.error(e); process.exit(1); });
