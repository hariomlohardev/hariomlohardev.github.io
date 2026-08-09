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
  const tagsHtml = (post.tags||[]).map(t=>`<a href="/blog.html#tag=${encodeURIComponent(t)}" style="font-family:var(--mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;border:1px solid var(--line);background:var(--paper-2);padding:4px 8px;color:var(--muted)">${escHtml(t)}</a>`).join(" ");
  const coverUrl = post.cover ? (post.cover.startsWith('http') ? post.cover : (post.cover.startsWith('/') ? SITE + post.cover : SITE + '/' + post.cover)) : null;
  const ogSvgUrl = `${SITE}/og/${post.slug}.svg`;
  const ogImage = coverUrl || ogSvgUrl;
  const ogImageAlt = post.title + ' — Hariom Lohar · Lab Notebook No.01';
  const jsonLd = {
    "@context":"https://schema.org",
    "@type":"BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    author: {"@type":"Person","name":"Hariom Lohar","url":SITE+"/"},
    mainEntityOfPage: post.url,
    url: post.url,
    image: ogImage,
    keywords: (post.tags||[]).join(", "),
    wordCount: post.wordCount,
    isPartOf: {"@type":"Blog","name":"Hariom Lohar — Lab Notebook"}
  };
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="theme-color" content="#FFD400" />
<meta name="color-scheme" content="light" />
<title>${escHtml(post.title)} — Hariom Lohar · Lab Notebook No.01</title>
<meta name="description" content="${escHtml(post.description)}" />
<meta name="author" content="Hariom Lohar" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<link rel="canonical" href="${post.url}" />
<link rel="author" href="https://github.com/hariomlohardev" />
<meta property="og:site_name" content="Hariom Lohar — Lab Notebook No.01" />
<meta property="og:locale" content="en_IN" />
<meta property="og:url" content="${post.url}" />
<meta property="og:title" content="${escHtml(post.title)} — Hariom Lohar" />
<meta property="og:description" content="${escHtml(post.description)}" />
<meta property="og:type" content="article" />
<meta property="article:published_time" content="${post.date}" />
<meta property="og:image" content="${ogImage}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="${escHtml(ogImageAlt)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escHtml(post.title)} — Hariom Lohar" />
<meta name="twitter:description" content="${escHtml(post.description)}" />
<meta name="twitter:image" content="${ogImage}" />
<meta name="twitter:creator" content="@HariomloharAGI" />
<link rel="alternate" type="application/rss+xml" title="Hariom Lohar — Blog" href="${SITE}/feed.xml" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>◎</text></svg>" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Instrument+Sans:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=Fragment+Mono:ital@0;1&display=swap" rel="stylesheet">
<script>document.documentElement.classList.add('js')</script>
<style>
:root{--paper:#FFFEFB;--paper-2:#F3F0E8;--sheet:#fff;--ink:#0B1220;--muted:#6E7D9A;--line:#D9E2EF;--line-2:#B9C8E2;--grid:#E3ECFB;--signal:#FFD400;--red:#E10600;--blue:#0050FF;--green:#0E9F6E;--max:860px;--pad:clamp(18px,4vw,52px);--mono:'Fragment Mono',monospace;--display:'Bricolage Grotesque',sans-serif;--serif:'Instrument Serif',serif;--sans:'Instrument Sans',sans-serif}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--sans);background:var(--paper);color:var(--ink);line-height:1.6;-webkit-font-smoothing:antialiased;background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);background-size:24px 24px}
a{color:inherit}
a:focus-visible,button:focus-visible{outline:2px solid var(--blue);outline-offset:3px}
#prog{position:fixed;top:0;left:0;height:3px;width:0;background:var(--signal);z-index:90}
.wrap{max-width:var(--max);margin:0 auto;padding-left:var(--pad);padding-right:var(--pad)}
header{position:sticky;top:0;z-index:40;background:rgba(255,254,251,.88);backdrop-filter:saturate(150%) blur(10px);border-bottom:1px solid var(--line)}
header.scrolled{box-shadow:0 6px 24px rgba(11,18,32,.08)}
.head-top{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px dashed var(--line);font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.head-main{display:flex;align-items:center;justify-content:space-between;gap:18px;height:56px}
.logo{font-family:var(--mono);font-size:13px;font-weight:500;display:flex;gap:10px;align-items:center;text-decoration:none}
.logo-mark{width:28px;height:28px;background:var(--ink);color:var(--paper);display:grid;place-items:center;font-size:11px}
nav{display:flex;gap:18px;overflow-x:auto;scrollbar-width:none}
nav a{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);padding:6px 0;border-bottom:2px solid transparent;white-space:nowrap;text-decoration:none}
nav a:hover{color:var(--ink);border-bottom-color:var(--signal)}
@media(max-width:760px){
  nav{display:flex;gap:14px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding-bottom:2px;-webkit-mask-image:linear-gradient(to right, transparent, black 14px, black calc(100% - 14px), transparent);mask-image:linear-gradient(to right, transparent, black 14px, black calc(100% - 14px), transparent)}
  nav::-webkit-scrollbar{display:none}
  nav a{padding:10px 6px;min-height:44px;display:grid;place-items:center}
}
.marginalia{border-top:1px solid var(--ink);border-bottom:1px solid var(--ink);background:var(--ink);color:#C8D2E6;overflow:hidden;padding:10px 0}
.breadcrumb{font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding:14px 0;display:flex;gap:8px;flex-wrap:wrap}
.breadcrumb a{color:var(--muted);text-decoration:none}
.breadcrumb a:hover{color:var(--ink)}
.hero{padding:18px 0 8px}
.eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);display:flex;gap:10px;align-items:center}
.eyebrow i{width:8px;height:8px;background:var(--red);border-radius:50%}
h1{font-family:var(--display);font-weight:800;letter-spacing:-.03em;line-height:1;font-size:clamp(1.9rem,4.5vw,2.8rem);text-transform:uppercase;margin-top:10px}
h1 em{font-family:var(--serif);font-style:italic;font-weight:400;text-transform:none}
.meta{margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-family:var(--mono);font-size:11px;color:var(--muted)}
.meta b{color:var(--ink)}
.paper{background:var(--sheet);border:1px solid var(--ink);padding:22px 22px 18px;box-shadow:0 1px 0 rgba(11,18,32,.06);position:relative;margin-top:18px}
.paper::before{content:"";position:absolute;top:-9px;left:50%;transform:translateX(-50%) rotate(-1deg);width:120px;height:14px;background:rgba(255,255,255,.78);border:1px solid rgba(11,18,32,.06)}
.prose{font-size:16px;line-height:1.75;color:#1e293b}
.prose h2{font-family:var(--display);font-weight:800;letter-spacing:-.02em;text-transform:uppercase;font-size:1.35rem;margin:22px 0 10px}
.prose h3{font-weight:700;margin:18px 0 8px}
.prose p{margin:12px 0}
.prose a{color:var(--blue);text-decoration:underline;text-underline-offset:2px}
.prose a:hover{color:#0037b3}
.prose blockquote{border-left:3px solid var(--signal);background:var(--paper-2);padding:10px 14px;margin:14px 0;color:#334155}
.prose ul{margin:12px 0 12px 18px}
.prose hr{border:none;border-top:1px solid var(--line);margin:18px 0}
.prose pre{background:#0B1220;color:#E8EEFB;padding:14px;overflow:auto;border:1px solid var(--ink);font-family:var(--mono);font-size:12px;line-height:1.6;margin:14px 0}
.prose code{font-family:var(--mono);font-size:.9em;background:var(--paper-2);border:1px solid var(--line);padding:1px 4px}
.prose pre code{background:none;border:none;padding:0;color:inherit}
footer{border-top:2px solid var(--ink);margin-top:28px;background:var(--paper-2)}
.foot-in{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:18px 0;font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important} #prog{display:none}}
@media print{ header,.marginalia,#prog,#giscus-root,footer{display:none!important} body{background:#fff;background-image:none} .paper{box-shadow:none}}
</style>
</head>
<body>
<a href="#main" class="skip" style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden">Skip to content</a>
<style>.skip:focus{left:16px;top:10px;width:auto;height:auto;padding:8px 12px;background:var(--ink);color:var(--paper);z-index:100;border:1px solid var(--signal);font-family:var(--mono);font-size:12px}</style>
<div id="prog" aria-hidden="true"></div>
<header id="top">
  <div class="wrap">
    <div class="head-top"><span>LAB NOTEBOOK <b>No.01</b> · BLOG · INDIA — UTC+5:30</span><span style="display:flex;gap:12px"><span>${dFmt}</span><span style="color:var(--muted)">${post.readingMinutes} min</span></span></div>
    <div class="head-main">
      <a class="logo" href="/"><span class="logo-mark">HL</span> hariomlohardev</a>
      <nav aria-label="Primary"><a href="/">Home</a><a href="/projects.html">Projects</a><a href="/blog.html">Blog</a><a href="/blog.html#daily-log">Daily Logs</a><a href="/#contact">Contact</a></nav>
      <a href="https://github.com/hariomlohardev" target="_blank" rel="noopener" style="font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;border:1px solid var(--green);color:var(--green);padding:6px 10px;text-decoration:none">GitHub ↗</a>
    </div>
  </div>
</header>
<div class="marginalia" aria-hidden="true" style="background:var(--paper);color:var(--muted);border-color:var(--line);text-align:center;font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase">Hariom Lohar — Lab Notebook No.01 · Daily Logs &amp; Articles</div>
<main class="wrap" id="main">
  <div class="breadcrumb"><a href="/">Hariom Lohar</a><span>›</span><a href="/blog.html">Blog</a><span>›</span><span>${escHtml(post.title)}</span></div>
  <div class="hero">
    <div class="eyebrow"><i></i> ${post.tags.includes("daily-log") ? "Daily Log" : "Article"} · ${dFmt} · ${post.readingMinutes} min · Hariom Lohar</div>
    <h1>${escHtml(post.title)}</h1>
    <div class="meta"><span><b>By Hariom Lohar</b> (hariomlohardev)</span><span>·</span><span>${post.wordCount} words</span><span>·</span><span>${tagsHtml || '<span style="color:var(--muted)">no tags</span>'}</span></div>
    <p style="margin-top:10px;color:#475569;font-size:15px;line-height:1.6;max-width:65ch">${escHtml(post.description)}</p>
  </div>
  <article class="paper">
    <div class="prose">
${post.html}
    </div>
  </article>
  <!-- Giscus — free comments via GitHub Discussions (no DB, no cost) -->
  <section style="margin-top:22px;background:var(--sheet);border:1px solid var(--ink);padding:16px;position:relative" aria-label="Comments">
    <div style="font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><span>Discuss — powered by GitHub</span><span style="text-transform:none;letter-spacing:0;color:var(--muted);font-size:11px">free · no tracking · GitHub login to comment</span></div>
    <div id="giscus-root" style="margin-top:14px;min-height:80px"></div>
    <noscript><p style="font-family:var(--mono);font-size:12px;color:var(--muted)">Enable JavaScript to load comments. Or <a href="https://github.com/hariomlohardev/hariomlohardev.github.io/discussions" target="_blank" rel="noopener" style="color:var(--blue);text-decoration:underline">open Discussions →</a></p></noscript>
    <p id="giscus-setup" style="display:none;margin-top:10px;font-family:var(--mono);font-size:11px;line-height:1.6;color:var(--muted);background:var(--paper-2);border:1px dashed var(--line);padding:10px">Giscus not yet configured — <a href="https://giscus.app" target="_blank" rel="noopener" style="color:var(--blue);text-decoration:underline">giscus.app</a> → pick <b>hariomlohardev/hariomlohardev.github.io</b> → enable Discussions → copy <code>data-repo-id</code> &amp; <code>data-category-id</code> into this page's script. See <code>posts/README.md</code>.</p>
  </section>
  <script>
  (function(){
    var s=document.createElement('script');
    s.src='https://giscus.app/client.js';
    s.async=true; s.crossOrigin='anonymous';
    // ——— FILL THESE TWO IDs AFTER ONE-TIME SETUP (see instructions below) ———
    // Get them free at https://giscus.app — pick repo hariomlohardev/hariomlohardev.github.io
    // If you leave them empty, comments show a setup note (no break).
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
    var hasIds = s.getAttribute('data-repo-id') && s.getAttribute('data-category-id');
    if(!hasIds){
      var note=document.getElementById('giscus-setup');
      if(note) note.style.display='block';
      // still load Utterances as fallback — works with just repo name, no IDs
      s.src='https://utteranc.es/client.js';
      s.setAttribute('repo','hariomlohardev/hariomlohardev.github.io');
      s.setAttribute('issue-term','pathname');
      s.setAttribute('theme','github-light');
      s.removeAttribute('data-repo'); s.removeAttribute('data-repo-id'); s.removeAttribute('data-category'); s.removeAttribute('data-category-id');
      s.removeAttribute('data-mapping'); s.removeAttribute('data-strict'); s.removeAttribute('data-reactions-enabled'); s.removeAttribute('data-emit-metadata'); s.removeAttribute('data-input-position'); s.removeAttribute('data-lang');
    }
    document.getElementById('giscus-root').appendChild(s);
  })();
  </script>
  <div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap">
    <a href="/blog.html" style="font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;border:1px solid var(--ink);padding:11px 14px;background:white;text-decoration:none">← Back to blog</a>
    <a href="https://github.com/hariomlohardev" target="_blank" rel="noopener" style="font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;background:var(--ink);color:white;padding:11px 14px;border:1px solid var(--ink);text-decoration:none">Follow on GitHub ↗</a>
  </div>
  <!-- Share — Lab Notebook tape, $0, no tracking -->
  <section aria-label="Share this post" style="margin-top:14px;background:var(--sheet);border:1px solid var(--ink);padding:14px 14px 12px;position:relative;display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between">
    <span style="position:absolute;top:-9px;left:14px;width:64px;height:12px;background:rgba(255,255,255,.78);border:1px solid rgba(11,18,32,.06);transform:rotate(-1deg)" aria-hidden="true"></span>
    <span style="font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)">Share — Lab Notebook No.01</span>
    <span style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <button type="button" onclick="(function(b){ var u='${post.url}'; if(navigator.clipboard){ navigator.clipboard.writeText(u).then(function(){ b.textContent='Copied ✓'; setTimeout(function(){ b.textContent='Copy link'; },1600); }); } else { prompt('Copy link:', u); } })(this)" style="font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;border:1px solid var(--ink);background:var(--paper);padding:8px 10px;cursor:pointer">Copy link</button>
      <a href="https://twitter.com/intent/tweet?url=${encodeURIComponent(post.url)}&text=${encodeURIComponent(post.title + ' — by Hariom Lohar')}" target="_blank" rel="noopener" style="font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;border:1px solid var(--line);background:var(--paper-2);padding:8px 10px;text-decoration:none">X ↗</a>
      <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(post.url)}" target="_blank" rel="noopener" style="font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;border:1px solid var(--line);background:var(--paper-2);padding:8px 10px;text-decoration:none">LinkedIn ↗</a>
    </span>
  </section>
</main>
<footer>
  <div class="wrap foot-in">
    <span>© ${new Date().getFullYear()} <b>Hariom Lohar</b> — Lab Notebook No.01 · <a href="https://github.com/hariomlohardev" style="text-decoration:underline">hariomlohardev on GitHub</a></span>
    <span><a href="/blog.html">Blog</a> · <a href="/feed.xml">RSS</a> · <a href="#top">Top ↑</a></span>
  </div>
</footer>
<script>
(function(){
  var hdr=document.querySelector('header'), prog=document.getElementById('prog'), qd=false;
  function onScroll(){ if(qd) return; qd=true; requestAnimationFrame(function(){ qd=false; var h=document.documentElement.scrollHeight-window.innerHeight; if(prog) prog.style.width=(h>0?(window.scrollY/h)*100:0)+'%'; if(hdr) hdr.classList.toggle('scrolled', window.scrollY>8); }); }
  window.addEventListener('scroll', onScroll,{passive:true}); onScroll();
})();
</script>
<!-- Analytics — $0 placeholder (replaced when you set token in index.html; regen via node scripts/generate-blog.js) -->
<!-- <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "REPLACE_WITH_YOUR_CLOUDFLARE_TOKEN"}'></script> -->
</body>
</html>`;
}

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
