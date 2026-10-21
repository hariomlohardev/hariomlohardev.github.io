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

// Reuse the archive's existing design without changing any other page.
const archive = fs.readFileSync(path.join(ROOT, "projects.html"), "utf8");
function archivePart(pattern, label){
  const match = archive.match(pattern);
  if(!match) throw new Error(`Project design source missing: ${label}`);
  return match[1];
}
const siteStyles = archivePart(/<style>([\s\S]*?)<\/style>/, "styles");
const siteHeader = archivePart(/(<header\b[\s\S]*?<\/header>)/, "header");
const siteFooter = archivePart(/(<footer\b[\s\S]*?<\/footer>)/, "footer");
const siteInteractions = archivePart(/\/\* ── scroll progress[\s\S]*?\*\/([\s\S]*?)\/\* ── eyebrow scramble/, "navigation")
  + archivePart(/\/\* ── clock \+ G shortcut \+ top ── \*\/([\s\S]*?)\/\* ── rotating/, "footer controls");

// helpers (mirrored from generate-blog.js)
function escHtml(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function escXml(s){ return escHtml(s); }
function escSvg(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function toSlug(s){ return String(s).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,64) || "project"; }
// Describe the actual project topic in search results; visible headings stay unchanged.
function pageTitle(p){
  const topics={
    'agi-research':'Neural Networks from Scratch',
    'micrograd-hk':'NumPy Autograd Engine',
    'peek':'Codebase Explorer CLI',
    'inkdown':'Local Markdown Editor',
    'practice-code':'Python Algorithms & DSA',
    'pkg-jupy':'Jupyter & Python Packages'
  };
  return `${p.name} — ${topics[p.slug] || p.statusLabel || 'Project'} | Hariom Lohar`;
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
  const statsHtml = (p.stats||[]).map(s=>`<div class="stat"><b>${escHtml(s.value)}</b><span>${escHtml(s.label)}</span></div>`).join("");
  const faqHtml = (p.faq||[]).map((f,i)=>`<details ${i===0?"open":""}><summary>${escHtml(f.q)}</summary><p>${escHtml(f.a)}</p></details>`).join("\n");
  const faqJson = (p.faq||[]).map(f=>({"@type":"Question","name":f.q,"acceptedAnswer":{"@type":"Answer","text":f.a}}));
  const related = (p.relatedSlugs||[]).map(s=>postsBySlug[s]).filter(Boolean).slice(0,3);
  const relatedHtml = related.length ? `<section id="related-logs" data-slugs="${escHtml((p.relatedSlugs||[]).join(','))}" style="margin-top:18px"><div style="font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:10px;display:flex;align-items:center;gap:10px"><i style="width:28px;height:1px;background:var(--ink)"></i> Related logs</div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px">${related.map(r=>`<a href="${r.url}" style="display:block;border:1px solid var(--ink);background:var(--sheet);padding:14px;text-decoration:none"><div style="font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)">${escHtml(r.date)} · ${r.readingMinutes} min</div><div style="font-family:var(--display);font-weight:600;font-size:1.5rem;margin-top:12px;line-height:1.2">${escHtml(r.title)}</div><div style="font-size:13px;color:var(--body);margin-top:8px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escHtml(r.description)}</div><div style="margin-top:10px;font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--blue)">Read →</div></a>`).join("")}</div></section>` : ((p.relatedSlugs&&p.relatedSlugs.length)?`<section id="related-logs" data-slugs="${escHtml((p.relatedSlugs||[]).join(','))}" style="margin-top:18px"><div style="font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:10px;display:flex;align-items:center;gap:10px"><i style="width:28px;height:1px;background:var(--ink)"></i> Related logs</div><div style="font-family:var(--mono);font-size:12px;color:var(--muted)">Loading related logs from Supabase…</div></section>`:"");
  // Supabase-only client hydration for related logs — fetches fresh data via REST, replaces SSR if needed
  const relatedHydration = (p.relatedSlugs&&p.relatedSlugs.length) ? `<script>(function(){var slugs=${JSON.stringify(p.relatedSlugs||[])};var box=document.getElementById('related-logs');if(!box||!slugs.length)return;var anon=(document.querySelector('meta[name="supabase-anon"]')?.content)||'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnbXZocHRlYmtzbGtqbGVvaWxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0NDQwMTAsImV4cCI6MjEwMzAyMDAxMH0.nnaZiyKNOx-eT_5JTQNDwk5b3PCDKZv4f9Yc6wQtk_k';var url='https://rgmvhptebkslkjleoilc.supabase.co';function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}function fmt(d){try{return new Date(d+'T00:00:00+05:30').toLocaleDateString('en-GB',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric'}).toUpperCase();}catch(e){return d;}}var filter=slugs.map(function(s){return 'slug.eq.'+encodeURIComponent(s);}).join(',');var endpoint=url.replace(/\\/$/,'')+'/rest/v1/posts?select=slug,title,description,date,tags,reading_minutes&or=('+filter+')&published=eq.true';fetch(endpoint,{headers:{apikey:anon,Authorization:'Bearer '+anon}}).then(function(r){if(!r.ok)throw new Error('rest '+r.status);return r.json();}).then(function(rows){if(!Array.isArray(rows)||!rows.length){box.remove();return;}var by={};rows.forEach(function(r){by[r.slug]=r;});var ordered=slugs.map(function(s){return by[s];}).filter(Boolean);if(!ordered.length){box.remove();return;}var grid=ordered.map(function(r){var href='https://hariomlohardev.github.io/blog/p/'+r.slug+'/';var mins=r.reading_minutes||3;return '<a href="'+href+'" style="display:block;border:1px solid var(--ink);background:var(--sheet);padding:14px;text-decoration:none"><div style="font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)">'+esc(fmt(r.date))+' · '+mins+' min</div><div style="font-family:var(--display);font-weight:600;font-size:1.5rem;margin-top:12px;line-height:1.2">'+esc(r.title)+'</div><div style="font-size:13px;color:var(--body);margin-top:8px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">'+esc(r.description||'')+'</div><div style="margin-top:10px;font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--blue)">Read →</div></a>';}).join('');var container=box.querySelector('div[style*="grid"]');if(container)container.innerHTML=grid;}).catch(function(){box.remove();});})();<\/script>` : "";
  const ctaLive = p.demoUrl ? `<a href="/${p.demoUrl}" class="btn solid">Open live bench →</a>` : "";
  const ctaRepo = p.repoUrl ? `<a href="${p.repoUrl}" target="_blank" rel="noopener" class="btn">View code on GitHub ↗</a>` : "";
  // Full graph: Person#person, WebSite#website, WebPage#webpage, BreadcrumbList#breadcrumb, CreativeWork#work (+FAQ) — all reference #person, no duplicate @ids
  const personNode = {"@type":"Person","@id":SITE+"/#person","name":"Hariom Lohar","alternateName":["hariomlohardev","Hariom Lohar hariomlohardev"],"disambiguatingDescription":"The Hariom Lohar at hariomlohardev.github.io — GitHub hariomlohardev, Harvard CS50P 2026 cert 544021b8-ab89-4eb2-a433-9c0b949e658f — not any other person named Hariom Lohar.","identifier":"https://github.com/hariomlohardev","nationality":{"@type":"Country","name":"India"},"givenName":"Hariom","familyName":"Lohar","url":SITE+"/","image":SITE+"/certificates/1.png","jobTitle":"Python / Django / Flutter Developer & AGI Researcher","description":"Hariom Lohar — Harvard CS50P certified 2026. Python, Django, FastAPI & Flutter developer and AGI researcher from India, rebuilding intelligence from first principles since 1 September 2026 in public. GitHub: hariomlohardev. Canonical site hariomlohardev.github.io.","address":{"@type":"PostalAddress","addressCountry":"IN"},"sameAs":["https://github.com/hariomlohardev","https://x.com/HariomloharAGI","https://x.com/hariomlohardev","https://www.linkedin.com/in/hariomlohar","https://dev.to/hariomlohardev","https://huggingface.co/hariomlohardev","https://hashnode.com/@hariomlohardev","https://medium.com/@hariomlohardev",SITE+"/"],"knowsAbout":["Python","Django","FastAPI","Flutter","Dart","LangChain","RAG","NumPy","PyTorch","CNNs","Transformers","Computer Vision","Backpropagation","AGI","Attention","Residual Networks","LayerNorm","Harvard CS50P"],"hasCredential":{"@type":"EducationalOccupationalCredential","name":"CS50's Introduction to Programming with Python","credentialCategory":"certificate","recognizedBy":{"@type":"Organization","name":"Harvard University"},"url":"https://cs50.harvard.edu/certificates/544021b8-ab89-4eb2-a433-9c0b949e658f"}};
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
${siteStyles}
:root{--display:var(--serif);--blue:var(--accent);--red:var(--accent);--red-soft:var(--accent-soft)}
.breadcrumb{display:flex;flex-wrap:wrap;gap:10px;padding:24px 0 0;font:10px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.breadcrumb a:hover{color:var(--accent)}
.hero{padding-top:clamp(36px,6vw,72px)}
.hero h1{font-size:clamp(2.6rem,7vw,6rem);overflow-wrap:anywhere;text-transform:none}
.meta{margin-top:20px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;color:var(--muted);font:11px var(--mono)}
.project-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}
main>.project-actions{padding:32px 0 56px;border-top:1px solid var(--line)}
.paper{padding:clamp(28px,5vw,56px) 0;margin:0;max-width:78ch}
.prose{font-size:16px;line-height:1.8;color:var(--body);overflow-wrap:anywhere}
.prose h2{font:600 clamp(1.8rem,3vw,2.6rem)/1.1 var(--serif);letter-spacing:-.03em;color:var(--ink);margin:36px 0 18px}
.prose p{margin:0 0 18px}
.prose a{color:var(--accent);text-decoration:underline;text-underline-offset:3px}
.prose ul,.prose ol{padding-left:22px;margin:18px 0 28px}
.prose li{margin:8px 0}
.prose code{font: .85em var(--mono);background:var(--paper-2);padding:2px 5px}
.prose pre{padding:20px;background:var(--ink);color:var(--paper);overflow:auto;margin:24px 0}
.prose pre code{background:none;padding:0;color:inherit}
.stats{grid-template-columns:repeat(auto-fit,minmax(140px,1fr))}
.stats .stat b{font-size:2rem;overflow-wrap:anywhere}
.project-faq{border-top:1px solid var(--line)}
.project-faq details{border-bottom:1px solid var(--line);padding:20px 0}
.project-faq summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:20px;color:var(--ink);font-weight:500}
.project-faq summary::-webkit-details-marker{display:none}
.project-faq summary::after{content:'›';font-family:var(--mono);color:var(--accent);transition:transform .2s}
.project-faq details[open] summary::after{transform:rotate(90deg)}
.project-faq p{max-width:70ch;margin-top:16px;line-height:1.75;color:var(--body)}
#related-logs{border-top:1px solid var(--line)}
#related-logs a:hover{border-color:var(--accent)}
@media(max-width:760px){.project-actions .btn{justify-content:center;width:100%}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.prose{font-size:15px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after{animation:none!important;transition:none!important}}
</style>
</head>
<body>
<a href="#main" class="skip" style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden">Skip to content</a>
<style>.skip:focus{left:16px;top:10px;width:auto;height:auto;padding:8px 12px;background:var(--ink);color:var(--paper);z-index:100;border:1px solid var(--signal);font-family:var(--mono);font-size:12px}</style>
<div id="prog" aria-hidden="true"></div>
${siteHeader}
<main class="wrap" id="main">
  <div class="breadcrumb"><a href="/">Hariom Lohar</a><span>›</span><a href="/projects">Projects</a><span>›</span><span>${escHtml(p.name)}</span></div>
  <div class="hero">
    <div class="eyebrow"><i></i> ${escHtml(kindLabel)} · ${escHtml(p.statusLabel)}</div>
    <h1>${escHtml(p.name)}</h1>
    <p class="lede">${escHtml(p.description)}</p>
    <div class="meta"><span>${kindBadge}</span><span>·</span><span>${escHtml(p.statusLabel)}</span></div>
    <div class="project-actions">${ctaLive} ${ctaRepo} <a href="/projects" class="btn">← Back to archive</a></div>
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
  ${faqHtml ? `<section class="project-faq"><div style="font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:10px;display:flex;align-items:center;gap:10px"><i style="width:28px;height:1px;background:var(--ink)"></i> FAQ — ${escHtml(p.name)}</div><div style="display:grid;gap:10px">${faqHtml}</div></section>` : ""}
  ${relatedHtml}
  ${relatedHydration}
  <div class="project-actions">
    ${ctaLive}
    ${ctaRepo}
    <a href="/projects" class="btn">← All projects</a>
    <a href="https://github.com/hariomlohardev" target="_blank" rel="noopener" class="btn solid">GitHub ↗</a>
  </div>
</main>
${siteFooter}
<script>
(function(){
var reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var ghUrl='https://github.com/hariomlohardev';
function $(id){return document.getElementById(id);}
document.getElementById('yr').textContent=new Date().getFullYear();
${siteInteractions}
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

  // Canonical sitemap generation runs after all pages have been written.

  console.log(`done — ${projects.length} project detail pages (${Object.keys(postsBySlug).length} posts available for related links)`);
}

main().catch(e=>{ console.error(e); process.exit(1); });
