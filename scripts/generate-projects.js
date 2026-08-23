#!/usr/bin/env node
"use strict";
/**
 * generate-projects.js — zero-deps static project-detail builder
 * Reads projects-data.json → projects/p/<slug>/index.html + og/<slug>.svg + patches sitemap.xml
 * Mirrors scripts/generate-blog.js pattern — Lab Notebook No.01, $0, Node only.
 * Run: node scripts/generate-projects.js
 * Also invoked by .github/workflows/pages.yml before deploy.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_JSON = path.join(ROOT, "projects-data.json");
const POSTS_JSON = path.join(ROOT, "posts.json");
const SITEMAP_XML = path.join(ROOT, "sitemap.xml");
const PROJECTS_P_DIR = path.join(ROOT, "projects", "p");
const OG_DIR = path.join(ROOT, "og");
const SITE = "https://hariomlohardev.github.io";

// helpers (mirrored from generate-blog.js)
function escHtml(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function escXml(s){ return escHtml(s); }
function escSvg(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function toSlug(s){ return String(s).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,64) || "project"; }
function fmtDate(d){
  try{ return new Date(d+"T00:00:00+05:30").toLocaleDateString("en-GB",{timeZone:"Asia/Kolkata",day:"2-digit",month:"short",year:"numeric"}).toUpperCase(); }catch{ return d; }
}
function mdToHtml(md){
  let s = md.replace(/\r\n/g,"\n");
  const codes=[];
  s = s.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g,(m,lang,code)=>{
    const idx=codes.length;
    codes.push(`<pre><code class="lang-${escHtml(lang||"")}">${escHtml(code.trimEnd())}</code></pre>`);
    return `__CODE_${idx}__`;
  });
  s = s.replace(/`([^`]+?)`/g, (m,c)=>`<code>${escHtml(c)}</code>`);
  s = s.replace(/^######\s+(.+)$/gm,"<h6>$1</h6>");
  s = s.replace(/^#####\s+(.+)$/gm,"<h5>$1</h5>");
  s = s.replace(/^####\s+(.+)$/gm,"<h4>$1</h4>");
  s = s.replace(/^###\s+(.+)$/gm,"<h3>$1</h3>");
  s = s.replace(/^##\s+(.+)$/gm,"<h2>$1</h2>");
  s = s.replace(/^#\s+(.+)$/gm,"<h1>$1</h1>");
  s = s.replace(/^>\s?(.+)$/gm,"<blockquote>$1</blockquote>");
  s = s.replace(/(<\/blockquote>\n<blockquote>)/g,"\n");
  s = s.replace(/\[([^\]]+?)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/g,'<a href="$2" rel="noopener">$1</a>');
  s = s.replace(/\*\*([^*]+?)\*\*/g,"<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+?)\*([^*]|$)/g,"$1<em>$2</em>$3");
  s = s.replace(/^\s*(\*\*\*|---)\s*$/gm,'<hr />');
  s = s.split("\n").map(line=>{
    if(line.match(/^\s*[-*]\s+/)) return line.replace(/^\s*[-*]\s+(.+)/,"<li>$1</li>");
    if(line.match(/^\s*\d+\.\s+/)) return line.replace(/^\s*\d+\.\s+(.+)/,"<li>$1</li>");
    return line;
  }).join("\n");
  s = s.replace(/(?:<li>.*<\/li>\n?)+/g, m=>{
    const inner=m.trim().split("\n").join("\n");
    return `<ul>\n${inner}\n</ul>`;
  });
  const blocks = s.split(/\n{2,}/).map(b=>{
    b=b.trim();
    if(!b) return "";
    if(b.startsWith("<h")||b.startsWith("<pre")||b.startsWith("<ul")||b.startsWith("<ol")||b.startsWith("<blockquote")||b.startsWith("<hr")||b.startsWith("__CODE_")) return b;
    return `<p>${b.replace(/\n/g,"<br />\n")}</p>`;
  }).join("\n\n");
  let out = blocks;
  codes.forEach((html,i)=>{ out = out.replace(`__CODE_${i}__`, html); });
  return out;
}

// load data
if(!fs.existsSync(DATA_JSON)){ console.error("projects-data.json missing"); process.exit(1); }
const rawData = JSON.parse(fs.readFileSync(DATA_JSON,"utf8"));
const projects = rawData.projects || rawData;
if(!Array.isArray(projects)){ console.error("projects-data.json: expected array"); process.exit(1); }

let postsBySlug = {};
try{
  if(fs.existsSync(POSTS_JSON)){
    const posts = JSON.parse(fs.readFileSync(POSTS_JSON,"utf8"));
    posts.forEach(p=>{ postsBySlug[p.slug]=p; });
  }
}catch(e){ console.warn("posts.json read fail", e.message); }

// og per project
function ogSvg(project){
  const tag = project.kind==="live" ? "◉ LIVE — INTERACTIVE" : "⑂ CODE · REPOSITORY";
  const title = project.name.length > 28 ? project.name.slice(0,26)+"…" : project.name;
  const desc = (project.description||"").slice(0,108);
  const sub = project.statusLabel || (project.kind==="live" ? "Live demo in browser" : "Open source");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${escSvg(project.name)}">
<rect width="1200" height="630" fill="#F6F4EE"/>
<defs><pattern id="g" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0 H0 V24" fill="none" stroke="#DAD5C6" stroke-width="1"/></pattern><pattern id="g2" width="120" height="120" patternUnits="userSpaceOnUse"><path d="M120 0 H0 V120" fill="none" stroke="#C4BEAC" stroke-width="1"/></pattern></defs>
<rect width="1200" height="630" fill="url(#g)"/><rect width="1200" height="630" fill="url(#g2)"/>
<rect x="0" y="0" width="1200" height="8" fill="#B93A13"/><rect x="0" y="8" width="1200" height="1" fill="#181611" opacity="0.12"/>
<rect x="0" y="0" width="1200" height="40" fill="#181611"/>
<text x="32" y="26" fill="#EFECE2" font-family="monospace" font-size="12" letter-spacing="1.2">LAB NOTEBOOK No.01 · HARIOM LOHAR — hariomlohardev · INDIA — UTC+5:30</text>
<text x="1088" y="26" fill="#C4BEAC" font-family="monospace" font-size="11" text-anchor="end">${escSvg(sub)}</text>
<rect x="514" y="46" width="172" height="18" rx="2" fill="#FFFFFF" stroke="rgba(24,22,17,0.08)" transform="rotate(-1 600 55)"/>
<rect x="48" y="64" width="1104" height="518" rx="2" fill="#FBFAF6" stroke="#181611" stroke-width="2"/>
<text x="72" y="112" fill="#5F594A" font-family="monospace" font-size="11" letter-spacing="1.6">${escSvg(tag)} · ${escSvg(project.name)}</text>
<text x="72" y="172" fill="#181611" font-family="serif" font-size="54" font-weight="800" letter-spacing="-1.2">${escSvg(title)}</text>
<text x="72" y="216" fill="#475569" font-family="sans-serif" font-size="19" letter-spacing="0">${escSvg(desc)}</text>
<line x1="72" y1="250" x2="1128" y2="250" stroke="#DAD5C6" stroke-width="1" stroke-dasharray="6 6"/>
<text x="72" y="290" fill="#0B1220" font-family="monospace" font-size="12" letter-spacing="0.8">By Hariom Lohar (hariomlohardev) · ${escSvg(project.statusLabel)}</text>
<text x="72" y="320" fill="#5F594A" font-family="monospace" font-size="11">hariomlohardev.github.io/projects/p/${escSvg(project.slug)}/ · Lab Notebook No.01</text>
<rect x="72" y="500" width="200" height="36" fill="#0B1220"/><text x="172" y="523" fill="#F6F4EE" font-family="monospace" font-size="12" text-anchor="middle" letter-spacing="1">${project.kind==="live" ? "OPEN LIVE BENCH →" : "VIEW CODE ↗"}</text>
<text x="1128" y="523" fill="#5F594A" font-family="monospace" font-size="11" text-anchor="end">◎ Lab Notebook No.01</text>
</svg>`;
}

function projectPage(p){
  const slug = p.slug ? toSlug(p.slug) : toSlug(p.id);
  const url = `${SITE}/projects/p/${slug}/`;
  const kindLabel = p.kind==="live" ? "Live · interactive" : "Code · repository";
  const kindBadge = p.kind==="live" ? '<span style="font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;padding:4px 9px;border:1px solid var(--red);color:var(--red);background:var(--red-soft)">◉ Live · interactive</span>' : '<span style="font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;padding:4px 9px;border:1px solid var(--green);color:var(--green);background:rgba(14,159,110,.10)">⑂ Code · repository</span>';
  const ogSvgUrl = `${SITE}/og/${slug}.svg`;
  const ogImage = p.cover ? (p.cover.startsWith("http") ? p.cover : SITE + (p.cover.startsWith("/") ? p.cover : "/"+p.cover)) : ogSvgUrl;
  const longHtml = p.longDescription ? mdToHtml(p.longDescription) : `<p>${escHtml(p.description)}</p>`;
  const chipsHtml = (p.chips||[]).map(c=>`<span style="font-family:var(--mono);font-size:10px;letter-spacing:.06em;text-transform:uppercase;background:var(--paper-2);border:1px solid var(--line);padding:4px 8px;color:var(--muted)">${escHtml(c)}</span>`).join(" ");
  const highlightsHtml = (p.highlights||[]).map(h=>`<li>${escHtml(h)}</li>`).join("");
  const langbar = (p.languages && p.languages.length>1) ? `<div style="display:flex;height:6px;border:1px solid var(--ink);overflow:hidden;background:var(--paper-2);max-width:320px;margin-top:10px">${p.languages.map(l=>`<i style="display:block;height:100%;width:${l.pct}%;background:${l.color}"></i>`).join("")}</div>` : "";
  const langMeta = (p.languages||[]).map(l=>`<span style="display:inline-flex;align-items:center;gap:6px"><i style="width:8px;height:8px;border-radius:50%;display:inline-block;background:${l.color}"></i>${escHtml(l.name)} ${l.pct}%</span>`).join(" · ");
  const statsHtml = (p.stats||[]).map(s=>`<div style="border:1px solid var(--line);background:var(--paper-2);padding:10px 12px;text-align:center"><div style="font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)">${escHtml(s.label)}</div><div style="font-family:var(--display);font-weight:800;font-size:1.25rem;margin-top:4px">${escHtml(s.value)}</div></div>`).join("");
  const faqHtml = (p.faq||[]).map((f,i)=>`<details style="border:1px solid var(--line);background:var(--sheet);padding:12px 14px" ${i===0?"open":""}><summary style="cursor:pointer;font-weight:600;list-style:none;display:flex;justify-content:space-between;gap:12px;align-items:center"><span>${escHtml(f.q)}</span><span style="font-family:var(--mono);font-size:11px;color:var(--muted);white-space:nowrap">tap ↕</span></summary><p style="margin-top:10px;color:#334155;line-height:1.65;font-size:14px">${escHtml(f.a)}</p></details>`).join("\n");
  const faqJson = (p.faq||[]).map(f=>({"@type":"Question","name":f.q,"acceptedAnswer":{"@type":"Answer","text":f.a}}));
  const related = (p.relatedSlugs||[]).map(s=>postsBySlug[s]).filter(Boolean).slice(0,3);
  const relatedHtml = related.length ? `<section style="margin-top:18px"><div style="font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:10px;display:flex;align-items:center;gap:10px"><i style="width:28px;height:1px;background:var(--ink)"></i> Related logs</div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px">${related.map(r=>`<a href="${r.url}" style="display:block;border:1px solid var(--ink);background:var(--sheet);padding:14px;text-decoration:none"><div style="font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)">${escHtml(r.date)} · ${r.readingMinutes} min</div><div style="font-family:var(--display);font-weight:800;text-transform:uppercase;margin-top:6px;line-height:1">${escHtml(r.title)}</div><div style="font-size:13px;color:#475569;margin-top:8px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escHtml(r.description)}</div><div style="margin-top:10px;font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--blue)">Read →</div></a>`).join("")}</div></section>` : "";
  const ctaLive = p.demoUrl ? `<a href="/${p.demoUrl}" style="font-family:var(--mono);font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;padding:12px 18px;display:inline-flex;align-items:center;gap:8px;background:var(--ink);color:var(--paper);border:1px solid var(--ink);text-decoration:none">Open live bench →</a>` : "";
  const ctaRepo = p.repoUrl ? `<a href="${p.repoUrl}" target="_blank" rel="noopener" style="font-family:var(--mono);font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;padding:12px 18px;display:inline-flex;align-items:center;gap:8px;background:var(--sheet);color:var(--ink);border:1px solid var(--ink);text-decoration:none">View code on GitHub ↗</a>` : "";
  const graph = [
    {"@type":"CreativeWork","@id":url+"#work","name":p.name+" — by Hariom Lohar","description":p.description,"url":url,"author":{"@id":SITE+"/#person"},"isPartOf":{"@id":SITE+"/#website"}},
    {"@type":"BreadcrumbList","@id":url+"#breadcrumb","itemListElement":[{"@type":"ListItem","position":1,"name":"Home — Hariom Lohar","item":SITE+"/"},{"@type":"ListItem","position":2,"name":"Projects — Hariom Lohar","item":SITE+"/projects"},{"@type":"ListItem","position":3,"name":p.name,"item":url}]}
  ];
  if(faqJson.length) graph.push({"@type":"FAQPage","@id":url+"#faq","mainEntity":faqJson});
  const jsonLd = {"@context":"https://schema.org","@graph":graph};

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="theme-color" content="#F6F4EE" />
<meta name="color-scheme" content="light" />
<title>Hariom Lohar — ${escHtml(p.name)} · ${escHtml(p.statusLabel)} | hariomlohardev</title>
<meta name="description" content="${escHtml(p.description)}" />
<meta name="author" content="Hariom Lohar" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<link rel="canonical" href="${url}" />
<link rel="author" href="https://github.com/hariomlohardev" />
<meta property="og:site_name" content="Hariom Lohar — Lab Notebook No.01" />
<meta property="og:locale" content="en_IN" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="Hariom Lohar — ${escHtml(p.name)} · ${escHtml(p.statusLabel)}" />
<meta property="og:description" content="${escHtml(p.description)}" />
<meta property="og:type" content="website" />
<meta property="og:image" content="${ogImage}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="${escHtml(p.name)} — Hariom Lohar · Lab Notebook No.01" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Hariom Lohar — ${escHtml(p.name)}" />
<meta name="twitter:description" content="${escHtml(p.description)}" />
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
<script>document.documentElement.classList.add('js')</script>
<style>
:root{--paper:#F6F4EE;--paper-2:#EFECE2;--sheet:#FBFAF6;--ink:#181611;--ink-2:#37342B;--body:#3B382E;--muted:#5F594A;--muted-2:#6E6858;--line:#DAD5C6;--line-2:#C4BEAC;--grid:#E3ECFB;--grid-2:#C9D8F0;--signal:#B93A13;--signal-soft:rgba(185,58,19,.12);--accent:#B93A13;--accent-soft:rgba(185,58,19,.12);--red:#E10600;--red-soft:rgba(225,6,0,.08);--blue:#0050FF;--green:#1E7A4E;--green-soft:rgba(30,122,78,.10);--max:960px;--pad:clamp(18px,4vw,52px);--mono:'Space Mono',ui-monospace,monospace;--display:'Fraunces',Georgia,serif;--serif:'Fraunces',Georgia,serif;--sans:'Archivo',system-ui,sans-serif;--ease:cubic-bezier(.22,1,.36,1);--ease2:cubic-bezier(.16,1,.3,1)}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:var(--sans);background:var(--paper);color:var(--ink);line-height:1.55;-webkit-font-smoothing:antialiased;overflow-x:hidden;background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px),linear-gradient(var(--grid-2) 1px,transparent 1px),linear-gradient(90deg,var(--grid-2) 1px,transparent 1px);background-size:24px 24px,24px 24px,120px 120px,120px 120px;background-position:-1px -1px}
::selection{background:var(--signal);color:var(--ink)}
body::after{content:"";position:fixed;inset:0;z-index:120;pointer-events:none;opacity:.05;mix-blend-mode:multiply;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E")}
a{color:inherit;text-decoration:none}
a:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid var(--blue);outline-offset:3px}
#prog{position:fixed;top:0;left:0;height:3px;width:0;background:var(--signal);z-index:90}
.wrap{max-width:var(--max);margin:0 auto;padding-left:var(--pad);padding-right:var(--pad);position:relative}
header{position:sticky;top:0;z-index:40;background:rgba(255,254,251,.88);backdrop-filter:saturate(150%) blur(10px);border-bottom:1px solid var(--line)}
.head-top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 0 12px;border-bottom:1px dashed var(--line);font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.head-top b{color:var(--ink);font-weight:500}
.head-main{display:flex;align-items:center;justify-content:space-between;gap:24px;height:56px}
.logo{font-family:var(--mono);font-size:13px;letter-spacing:.02em;font-weight:500;display:flex;align-items:center;gap:10px}
.logo-mark{width:28px;height:28px;background:var(--ink);color:var(--paper);display:grid;place-items:center;font-family:var(--mono);font-size:11px;font-weight:600}
.logo i{font-style:normal;color:var(--muted);font-weight:400}
nav{display:flex;gap:22px}
nav a{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);padding:6px 0;border-bottom:2px solid transparent;transition:color .2s,border-color .2s}
nav a:hover,nav a.active{color:var(--ink);border-bottom-color:var(--signal)}
.avail{font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;display:inline-flex;align-items:center;gap:8px;border:1px solid var(--green);color:var(--green);padding:6px 10px;background:var(--green-soft)}
.avail i{width:7px;height:7px;border-radius:50%;background:var(--green);animation:pulse 2s infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(14,159,110,.4)}70%{box-shadow:0 0 0 6px rgba(14,159,110,0)}100%{box-shadow:0 0 0 0 rgba(14,159,110,0)}}
.hero{padding:22px 0 10px}
.breadcrumb{font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding:14px 0;display:flex;gap:8px;flex-wrap:wrap}
.breadcrumb a{color:var(--muted);text-decoration:none}
.breadcrumb a:hover{color:var(--ink)}
.eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);display:flex;align-items:center;gap:10px}
.eyebrow i{width:8px;height:8px;border-radius:50%;background:var(--red)}
h1{font-family:var(--display);font-weight:800;letter-spacing:-.035em;line-height:.9;font-size:clamp(2rem,5vw,3.4rem);text-transform:uppercase;margin-top:10px}
.meta{margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-family:var(--mono);font-size:11px;color:var(--muted)}
.paper{background:var(--sheet);border:1px solid var(--ink);padding:22px 22px 18px;box-shadow:0 1px 0 rgba(11,18,32,.06);position:relative;margin-top:18px}
.paper::before{content:"";position:absolute;top:-9px;left:50%;transform:translateX(-50%) rotate(-1deg);width:120px;height:14px;background:rgba(255,255,255,.78);border:1px solid rgba(11,18,32,.06)}
.prose{font-size:15px;line-height:1.75;color:#1e293b}
.prose h2{font-family:var(--display);font-weight:800;letter-spacing:-.02em;text-transform:uppercase;font-size:1.2rem;margin:18px 0 10px}
.prose p{margin:11px 0}
.prose a{color:var(--blue);text-decoration:underline;text-underline-offset:2px}
.prose ul{margin:12px 0 12px 18px}
.prose li{margin:6px 0}
.prose code{font-family:var(--mono);font-size:.9em;background:var(--paper-2);border:1px solid var(--line);padding:1px 4px}
.prose pre{background:#0B1220;color:#E8EEFB;padding:14px;overflow:auto;border:1px solid var(--ink);font-family:var(--mono);font-size:12px;line-height:1.6;margin:12px 0}
.prose pre code{background:none;border:none;padding:0;color:inherit}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}
@media(max-width:640px){.stats{grid-template-columns:1fr 1fr 1fr}.head-main{height:auto;padding:10px 0;flex-wrap:wrap}nav{gap:14px}}
footer{border-top:2px solid var(--ink);margin-top:24px;background:var(--paper-2)}
.foot-in{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:18px 0;font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
</style>
</head>
<body>
<a href="#main" class="skip" style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden">Skip to content</a>
<style>.skip:focus{left:16px;top:10px;width:auto;height:auto;padding:8px 12px;background:var(--ink);color:var(--paper);z-index:100;border:1px solid var(--signal);font-family:var(--mono);font-size:12px}</style>
<div id="prog" aria-hidden="true"></div>
<header id="top">
  <div class="wrap">
    <div class="head-top"><span>LAB NOTEBOOK <b>No. 01</b> · PROJECT · INDIA — UTC+5:30</span><span style="display:flex;gap:12px;flex-wrap:wrap"><span>${escHtml(kindLabel)}</span><span style="color:var(--muted)">${escHtml(p.statusLabel)}</span></span></div>
    <div class="head-main">
      <a class="logo" href="/"><span class="logo-mark">HL</span> hariomlohardev <i>— build log</i></a>
      <nav aria-label="Primary"><a href="/">Home</a><a href="/projects" class="active" aria-current="page">Projects</a><a href="/opensource">Open Source</a><a href="/blog">Blog</a><a href="/contact">Contact</a>
        <a href="/community">Community</a></nav>
      <a class="avail" href="/contact"><i></i> Available for freelance</a>
    </div>
  </div>
</header>
<main class="wrap" id="main">
  <div class="breadcrumb"><a href="/">Hariom Lohar</a><span>›</span><a href="/projects">Projects</a><span>›</span><span>${escHtml(p.name)}</span></div>
  <div class="hero">
    <div class="eyebrow"><i></i> ${escHtml(kindLabel)} · ${escHtml(p.statusLabel)}</div>
    <h1>${escHtml(p.name)}</h1>
    <div class="meta"><span>${kindBadge}</span><span>·</span><span>${escHtml(p.description).slice(0,120)}</span></div>
    <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">${ctaLive} ${ctaRepo} <a href="/projects" style="font-family:var(--mono);font-size:12px;letter-spacing:.08em;text-transform:uppercase;border:1px solid var(--line);background:var(--paper-2);padding:12px 18px;text-decoration:none">← Back to archive</a></div>
  </div>
  <article class="paper">
    <div class="prose">
      ${longHtml}
      ${p.highlights && p.highlights.length ? `<h2>Highlights</h2><ul>${highlightsHtml}</ul>` : ""}
      <div class="chips">${chipsHtml}</div>
      ${langbar}
      ${langMeta ? `<div style="margin-top:8px;font-family:var(--mono);font-size:11px;color:var(--muted)">${langMeta}</div>` : ""}
      ${statsHtml ? `<div class="stats">${statsHtml}</div>` : ""}
    </div>
  </article>
  ${faqHtml ? `<section style="margin-top:18px"><div style="font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:10px;display:flex;align-items:center;gap:10px"><i style="width:28px;height:1px;background:var(--ink)"></i> FAQ — ${escHtml(p.name)}</div><div style="display:grid;gap:10px">${faqHtml}</div></section>` : ""}
  ${relatedHtml}
  <div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap">
    ${ctaLive}
    ${ctaRepo}
    <a href="/projects" style="font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;border:1px solid var(--ink);padding:11px 14px;background:var(--sheet);text-decoration:none">← All projects</a>
    <a href="https://github.com/hariomlohardev" target="_blank" rel="noopener" style="font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;background:var(--ink);color:white;padding:11px 14px;border:1px solid var(--ink);text-decoration:none">GitHub ↗</a>
  </div>
</main>
<footer>
  <div class="wrap foot-in">
    <span>© ${new Date().getFullYear()} <b>Hariom Lohar</b> — Lab Notebook No.01 · <a href="https://github.com/hariomlohardev" style="text-decoration:underline">hariomlohardev on GitHub</a></span>
    <span><a href="/projects">Projects</a> · <a href="/blog">Blog</a> · <a href="#top">Top ↑</a></span>
  </div>
</footer>
<script>
(function(){
  var prog=document.getElementById('prog');
  var q=false;
  function onScroll(){ if(q) return; q=true; requestAnimationFrame(function(){ q=false; var h=document.documentElement.scrollHeight-window.innerHeight; if(prog) prog.style.width=(h>0?(window.scrollY/h)*100:0)+'%'; }); }
  window.addEventListener('scroll',onScroll,{passive:true}); onScroll();
})();
</script>
<!-- Cloudflare Web Analytics --><script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "7c8c6879055d45ba894f6ac0ce1cc51a"}'></script><!-- End Cloudflare Web Analytics -->
</body>
</html>`;
}

// generate
try{ fs.mkdirSync(PROJECTS_P_DIR, {recursive:true}); }catch{}
try{ fs.mkdirSync(OG_DIR, {recursive:true}); }catch{}

for(const p of projects){
  const slug = p.slug ? toSlug(p.slug) : toSlug(p.id);
  if(!slug || !p.name){ console.warn(`skip bad project ${p.id}`); continue; }
  const dir = path.join(PROJECTS_P_DIR, slug);
  fs.mkdirSync(dir, {recursive:true});
  const html = projectPage({...p, slug});
  fs.writeFileSync(path.join(dir,"/"), html);
  console.log(`→ projects/p/${slug}/index.html`);
  // og svg if no cover
  if(!p.cover){
    try{
      const svg = ogSvg({...p, slug});
      fs.writeFileSync(path.join(OG_DIR, slug + ".svg"), svg);
      console.log(`→ og/${slug}.svg`);
    }catch(e){ console.warn('og fail', slug, e.message); }
  }
}

// patch sitemap.xml
if(fs.existsSync(SITEMAP_XML)){
  let sitemap = fs.readFileSync(SITEMAP_XML,"utf8");
  let added=0;
  const today = new Date().toISOString().slice(0,10);
  for(const p of projects){
    const slug = p.slug ? toSlug(p.slug) : toSlug(p.id);
    const loc = `${SITE}/projects/p/${slug}/`;
    if(!sitemap.includes(loc)){
      const priority = p.kind==="live" ? "0.8" : "0.6";
      sitemap = sitemap.replace("</urlset>", `  <url><loc>${escXml(loc)}</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>${priority}</priority></url>\n</urlset>`);
      added++;
    }
  }
  if(added){ fs.writeFileSync(SITEMAP_XML, sitemap); console.log(`→ patched ${SITEMAP_XML} (+${added} project detail urls)`); }
  else console.log(`sitemap already has project detail entries, skipping patch`);
}

console.log(`done — ${projects.length} project detail pages`);
