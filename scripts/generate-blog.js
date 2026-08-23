#!/usr/bin/env node
"use strict";
/**
 * generate-blog.js — zero-deps static blog builder for hariomlohardev.github.io
 * Reads posts/*.md → posts.json + feed.xml + blog/p/<slug>/index.html + patches sitemap.xml
 * Free, deterministic, Node-only. Run locally: node scripts/generate-blog.js
 * Also invoked by .github/workflows/pages.yml before deploy.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const POSTS_DIR = path.join(ROOT, "posts");
const BLOG_P_DIR = path.join(ROOT, "blog", "p");
const POSTS_JSON = path.join(ROOT, "posts.json");
const FEED_XML = path.join(ROOT, "feed.xml");
const SITEMAP_XML = path.join(ROOT, "sitemap.xml");
const SITE = "https://hariomlohardev.github.io";

// ── helpers ──────────────────────────────────────────────────────────
function escHtml(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function escXml(s){ return escHtml(s); }
function toSlug(s){ return String(s).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,64) || "post"; }
function fmtDate(d){ // YYYY-MM-DD → locale
  try{ return new Date(d+"T00:00:00+05:30").toLocaleDateString("en-GB",{timeZone:"Asia/Kolkata",day:"2-digit",month:"short",year:"numeric"}).toUpperCase(); }catch{ return d; }
}
function parseFrontmatter(raw){
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
function mdToHtml(md){
  let s = md.replace(/\r\n/g,"\n");
  // code fences ```lang\ncode```
  const codes=[];
  s = s.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g,(m,lang,code)=>{
    const idx=codes.length;
    codes.push(`<pre><code class="lang-${escHtml(lang||"")}">${escHtml(code.trimEnd())}</code></pre>`);
    return `__CODE_${idx}__`;
  });
  // inline code `code`
  s = s.replace(/`([^`]+?)`/g, (m,c)=>`<code>${escHtml(c)}</code>`);
  // headings # to ###...
  s = s.replace(/^######\s+(.+)$/gm,"<h6>$1</h6>");
  s = s.replace(/^#####\s+(.+)$/gm,"<h5>$1</h5>");
  s = s.replace(/^####\s+(.+)$/gm,"<h4>$1</h4>");
  s = s.replace(/^###\s+(.+)$/gm,"<h3>$1</h3>");
  s = s.replace(/^##\s+(.+)$/gm,"<h2>$1</h2>");
  s = s.replace(/^#\s+(.+)$/gm,"<h1>$1</h1>");
  // blockquote > line
  s = s.replace(/^>\s?(.+)$/gm,"<blockquote>$1</blockquote>");
  s = s.replace(/(<\/blockquote>\n<blockquote>)/g,"\n");
  // links [text](url) — before bold to avoid conflict
  s = s.replace(/\[([^\]]+?)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/g,'<a href="$2" rel="noopener">$1</a>');
  // bold **text**
  s = s.replace(/\*\*([^*]+?)\*\*/g,"<strong>$1</strong>");
  // italic *text* (avoid **)
  s = s.replace(/(^|[^*])\*([^*\n]+?)\*([^*]|$)/g,"$1<em>$2</em>$3");
  // horizontal rule --- or ***
  s = s.replace(/^\s*(\*\*\*|---)\s*$/gm,'<hr />');
  // unordered lists
  s = s.split("\n").map(line=>{
    if(line.match(/^\s*[-*]\s+/)) return line.replace(/^\s*[-*]\s+(.+)/,"<li>$1</li>");
    if(line.match(/^\s*\d+\.\s+/)) return line.replace(/^\s*\d+\.\s+(.+)/,"<li>$1</li>");
    return line;
  }).join("\n");
  // wrap consecutive <li> in <ul>
  s = s.replace(/(?:<li>.*<\/li>\n?)+/g, m=>{
    const inner=m.trim().split("\n").join("\n");
    // detect ordered vs unordered: if first item had digit, use ol? For now ul handles both; keep ul for simplicity except detect
    return `<ul>\n${inner}\n</ul>`;
  });
  // paragraphs: split by double newline, wrap lines not already block elements
  const blocks = s.split(/\n{2,}/).map(b=>{
    b=b.trim();
    if(!b) return "";
    if(b.startsWith("<h")||b.startsWith("<pre")||b.startsWith("<ul")||b.startsWith("<ol")||b.startsWith("<blockquote")||b.startsWith("<hr")||b.startsWith("__CODE_")) return b;
    // restore code placeholders inside
    return `<p>${b.replace(/\n/g,"<br />\n")}</p>`;
  }).join("\n\n");
  let out = blocks;
  codes.forEach((html,i)=>{ out = out.replace(`__CODE_${i}__`, html); });
  return out;
}
function wordCount(s){ return String(s).trim().split(/\s+/).filter(Boolean).length; }

// ── scan posts ──────────────────────────────────────────────────────
if(!fs.existsSync(POSTS_DIR)) { console.error("posts/ missing"); process.exit(1); }
const files = fs.readdirSync(POSTS_DIR).filter(f=>f.endsWith(".md") && f!=="README.md").sort();
const posts=[];

for(const file of files){
  const raw = fs.readFileSync(path.join(POSTS_DIR,file),"utf8");
  const {data, body} = parseFrontmatter(raw);
  if(data.draft===true || String(data.draft).toLowerCase()==="true") { console.log(`skip draft ${file}`); continue; }
  const title = data.title || toSlug(file.replace(/\.md$/,""));
  const dateStr = data.date || file.slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)){ console.warn(`skip ${file}: bad date ${dateStr}`); continue; }
  const slug = data.slug ? toSlug(data.slug) : toSlug(file.replace(/^\d{4}-\d{2}-\d{2}-/,"").replace(/\.md$/,"")) || toSlug(title);
  const description = data.description || body.split("\n").find(l=>l.trim() && !l.trim().startsWith("#"))?.slice(0,155) || "";
  const tags = Array.isArray(data.tags) ? data.tags : (data.tags? [String(data.tags)] : []);
  const cover = data.cover || data.image || data.og || null;
  const html = mdToHtml(body.trim());
  const wc = wordCount(body);
  const reading = Math.max(1, Math.ceil(wc/200));
  const url = `${SITE}/blog/p/${slug}/`;
  posts.push({
    slug, title: String(title), date: dateStr, description: String(description),
    tags, html, raw: body, wordCount: wc, readingMinutes: reading, url,
    file, cover: cover ? String(cover) : null
  });
}
posts.sort((a,b)=> b.date.localeCompare(a.date));

// ── write posts.json ────────────────────────────────────────────────
const jsonOut = posts.map(p=>({
  slug:p.slug, title:p.title, date:p.date, description:p.description, tags:p.tags,
  readingMinutes:p.readingMinutes, wordCount:p.wordCount, url:p.url, file:p.file, cover:p.cover
}));
fs.writeFileSync(POSTS_JSON, JSON.stringify(jsonOut,null,2)+" \n");
console.log(`→ ${POSTS_JSON} (${posts.length} posts)`);

// ── write feed.xml ──────────────────────────────────────────────────
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
  <link>${SITE}/blog.html</link>
  <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml" />
  <description>Daily AGI research logs and articles by Hariom Lohar (hariomlohardev) — Python, Django, Flutter, Harvard CS50P 2026.</description>
  <language>en-IN</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${feedItems}
</channel>
</rss>
`;
fs.writeFileSync(FEED_XML, feed);
console.log(`→ ${FEED_XML}`);

// ── generate og/*.svg — per-post OG, Lab Notebook No.01, no deps, $0 ──
function escSvg(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function ogSvg(post){
  const dFmt = fmtDate(post.date);
  const title = post.title.length > 64 ? post.title.slice(0,61)+'…' : post.title;
  const desc = (post.description||'').slice(0,110);
  const tag = (post.tags||[]).includes('daily-log') ? '◎ DAILY LOG' : '✎ ARTICLE';
  // 1200×630, paper grid nod, signal bar
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${escSvg(title)}">
<rect width="1200" height="630" fill="#FFFEFB"/>
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
  const tagsHtml = (post.tags||[]).map(t=>`<a href="/blog.html#tag=${encodeURIComponent(t)}">#${escHtml(t)}</a>`).join(" ");
  const tagLinks = (post.tags||[]).map(t=>`<a href="/blog.html#tag=${encodeURIComponent(t)}">${escHtml(t)}</a>`).join("");
  const isLog = (post.tags||[]).map(x=>String(x).toLowerCase()).includes('daily-log');
  const typeLabel = isLog ? 'Daily Log' : 'Article';
  const coverUrl = post.cover ? (post.cover.startsWith('http') ? post.cover : (post.cover.startsWith('/') ? SITE + post.cover : SITE + '/' + post.cover)) : null;
  const ogSvgUrl = `${SITE}/og/${post.slug}.svg`;
  const ogImage = coverUrl || ogSvgUrl;
  const ogImageAlt = post.title + ' — Hariom Lohar · Lab Notebook No.01';
  const canonical = post.url;
  const wordCount = post.wordCount;
  const reading = post.readingMinutes;
  const desc = post.description;
  const jsonLd = {
    "@context":"https://schema.org",
    "@type":"BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    author: {"@type":"Person","@id":SITE+"/#person","name":"Hariom Lohar","alternateName":"hariomlohardev","url":SITE+"/","sameAs":["https://github.com/hariomlohardev","https://x.com/HariomloharAGI","https://www.linkedin.com/in/hariomlohar"]},
    mainEntityOfPage: post.url,
    url: post.url,
    image: ogImage,
    keywords: (post.tags||[]).join(", "),
    wordCount: post.wordCount,
    isPartOf: {"@type":"Blog","name":"Hariom Lohar — Lab Notebook"}
  };
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
.prose strong{color:var(--ink);font-weight:600}
.prose blockquote{border-left:3px solid var(--accent);padding:6px 0 6px 26px;margin:36px 0;color:var(--ink-2);font-family:var(--serif);font-style:italic;font-size:1.2rem;line-height:1.6}
.prose ul,.prose ol{margin:22px 0 22px 24px}
.prose li{margin:9px 0}
.prose li::marker{color:var(--accent)}
.prose hr{border:none;border-top:1px solid var(--line);margin:44px 0}
.prose code{font-family:var(--mono);font-size:.85em;background:var(--paper-2);padding:2px 6px;color:var(--ink)}
.prose pre{background:var(--ink);color:var(--paper);padding:20px 22px;overflow-x:auto;font-family:var(--mono);font-size:13px;line-height:1.8;margin:36px 0;border:none}
.prose pre code{background:none;border:none;padding:0;color:inherit;font-size:inherit;white-space:pre}
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
#giscus-root{min-height:80px}
#giscus-setup{margin-top:14px;font-family:var(--mono);font-size:11px;line-height:1.7;color:var(--muted)}
#giscus-setup a{color:var(--accent);text-decoration:underline;text-underline-offset:3px}
#giscus-setup code{font-family:var(--mono);font-size:.9em;background:var(--paper-2);padding:1px 5px}
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
        <a href="/projects.html">Projects</a>
        <a href="/opensource.html">Open Source</a>
        <a href="/blog.html" class="active" aria-current="page">Blog</a>
        <a href="/#about">About</a>
        <a href="/#contact">Contact</a>
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
      <a href="/projects.html"><span>Projects</span><span class="no">02</span></a>
      <a href="/opensource.html"><span>Open Source</span><span class="no">03</span></a>
      <a href="/blog.html" class="active"><span>Blog &amp; Logs</span><span class="no">04</span></a>
      <a href="/#about"><span>About</span><span class="no">05</span></a>
      <a href="/#contact"><span>Contact</span><span class="no">06</span></a>
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
      <a href="/blog.html">Blog</a><span class="sep">/</span>
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
        <div class="tags">${(post.tags||[]).map(t=>`<a href="/blog.html#tag=${encodeURIComponent(t)}">${escHtml(t)}</a>`).join("")}</div>
      </div>
    </div>
    <div class="rule" aria-hidden="true"></div>
    <article class="rv">
      <div class="prose">
${post.html}
      </div>
      <div class="endmark" aria-hidden="true">◆</div>
    </article>
    <section class="flat-sec rv" aria-label="Comments">
      <div class="kicker"><i></i> Discuss — powered by GitHub <span class="sub">free · no tracking · GitHub login to comment</span></div>
      <div id="giscus-root"></div>
      <noscript><p style="font-family:var(--mono);font-size:12px;color:var(--muted)">Enable JavaScript to load comments. Or <a href="https://github.com/hariomlohardev/hariomlohardev.github.io/discussions" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline">open Discussions →</a></p></noscript>
      <p id="giscus-setup" style="display:none">Giscus not yet configured — <a href="https://giscus.app" target="_blank" rel="noopener">giscus.app</a> → pick <b>hariomlohardev/hariomlohardev.github.io</b> → enable Discussions → copy <code>data-repo-id</code> &amp; <code>data-category-id</code> into this page's script.</p>
    </section>
    <section class="flat-sec rv" aria-label="Share this post">
      <div class="kicker"><i></i> Share — Lab Notebook №01</div>
      <div class="share-row">
        <button type="button" class="share-btn" id="copyBtn">Copy link</button>
        <a class="share-btn" href="https://twitter.com/intent/tweet?url=${encUrl}&text=${encTitle}" target="_blank" rel="noopener">X ↗</a>
        <a class="share-btn" href="https://www.linkedin.com/sharing/share-offsite/?url=${encUrl}" target="_blank" rel="noopener">LinkedIn ↗</a>
      </div>
    </section>
    <div class="post-nav rv">
      <a href="/blog.html" class="btn">← Back to blog</a>
      <a href="https://github.com/hariomlohardev" target="_blank" rel="noopener" class="btn solid">Follow on GitHub ↗</a>
    </div>
  </div>
</main>
<footer>
  <div class="wrap foot-in">
    <span>© ${new Date().getFullYear()} Hariom Lohar — Lab Notebook №01</span>
    <span><a href="/blog.html">Blog</a> · <a href="/feed.xml">RSS</a> · press <span class="kbd">G</span> → github</span>
    <button class="top-btn" id="topBtn" type="button">Back to top ↑</button>
  </div>
</footer>
<script>
(function(){
"use strict";
var reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
document.getElementById('yr')?.textContent=new Date().getFullYear();
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
(function(){
  var s=document.createElement('script');
  s.src='https://giscus.app/client.js';
  s.async=true;s.crossOrigin='anonymous';
  s.setAttribute('data-repo','hariomlohardev/hariomlohardev.github.io');
  s.setAttribute('data-repo-id','R_kgDOTkm3vQ');
  s.setAttribute('data-category','General');
  s.setAttribute('data-category-id','DIC_kwDOTkm3vc4DDAjC');
  s.setAttribute('data-mapping','pathname');
  s.setAttribute('data-strict','0');
  s.setAttribute('data-reactions-enabled','1');
  s.setAttribute('data-emit-metadata','0');
  s.setAttribute('data-input-position','bottom');
  s.setAttribute('data-theme','preferred_color_scheme');
  s.setAttribute('data-lang','en');
  var hasIds=s.getAttribute('data-repo-id')&&s.getAttribute('data-category-id');
  if(!hasIds){
    var note=document.getElementById('giscus-setup');
    if(note)note.style.display='block';
    s.src='https://utteranc.es/client.js';
    s.setAttribute('repo','hariomlohardev/hariomlohardev.github.io');
    s.setAttribute('issue-term','pathname');
    s.setAttribute('theme','github-light');
    ['data-repo','data-repo-id','data-category','data-category-id','data-mapping','data-strict','data-reactions-enabled','data-emit-metadata','data-input-position','data-lang'].forEach(function(a){s.removeAttribute(a);});
  }
  document.getElementById('giscus-root').appendChild(s);
})();
})();
</script>
<script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "7c8c6879055d45ba894f6ac0ce1cc51a"}'></script>
</body>
</html>`;
}
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

// ── patch sitemap.xml ───────────────────────────────────────────────
if(fs.existsSync(SITEMAP_XML)){
  let sitemap = fs.readFileSync(SITEMAP_XML,"utf8");
  const hasBlog = sitemap.includes("/blog.html");
  if(!hasBlog){
    const entries = [`  <url><loc>${SITE}/blog.html</loc><lastmod>${posts[0]?.date || new Date().toISOString().slice(0,10)}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>`]
      .concat(posts.map(p=>`  <url><loc>${escXml(p.url)}</loc><lastmod>${p.date}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`))
      .join("\n");
    sitemap = sitemap.replace("</urlset>", entries+"\n</urlset>");
    fs.writeFileSync(SITEMAP_XML, sitemap);
    console.log(`→ patched ${SITEMAP_XML} (+${posts.length+1} urls)`);
  } else {
    // inject any missing post urls incrementally
    let added=0;
    for(const p of posts){
      if(!sitemap.includes(p.url)){
        sitemap = sitemap.replace("</urlset>", `  <url><loc>${escXml(p.url)}</loc><lastmod>${p.date}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>\n</urlset>`);
        added++;
      }
    }
    if(added){ fs.writeFileSync(SITEMAP_XML, sitemap); console.log(`→ patched ${SITEMAP_XML} (+${added} missing post urls)`); }
    else console.log(`sitemap already has blog entries, skipping patch`);
  }
}

console.log(`done — ${posts.length} posts`);
