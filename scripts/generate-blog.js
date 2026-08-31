#!/usr/bin/env node
"use strict";
/**
 * generate-blog.js — zero-deps static blog builder for hariomlohardev.github.io
 *
 * SOURCE OF TRUTH: Supabase `public.posts` (published=true). There is no file
 * fallback — no posts.json, no posts/*.md. Delete a post in Supabase and the
 * next build deletes its page, its og image and its sitemap entry.
 *
 * A build only ever mirrors Supabase: if the table answers with 0 published
 * posts the blog builds empty. If Supabase is unreachable or unconfigured the
 * build fails loudly instead of quietly wiping pages.
 *
 * Reads Supabase posts → feed.xml + blog/p/<slug>/index.html + og/<slug>.svg,
 * prunes whatever no longer exists, and patches sitemap.xml.
 * Run locally: SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/generate-blog.js
 * Also invoked by .github/workflows/pages.yml before deploy.
 */
const fs = require("fs");
const path = require("path");
require("./load-env")();

const ROOT = path.resolve(__dirname, "..");
const BLOG_P_DIR = path.join(ROOT, "blog", "p");
const FEED_XML = path.join(ROOT, "feed.xml");
const SITEMAP_XML = path.join(ROOT, "sitemap.xml");
const PROJECTS_JSON = path.join(ROOT, "projects-data.json");
const SITE = "https://hariomlohardev.github.io";

// ── helpers ──────────────────────────────────────────────────────────
function escHtml(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function escXml(s){ return escHtml(s); }
function toSlug(s){ return String(s).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,64) || "post"; }
function fmtDate(d){ // YYYY-MM-DD → locale
  try{ return new Date(d+"T00:00:00+05:30").toLocaleDateString("en-GB",{timeZone:"Asia/Kolkata",day:"2-digit",month:"short",year:"numeric"}).toUpperCase(); }catch{ return d; }
}
function parseFrontmatter(raw){
  raw = raw.replace(/\r\n/g, "\n");
  if(!raw.startsWith("---")) return {data:{}, body:raw};
  const end = raw.indexOf("\n---",3);
  if(end===-1) return {data:{}, body:raw};
  const fmRaw = raw.slice(3, end).trim();
  const body = raw.slice(end+4).replace(/^\n/,"");
  const data={};
  let currentKey=null;
  fmRaw.split("\n").forEach(line=>{
    if(!line.trim() || line.trim().startsWith("#")) return;
    const m=line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if(m){
      const k=m[1].trim(), v=m[2].trim();
      if(v==="") { currentKey=k; data[k]=""; return; }
      currentKey=k;
      // try JSON array/bool/number, else strip quotes
      let val=v;
      if((val.startsWith('"')&&val.endsWith('"'))||(val.startsWith("'")&&val.endsWith("'"))) val=val.slice(1,-1);
      if(val==="true") data[k]=true;
      else if(val==="false") data[k]=false;
      else if(val.startsWith("[") && val.endsWith("]")){
        try{ data[k]=JSON.parse(val.replace(/'/g,'"')); }catch{ data[k]=val.slice(1,-1).split(",").map(s=>s.trim().replace(/^["']|["']$/g,"")).filter(Boolean); }
      } else data[k]=val;
    } else if(currentKey && line.match(/^\s*-\s+/)){
      if(!Array.isArray(data[currentKey])) data[currentKey]=[];
      data[currentKey].push(line.replace(/^\s*-\s+/,"").replace(/^["']|["']$/g,"").trim());
    }
  });
  // normalize tags
  if(data.tags && typeof data.tags==="string"){
    const t=data.tags.trim();
    if(t.startsWith("[")) try{ data.tags=JSON.parse(t.replace(/'/g,'"')); }catch{ data.tags=t.split(",").map(s=>s.trim()); }
    else data.tags=[t];
  }
  return {data, body};
}
// one renderer for the whole site — see assets/md.js
const {mdToHtml} = require("../assets/md.js");
function wordCount(s){ return String(s).trim().split(/\s+/).filter(Boolean).length; }

// ── the only posts loader ───────────────────────────────────────────
// Supabase `public.posts` (published=true) is the whole source. Anything that
// goes wrong throws: a build that cannot read Supabase must not rewrite pages.
async function loadPostsFromSupabase(){
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if(!url || !key) throw new Error("SUPABASE_URL + SUPABASE_ANON_KEY (or SERVICE_ROLE_KEY) required — Supabase is the only source of posts");
  {
    const endpoint = `${url.replace(/\/$/,'')}/rest/v1/posts?select=slug,title,description,date,tags,cover,html,raw,word_count,reading_minutes,published&published=eq.true&order=date.desc`;
    const res = await fetch(endpoint, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if(!res.ok){
      const txt = await res.text().catch(()=> '');
      throw new Error(`Supabase posts fetch ${res.status} ${txt.slice(0,200)}`);
    }
    const rows = await res.json();
    if(!Array.isArray(rows)) throw new Error("Supabase posts: unexpected response shape");
    if(rows.length===0){
      console.log("→ posts: Supabase has 0 published posts — the blog builds empty and stale pages get pruned");
      return [];
    }
    const posts = rows.map(r=>{
      const dateStr = typeof r.date === 'string' ? r.date.slice(0,10) : String(r.date||'').slice(0,10);
      const slug = toSlug(r.slug);
      const title = String(r.title||slug);
      const description = String(r.description||'');
      const tags = Array.isArray(r.tags) ? r.tags : [];
      const cover = r.cover ? String(r.cover) : null;
      // `raw` in Supabase still carries the YAML frontmatter (title/date/tags/slug).
      // Strip it, or it renders as literal text plus two <hr /> inside .prose.
      const raw = r.raw != null ? parseFrontmatter(String(r.raw)).body : '';
      // Prefer stored html, else render from raw
      const html = r.html ? String(r.html) : mdToHtml((raw || description).trim());
      const wc = r.word_count ?? r.wordCount ?? (raw ? wordCount(raw) : wordCount(description));
      const reading = r.reading_minutes ?? r.readingMinutes ?? Math.max(1, Math.ceil(wc/200));
      const file = `${dateStr}-${slug}.md`;
      const postUrl = `${SITE}/blog/p/${slug}/`;
      return { slug, title, date: dateStr, description, tags, html, raw, wordCount: wc, readingMinutes: reading, url: postUrl, file, cover };
    }).filter(p=> /^\d{4}-\d{2}-\d{2}$/.test(p.date));
    // Supabase already sorts date desc, but ensure
    posts.sort((a,b)=> b.date.localeCompare(a.date));
    console.log(`→ posts: Supabase (${posts.length} published) — source of truth`);
    return posts;
  }
}

async function getPosts(){
  return { posts: await loadPostsFromSupabase(), source: 'supabase' };
}

// ── generate og/*.svg — per-post OG, Lab Notebook No.01, no deps, $0 ──
function escSvg(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function ogSvg(post){
  const dFmt = fmtDate(post.date);
  const title = post.title.length > 64 ? post.title.slice(0,61)+'…' : post.title;
  const desc = (post.description||'').slice(0,110);
  const tag = (post.tags||[]).includes('daily-log') ? '◎ DAILY LOG' : '✎ ARTICLE';
  // 1200×630
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${escSvg(title)}">
<rect width="1200" height="630" fill="#F6F4EE"/>
<!-- grid 24px subtle -->
<defs><pattern id="g" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0 H0 V24" fill="none" stroke="#E3ECFB" stroke-width="1"/></pattern><pattern id="g2" width="120" height="120" patternUnits="userSpaceOnUse"><path d="M120 0 H0 V120" fill="none" stroke="#C9D8F0" stroke-width="1"/></pattern></defs>
<rect width="1200" height="630" fill="url(#g)"/><rect width="1200" height="630" fill="url(#g2)"/>
<!-- top bar -->
<rect x="0" y="0" width="1200" height="8" fill="#FFD400"/>
<rect x="0" y="8" width="1200" height="1" fill="#0B1220" opacity="0.12"/>
<!-- marginalia -->
<rect x="0" y="0" width="1200" height="40" fill="#0B1220"/>
<text x="32" y="26" fill="#C8D2E6" font-family="monospace" font-size="12" letter-spacing="1.2">LAB NOTEBOOK No.01 · HARIOM LOHAR — hariomlohardev · INDIA — UTC+5:30</text>
<text x="1088" y="26" fill="#8A9AB6" font-family="monospace" font-size="11" text-anchor="end">${escSvg(dFmt)} · ${post.readingMinutes||3} MIN</text>
<!-- tape -->
<rect x="514" y="46" width="172" height="18" rx="2" fill="#FFFFFF" stroke="rgba(11,18,32,0.08)" transform="rotate(-1 600 55)"/>
<!-- sheet -->
<rect x="48" y="64" width="1104" height="518" rx="2" fill="#FFFFFF" stroke="#0B1220" stroke-width="2"/>
<text x="72" y="112" fill="#6E7D9A" font-family="monospace" font-size="11" letter-spacing="1.6">${escSvg(tag)} · ${escSvg(dFmt)}</text>
<text x="72" y="172" fill="#0B1220" font-family="sans-serif" font-size="54" font-weight="800" letter-spacing="-1.2">${escSvg(title)}</text>
<text x="72" y="226" fill="#475569" font-family="sans-serif" font-size="20" letter-spacing="0">${escSvg(desc)}</text>
<line x1="72" y1="260" x2="1128" y2="260" stroke="#D9E2EF" stroke-width="1" stroke-dasharray="6 6"/>
<text x="72" y="300" fill="#0B1220" font-family="monospace" font-size="12" letter-spacing="0.8">By Hariom Lohar (hariomlohardev) · Harvard CS50P 2026 · 1 July 2026 → 31 Dec 2027</text>
<text x="72" y="330" fill="#6E7D9A" font-family="monospace" font-size="11">hariomlohardev.github.io/blog/p/${escSvg(post.slug)}/ · Open notebook, open source.</text>
<rect x="72" y="500" width="180" height="36" fill="#0B1220"/><text x="162" y="523" fill="#FFFEFB" font-family="monospace" font-size="12" text-anchor="middle" letter-spacing="1">OPEN POST →</text>
<text x="1128" y="523" fill="#6E7D9A" font-family="monospace" font-size="11" text-anchor="end">◎ Lab Notebook No.01</text>
</svg>`;
}
const OG_DIR = path.join(ROOT, "og");
try{ fs.mkdirSync(OG_DIR, {recursive:true}); }catch{}

// ── generate blog/p/<slug>/index.html ─────────────────────────────
function postPage(post){
  const dFmt = fmtDate(post.date);
  const tagsHtml = (post.tags||[]).map(t=>`<a href="/blog#tag=${encodeURIComponent(t)}">#${escHtml(t)}</a>`).join(" ");
  const tagLinks = (post.tags||[]).map(t=>`<a href="/blog#tag=${encodeURIComponent(t)}">${escHtml(t)}</a>`).join("");
  const isLog = (post.tags||[]).map(x=>String(x).toLowerCase()).includes('daily-log');
  const typeLabel = isLog ? 'Daily Log' : 'Article';
  const coverUrl = post.cover ? (post.cover.startsWith('http') ? post.cover : (post.cover.startsWith('/') ? SITE + post.cover : SITE + '/' + post.cover)) : null;
  const ogPngUrl = `${SITE}/og/${post.slug}.png`; // rasterized from og/<slug>.svg — crawlers refuse svg
  const ogImage = coverUrl || ogPngUrl;
  const ogImageAlt = post.title + ' — Hariom Lohar · Lab Notebook No.01';
  const canonical = post.url;
  const wordCount = post.wordCount;
  const reading = post.readingMinutes;
  const desc = post.description;
  // Canonical JSON-LD graph: Person#person, WebSite#website, WebPage#webpage, BreadcrumbList#breadcrumb, BlogPosting#article — all reference #person, no duplicate @ids
  const personNode = {"@type":"Person","@id":SITE+"/#person","name":"Hariom Lohar","alternateName":["hariomlohardev","Hariom Lohar hariomlohardev"],"disambiguatingDescription":"The Hariom Lohar at hariomlohardev.github.io — GitHub hariomlohardev, Harvard CS50P 2026 cert 544021b8-ab89-4eb2-a433-9c0b949e658f — not any other person named Hariom Lohar.","identifier":"https://github.com/hariomlohardev","nationality":{"@type":"Country","name":"India"},"givenName":"Hariom","familyName":"Lohar","url":SITE+"/","image":SITE+"/certificates/1.png","jobTitle":"Python / Django / Flutter Developer & AGI Researcher","description":"Hariom Lohar — Harvard CS50P certified 2026. Python, Django, FastAPI & Flutter developer and AGI researcher from India, rebuilding intelligence from first principles since 1 July 2026 in public. GitHub: hariomlohardev. Canonical site hariomlohardev.github.io.","address":{"@type":"PostalAddress","addressCountry":"IN"},"sameAs":["https://github.com/hariomlohardev","https://x.com/HariomloharAGI","https://x.com/hariomlohardev","https://www.linkedin.com/in/hariomlohar","https://dev.to/hariomlohardev","https://huggingface.co/hariomlohardev","https://hashnode.com/@hariomlohardev","https://medium.com/@hariomlohardev",SITE+"/"],"knowsAbout":["Python","Django","FastAPI","Flutter","Dart","LangChain","RAG","NumPy","PyTorch","CNNs","Transformers","Computer Vision","Backpropagation","AGI","Attention","Residual Networks","LayerNorm","Harvard CS50P"],"hasCredential":{"@type":"EducationalOccupationalCredential","name":"CS50's Introduction to Programming with Python","credentialCategory":"certificate","recognizedBy":{"@type":"Organization","name":"Harvard University"},"url":"https://cs50.harvard.edu/certificates/544021b8-ab89-4eb2-a433-9c0b949e658f"}};
  const websiteNode = {"@type":"WebSite","@id":SITE+"/#website","url":SITE+"/","name":"Hariom Lohar — Lab Notebook No.01","alternateName":"hariomlohardev.github.io","description":"Official site of Hariom Lohar (hariomlohardev on GitHub) — Python/Django/Flutter, Harvard CS50P 2026, and AGI research lab notebook.","inLanguage":"en-IN","publisher":{"@id":SITE+"/#person"}};
  const webpageNode = {"@type":"WebPage","@id":canonical+"#webpage","url":canonical,"name":post.title+" — Hariom Lohar","isPartOf":{"@id":SITE+"/#website"},"about":{"@id":SITE+"/#person"},"author":{"@id":SITE+"/#person"},"description":desc,"breadcrumb":{"@id":canonical+"#breadcrumb"},"inLanguage":"en-IN","primaryImageOfPage":{"@type":"ImageObject","contentUrl":ogImage},"datePublished":post.date+"T00:00:00+05:30","dateModified":post.date+"T00:00:00+05:30"};
  const breadcrumbNode = {"@type":"BreadcrumbList","@id":canonical+"#breadcrumb","itemListElement":[{"@type":"ListItem","position":1,"name":"Home — Hariom Lohar","item":SITE+"/"},{"@type":"ListItem","position":2,"name":"Blog","item":SITE+"/blog"},{"@type":"ListItem","position":3,"name":post.title,"item":canonical}]};
  const blogPostingNode = {"@type":"BlogPosting","@id":canonical+"#article","headline":post.title,"name":post.title,"description":desc,"datePublished":post.date+"T00:00:00+05:30","dateModified":post.date+"T00:00:00+05:30","author":{"@id":SITE+"/#person"},"publisher":{"@id":SITE+"/#person"},"mainEntityOfPage":{"@id":canonical+"#webpage"},"url":canonical,"image":ogImage,"keywords":(post.tags||[]).join(", "),"wordCount":post.wordCount,"inLanguage":"en-IN","isPartOf":{"@id":SITE+"/#website"},"about":{"@id":SITE+"/#person"}};
  const jsonLd = {"@context":"https://schema.org","@graph":[personNode, websiteNode, webpageNode, breadcrumbNode, blogPostingNode]};
  // Split title for hero: keep full title, but also use first part for breadcrumb
  const shortCur = post.title.length > 28 ? post.title.slice(0,26)+'…' : post.title;
  const encUrl = encodeURIComponent(post.url);
  const encTitle = encodeURIComponent(post.title + ' — by Hariom Lohar');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="theme-color" content="#F6F4EE" />
<meta name="color-scheme" content="light" />
<title>${escHtml(post.title)} — Hariom Lohar · Lab Notebook №01</title>
<meta name="description" content="${escHtml(desc)}" />
<meta name="author" content="Hariom Lohar" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<link rel="canonical" href="${canonical}" />
<link rel="author" href="https://github.com/hariomlohardev" />
<link rel="me" href="https://github.com/hariomlohardev" />
<link rel="me" href="https://x.com/HariomloharAGI" />
<link rel="me" href="https://www.linkedin.com/in/hariomlohar" />
<link rel="alternate" type="application/rss+xml" title="Hariom Lohar — Blog" href="${SITE}/feed.xml" />
<link rel="manifest" href="/site.webmanifest" />
<link rel="alternate" type="text/plain" href="/llms.txt" title="LLM index — Hariom Lohar" />
<meta property="og:site_name" content="Hariom Lohar — Lab Notebook №01" />
<meta property="og:locale" content="en_IN" />
<meta property="og:url" content="${canonical}" />
<meta property="og:title" content="${escHtml(post.title)} — Hariom Lohar" />
<meta property="og:description" content="${escHtml(desc)}" />
<meta property="og:type" content="article" />
<meta property="article:published_time" content="${post.date}" />
<meta property="og:image" content="${ogImage}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:type" content="image/png" />
<meta property="og:image:alt" content="${escHtml(ogImageAlt)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escHtml(post.title)} — Hariom Lohar" />
<meta name="twitter:description" content="${escHtml(desc)}" />
<meta name="twitter:image" content="${ogImage}" />
<meta name="twitter:creator" content="@HariomloharAGI" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="icon" type="image/png" href="/favicon.png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<script>document.documentElement.classList.add('js')</script>
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="preconnect" href="https://rgmvhptebkslkjleoilc.supabase.co" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/fraunces/latin-400.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/fraunces/latin-600.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/fraunces/latin-400-italic.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/fraunces/latin-600-italic.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/archivo/latin-400.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/archivo/latin-500.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/archivo/latin-600.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/space-mono/latin-400.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/space-mono/latin-400-italic.css">
<style>
:root{
  --paper:#F6F4EE;--paper-2:#EFECE2;--sheet:#FBFAF6;
  --ink:#181611;--ink-2:#37342B;--body:#3B382E;
  --muted:#5F594A;--muted-2:#6E6858;
  --line:#DAD5C6;--line-2:#C4BEAC;
  --accent:#B93A13;--accent-soft:rgba(185,58,19,.12);
  --green:#1E7A4E;--green-soft:rgba(30,122,78,.10);
  --max:1200px;--read:700px;--pad:clamp(20px,4.6vw,60px);
  --serif:'Fraunces',Georgia,serif;--sans:'Archivo',system-ui,sans-serif;--mono:'Space Mono',ui-monospace,'SFMono-Regular',monospace;
  --ease:cubic-bezier(.22,1,.36,1);
}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{font-family:var(--sans);background:var(--paper);color:var(--body);font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased;overflow-x:hidden}
body::after{content:"";position:fixed;inset:0;z-index:120;pointer-events:none;opacity:.05;mix-blend-mode:multiply;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E")}
::selection{background:var(--accent);color:var(--paper)}
a{color:inherit;text-decoration:none}
img{display:block;max-width:100%}
button{font:inherit;background:none;border:none;cursor:pointer;color:inherit}
a:focus-visible,button:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
#prog{position:fixed;top:0;left:0;height:2px;width:0;background:var(--accent);z-index:140}
.wrap{max-width:var(--max);margin:0 auto;padding-left:var(--pad);padding-right:var(--pad);position:relative}
.read{max-width:var(--read);margin:0 auto;padding-left:var(--pad);padding-right:var(--pad)}
.skip{position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden}
.skip:focus{left:16px;top:12px;width:auto;height:auto;padding:9px 14px;background:var(--ink);color:var(--paper);z-index:200;font-family:var(--mono);font-size:12px}
header{position:sticky;top:0;z-index:100;background:rgba(246,244,238,.94);backdrop-filter:saturate(140%) blur(10px);border-bottom:1px solid var(--line);transition:box-shadow .3s var(--ease)}
header.scrolled{box-shadow:0 10px 30px rgba(24,22,17,.07)}
.head-main{display:flex;align-items:center;justify-content:space-between;gap:20px;height:68px}
.logo{display:flex;align-items:center;gap:12px;flex:none}
.logo-mark{width:36px;height:36px;flex:none;transition:transform .3s var(--ease)}
.logo:hover .logo-mark{transform:rotate(-6deg)}
.logo-mark svg{width:100%;height:100%;display:block}
.logo-word{font-family:var(--mono);font-size:13px;letter-spacing:.05em;line-height:1.25;color:var(--ink)}
.logo-word i{display:block;font-style:normal;font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted)}
nav.desk{display:flex;gap:26px}
nav.desk a{font-family:var(--mono);font-size:11.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--muted);padding:6px 0;position:relative;white-space:nowrap;transition:color .2s}
nav.desk a::after{content:"";position:absolute;left:0;bottom:0;height:1.5px;width:100%;background:var(--accent);transform:scaleX(0);transform-origin:left;transition:transform .3s var(--ease)}
nav.desk a:hover{color:var(--ink)}
nav.desk a:hover::after{transform:scaleX(1)}
nav.desk a.active{color:var(--ink)}
nav.desk a.active::after{transform:scaleX(1)}
.head-right{display:flex;align-items:center;gap:12px;flex:none}
.gh-pill{font-family:var(--mono);font-size:11px;letter-spacing:.13em;text-transform:uppercase;border:1px solid var(--ink);padding:10px 14px;display:inline-flex;align-items:center;gap:9px;transition:background .2s,color .2s;color:var(--ink)}
.gh-pill i{width:7px;height:7px;border-radius:50%;background:var(--green);animation:pulse 2.2s infinite}
.gh-pill:hover{background:var(--ink);color:var(--paper)}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(30,122,78,.45)}70%{box-shadow:0 0 0 7px rgba(30,122,78,0)}100%{box-shadow:0 0 0 0 rgba(30,122,78,0)}}
.menu-btn{display:none;align-items:center;gap:10px;font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;border:1px solid var(--ink);color:var(--ink);padding:11px 14px;min-height:44px}
.menu-btn .bars{width:16px;height:10px;position:relative;flex:none}
.menu-btn .bars span{position:absolute;left:0;width:100%;height:1.6px;background:currentColor;transition:transform .25s var(--ease),top .25s var(--ease)}
.menu-btn .bars span:nth-child(1){top:0}
.menu-btn .bars span:nth-child(2){top:8px}
.menu-btn.open .bars span:nth-child(1){top:4px;transform:rotate(45deg)}
.menu-btn.open .bars span:nth-child(2){top:4px;transform:rotate(-45deg)}
.mobile-panel{display:none;position:absolute;left:0;right:0;top:100%;background:var(--paper);border-bottom:1px solid var(--ink);padding:6px var(--pad) 18px;opacity:0;transform:translateY(-8px);visibility:hidden;transition:opacity .28s var(--ease),transform .28s var(--ease),visibility .28s;box-shadow:0 18px 34px rgba(24,22,17,.10);z-index:99}
.mobile-panel.open{opacity:1;transform:none;visibility:visible}
.mobile-panel nav{display:grid;gap:0}
.mobile-panel nav a{font-family:var(--mono);font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink);padding:15px 4px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;min-height:48px}
.mobile-panel nav a .no{font-size:10px;color:var(--accent)}
.mobile-panel nav a.active{color:var(--accent)}
.mp-actions{display:flex;gap:10px;margin-top:16px}
.mp-actions a{flex:1;text-align:center;font-family:var(--mono);font-size:11px;letter-spacing:.13em;text-transform:uppercase;border:1px solid var(--ink);padding:13px 10px;color:var(--ink);min-height:46px;display:flex;align-items:center;justify-content:center}
.mp-actions a.alt{border-color:var(--accent);color:var(--accent)}
.breadcrumb{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);padding-top:clamp(28px,4vw,40px);display:flex;gap:9px;flex-wrap:wrap;align-items:center}
.breadcrumb a{color:var(--muted);transition:color .15s}
.breadcrumb a:hover{color:var(--accent)}
.breadcrumb .sep{color:var(--line-2)}
.breadcrumb .cur{color:var(--ink-2)}
.hero{padding:clamp(48px,8vw,90px) 0 clamp(40px,6vw,64px)}
.eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--ink-2);display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.eyebrow i{width:9px;height:9px;background:var(--accent);flex:none;transform:rotate(45deg)}
.eyebrow .dot{color:var(--line-2)}
.hero h1{font-family:var(--serif);font-weight:600;letter-spacing:-.032em;line-height:1.08;font-size:clamp(2.1rem,5.8vw,3.6rem);margin-top:26px;color:var(--ink)}
.hero h1 em{font-style:italic;font-weight:400}
.lede{margin-top:26px;color:var(--ink-2);font-family:var(--serif);font-style:italic;font-size:clamp(1.15rem,2.4vw,1.35rem);line-height:1.55;max-width:34ch}
.hero-foot{margin-top:34px;display:flex;flex-direction:column;gap:16px}
.meta{display:flex;gap:12px;flex-wrap:wrap;align-items:center;font-family:var(--mono);font-size:11.5px;color:var(--muted)}
.meta b{color:var(--ink);font-weight:400}
.meta .sep{color:var(--line-2)}
.tags{display:flex;gap:18px;flex-wrap:wrap}
.tags a{font-family:var(--mono);font-size:11.5px;letter-spacing:.05em;color:var(--muted);transition:color .15s;padding:2px 0}
.tags a::before{content:"#";color:var(--accent)}
.tags a:hover{color:var(--ink)}
.rule{width:56px;height:2px;background:var(--accent);margin:0 0 clamp(40px,6vw,64px)}
.prose{font-size:17.5px;line-height:1.9;color:var(--body);counter-reset:sec}
.prose h2{font-family:var(--serif);font-weight:600;letter-spacing:-.02em;font-size:1.7rem;line-height:1.25;color:var(--ink);margin:72px 0 18px;counter-increment:sec}
.prose h2:first-child{margin-top:0}
.prose h2::before{content:"§ " counter(sec,decimal-leading-zero);display:block;font-family:var(--mono);font-size:11px;letter-spacing:.22em;color:var(--accent);margin-bottom:14px;font-weight:400}
.prose h3{font-family:var(--serif);font-weight:600;letter-spacing:-.01em;font-size:1.25rem;color:var(--ink);margin:40px 0 14px}
.prose p{margin:24px 0}
.prose a{color:var(--accent);font-weight:500;text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px}
.prose a:hover{background:var(--accent-soft)}
/* an uploaded file — a link that downloads, so it reads as a slip of paper, not prose */
.prose a.dl-file{display:inline-flex;align-items:baseline;gap:9px;max-width:100%;margin:6px 0;padding:9px 13px;background:var(--sheet);border:1px solid var(--line-2);box-shadow:2px 2px 0 var(--paper-2);font-family:var(--mono);font-size:.8em;letter-spacing:.02em;font-weight:400;color:var(--ink);text-decoration:none;overflow-wrap:anywhere}
.prose a.dl-file::before{content:"↓";color:var(--accent);font-weight:700}
.prose a.dl-file:hover{background:var(--accent-soft);border-color:var(--accent);box-shadow:2px 2px 0 var(--accent)}
.prose strong{color:var(--ink);font-weight:600}
.prose blockquote{border-left:3px solid var(--accent);padding:6px 0 6px 26px;margin:36px 0;color:var(--ink-2);font-family:var(--serif);font-style:italic;font-size:1.2rem;line-height:1.6}
.prose ul,.prose ol{margin:22px 0 22px 24px}
.prose li{margin:9px 0}
.prose li::marker{color:var(--accent)}
.prose hr{border:none;border-top:1px solid var(--line);margin:44px 0}
.prose code{font-family:var(--mono);font-size:.85em;background:var(--paper-2);padding:2px 6px;color:var(--ink)}
.prose pre{background:var(--ink);color:var(--paper);padding:20px 22px;overflow-x:auto;font-family:var(--mono);font-size:13px;line-height:1.8;margin:36px 0;border:none}
.prose pre code{background:none;border:none;padding:0;color:inherit;font-size:inherit;white-space:pre}
.prose img{max-width:100%;height:auto;display:block;margin:24px 0;border:1px solid var(--line);background:var(--paper-2)}
.prose img[loading="lazy"]{content-visibility:auto}
.codeblock{margin:38px 0;background:var(--ink);overflow:hidden;box-shadow:0 8px 24px rgba(24,22,17,.10)}
.code-head{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 18px;background:rgba(246,244,238,.05);border-bottom:1px solid rgba(246,244,238,.12)}
.code-lang{font-family:var(--mono);font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:rgba(246,244,238,.5);display:flex;align-items:center;gap:8px}
.code-lang::before{content:"";width:7px;height:7px;background:var(--accent);transform:rotate(45deg)}
.code-copy{font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:rgba(246,244,238,.75);border:1px solid rgba(246,244,238,.22);padding:6px 12px;transition:all .18s var(--ease);background:transparent;min-height:32px}
.code-copy:hover{color:var(--paper);border-color:var(--paper);background:rgba(246,244,238,.08)}
.code-copy.done{color:#8FD7AC;border-color:#8FD7AC}
.codeblock pre{margin:0;background:transparent;padding:20px 22px;box-shadow:none}
.tk-k{color:#E8A15C}
.tk-n{color:#A8CBA0}
.tk-c{color:#8A93A6;font-style:italic}
.endmark{text-align:center;margin-top:64px;color:var(--accent);font-size:14px;letter-spacing:.6em;padding-left:.6em}
.flat-sec{margin-top:clamp(64px,9vw,100px)}
.kicker{font-family:var(--mono);font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--muted);display:flex;align-items:center;gap:10px;margin-bottom:22px}
.kicker i{width:24px;height:1px;background:var(--ink)}
.kicker .sub{text-transform:none;letter-spacing:.02em;color:var(--muted-2);margin-left:auto}
/* — hl rating + comments — Lab Notebook No.01 — svg star smooth */
.hl-card{background:var(--sheet);border:1px solid var(--line);padding:18px}
.hl-stars{display:flex;gap:10px;justify-content:center;align-items:center;padding:12px 0}
.hl-star{width:44px;height:44px;display:grid;place-items:center;border:1px solid var(--line);border-radius:50%;background:var(--paper-2);cursor:pointer;transition:transform .22s var(--ease),background .22s,border-color .22s; color:var(--muted)}
.hl-star svg{width:24px;height:24px;display:block;transition:transform .28s var(--ease), fill .28s var(--ease), stroke .28s var(--ease), filter .28s var(--ease); fill:none; stroke:currentColor}
.hl-star:hover{transform:translateY(-2px) scale(1.06);border-color:var(--accent);background:var(--sheet);color:var(--accent)}
.hl-star:hover svg{transform:scale(1.04)}
.hl-star.on{background:var(--accent);border-color:var(--accent);color:var(--paper);transform:scale(1.08);animation:hlStarPop .5s var(--ease)}
.hl-star.on svg{fill:var(--paper);stroke:var(--paper);filter:drop-shadow(0 1px 6px rgba(0,0,0,.12))}
.hl-star:active{transform:scale(.96)}
@keyframes hlStarPop{0%{transform:scale(.9)}35%{transform:scale(1.18) rotate(-2deg)}65%{transform:scale(.98) rotate(1deg)}100%{transform:scale(1.08) rotate(0)}}
.hl-range{display:none}
.hl-rating-head,.hl-avg,.hl-meta,.hl-dist{display:none !important}
.hl-actions{display:flex;gap:10px;align-items:center;justify-content:center;margin-top:14px;flex-wrap:wrap}
.hl-btn{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;border:1px solid var(--ink);background:var(--ink);color:var(--paper);padding:11px 18px;min-height:42px;transition:transform .15s var(--ease),background .2s,border-color .2s}
.hl-btn:hover{background:var(--accent);border-color:var(--accent)}
.hl-btn:active{transform:translateY(1px)}
.hl-btn.ghost{background:transparent;color:var(--ink)}
.hl-btn.ghost:hover{background:var(--sheet)}
.hl-note{font-family:var(--mono);font-size:11px;color:var(--muted);line-height:1.6;text-align:center;width:100%}
.hl-modal{position:fixed;inset:0;z-index:200;background:rgba(24,22,17,.48);backdrop-filter:blur(4px);display:none;place-items:center;padding:20px}
.hl-modal.open{display:grid}
.hl-modal-card{background:var(--sheet);border:1px solid var(--ink);padding:22px;max-width:420px;width:100%;box-shadow:0 18px 40px rgba(24,22,17,.18);animation:hlIn .35s var(--ease)}
.hl-modal-title{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:10px}
.hl-comments-list{display:grid;gap:14px;margin-top:14px}
.hl-c{border:1px solid var(--line);background:var(--paper-2);padding:14px;animation:hlIn .4s var(--ease)}
@keyframes hlIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.hl-c.mine{border-color:var(--accent);background:var(--sheet);box-shadow:0 2px 12px rgba(185,58,19,.08)}
.hl-c-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.hl-ava{width:28px;height:28px;border-radius:50%;background:var(--ink);color:var(--paper);display:grid;place-items:center;font-family:var(--mono);font-size:11px;flex:none}
.hl-who{font-family:var(--mono);font-size:12px;color:var(--ink);display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.hl-who b{font-weight:600}
.hl-who .hl-time{font-size:11px;color:var(--muted);letter-spacing:.02em}
.hl-body{margin-top:10px;font-size:15px;line-height:1.7;color:var(--body);white-space:pre-wrap;word-break:break-word}
.hl-reply{margin-top:10px;font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);display:inline-flex;gap:6px;align-items:center;border-bottom:1px dashed var(--line-2);padding-bottom:2px}
.hl-reply:hover{color:var(--accent);border-color:var(--accent)}
.hl-children{margin-top:12px;margin-left:14px;border-left:2px solid var(--line);padding-left:12px;display:grid;gap:12px}
.hl-composer{display:grid;gap:10px}
.hl-row{display:flex;gap:10px;flex-wrap:wrap}
.hl-input,.hl-textarea{width:100%;font-family:var(--sans);font-size:14px;border:1px solid var(--line-2);background:var(--sheet);color:var(--ink);padding:11px 12px;outline:none;transition:border-color .18s,box-shadow .18s}
.hl-input:focus,.hl-textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.hl-textarea{min-height:92px;resize:vertical;line-height:1.6}
.hl-input{flex:1;min-width:160px}
.hl-hint{font-family:var(--mono);font-size:11px;color:var(--muted);line-height:1.6}
.hl-empty{font-family:var(--mono);font-size:12px;color:var(--muted);border:1px dashed var(--line-2);padding:14px;background:var(--sheet)}
.share-row{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.share-btn{font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;border:1px solid var(--line-2);background:transparent;padding:12px 16px;transition:all .18s var(--ease);display:inline-flex;align-items:center;gap:8px;min-height:46px;color:var(--ink-2)}
.share-btn:hover{border-color:var(--ink);color:var(--ink);background:var(--sheet)}
.post-nav{margin-top:clamp(56px,8vw,84px);padding-top:36px;border-top:1px solid var(--line);display:flex;gap:14px;flex-wrap:wrap}
.btn{font-family:var(--mono);font-size:11.5px;letter-spacing:.15em;text-transform:uppercase;padding:15px 22px;border:1px solid var(--ink);display:inline-flex;align-items:center;gap:10px;min-height:48px;color:var(--ink);transition:background .2s,color .2s,transform .2s var(--ease)}
.btn:hover{background:var(--ink);color:var(--paper)}
.btn.solid{background:var(--ink);color:var(--paper)}
.btn.solid:hover{background:var(--accent);border-color:var(--accent)}
.btn:active{transform:translateY(1px)}
footer{border-top:1px solid var(--ink);margin-top:clamp(56px,8vw,84px);background:var(--paper)}
.foot-in{display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:center;padding:26px 0;font-family:var(--mono);font-size:10.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--muted);line-height:2}
.foot-in a:hover{color:var(--accent)}
.foot-in .top-btn{border:1px solid var(--line-2);padding:10px 14px;min-height:42px;transition:all .15s;color:var(--ink-2)}
.foot-in .top-btn:hover{border-color:var(--ink);background:var(--ink);color:var(--paper)}
.kbd{border:1px solid var(--line-2);padding:2px 6px;border-radius:3px;color:var(--ink);font-weight:600;background:var(--paper)}
html.js .rv{opacity:0;transform:translateY(16px);transition:opacity .6s var(--ease),transform .6s var(--ease)}
html.js .rv.in{opacity:1;transform:none}
html:not(.js) .rv{opacity:1;transform:none}
@media(max-width:1120px){
  nav.desk{gap:18px}
}
@media(max-width:980px){
  nav.desk{gap:12px}
  nav.desk a{font-size:11px;letter-spacing:.09em}
}
@media(max-width:760px){
  nav.desk{display:none}
  .menu-btn{display:inline-flex}
  .mobile-panel{display:block}
  .gh-pill{display:none}
}
@media(max-width:640px){
  :root{--pad:20px}
  .head-main{height:62px}
  .logo-mark{width:31px;height:31px}
  .prose{font-size:16px}
  .prose h2{font-size:1.4rem;margin:56px 0 16px}
  .prose pre,.codeblock pre{font-size:11.5px;padding:16px}
  .post-nav .btn{flex:1;justify-content:center}
  .foot-in{flex-direction:column;align-items:flex-start}
  .foot-in .top-btn{width:100%;text-align:center}
}
@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{animation:none!important;transition:none!important}
  html{scroll-behavior:auto}
}
@media print{
  header,#prog,.flat-sec,.post-nav,footer,body::after{display:none!important}
  body{background:#fff}
  .codeblock{box-shadow:none}
}
</style>
</head>
<body>
<a href="#main" class="skip">Skip to content</a>
<div id="prog" aria-hidden="true"></div>
<header id="top">
  <div class="wrap">
    <div class="head-main">
      <a class="logo" href="/" aria-label="Hariom Lohar — home">
        <span class="logo-mark" aria-hidden="true">
          <svg viewBox="0 0 44 44" fill="none">
            <path d="M7 6 V38" stroke="#181611" stroke-width="5"/>
            <path d="M23 6 V38" stroke="#181611" stroke-width="5"/>
            <path d="M7 22 H23" stroke="#B93A13" stroke-width="5"/>
            <path d="M23 38 H38" stroke="#181611" stroke-width="5"/>
            <circle cx="37" cy="7" r="3.4" fill="#B93A13"/>
          </svg>
        </span>
        <span class="logo-word">hariomlohardev<i>lab notebook №01</i></span>
      </a>
      <nav class="desk" aria-label="Primary">
        <a href="/">Home</a>
        <a href="/projects">Projects</a>
        <a href="/opensource">Open Source</a>
        <a href="/blog" class="active" aria-current="page">Blog</a>
        <a href="/tricks">Tricks</a>
        <a href="/about">About</a>
        <a href="/contact">Contact</a>
        <a href="/community">Community</a>
      </nav>
      <div class="head-right">
        <a class="gh-pill" href="https://github.com/hariomlohardev" target="_blank" rel="noopener"><i aria-hidden="true"></i><span>Github&nbsp;↗</span></a>
        <button class="menu-btn" id="menuBtn" aria-expanded="false" aria-controls="mobilePanel" aria-label="Open menu">
          <span class="bars" aria-hidden="true"><span></span><span></span></span> Menu
        </button>
      </div>
    </div>
  </div>
  <div class="mobile-panel" id="mobilePanel" aria-hidden="true">
    <nav aria-label="Mobile primary">
      <a href="/"><span>Home</span><span class="no">01</span></a>
      <a href="/projects"><span>Projects</span><span class="no">02</span></a>
      <a href="/opensource"><span>Open Source</span><span class="no">03</span></a>
      <a href="/blog" class="active"><span>Blog &amp; Logs</span><span class="no">04</span></a>
      <a href="/tricks"><span>Tricks</span><span class="no">05</span></a>
      <a href="/about"><span>About</span><span class="no">06</span></a>
      <a href="/contact"><span>Contact</span><span class="no">07</span></a>
      <a href="/community"><span>Community</span><span class="no">08</span></a>
    </nav>
    <div class="mp-actions">
      <a href="/feed.xml">RSS Feed</a>
      <a class="alt" href="https://github.com/hariomlohardev" target="_blank" rel="noopener">GitHub ↗</a>
    </div>
  </div>
</header>
<main id="main">
  <div class="read">
    <div class="breadcrumb">
      <a href="/">Hariom Lohar</a><span class="sep">/</span>
      <a href="/blog">Blog</a><span class="sep">/</span>
      <span class="cur">${escHtml(shortCur)}</span>
    </div>
    <div class="hero">
      <p class="eyebrow rv"><i aria-hidden="true"></i>
        <span>${escHtml(typeLabel)}</span><span class="dot">·</span>
        <span>${escHtml(dFmt)}</span><span class="dot">·</span>
        <span>${reading} min read</span>
      </p>
      <h1 class="rv">${escHtml(post.title)}</h1>
      <p class="lede rv">${escHtml(desc)}</p>
      <div class="hero-foot rv">
        <div class="meta">
          <span><b>By Hariom Lohar</b> (hariomlohardev)</span>
          <span class="sep">·</span><span>${wordCount} words</span>
          <span class="sep">·</span><span>committed in public</span>
        </div>
        <div class="tags">${(post.tags||[]).map(t=>`<a href="/blog#tag=${encodeURIComponent(t)}">${escHtml(t)}</a>`).join("")}</div>
      </div>
    </div>
    <div class="rule" aria-hidden="true"></div>
    <article class="rv">
      <div class="prose">
${post.html}
      </div>
      <div class="endmark" aria-hidden="true">◆</div>
    </article>
    <section class="flat-sec rv" id="hl-rating" aria-label="Rate this post" data-slug="${post.slug}">
      <div class="kicker"><i></i> Rate this log <span class="sub">tap a star · smooth</span></div>
      <div class="hl-card" id="hlRatingCard" style="text-align:center">
        <div class="hl-stars" id="hlStars" role="radiogroup" aria-label="Rate 1 to 5">
          <button type="button" class="hl-star" data-v="1" aria-label="1 star"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13.7276 3.44418L15.4874 6.99288C15.7274 7.48687 16.3673 7.9607 16.9073 8.05143L20.0969 8.58575C22.1367 8.92853 22.6167 10.4206 21.1468 11.8925L18.6671 14.3927C18.2471 14.8161 18.0172 15.6327 18.1471 16.2175L18.8571 19.3125C19.417 21.7623 18.1271 22.71 15.9774 21.4296L12.9877 19.6452C12.4478 19.3226 11.5579 19.3226 11.0079 19.6452L8.01827 21.4296C5.8785 22.71 4.57865 21.7522 5.13859 19.3125L5.84851 16.2175C5.97849 15.6327 5.74852 14.8161 5.32856 14.3927L2.84884 11.8925C1.389 10.4206 1.85895 8.92853 3.89872 8.58575L7.08837 8.05143C7.61831 7.9607 8.25824 7.48687 8.49821 6.99288L10.258 3.44418C11.2179 1.51861 12.7777 1.51861 13.7276 3.44418Z"></path></svg></button>
          <button type="button" class="hl-star" data-v="2" aria-label="2 stars"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13.7276 3.44418L15.4874 6.99288C15.7274 7.48687 16.3673 7.9607 16.9073 8.05143L20.0969 8.58575C22.1367 8.92853 22.6167 10.4206 21.1468 11.8925L18.6671 14.3927C18.2471 14.8161 18.0172 15.6327 18.1471 16.2175L18.8571 19.3125C19.417 21.7623 18.1271 22.71 15.9774 21.4296L12.9877 19.6452C12.4478 19.3226 11.5579 19.3226 11.0079 19.6452L8.01827 21.4296C5.8785 22.71 4.57865 21.7522 5.13859 19.3125L5.84851 16.2175C5.97849 15.6327 5.74852 14.8161 5.32856 14.3927L2.84884 11.8925C1.389 10.4206 1.85895 8.92853 3.89872 8.58575L7.08837 8.05143C7.61831 7.9607 8.25824 7.48687 8.49821 6.99288L10.258 3.44418C11.2179 1.51861 12.7777 1.51861 13.7276 3.44418Z"></path></svg></button>
          <button type="button" class="hl-star" data-v="3" aria-label="3 stars"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13.7276 3.44418L15.4874 6.99288C15.7274 7.48687 16.3673 7.9607 16.9073 8.05143L20.0969 8.58575C22.1367 8.92853 22.6167 10.4206 21.1468 11.8925L18.6671 14.3927C18.2471 14.8161 18.0172 15.6327 18.1471 16.2175L18.8571 19.3125C19.417 21.7623 18.1271 22.71 15.9774 21.4296L12.9877 19.6452C12.4478 19.3226 11.5579 19.3226 11.0079 19.6452L8.01827 21.4296C5.8785 22.71 4.57865 21.7522 5.13859 19.3125L5.84851 16.2175C5.97849 15.6327 5.74852 14.8161 5.32856 14.3927L2.84884 11.8925C1.389 10.4206 1.85895 8.92853 3.89872 8.58575L7.08837 8.05143C7.61831 7.9607 8.25824 7.48687 8.49821 6.99288L10.258 3.44418C11.2179 1.51861 12.7777 1.51861 13.7276 3.44418Z"></path></svg></button>
          <button type="button" class="hl-star" data-v="4" aria-label="4 stars"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13.7276 3.44418L15.4874 6.99288C15.7274 7.48687 16.3673 7.9607 16.9073 8.05143L20.0969 8.58575C22.1367 8.92853 22.6167 10.4206 21.1468 11.8925L18.6671 14.3927C18.2471 14.8161 18.0172 15.6327 18.1471 16.2175L18.8571 19.3125C19.417 21.7623 18.1271 22.71 15.9774 21.4296L12.9877 19.6452C12.4478 19.3226 11.5579 19.3226 11.0079 19.6452L8.01827 21.4296C5.8785 22.71 4.57865 21.7522 5.13859 19.3125L5.84851 16.2175C5.97849 15.6327 5.74852 14.8161 5.32856 14.3927L2.84884 11.8925C1.389 10.4206 1.85895 8.92853 3.89872 8.58575L7.08837 8.05143C7.61831 7.9607 8.25824 7.48687 8.49821 6.99288L10.258 3.44418C11.2179 1.51861 12.7777 1.51861 13.7276 3.44418Z"></path></svg></button>
          <button type="button" class="hl-star" data-v="5" aria-label="5 stars"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13.7276 3.44418L15.4874 6.99288C15.7274 7.48687 16.3673 7.9607 16.9073 8.05143L20.0969 8.58575C22.1367 8.92853 22.6167 10.4206 21.1468 11.8925L18.6671 14.3927C18.2471 14.8161 18.0172 15.6327 18.1471 16.2175L18.8571 19.3125C19.417 21.7623 18.1271 22.71 15.9774 21.4296L12.9877 19.6452C12.4478 19.3226 11.5579 19.3226 11.0079 19.6452L8.01827 21.4296C5.8785 22.71 4.57865 21.7522 5.13859 19.3125L5.84851 16.2175C5.97849 15.6327 5.74852 14.8161 5.32856 14.3927L2.84884 11.8925C1.389 10.4206 1.85895 8.92853 3.89872 8.58575L7.08837 8.05143C7.61831 7.9607 8.25824 7.48687 8.49821 6.99288L10.258 3.44418C11.2179 1.51861 12.7777 1.51861 13.7276 3.44418Z"></path></svg></button>
        </div>
        <input class="hl-range" id="hlRange" type="range" min="1" max="5" step="1" value="3" aria-hidden="true" tabindex="-1" />
        <div class="hl-actions">
          <button type="button" class="hl-btn" id="hlRateBtn">Rate →</button>
          <span class="hl-note" id="hlRateNote">thanks for rating</span>
        </div>
      </div>
    </section>
    <section class="flat-sec rv" id="hl-comments" aria-label="Comments" data-slug="${post.slug}">
      <div class="kicker"><i></i> Discuss — replies · rating <span class="sub" id="hlCSub">0 comments</span></div>
      <div class="hl-card hl-composer" id="hlComposer">
        <textarea class="hl-textarea" id="hlText" maxlength="2000" placeholder="Share a thought — reply threads, plain text, 2000 max…"></textarea>
        <div class="hl-row" style="align-items:center;justify-content:space-between">
          <span class="hl-hint" id="hlReplyHint" style="display:none">↳ Replying to <b id="hlReplyWho"></b> · <button type="button" class="hl-reply" id="hlCancelReply" style="border:none;background:none;padding:0;color:var(--accent)">cancel</button></span>
          <span class="hl-hint" id="hlHint">cookie hl_cid · name saved after first comment</span>
        </div>
        <div class="hl-actions" style="margin-top:2px">
          <button type="button" class="hl-btn" id="hlPost">Post comment →</button>
          <span class="hl-note" id="hlPostNote"></span>
        </div>
      </div>
      <div class="hl-comments-list" id="hlList" style="margin-top:16px"></div>
      <noscript><p class="hl-hint" style="margin-top:12px">Enable JavaScript to load comments — served from Supabase, no GitHub login.</p></noscript>
    </section>
    <div class="hl-modal" id="hlNameModal" aria-hidden="true" style="display:none">
      <div class="hl-modal-card">
        <div class="hl-modal-title">What's your name?</div>
        <input class="hl-input" id="hlName" type="text" maxlength="32" placeholder="Your name — saved in cookie" autocomplete="nickname" />
        <div style="font-family:var(--mono);font-size:11px;color:var(--muted);margin-top:8px">Stored as hl_name cookie · skip to post as Anonymous</div>
        <div style="display:flex;gap:10px;margin-top:14px;justify-content:flex-end">
          <button type="button" class="hl-btn ghost" id="hlNameSkip">Skip → Anonymous</button>
          <button type="button" class="hl-btn" id="hlNameContinue">Continue →</button>
        </div>
      </div>
    </div>
    <section class="flat-sec rv" aria-label="Share this post">
      <div class="kicker"><i></i> Share — Lab Notebook №01</div>
      <div class="share-row">
        <button type="button" class="share-btn" id="copyBtn">Copy link</button>
        <a class="share-btn" href="https://twitter.com/intent/tweet?url=${encUrl}&text=${encTitle}" target="_blank" rel="noopener">X ↗</a>
        <a class="share-btn" href="https://www.linkedin.com/sharing/share-offsite/?url=${encUrl}" target="_blank" rel="noopener">LinkedIn ↗</a>
      </div>
    </section>
    <div class="post-nav rv">
      <a href="/blog" class="btn">← Back to blog</a>
      <a href="https://github.com/hariomlohardev" target="_blank" rel="noopener" class="btn solid">Follow on GitHub ↗</a>
    </div>
  </div>
</main>
<footer>
  <div class="wrap foot-in">
    <span>© ${new Date().getFullYear()} Hariom Lohar — Lab Notebook №01</span>
    <span><a href="/blog">Blog</a> · <a href="/feed.xml">RSS</a> · press <span class="kbd">G</span> → github</span>
    <button class="top-btn" id="topBtn" type="button">Back to top ↑</button>
  </div>
</footer>
<script>
(function(){
"use strict";
var reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var _yr=document.getElementById('yr'); if(_yr) _yr.textContent=new Date().getFullYear();
function copyText(text,btn,label){
  function done(){
    if(!btn)return;
    var old=btn.textContent;
    btn.textContent='Copied ✓';btn.classList.add('done');
    setTimeout(function(){btn.textContent=label||old;btn.classList.remove('done');},1600);
  }
  function fallback(){
    var ta=document.createElement('textarea');
    ta.value=text;ta.style.position='fixed';ta.style.opacity='0';
    document.body.appendChild(ta);ta.focus();ta.select();
    try{document.execCommand('copy');done();}catch(e){}
    document.body.removeChild(ta);
  }
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(done).catch(fallback);
  }else fallback();
}
function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function highlightPython(src){
  return src.split('\\n').map(function(line){
    var ci=line.indexOf('#');
    var code=ci>-1?line.slice(0,ci):line;
    var comment=ci>-1?line.slice(ci):'';
    var out=escHtml(code)
      .replace(/\\b(def|return|for|in|range|import|from|as|if|elif|else|lambda|class|None|True|False)\\b/g,'<span class="tk-k">$1</span>')
      .replace(/\\b(\\d+\\.?\\d*(?:e-?\\d+)?)\\b/g,'<span class="tk-n">$1</span>');
    if(comment)out+='<span class="tk-c">'+escHtml(comment)+'</span>';
    return out;
  }).join('\\n');
}
function enhanceCode(){
  document.querySelectorAll('.prose pre').forEach(function(pre){
    var codeEl=pre.querySelector('code')||pre;
    var m=(codeEl.className||'').match(/lang(?:uage)?-([a-z0-9]+)/i);
    var lang=m?m[1].toLowerCase():'';
    var fig=document.createElement('div');fig.className='codeblock';
    pre.parentNode.insertBefore(fig,pre);
    var head=document.createElement('div');head.className='code-head';
    var lab=document.createElement('span');lab.className='code-lang';
    lab.textContent=lang==='math'?'equation':(lang||'code');
    var btn=document.createElement('button');btn.type='button';btn.className='code-copy';
    btn.textContent='Copy';btn.setAttribute('aria-label','Copy code to clipboard');
    btn.addEventListener('click',function(){copyText(codeEl.innerText,btn,'Copy');});
    head.appendChild(lab);head.appendChild(btn);
    fig.appendChild(head);
    fig.appendChild(pre);
    if(lang==='python'){codeEl.innerHTML=highlightPython(codeEl.textContent);}
  });
}
enhanceCode();
var hdr=document.querySelector('header'),prog=document.getElementById('prog'),qd=false;
function onScroll(){if(qd)return;qd=true;requestAnimationFrame(function(){qd=false;var h=document.documentElement.scrollHeight-window.innerHeight;if(prog)prog.style.width=(h>0?(window.scrollY/h)*100:0)+'%';if(hdr)hdr.classList.toggle('scrolled',window.scrollY>8);});}
window.addEventListener('scroll',onScroll,{passive:true});onScroll();
var menuBtn=document.getElementById('menuBtn'),panel=document.getElementById('mobilePanel');
function setMenu(o){menuBtn.setAttribute('aria-expanded',String(o));menuBtn.setAttribute('aria-label',o?'Close menu':'Open menu');menuBtn.classList.toggle('open',o);panel.classList.toggle('open',o);panel.setAttribute('aria-hidden',String(!o));}
menuBtn.addEventListener('click',function(){setMenu(menuBtn.getAttribute('aria-expanded')!=='true');});
panel.querySelectorAll('a').forEach(function(a){a.addEventListener('click',function(){setMenu(false);});});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&panel.classList.contains('open'))setMenu(false);});
document.addEventListener('click',function(e){if(panel.classList.contains('open')&&!panel.contains(e.target)&&!menuBtn.contains(e.target))setMenu(false);});
window.addEventListener('resize',function(){if(window.innerWidth>760&&panel.classList.contains('open'))setMenu(false);});
function observeReveals(){
  var els=document.querySelectorAll('.rv:not(.in)');
  if('IntersectionObserver' in window&&!reduced){
    var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{threshold:.08});
    els.forEach(function(el,i){el.style.transitionDelay=(Math.min(i,5)*45)+'ms';io.observe(el);});
  }else els.forEach(function(el){el.classList.add('in');});
}
observeReveals();
window.addEventListener('keydown',function(e){if(e.metaKey||e.ctrlKey||e.altKey)return;var t=(document.activeElement&&document.activeElement.tagName)||'';if(t==='INPUT'||t==='TEXTAREA')return;if(e.key==='g'||e.key==='G')window.open('https://github.com/hariomlohardev','_blank','noopener');});
document.getElementById('topBtn').addEventListener('click',function(){window.scrollTo({top:0,behavior:reduced?'auto':'smooth'});});
document.getElementById('copyBtn').addEventListener('click',function(){
  copyText('${canonical}',this,'Copy link');
});
/* — HL rating + comments (cookie hl_cid + optional name) — */
(function(){
  var slug='${post.slug}';
  function q(s){return document.querySelector(s)}
  function el(s){return document.getElementById(s)}
  // — cookie + client id —
  function getCookie(n){try{var m=document.cookie.match(new RegExp('(?:^|; )'+n.replace(/[-\\\\^$*+?.()|\\[\\]{}]/g,'\\\\$&')+'=([^;]*)'));return m?decodeURIComponent(m[1]):''}catch(e){return ''}}
  function setCookie(n,v){try{document.cookie=n+'='+encodeURIComponent(v)+'; path=/; max-age='+60*60*24*365+'; SameSite=Lax'}catch(e){} try{localStorage.setItem(n,v)}catch(e){}}
  function getCid(){var c=''; try{c=localStorage.getItem('hl_cid')||''}catch(e){} if(!c) c=getCookie('hl_cid'); if(!c){ try{c=crypto.randomUUID().replace(/-/g,'')}catch(e){c=Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2)} c=c.replace(/[^A-Za-z0-9]/g,'').slice(0,24)||('hl'+Date.now()); } c=c.replace(/[^A-Za-z0-9_-]/g,'').slice(0,32); if(c.length<6) c='hl-'+c+Date.now(); setCookie('hl_cid',c); try{localStorage.setItem('hl_cid',c)}catch(e){} return c}
  function getName(){var n=''; try{n=localStorage.getItem('hl_name')||''}catch(e){} if(!n) n=getCookie('hl_name'); return (n||'').trim().slice(0,32)}
  function setName(n){n=(n||'').trim().slice(0,32); if(!n) return; setCookie('hl_name',n); try{localStorage.setItem('hl_name',n)}catch(e){}}
  var CID=getCid();
  var nameInput=el('hlName'), textInput=el('hlText');
  if(nameInput && getName()) nameInput.value=getName();
  // — rating — hugeicons smooth, no previous display
  var starsEl=el('hlStars'), rangeEl=el('hlRange'), rateBtn=el('hlRateBtn'), rateNote=el('hlRateNote');
  var selected = parseInt(rangeEl && rangeEl.value || '3',10) || 3;
  function updateStars(val){
    if(!starsEl) return;
    var stars=starsEl.querySelectorAll('.hl-star');
    stars.forEach(function(b){
      var v=parseInt(b.getAttribute('data-v'),10);
      b.classList.toggle('on', v<=val);
      b.setAttribute('aria-pressed', v<=val ? 'true':'false');
    });
    if(rangeEl) rangeEl.value=val;
  }
  updateStars(selected);
  if(starsEl){
    starsEl.querySelectorAll('.hl-star').forEach(function(btn){
      btn.addEventListener('click',function(){
        var v=parseInt(btn.getAttribute('data-v'),10);
        selected=v;
        updateStars(v);
        if(!reduced){ btn.classList.remove('on'); void btn.offsetWidth; btn.classList.add('on'); updateStars(v); }
      });
      btn.addEventListener('mouseenter',function(){
        var v=parseInt(btn.getAttribute('data-v'),10);
        var stars=starsEl.querySelectorAll('.hl-star');
        stars.forEach(function(b){ var bv=parseInt(b.getAttribute('data-v'),10); b.classList.toggle('on', bv<=v); });
      });
    });
    starsEl.addEventListener('mouseleave',function(){ updateStars(selected); });
  }
  if(rangeEl){ rangeEl.addEventListener('input',function(){ var v=parseInt(rangeEl.value||'3',10); selected=v; updateStars(v); }); }
  if(rateBtn){ rateBtn.addEventListener('click',function(){
    var v=selected; if(!(v>=1&&v<=5)) return;
    var nm=(nameInput&&nameInput.value||'').trim().slice(0,32);
    if(nm) setName(nm);
    rateBtn.disabled=true; rateBtn.textContent='…';
    fetch('/api/blog/social?type=ratings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:slug,score:v,client_id:CID,author_name:nm||getName()||'Anonymous'})}).then(function(r){return r.json()}).then(function(j){
      if(!j||!j.ok) throw new Error(j&&j.error||'failed');
      rateBtn.textContent='Rated ✓';
      if(rateNote){ rateNote.textContent='thanks for rating'; rateNote.style.display=''; }
      updateStars(v);
      if(v===5 && !reduced){
        var c=document.createElement('div'); c.textContent='✦ Thanks — 5/5 ✦'; c.style.cssText='position:fixed;left:50%;top:18%;transform:translateX(-50%);background:var(--ink);color:var(--paper);font-family:var(--mono);font-size:12px;letter-spacing:.12em;padding:10px 16px;border:1px solid var(--accent);z-index:999;animation:hlIn .5s var(--ease)'; document.body.appendChild(c); setTimeout(function(){c.remove()},2200);
      }
      setTimeout(function(){rateBtn.disabled=false; rateBtn.textContent='Rate →';},1800);
    }).catch(function(e){ rateBtn.disabled=false; rateBtn.textContent='Rate →'; if(rateNote){ rateNote.textContent=e.message||'failed'; rateNote.style.display=''; setTimeout(function(){rateNote.textContent='thanks for rating'},2500); } });
  }); }
  // — comments — with name modal (no inline name, popup if no hl_name)
  var listEl=el('hlList'), cSub=el('hlCSub'), postBtn=el('hlPost'), postNote=el('hlPostNote'), replyHint=el('hlReplyHint'), replyWho=el('hlReplyWho'), cancelReply=el('hlCancelReply');
  var nameModal=el('hlNameModal'), nameContinue=el('hlNameContinue'), nameSkip=el('hlNameSkip');
  var replyTo=null;
  var pendingContent=null, pendingReplyTo=null;
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
  function timeAgo(iso){try{var d=new Date(iso),s=Math.floor((Date.now()-d)/1000); if(s<60) return 'just now'; if(s<3600) return Math.floor(s/60)+'m ago'; if(s<86400) return Math.floor(s/3600)+'h ago'; if(s<2592000) return Math.floor(s/86400)+'d ago'; return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}catch(e){return ''}}
  function setReply(id,name){ replyTo=id; replyWho.textContent=name||'Anonymous'; replyHint.style.display=''; if(textInput){textInput.focus(); textInput.placeholder='Reply to '+(name||'Anonymous')+'…'} }
  function clearReply(){ replyTo=null; replyHint.style.display='none'; if(textInput) textInput.placeholder='Share a thought — reply threads, plain text, 2000 max…'; }
  if(cancelReply) cancelReply.addEventListener('click',clearReply);
  function renderComments(rows){
    if(!listEl) return;
    if(!rows||!rows.length){ listEl.innerHTML='<div class="hl-empty">No comments yet — be the first to log a note.</div>'; if(cSub) cSub.textContent='0 comments'; return; }
    if(cSub) cSub.textContent=rows.length+' comment'+(rows.length===1?'':'s');
    var map={}; rows.forEach(function(r){ map[r.id]=Object.assign({},r,{children:[]}); });
    var roots=[];
    rows.forEach(function(r){ var n=map[r.id]; if(r.parent_id && map[r.parent_id]) map[r.parent_id].children.push(n); else roots.push(n); });
    function nodeHtml(n,depth){
      var isMine=n.client_id===CID;
      var ava=(n.author_name||'A').trim().charAt(0).toUpperCase()||'A';
      var html='<div class="hl-c'+(isMine?' mine':'')+'"><div class="hl-c-head"><span class="hl-ava">'+esc(ava)+'</span><span class="hl-who"><b>'+esc(n.author_name||'Anonymous')+'</b>'+(isMine?' <span style="font-size:10px;letter-spacing:.08em;color:var(--accent)">· you</span>':'')+'<span class="hl-time">· '+esc(timeAgo(n.created_at))+'</span></span></div><div class="hl-body">'+esc(n.content)+'</div><button type="button" class="hl-reply" data-reply="'+esc(n.id)+'" data-who="'+esc(n.author_name||'Anonymous')+'">↳ Reply</button>';
      if(n.children&&n.children.length){
        html+='<div class="hl-children">';
        n.children.forEach(function(ch){ html+=nodeHtml(ch,depth+1); });
        html+='</div>';
      }
      html+='</div>';
      return html;
    }
    var out=''; roots.forEach(function(r){ out+=nodeHtml(r,0); });
    listEl.innerHTML=out;
    listEl.querySelectorAll('[data-reply]').forEach(function(b){ b.addEventListener('click',function(){ setReply(b.getAttribute('data-reply'), b.getAttribute('data-who')); window.scrollTo({top: document.getElementById('hlComposer').offsetTop - 88, behavior: reduced?'auto':'smooth'}); }); });
  }
  function fetchComments(){
    fetch('/api/blog/social?type=comments&slug='+encodeURIComponent(slug)).then(function(r){return r.json()}).then(function(j){ if(j&&j.ok) renderComments(j.comments||[]); }).catch(function(){});
  }
  fetchComments();
  function showNameModal(){
    if(nameModal){ nameModal.style.display='grid'; nameModal.classList.add('open'); nameModal.setAttribute('aria-hidden','false'); if(nameInput){ nameInput.value=getName()||''; setTimeout(function(){nameInput.focus()},50); } document.body.style.overflow='hidden'; }
  }
  function hideNameModal(){ if(nameModal){ nameModal.style.display='none'; nameModal.classList.remove('open'); nameModal.setAttribute('aria-hidden','true'); document.body.style.overflow=''; } }
  if(nameModal){
    nameModal.addEventListener('click',function(e){ if(e.target===nameModal) hideNameModal(); });
    document.addEventListener('keydown',function(e){ if(e.key==='Escape' && nameModal.classList.contains('open')) hideNameModal(); });
  }
  if(nameContinue) nameContinue.addEventListener('click',function(){
    var nm=(nameInput&&nameInput.value||'').trim().slice(0,32);
    if(nm) setName(nm);
    hideNameModal();
    if(pendingContent!==null){ var c=pendingContent; var r=pendingReplyTo; pendingContent=null; pendingReplyTo=null; doPost(c, r, nm||getName()||'Anonymous'); }
  });
  if(nameSkip) nameSkip.addEventListener('click',function(){
    hideNameModal();
    if(pendingContent!==null){ var c=pendingContent; var r=pendingReplyTo; pendingContent=null; pendingReplyTo=null; doPost(c, r, 'Anonymous'); }
  });
  if(nameInput) nameInput.addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); if(nameContinue) nameContinue.click(); } });
  function doPost(content, replyId, authorName){
    postBtn.disabled=true; postBtn.textContent='Posting…'; postNote.textContent='';
    fetch('/api/blog/social?type=comments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:slug,content:content,author_name:authorName,parent_id:replyId,client_id:CID})}).then(function(r){return r.json().then(function(j){ return {status:r.status, body:j};})}).then(function(x){
      if(!x.body||!x.body.ok) throw new Error(x.body&&x.body.error||'failed ('+x.status+')');
      if(textInput) textInput.value=''; clearReply(); postNote.textContent='posted ✓';
      fetchComments();
      setTimeout(function(){postNote.textContent=''},2000);
    }).catch(function(e){ postNote.textContent=e.message||'failed'; }).finally(function(){ postBtn.disabled=false; postBtn.textContent='Post comment →'; });
  }
  if(postBtn){ postBtn.addEventListener('click',function(){
    var content=(textInput&&textInput.value||'').trim();
    if(!content){ postNote.textContent='write something first'; textInput.focus(); return; }
    if(content.length>2000){ postNote.textContent='max 2000 chars'; return; }
    var stored=getName();
    if(!stored){
      pendingContent=content; pendingReplyTo=replyTo;
      showNameModal();
      return;
    }
    doPost(content, replyTo, stored);
  }); }
  if(textInput){ textInput.addEventListener('keydown',function(e){ if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){ postBtn.click(); } }); }
})();
})();
</script>
<script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "7c8c6879055d45ba894f6ac0ce1cc51a"}'></script>
<script type="module" src="/assets/speed-insights.js"></script>
</body>
</html>`;
}

async function main(){
  const { posts, source } = await getPosts();

  // ── write feed.xml ──────────────────────────────────────────────────
  // feed.xml is Supabase-primary via getPosts() so new Supabase posts appear without manual generate
  function rssDate(d){ return new Date(d+"T00:00:00+05:30").toUTCString(); }
  const feedItems = posts.slice(0,50).map(p=>`  <item>
    <title>${escXml(p.title)}</title>
    <link>${escXml(p.url)}</link>
    <guid isPermaLink="true">${escXml(p.url)}</guid>
    <description>${escXml(p.description)}</description>
    <pubDate>${rssDate(p.date)}</pubDate>
    <category>${(p.tags||[]).map(t=>escXml(t)).join("</category>\n    <category>")}</category>
  </item>`).join("\n");
  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>Hariom Lohar — Lab Notebook No.01 · Blog &amp; Daily Logs</title>
  <link>${SITE}/blog</link>
  <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml" />
  <description>Daily AGI research logs and articles by Hariom Lohar (hariomlohardev) — Python, Django, Flutter, Harvard CS50P 2026.</description>
  <language>en-IN</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${feedItems}
</channel>
</rss>
`;
  fs.writeFileSync(FEED_XML, feed);
  console.log(`→ ${FEED_XML} (${posts.length} posts from ${source})`);

  // generate
  for(const post of posts){
    const dir = path.join(BLOG_P_DIR, post.slug);
    fs.mkdirSync(dir, {recursive:true});
    fs.writeFileSync(path.join(dir,"index.html"), postPage(post));
    console.log(`→ blog/p/${post.slug}/index.html`);
    // og svg — $0, Lab Notebook chrome
    if(!post.cover){
      try{
        const svg = ogSvg(post);
        fs.writeFileSync(path.join(OG_DIR, post.slug + ".svg"), svg);
        console.log(`→ og/${post.slug}.svg`);
      }catch(e){ console.warn('og fail', post.slug, e.message); }
    }
  }

  // ── prune what Supabase no longer has ───────────────────────────────
  // A deleted post has to disappear from the site, not linger as a static page.
  const live = new Set(posts.map(p=>p.slug));
  // og/ also holds page and project images — only a post's own svg may go
  const keepOg = new Set(["404","about","avatar-circle","blog","community","contact","home","opensource","projects","thanks","tricks"]);
  try{
    const pj = JSON.parse(fs.readFileSync(PROJECTS_JSON,"utf8"));
    (Array.isArray(pj) ? pj : (pj.projects||[])).forEach(x=>{ if(x && x.slug) keepOg.add(String(x.slug)); });
  }catch{}
  let pruned = 0;
  if(fs.existsSync(BLOG_P_DIR)){
    for(const slug of fs.readdirSync(BLOG_P_DIR)){
      const dir = path.join(BLOG_P_DIR, slug);
      if(live.has(slug) || !fs.statSync(dir).isDirectory()) continue;
      fs.rmSync(dir, {recursive:true, force:true});
      pruned++;
      console.log(`✕ blog/p/${slug}/ — no longer in Supabase`);
      const og = path.join(OG_DIR, slug + ".svg");
      if(!keepOg.has(slug) && fs.existsSync(og)){ fs.unlinkSync(og); console.log(`✕ og/${slug}.svg`); }
    }
  }

  // ── patch sitemap.xml ───────────────────────────────────────────────
  // sitemap.xml is Supabase-primary via getPosts() so new Supabase posts appear without manual generate
  if(fs.existsSync(SITEMAP_XML)){
    let sitemap = fs.readFileSync(SITEMAP_XML,"utf8");
    // A post that is gone must lose its sitemap url too. Prune whole <url> blocks:
    // they span several lines because of <image:image>, so dropping just the <loc>
    // line leaves a <url> with no <loc> — invalid, and Google can reject the file.
    let droppedUrls = 0;
    sitemap = sitemap.replace(/[ \t]*<url>[\s\S]*?<\/url>\s*/g, block=>{
      if(!block.includes("<loc>")){ droppedUrls++; return ""; }
      const m = block.match(/\/blog\/p\/([^/<"]+)/);
      if(!m || live.has(m[1])) return block;
      droppedUrls++;
      return "";
    });
    if(droppedUrls) console.log(`✕ sitemap.xml — dropped ${droppedUrls} url block(s) for deleted posts`);
    const hasBlog = sitemap.includes("/blog");
    const today = new Date().toISOString().slice(0,10);
    if(!hasBlog){
      const entries = [`  <url><loc>${SITE}/blog</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>`]
        .concat(posts.map(p=>`  <url><loc>${escXml(p.url)}</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`))
        .join("\n");
      sitemap = sitemap.replace("</urlset>", entries+"\n</urlset>");
      fs.writeFileSync(SITEMAP_XML, sitemap);
      console.log(`→ patched ${SITEMAP_XML} (+${posts.length+1} urls from ${source})`);
    } else {
      // inject any missing post urls incrementally and refresh lastmod to today
      let added=0;
      for(const p of posts){
        if(!sitemap.includes(p.url)){
          sitemap = sitemap.replace("</urlset>", `  <url><loc>${escXml(p.url)}</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>\n</urlset>`);
          added++;
        } else {
          // ensure lastmod is today
          const re = new RegExp(`(<loc>${escXml(p.url)}<\\/loc>\\s*<lastmod>)[^<]+(<\\/lastmod>)`);
          if(re.test(sitemap)) sitemap = sitemap.replace(re, `$1${today}$2`);
        }
      }
      // also ensure /blog entry lastmod is today
      const blogRe = new RegExp(`(<loc>${escXml(SITE)}/blog<\\/loc>\\s*<lastmod>)[^<]+(<\\/lastmod>)`);
      if(blogRe.test(sitemap)) sitemap = sitemap.replace(blogRe, `$1${today}$2`);
      if(added){ fs.writeFileSync(SITEMAP_XML, sitemap); console.log(`→ patched ${SITEMAP_XML} (+${added} missing post urls from ${source}, refreshed lastmod → ${today})`); }
      else { fs.writeFileSync(SITEMAP_XML, sitemap); console.log(`sitemap already has blog entries (${posts.length} from ${source}), refreshed lastmod → ${today}`); }
    }
  }

  console.log(`done — ${posts.length} posts from ${source}${pruned ? `, ${pruned} pruned` : ""}`);
}

main().catch(e=>{ console.error(e); process.exit(1); });
