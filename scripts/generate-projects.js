#!/usr/bin/env node
"use strict";
/**
 * generate-projects.js — zero-deps static project-detail builder
 *
 * SOURCE OF TRUTH for blog posts: Supabase `public.posts` (published=true).
 * Related-post links come from Supabase `public.posts` (published=true) when
 * SUPABASE_URL + a key are set; there is no posts.json fallback, so without env
 * the projects still build and simply carry no related links.
 */
const fs = require("fs");
const path = require("path");
require("./load-env")();

const ROOT = path.resolve(__dirname, "..");
const DATA_JSON = path.join(ROOT, "projects-data.json");
// Supabase `posts` is the source of truth; this fallback is for local/offline.
const SITEMAP_XML = path.join(ROOT, "sitemap.xml");
const PROJECTS_P_DIR = path.join(ROOT, "projects", "p");
const OG_DIR = path.join(ROOT, "og");
const SITE = "https://hariomlohardev.github.io";

// helpers (mirrored from generate-blog.js)
function escHtml(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function escXml(s){ return escHtml(s); }
function escSvg(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function toSlug(s){ return String(s).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,64) || "project"; }
// Google truncates a <title> past ~65 chars and a description past ~165, so
// build both to fit: the title sheds its least useful parts, and a project can
// carry a hand-written `metaDescription` when its full one runs long.
function pageTitle(p){
  const full = `Hariom Lohar — ${p.name} · ${p.statusLabel} | hariomlohardev`;
  if(full.length <= 65) return full;
  const noHandle = `Hariom Lohar — ${p.name} · ${p.statusLabel}`;
  if(noHandle.length <= 65) return noHandle;
  return `Hariom Lohar — ${p.name} | hariomlohardev`.slice(0,65);
}
function metaDesc(p){
  const d = p.metaDescription || p.description || "";
  if(d.length <= 165) return d;
  const cut = d.slice(0,162);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), 120)).replace(/[,;:—-]$/,"") + "…";
}
function fmtDate(d){
  try{ return new Date(d+"T00:00:00+05:30").toLocaleDateString("en-GB",{timeZone:"Asia/Kolkata",day:"2-digit",month:"short",year:"numeric"}).toUpperCase(); }catch{ return d; }
}
// one renderer for the whole site — see assets/md.js
const {mdToHtml} = require("../assets/md.js");

// load projects data (sync — projects-data.json remains file-based; Supabase site_content key=projects is separate concern)
if(!fs.existsSync(DATA_JSON)){ console.error("projects-data.json missing"); process.exit(1); }
const rawData = JSON.parse(fs.readFileSync(DATA_JSON,"utf8"));
const projects = rawData.projects || rawData;
if(!Array.isArray(projects)){ console.error("projects-data.json: expected array"); process.exit(1); }

// ── posts loader (for relatedSlugs) ──────────────────────────────────
// Supabase `posts` is the only source. Without env, or on a failed read, the
// related-post links are simply left out — projects still build.
async function loadPostsBySlug(){
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if(url && key){
    try{
      const endpoint = `${url.replace(/\/$/,'')}/rest/v1/posts?select=slug,title,description,date,tags,cover,word_count,reading_minutes,published&published=eq.true&order=date.desc`;
      const res = await fetch(endpoint, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      if(res.ok){
        const rows = await res.json();
        if(Array.isArray(rows) && rows.length){
          const map = {};
          rows.forEach(r=>{
            const slug = r.slug;
            map[slug] = {
              slug,
              title: r.title,
              date: typeof r.date === 'string' ? r.date.slice(0,10) : String(r.date).slice(0,10),
              description: r.description || '',
              tags: Array.isArray(r.tags) ? r.tags : [],
              readingMinutes: r.reading_minutes ?? r.readingMinutes ?? 3,
              wordCount: r.word_count ?? r.wordCount ?? 0,
              url: `https://hariomlohardev.github.io/blog/p/${slug}/`,
              file: `${(typeof r.date==='string'? r.date.slice(0,10): String(r.date).slice(0,10))}-${slug}.md`,
              cover: r.cover || null,
            };
          });
          console.log(`→ posts: Supabase (${rows.length} published) — source of truth for relatedSlugs`);
          return map;
        }
        console.log("→ posts: Supabase has 0 published posts — relatedSlugs left empty");
        return {};
      } else {
        const txt = await res.text().catch(()=> '');
        console.warn(`Supabase posts fetch ${res.status} ${txt.slice(0,200)} — relatedSlugs left empty`);
      }
    }catch(e){ console.warn("Supabase fetch failed for postsBySlug:", e.message, "— relatedSlugs left empty"); }
  } else {
    console.warn("Supabase env not set — relatedSlugs left empty");
  }
  return {};
}

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

function projectPage(p, postsBySlug){
  const slug = p.slug ? toSlug(p.slug) : toSlug(p.id);
  const url = `${SITE}/projects/p/${slug}/`;
  const kindLabel = p.kind==="live" ? "Live · interactive" : "Code · repository";
  const kindBadge = p.kind==="live" ? '<span style="font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;padding:4px 9px;border:1px solid var(--red);color:var(--red);background:var(--red-soft)">◉ Live · interactive</span>' : '<span style="font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;padding:4px 9px;border:1px solid var(--green);color:var(--green);background:rgba(14,159,110,.10)">⑂ Code · repository</span>';
  const ogPngUrl = `${SITE}/og/${slug}.png`; // rasterized from og/<slug>.svg — crawlers refuse svg
  const ogImage = p.cover ? (p.cover.startsWith("http") ? p.cover : SITE + (p.cover.startsWith("/") ? p.cover : "/"+p.cover)) : ogPngUrl;
  const longHtml = p.longDescription ? mdToHtml(p.longDescription) : `<p>${escHtml(p.description)}</p>`;
  const chipsHtml = (p.chips||[]).map(c=>`<span style="font-family:var(--mono);font-size:10px;letter-spacing:.06em;text-transform:uppercase;background:var(--paper-2);border:1px solid var(--line);padding:4px 8px;color:var(--muted)">${escHtml(c)}</span>`).join(" ");
  const highlightsHtml = (p.highlights||[]).map(h=>`<li>${escHtml(h)}</li>`).join("");
  const langbar = (p.languages && p.languages.length>1) ? `<div style="display:flex;height:6px;border:1px solid var(--ink);overflow:hidden;background:var(--paper-2);max-width:320px;margin-top:10px">${p.languages.map(l=>`<i style="display:block;height:100%;width:${l.pct}%;background:${l.color}"></i>`).join("")}</div>` : "";
  const langMeta = (p.languages||[]).map(l=>`<span style="display:inline-flex;align-items:center;gap:6px"><i style="width:8px;height:8px;border-radius:50%;display:inline-block;background:${l.color}"></i>${escHtml(l.name)} ${l.pct}%</span>`).join(" · ");
  const statsHtml = (p.stats||[]).map(s=>`<div style="border:1px solid var(--line);background:var(--paper-2);padding:10px 12px;text-align:center"><div style="font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)">${escHtml(s.label)}</div><div style="font-family:var(--display);font-weight:800;font-size:1.25rem;margin-top:4px">${escHtml(s.value)}</div></div>`).join("");
  const faqHtml = (p.faq||[]).map((f,i)=>`<details style="border:1px solid var(--line);background:var(--sheet);padding:12px 14px" ${i===0?"open":""}><summary style="cursor:pointer;font-weight:600;list-style:none;display:flex;justify-content:space-between;gap:12px;align-items:center"><span>${escHtml(f.q)}</span><span style="font-family:var(--mono);font-size:11px;color:var(--muted);white-space:nowrap">tap ↕</span></summary><p style="margin-top:10px;color:#334155;line-height:1.65;font-size:14px">${escHtml(f.a)}</p></details>`).join("\n");
  const faqJson = (p.faq||[]).map(f=>({"@type":"Question","name":f.q,"acceptedAnswer":{"@type":"Answer","text":f.a}}));
  const related = (p.relatedSlugs||[]).map(s=>postsBySlug[s]).filter(Boolean).slice(0,3);
  const relatedHtml = related.length ? `<section id="related-logs" data-slugs="${escHtml((p.relatedSlugs||[]).join(','))}" style="margin-top:18px"><div style="font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:10px;display:flex;align-items:center;gap:10px"><i style="width:28px;height:1px;background:var(--ink)"></i> Related logs</div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px">${related.map(r=>`<a href="${r.url}" style="display:block;border:1px solid var(--ink);background:var(--sheet);padding:14px;text-decoration:none"><div style="font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)">${escHtml(r.date)} · ${r.readingMinutes} min</div><div style="font-family:var(--display);font-weight:800;text-transform:uppercase;margin-top:6px;line-height:1">${escHtml(r.title)}</div><div style="font-size:13px;color:#475569;margin-top:8px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escHtml(r.description)}</div><div style="margin-top:10px;font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--blue)">Read →</div></a>`).join("")}</div></section>` : ((p.relatedSlugs&&p.relatedSlugs.length)?`<section id="related-logs" data-slugs="${escHtml((p.relatedSlugs||[]).join(','))}" style="margin-top:18px"><div style="font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:10px;display:flex;align-items:center;gap:10px"><i style="width:28px;height:1px;background:var(--ink)"></i> Related logs</div><div style="font-family:var(--mono);font-size:12px;color:var(--muted)">Loading related logs from Supabase…</div></section>`:"");
  // Supabase-only client hydration for related logs — fetches fresh data via REST, replaces SSR if needed
  const relatedHydration = (p.relatedSlugs&&p.relatedSlugs.length) ? `<script>(function(){var slugs=${JSON.stringify(p.relatedSlugs||[])};var box=document.getElementById('related-logs');if(!box||!slugs.length)return;var anon=(document.querySelector('meta[name="supabase-anon"]')?.content)||'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnbXZocHRlYmtzbGtqbGVvaWxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0NDQwMTAsImV4cCI6MjEwMzAyMDAxMH0.nnaZiyKNOx-eT_5JTQNDwk5b3PCDKZv4f9Yc6wQtk_k';var url='https://rgmvhptebkslkjleoilc.supabase.co';function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}function fmt(d){try{return new Date(d+'T00:00:00+05:30').toLocaleDateString('en-GB',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric'}).toUpperCase();}catch(e){return d;}}var filter=slugs.map(function(s){return 'slug.eq.'+encodeURIComponent(s);}).join(',');var endpoint=url.replace(/\\/$/,'')+'/rest/v1/posts?select=slug,title,description,date,tags,reading_minutes&or=('+filter+')&published=eq.true';fetch(endpoint,{headers:{apikey:anon,Authorization:'Bearer '+anon}}).then(function(r){if(!r.ok)throw new Error('rest '+r.status);return r.json();}).then(function(rows){if(!Array.isArray(rows)||!rows.length){box.remove();return;}var by={};rows.forEach(function(r){by[r.slug]=r;});var ordered=slugs.map(function(s){return by[s];}).filter(Boolean);if(!ordered.length){box.remove();return;}var grid=ordered.map(function(r){var href='https://hariomlohardev.github.io/blog/p/'+r.slug+'/';var mins=r.reading_minutes||3;return '<a href="'+href+'" style="display:block;border:1px solid var(--ink);background:var(--sheet);padding:14px;text-decoration:none"><div style="font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)">'+esc(fmt(r.date))+' · '+mins+' min</div><div style="font-family:var(--display);font-weight:800;text-transform:uppercase;margin-top:6px;line-height:1">'+esc(r.title)+'</div><div style="font-size:13px;color:#475569;margin-top:8px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">'+esc(r.description||'')+'</div><div style="margin-top:10px;font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--blue)">Read →</div></a>';}).join('');var container=box.querySelector('div[style*="grid"]');if(container)container.innerHTML=grid;}).catch(function(){box.remove();});})();<\/script>` : "";
  const ctaLive = p.demoUrl ? `<a href="/${p.demoUrl}" style="font-family:var(--mono);font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;padding:12px 18px;display:inline-flex;align-items:center;gap:8px;background:var(--ink);color:var(--paper);border:1px solid var(--ink);text-decoration:none">Open live bench →</a>` : "";
  const ctaRepo = p.repoUrl ? `<a href="${p.repoUrl}" target="_blank" rel="noopener" style="font-family:var(--mono);font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;padding:12px 18px;display:inline-flex;align-items:center;gap:8px;background:var(--sheet);color:var(--ink);border:1px solid var(--ink);text-decoration:none">View code on GitHub ↗</a>` : "";
  // Full graph: Person#person, WebSite#website, WebPage#webpage, BreadcrumbList#breadcrumb, CreativeWork#work (+FAQ) — all reference #person, no duplicate @ids
  const personNode = {"@type":"Person","@id":SITE+"/#person","name":"Hariom Lohar","alternateName":["hariomlohardev","Hariom Lohar hariomlohardev"],"disambiguatingDescription":"The Hariom Lohar at hariomlohardev.github.io — GitHub hariomlohardev, Harvard CS50P 2026 cert 544021b8-ab89-4eb2-a433-9c0b949e658f — not any other person named Hariom Lohar.","identifier":"https://github.com/hariomlohardev","nationality":{"@type":"Country","name":"India"},"givenName":"Hariom","familyName":"Lohar","url":SITE+"/","image":SITE+"/certificates/1.png","jobTitle":"Python / Django / Flutter Developer & AGI Researcher","description":"Hariom Lohar — Harvard CS50P certified 2026. Python, Django, FastAPI & Flutter developer and AGI researcher from India, rebuilding intelligence from first principles since 1 July 2026 in public. GitHub: hariomlohardev. Canonical site hariomlohardev.github.io.","address":{"@type":"PostalAddress","addressCountry":"IN"},"sameAs":["https://github.com/hariomlohardev","https://x.com/HariomloharAGI","https://x.com/hariomlohardev","https://www.linkedin.com/in/hariomlohar","https://dev.to/hariomlohardev","https://huggingface.co/hariomlohardev","https://hashnode.com/@hariomlohardev","https://medium.com/@hariomlohardev",SITE+"/"],"knowsAbout":["Python","Django","FastAPI","Flutter","Dart","LangChain","RAG","NumPy","PyTorch","CNNs","Transformers","Computer Vision","Backpropagation","AGI","Attention","Residual Networks","LayerNorm","Harvard CS50P"],"hasCredential":{"@type":"EducationalOccupationalCredential","name":"CS50's Introduction to Programming with Python","credentialCategory":"certificate","recognizedBy":{"@type":"Organization","name":"Harvard University"},"url":"https://cs50.harvard.edu/certificates/544021b8-ab89-4eb2-a433-9c0b949e658f"}};
  const websiteNode = {"@type":"WebSite","@id":SITE+"/#website","url":SITE+"/","name":"Hariom Lohar — Lab Notebook No.01","alternateName":"hariomlohardev.github.io","description":"Official site of Hariom Lohar (hariomlohardev on GitHub) — Python/Django/Flutter, Harvard CS50P 2026, and AGI research lab notebook.","inLanguage":"en-IN","publisher":{"@id":SITE+"/#person"}};
  const webpageNode = {"@type":"WebPage","@id":url+"#webpage","url":url,"name":p.name+" — Hariom Lohar","isPartOf":{"@id":SITE+"/#website"},"about":{"@id":SITE+"/#person"},"author":{"@id":SITE+"/#person"},"description":p.description,"breadcrumb":{"@id":url+"#breadcrumb"},"inLanguage":"en-IN","primaryImageOfPage":{"@type":"ImageObject","contentUrl":ogImage}};
  const breadcrumbNode = {"@type":"BreadcrumbList","@id":url+"#breadcrumb","itemListElement":[{"@type":"ListItem","position":1,"name":"Home — Hariom Lohar","item":SITE+"/"},{"@type":"ListItem","position":2,"name":"Projects","item":SITE+"/projects"},{"@type":"ListItem","position":3,"name":p.name,"item":url}]};
  const workNode = {"@type":"CreativeWork","@id":url+"#work","name":p.name+" — by Hariom Lohar","description":p.description,"url":url,"author":{"@id":SITE+"/#person"},"isPartOf":{"@id":SITE+"/#website"},"about":{"@id":SITE+"/#person"},"publisher":{"@id":SITE+"/#person"},"image":{"@type":"ImageObject","url":ogImage}};
  const graph = [personNode, websiteNode, webpageNode, breadcrumbNode, workNode];
  if(faqJson.length) graph.push({"@type":"FAQPage","@id":url+"#faq","mainEntity":faqJson});
  const jsonLd = {"@context":"https://schema.org","@graph":graph};

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="theme-color" content="#F6F4EE" />
<meta name="color-scheme" content="light" />
<title>${escHtml(pageTitle(p))}</title>
<meta name="description" content="${escHtml(metaDesc(p))}" />
<meta name="author" content="Hariom Lohar" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<link rel="canonical" href="${url}" />
<link rel="author" href="https://github.com/hariomlohardev" />
<meta property="og:site_name" content="Hariom Lohar — Lab Notebook No.01" />
<meta property="og:locale" content="en_IN" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="Hariom Lohar — ${escHtml(p.name)} · ${escHtml(p.statusLabel)}" />
<meta property="og:description" content="${escHtml(metaDesc(p))}" />
<meta property="og:type" content="website" />
<meta property="og:image" content="${ogImage}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:type" content="image/png" />
<meta property="og:image:alt" content="${escHtml(p.name)} — Hariom Lohar · Lab Notebook No.01" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Hariom Lohar — ${escHtml(p.name)}" />
<meta name="twitter:description" content="${escHtml(metaDesc(p))}" />
<meta name="twitter:image" content="${ogImage}" />
<meta name="twitter:creator" content="@HariomloharAGI" />
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="icon" type="image/png" href="/favicon.png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<script>document.documentElement.classList.add('js')</script>
<link rel="preload" href="/assets/fonts/archivo-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/fraunces-latin-600-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/fonts.css?v=1">
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
      <nav aria-label="Primary"><a href="/">Home</a><a href="/projects" class="active" aria-current="page">Projects</a><a href="/opensource">Open Source</a><a href="/blog">Blog</a><a href="/tricks">Tricks</a><a href="/contact">Contact</a>
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
  ${relatedHydration}
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
<script type="module" src="/assets/speed-insights.js"></script>
</body>
</html>`;
}

async function main(){
  // related-post map — Supabase only, empty when unavailable
  const postsBySlug = await loadPostsBySlug();

  // generate
  try{ fs.mkdirSync(PROJECTS_P_DIR, {recursive:true}); }catch{}
  try{ fs.mkdirSync(OG_DIR, {recursive:true}); }catch{}

  for(const p of projects){
    const slug = p.slug ? toSlug(p.slug) : toSlug(p.id);
    if(!slug || !p.name){ console.warn(`skip bad project ${p.id}`); continue; }
    const dir = path.join(PROJECTS_P_DIR, slug);
    fs.mkdirSync(dir, {recursive:true});
    const html = projectPage({...p, slug}, postsBySlug);
    fs.writeFileSync(path.join(dir,"index.html"), html);
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

  console.log(`done — ${projects.length} project detail pages (${Object.keys(postsBySlug).length} posts available for related links)`);
}

main().catch(e=>{ console.error(e); process.exit(1); });
