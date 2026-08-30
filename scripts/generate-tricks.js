/**
 * scripts/generate-tricks.js — TRICKS build step
 *
 * Source of truth: Supabase `tricks` (fallback: committed tricks-data.json).
 * Writes:
 *   tricks-data.json           — static list fallback for /tricks
 *   tricks/p/<id>/index.html   — one static page per published trick
 *   trick.html                 — dynamic shell (?id=N) that vercel.json rewrites
 *                                /tricks/p/:id to, for tricks created after the
 *                                last build (filesystem wins when the static
 *                                page already exists)
 *   sitemap.xml                — + /tricks and every /tricks/p/<id>
 *
 * The design is never re-typed: tricks.html is read as the shell and only the
 * <head> SEO block, <main> and the page script are swapped, so header, footer,
 * tokens, prose styles and reveal behaviour can't drift from the list page.
 * Runs last in the build chain so its sitemap entries survive the other steps.
 * No npm deps (GitHub Pages CI runs the generators without `npm install`).
 */
const fs = require("fs");
const path = require("path");
require("./load-env")();

const ROOT = path.resolve(__dirname, "..");
const SITE = "https://hariomlohardev.github.io";
const SHELL_HTML = path.join(ROOT, "tricks.html");
const TRICKS_P_DIR = path.join(ROOT, "tricks", "p");
const DYN_HTML = path.join(ROOT, "trick.html");
const DATA_JSON = path.join(ROOT, "tricks-data.json");
const SITEMAP_XML = path.join(ROOT, "sitemap.xml");

const escHtml = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const escAttr = s => escHtml(s).replace(/'/g, "&#39;");
const escXml  = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const TICK = String.fromCharCode(96);

/* markdown -> html (mirrors mdToHtml in api/admin/posts.js; used only when a
   row has no stored html, e.g. inserted straight through SQL) */
// a block that opens with a block-level tag can still end with plain text
// (a list followed by a sign-off line) — wrap that tail so it gets .prose p spacing.
function tailP(b){
  var m = b.match(/^([\s\S]*<\/(?:ul|ol|blockquote|pre|h[1-6])>)([\s\S]*)$/);
  if(!m || !m[2].trim()) return b;
  return m[1] + "\n<p>" + m[2].trim().replace(/\n/g, "<br />\n") + "</p>";
}
function mdToHtml(md){
  let s = String(md || "").replace(/\r\n/g, "\n");
  const codes = [];
  s = s.replace(/`{3}([a-zA-Z0-9_-]*)\n([\s\S]*?)`{3}/g, (m, lang, code) => {
    const i = codes.length;
    codes.push(`<pre><code class="lang-${lang || ""}">${escHtml(code.trimEnd())}</code></pre>`);
    return `__CODE_${i}__`;
  });
  s = s.replace(/`([^`]+?)`/g, (m, c) => "<code>" + escHtml(c) + "</code>");
  s = s.replace(/^######\s+(.+)$/gm, "<h6>$1</h6>").replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>").replace(/^####\s+(.+)$/gm, "<h4>$1</h4>");
  s = s.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>").replace(/^##\s+(.+)$/gm, "<h2>$1</h2>").replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");
  s = s.replace(/!\[([^\]]*?)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/g, '<img src="$2" alt="$1" loading="lazy" decoding="async" />');
  s = s.replace(/\[([^\]]+?)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g, '<a href="$2" rel="noopener">$1</a>');
  s = s.replace(/^>[ \t]?(.*)$/gm, "<blockquote>$1</blockquote>");
  s = s.replace(/<\/blockquote>\n<blockquote>/g, "<br />\n");
  s = s.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/^[ \t]*(\*\*\*|---)[ \t]*$/gm, "<hr />");
  s = s.split("\n").map(l => l.match(/^[ \t]*[-*][ \t]+/) ? l.replace(/^[ \t]*[-*][ \t]+(.+)/, "<li>$1</li>")
    : l.match(/^[ \t]*\d+\.[ \t]+/) ? l.replace(/^[ \t]*\d+\.[ \t]+(.+)/, "<li>$1</li>") : l).join("\n");
  s = s.replace(/(?:<li>.*<\/li>\n?)+/g, m => `<ul>\n${m.trim()}\n</ul>`);
  s = s.split(/\n{2,}/).map(b => {
    b = b.trim(); if (!b) return "";
    if (/^<(h\d|pre|ul|hr|blockquote|img)/.test(b) || b.startsWith("__CODE_")) return tailP(b);
    return `<p>${b.replace(/\n/g, "<br />\n")}</p>`;
  }).join("\n\n");
  codes.forEach((h, i) => { s = s.replace(`__CODE_${i}__`, h); });
  return s;
}

/* markdown -> plain text, for meta descriptions */
function plainText(md){
  let s = String(md || "");
  s = s.split(TICK + TICK + TICK).filter((x, i) => i % 2 === 0).join(" ");
  s = s.split(TICK).join("");
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  s = s.replace(/^#{1,6}\s+/gm, "").replace(/^\s*[-*+]\s+/gm, "").replace(/^\s*>\s?/gm, "").replace(/[*_]/g, "");
  return s.replace(/\s+/g, " ").trim();
}
const clip = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s; };
const pad3 = n => String(n == null ? "" : n).padStart(3, "0");
const fmtDate = iso => { try { return new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" }).toUpperCase(); } catch { return String(iso || "").slice(0, 10); } };

/* ── data: Supabase `tricks` is the source of truth ─────────────────── */
const REST_COLS = "id,title,raw,html,tags,published,word_count,reading_minutes,created_at,updated_at";

async function loadFromSupabase(){
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if(!url || !key) return null;
  try{
    const endpoint = url.replace(/\/$/, "") + "/rest/v1/tricks?select=" + REST_COLS + "&published=eq.true&order=created_at.desc&limit=500";
    const res = await fetch(endpoint, { headers: { apikey: key, Authorization: "Bearer " + key } });
    if(!res.ok){
      const txt = await res.text().catch(() => "");
      console.warn("tricks: Supabase " + res.status + " " + txt.slice(0, 160) + " — falling back to tricks-data.json");
      return null;
    }
    const rows = await res.json();
    if(!Array.isArray(rows)) return null;
    return rows;
  }catch(e){
    console.warn("tricks: Supabase fetch failed:", e.message, "— falling back to tricks-data.json");
    return null;
  }
}

function loadFromJson(){
  if(!fs.existsSync(DATA_JSON)) return null;
  try{
    const j = JSON.parse(fs.readFileSync(DATA_JSON, "utf8"));
    return Array.isArray(j) ? j : (Array.isArray(j.tricks) ? j.tricks : null);
  }catch(e){ console.warn("tricks-data.json unreadable:", e.message); return null; }
}

function normalize(rows){
  return (rows || [])
    .filter(r => r && r.published !== false && /^[0-9]{1,18}$/.test(String(r.id == null ? "" : r.id)))
    .map(r => {
      const raw = r.raw != null ? String(r.raw) : "";
      const html = r.html ? String(r.html) : mdToHtml(raw);
      const text = plainText(raw);
      const wc = Number(r.word_count || r.wordCount) || text.split(/\s+/).filter(Boolean).length;
      const created = r.created_at || r.createdAt || new Date().toISOString();
      return {
        id: Number(r.id),
        title: String(r.title || ("Trick #" + r.id)).trim(),
        raw, html, text,
        tags: Array.isArray(r.tags) ? r.tags.map(x => String(x).trim()).filter(Boolean).slice(0, 8) : [],
        wordCount: wc,
        readingMinutes: Number(r.reading_minutes || r.readingMinutes) || Math.max(1, Math.ceil(wc / 200)),
        created_at: created,
        updated_at: r.updated_at || r.updatedAt || created,
        url: SITE + "/tricks/p/" + Number(r.id) + "/"
      };
    })
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

async function getTricks(){
  const fromSb = await loadFromSupabase();
  if(fromSb) return { tricks: normalize(fromSb), source: "Supabase" };
  const fromJson = loadFromJson();
  if(fromJson) return { tricks: normalize(fromJson), source: "tricks-data.json" };
  return { tricks: [], source: "none" };
}

/* ── shell splicing: tricks.html is the single source of design ─────── */
function readShell(){
  if(!fs.existsSync(SHELL_HTML)) throw new Error("tricks.html missing — the tricks shell is required");
  return fs.readFileSync(SHELL_HTML, "utf8").replace(/\r\n/g, "\n");
}
function swapHead(s, headHtml){
  const i0 = s.indexOf("<title>");
  const i1 = s.indexOf("</script>", i0);
  if(i0 < 0 || i1 < 0) throw new Error("shell: head SEO block not found");
  return s.slice(0, i0) + headHtml + s.slice(i1 + 9);
}
function swapMain(s, mainHtml){
  const i0 = s.indexOf('<main id="main">');
  const i1 = s.indexOf("</main>", i0);
  if(i0 < 0 || i1 < 0) throw new Error("shell: <main> not found");
  return s.slice(0, i0) + mainHtml + s.slice(i1 + 7);
}
const JS_MARK = "  /* ── tricks: Supabase is the source of truth";
const JS_TAIL = "})();\n</script>";
function swapScript(s, jsBody){
  const i0 = s.indexOf(JS_MARK);
  if(i0 < 0) throw new Error("shell: page script marker not found");
  const i1 = s.indexOf(JS_TAIL, i0);
  if(i1 < 0) throw new Error("shell: page script tail not found");
  return s.slice(0, i0) + jsBody + s.slice(i1);
}

const PERSON = SITE + "/#person";
const WEBSITE = SITE + "/#website";
function personNode(){
  return {"@type":"Person","@id":PERSON,"name":"Hariom Lohar","alternateName":["hariomlohardev","Hariom Lohar hariomlohardev"],"identifier":"https://github.com/hariomlohardev","givenName":"Hariom","familyName":"Lohar","url":SITE+"/","image":SITE+"/certificates/1.png","jobTitle":"Python / Django / Flutter Developer & AGI Researcher","address":{"@type":"PostalAddress","addressCountry":"IN"},"sameAs":["https://github.com/hariomlohardev","https://x.com/HariomloharAGI","https://www.linkedin.com/in/hariomlohar","https://dev.to/hariomlohardev","https://huggingface.co/hariomlohardev","https://hashnode.com/@hariomlohardev","https://medium.com/@hariomlohardev",SITE+"/"]};
}
function websiteNode(){
  return {"@type":"WebSite","@id":WEBSITE,"url":SITE+"/","name":"Hariom Lohar — Lab Notebook No.01","alternateName":"hariomlohardev.github.io","inLanguage":"en-IN","publisher":{"@id":PERSON}};
}

function headFor(t){
  const canonical = t.url;
  const desc = clip(t.text || t.title, 155) || ("Trick — " + t.title + " — by Hariom Lohar.");
  const ogImg = SITE + "/og/tricks.svg";
  const iso = new Date(t.created_at).toISOString();
  const mod = new Date(t.updated_at || t.created_at).toISOString();
  const webpage = {"@type":"WebPage","@id":canonical+"#webpage","url":canonical,"name":t.title+" — Trick — Hariom Lohar","isPartOf":{"@id":WEBSITE},"about":{"@id":PERSON},"author":{"@id":PERSON},"description":desc,"breadcrumb":{"@id":canonical+"#breadcrumb"},"inLanguage":"en-IN","primaryImageOfPage":{"@type":"ImageObject","contentUrl":ogImg},"datePublished":iso,"dateModified":mod};
  const crumbs = {"@type":"BreadcrumbList","@id":canonical+"#breadcrumb","itemListElement":[{"@type":"ListItem","position":1,"name":"Home — Hariom Lohar","item":SITE+"/"},{"@type":"ListItem","position":2,"name":"Tricks","item":SITE+"/tricks"},{"@type":"ListItem","position":3,"name":t.title,"item":canonical}]};
  const article = {"@type":"TechArticle","@id":canonical+"#article","headline":t.title,"name":t.title,"description":desc,"datePublished":iso,"dateModified":mod,"author":{"@id":PERSON},"publisher":{"@id":PERSON},"mainEntityOfPage":{"@id":canonical+"#webpage"},"url":canonical,"image":ogImg,"keywords":(t.tags||[]).join(", "),"wordCount":t.wordCount,"inLanguage":"en-IN","isPartOf":{"@id":WEBSITE},"about":{"@id":PERSON},"proficiencyLevel":"Beginner"};
  const jsonLd = {"@context":"https://schema.org","@graph":[personNode(), websiteNode(), webpage, crumbs, article]};
  return [
    "<title>" + escHtml(t.title) + " — Trick — Hariom Lohar</title>",
    '<meta name="description" content="' + escAttr(desc) + '" />',
    '<meta name="author" content="Hariom Lohar" />',
    '<meta name="robots" content="index, follow, max-image-preview:large" />',
    '<link rel="canonical" href="' + canonical + '" />',
    '<link rel="alternate" type="application/rss+xml" title="Hariom Lohar — Blog &amp; Daily Logs" href="' + SITE + '/feed.xml" />',
    '<link rel="author" href="https://github.com/hariomlohardev" />',
    '<link rel="me" href="https://github.com/hariomlohardev" />',
    '<meta property="og:site_name" content="Hariom Lohar — Lab Notebook №01" />',
    '<meta property="og:locale" content="en_IN" />',
    '<meta property="og:url" content="' + canonical + '" />',
    '<meta property="og:title" content="' + escAttr(t.title) + ' — Trick — Hariom Lohar" />',
    '<meta property="og:description" content="' + escAttr(desc) + '" />',
    '<meta property="og:type" content="article" />',
    '<meta property="article:published_time" content="' + iso + '" />',
    '<meta property="og:image" content="' + ogImg + '" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    '<meta name="twitter:title" content="' + escAttr(t.title) + ' — Trick — Hariom Lohar" />',
    '<meta name="twitter:description" content="' + escAttr(desc) + '" />',
    '<meta name="twitter:creator" content="@HariomloharAGI" />',
    '<meta name="twitter:site" content="@HariomloharAGI" />',
    '<script type="application/ld+json">' + JSON.stringify(jsonLd) + "</script>"
  ].join("\n");
}

/* the newsletter band is lifted straight out of the shell so it stays in sync */
function newsbandOf(shell){
  const i0 = shell.indexOf('<section class="newsband"');
  const i1 = shell.indexOf("</main>");
  if(i0 < 0 || i1 < 0) return "";
  const block = shell.slice(i0, i1);
  const j = block.lastIndexOf("</section>");
  return j < 0 ? "" : block.slice(0, j + 10);
}

function mainFor(t, newsband){
  const num = pad3(t.id);
  const tags = (t.tags || []).map(x => "<span>" + escHtml(x) + "</span>").join("");
  const read = t.readingMinutes + " min read";
  return [
    '<main id="main">',
    "  <!-- ══ TRICK HEAD ══ -->",
    '  <div class="masthead">',
    '    <div class="wrap">',
    '      <div class="crumb" style="padding-top:clamp(18px,3vw,28px)">',
    '        <a href="/">Hariom Lohar</a><span>/</span><a href="/tricks">Tricks</a><span>/</span><span style="color:var(--accent)">#' + num + "</span>",
    "      </div>",
    '      <div class="mast-body">',
    '        <p class="eyebrow"><i aria-hidden="true"></i><span>TRICK #' + num + " · " + escHtml(read.toUpperCase()) + "</span></p>",
    '        <h1 class="trick-title">' + escHtml(t.title) + "</h1>",
    '        <div class="meta"><b>FILED ' + escHtml(fmtDate(t.created_at)) + '</b><span class="sep">·</span><span>' + t.wordCount + ' words</span><span class="sep">·</span><span>' + escHtml(read) + "</span></div>",
    tags ? '        <div class="tags">' + tags + "</div>" : "",
    '        <div class="trick-actions">',
    '          <button class="btn" type="button" id="copyLink">Copy link</button>',
    '          <a class="btn" href="/tricks">All tricks →</a>',
    "        </div>",
    "      </div>",
    "    </div>",
    "  </div>",
    "",
    '  <div class="wrap">',
    '    <article class="trick-sheet rv">',
    '      <div class="rule"></div>',
    '      <div class="prose">',
    t.html,
    "      </div>",
    "    </article>",
    '    <div class="trick-foot">',
    '      <span class="fnote">Trick #' + num + " · Lab Notebook №01</span>",
    '      <a class="btn" href="/tricks">← Back to all tricks</a>',
    "    </div>",
    "",
    "    <!-- ══ NEWSLETTER ══ -->",
    "    " + newsband,
    "  </div>",
    "</main>"
  ].filter(x => x !== "").join("\n");
}

/* page script for a trick page — the list logic is not needed, only copy-link */
const TRICK_JS = [
  "  /* ── trick page: copy link ──────────────────────────────────────── */",
  "  var copyBtn=document.getElementById('copyLink');",
  "  if(copyBtn) copyBtn.addEventListener('click',function(){",
  "    var u=location.href.split('#')[0];",
  "    var done=function(){ var o=copyBtn.textContent; copyBtn.textContent='Copied ✓'; copyBtn.classList.add('copied');",
  "      setTimeout(function(){ copyBtn.textContent=o; copyBtn.classList.remove('copied'); },1600); };",
  "    if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(u).then(done,function(){ window.prompt('Copy link',u); });",
  "    else window.prompt('Copy link',u);",
  "  });",
  ""
].join("\n");

function pageFor(shell, t, newsband){
  let s = swapHead(shell, headFor(t));
  s = swapMain(s, mainFor(t, newsband));
  s = swapScript(s, TRICK_JS);
  return s;
}

/* ── dynamic viewer: /trick.html?id=N (rewrite target for fresh tricks) ── */
const DYN_HEAD = [
  "<title>Trick — Hariom Lohar · Lab Notebook №01</title>",
  '<meta name="description" content="A trick from the lab notebook of Hariom Lohar (hariomlohardev) — small, sharp, reusable." />',
  '<meta name="author" content="Hariom Lohar" />',
  '<meta name="robots" content="noindex, follow" />',
  '<link rel="alternate" type="application/rss+xml" title="Hariom Lohar — Blog &amp; Daily Logs" href="' + SITE + '/feed.xml" />',
  '<link rel="author" href="https://github.com/hariomlohardev" />',
  '<meta property="og:site_name" content="Hariom Lohar — Lab Notebook №01" />',
  '<meta property="og:locale" content="en_IN" />',
  '<meta property="og:type" content="article" />',
  '<meta property="og:image" content="' + SITE + '/og/tricks.svg" />',
  '<meta name="twitter:card" content="summary_large_image" />',
  '<meta name="twitter:creator" content="@HariomloharAGI" />',
  "<script>/* dynamic trick shell — the built page at /tricks/p/<id>/ wins on the filesystem */</script>"
].join("\n");

function dynMain(newsband){
  return [
    '<main id="main">',
    '  <div class="masthead">',
    '    <div class="wrap">',
    '      <div class="crumb" style="padding-top:clamp(18px,3vw,28px)">',
    '        <a href="/">Hariom Lohar</a><span>/</span><a href="/tricks">Tricks</a><span>/</span><span style="color:var(--accent)" id="tNum">#000</span>',
    "      </div>",
    '      <div class="mast-body">',
    '        <p class="eyebrow"><i aria-hidden="true"></i><span id="tEyebrow">LOADING TRICK…</span></p>',
    '        <h1 class="trick-title" id="tTitle">Loading…</h1>',
    '        <div class="meta" id="tMeta"></div>',
    '        <div class="tags" id="tTags"></div>',
    '        <div class="trick-actions">',
    '          <button class="btn" type="button" id="copyLink">Copy link</button>',
    '          <a class="btn" href="/tricks">All tricks →</a>',
    "        </div>",
    "      </div>",
    "    </div>",
    "  </div>",
    "",
    '  <div class="wrap">',
    '    <article class="trick-sheet">',
    '      <div class="rule"></div>',
    '      <div class="prose" id="tProse"><p class="tload">Fetching the trick…</p></div>',
    "    </article>",
    '    <div class="trick-foot">',
    '      <span class="fnote" id="tFoot">Lab Notebook №01</span>',
    '      <a class="btn" href="/tricks">← Back to all tricks</a>',
    "    </div>",
    "",
    "    <!-- ══ NEWSLETTER ══ -->",
    "    " + newsband,
    "  </div>",
    "</main>"
  ].join("\n");
}

const DYN_JS = [
  "  /* ── trick viewer: /tricks/p/<id> before the static page is built ─── */",
  "  var pad3=function(n){ return String(n==null?'':n).padStart(3,'0'); };",
  "  var fmt=function(iso){ try{ return new Date(iso).toLocaleDateString('en-GB',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric'}).toUpperCase(); }catch(e){ return String(iso||'').slice(0,10); } };",
  "  var esc=function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };",
  "  function idFromUrl(){",
  "    var m=/[?&]id=([0-9]{1,18})/.exec(location.search);",
  "    if(m) return m[1];",
  "    m=new RegExp('/tricks/p/([0-9]{1,18})').exec(location.pathname);",
  "    return m ? m[1] : '';",
  "  }",
  "  var TID=idFromUrl();",
  "  var elNum=document.getElementById('tNum'), elEye=document.getElementById('tEyebrow'), elTitle=document.getElementById('tTitle'),",
  "      elMeta=document.getElementById('tMeta'), elTags=document.getElementById('tTags'), elProse=document.getElementById('tProse'),",
  "      elFoot=document.getElementById('tFoot');",
  "  function fail(msg){",
  "    if(elEye) elEye.textContent='NOT FOUND';",
  "    if(elTitle) elTitle.textContent='This trick is not here';",
  "    if(elProse) elProse.innerHTML='<p>'+esc(msg)+'</p><p><a href=\"/tricks\">← Browse every trick</a></p>';",
  "    document.title='Trick not found — Hariom Lohar';",
  "  }",
  "  function paint(t){",
  "    var num=pad3(t.id), wc=Number(t.word_count||t.wordCount||0), rd=Number(t.reading_minutes||t.readingMinutes||0)||Math.max(1,Math.ceil(wc/200));",
  "    if(elNum) elNum.textContent='#'+num;",
  "    if(elEye) elEye.textContent='TRICK #'+num+' · '+rd+' MIN READ';",
  "    if(elTitle) elTitle.textContent=t.title||('Trick #'+num);",
  "    if(elMeta) elMeta.innerHTML='<b>FILED '+esc(fmt(t.created_at))+'</b><span class=\"sep\">·</span><span>'+wc+' words</span><span class=\"sep\">·</span><span>'+rd+' min read</span>';",
  "    if(elTags) elTags.innerHTML=(t.tags||[]).map(function(x){ return '<span>'+esc(x)+'</span>'; }).join('');",
  "    if(elProse) elProse.innerHTML=t.html||('<p>'+esc(t.raw||'')+'</p>');",
  "    if(elFoot) elFoot.textContent='Trick #'+num+' · Lab Notebook №01';",
  "    document.title=(t.title||('Trick #'+num))+' — Trick — Hariom Lohar';",
  "    var canon='https://hariomlohardev.github.io/tricks/p/'+t.id+'/';",
  "    var lc=document.querySelector('link[rel=\"canonical\"]');",
  "    if(!lc){ lc=document.createElement('link'); lc.setAttribute('rel','canonical'); document.head.appendChild(lc); }",
  "    lc.setAttribute('href',canon);",
  "    var ogu=document.querySelector('meta[property=\"og:url\"]');",
  "    if(!ogu){ ogu=document.createElement('meta'); ogu.setAttribute('property','og:url'); document.head.appendChild(ogu); }",
  "    ogu.setAttribute('content',canon);",
  "    if(history.replaceState && location.pathname.indexOf('/tricks/p/')<0) history.replaceState(null,'','/tricks/p/'+t.id+'/');",
  "    if(typeof observeReveals==='function') observeReveals(document);",
  "  }",
  "  var copyBtn=document.getElementById('copyLink');",
  "  if(copyBtn) copyBtn.addEventListener('click',function(){",
  "    var u=location.href.split('#')[0];",
  "    var done=function(){ var o=copyBtn.textContent; copyBtn.textContent='Copied ✓'; copyBtn.classList.add('copied');",
  "      setTimeout(function(){ copyBtn.textContent=o; copyBtn.classList.remove('copied'); },1600); };",
  "    if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(u).then(done,function(){ window.prompt('Copy link',u); });",
  "    else window.prompt('Copy link',u);",
  "  });",
  "  if(!TID){ location.replace('/tricks'); }",
  "  else {",
  "    fetch('/api/tricks?id='+encodeURIComponent(TID),{headers:{Accept:'application/json'}})",
  "      .then(function(r){ if(!r.ok) throw new Error('api'); return r.json(); })",
  "      .then(function(j){ var t=(j&&j.trick)||(j&&j.tricks&&j.tricks[0]); if(!t) throw new Error('none'); return t; })",
  "      .catch(function(){",
  "        return fetch('/tricks-data.json',{cache:'no-cache'}).then(function(r){ return r.json(); }).then(function(j){",
  "          var arr=Array.isArray(j)?j:(j.tricks||[]);",
  "          var t=arr.filter(function(x){ return String(x.id)===String(TID); })[0];",
  "          if(!t) throw new Error('none'); return t;",
  "        });",
  "      })",
  "      .then(paint)",
  "      .catch(function(){ fail('Trick #'+pad3(TID)+' could not be loaded — it may be unpublished or removed.'); });",
  "  }",
  ""
].join("\n");

function dynPage(shell, newsband){
  let s = swapHead(shell, DYN_HEAD);
  s = swapMain(s, dynMain(newsband));
  s = swapScript(s, DYN_JS);
  return s;
}

/* ── writers ────────────────────────────────────────────────────────── */
function writeIfChanged(p, s){
  if(fs.existsSync(p) && fs.readFileSync(p, "utf8") === s) return false;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s);
  return true;
}

function writeData(tricks){
  const payload = {
    generated: new Date().toISOString(),
    count: tricks.length,
    tricks: tricks.map(t => ({
      id: t.id, title: t.title, raw: t.raw, html: t.html, tags: t.tags,
      published: true, word_count: t.wordCount, reading_minutes: t.readingMinutes,
      created_at: t.created_at, updated_at: t.updated_at
    }))
  };
  writeIfChanged(DATA_JSON, JSON.stringify(payload, null, 2) + "\n");
  console.log("→ tricks-data.json (" + tricks.length + ")");
}

function writeStatic(shell, tricks, newsband){
  fs.mkdirSync(TRICKS_P_DIR, { recursive: true });
  let written = 0;
  for(const t of tricks){
    if(writeIfChanged(path.join(TRICKS_P_DIR, String(t.id), "index.html"), pageFor(shell, t, newsband))) written++;
  }
  const keep = new Set(tricks.map(t => String(t.id)));
  let pruned = 0;
  for(const d of fs.readdirSync(TRICKS_P_DIR, { withFileTypes: true })){
    if(!d.isDirectory() || !/^[0-9]{1,18}$/.test(d.name) || keep.has(d.name)) continue;
    fs.rmSync(path.join(TRICKS_P_DIR, d.name), { recursive: true, force: true });
    pruned++;
  }
  console.log("→ tricks/p/<id>/index.html — " + tricks.length + " pages (" + written + " rewritten" + (pruned ? ", " + pruned + " pruned" : "") + ")");
}

function patchSitemap(tricks){
  if(!fs.existsSync(SITEMAP_XML)) return;
  let sm = fs.readFileSync(SITEMAP_XML, "utf8");
  const today = new Date().toISOString().slice(0, 10);
  const listUrl = SITE + "/tricks";
  let added = 0;
  const push = (loc, freq, pri) => {
    const key = "<loc>" + escXml(loc) + "</loc>";
    const at = sm.indexOf(key);
    if(at >= 0){
      const a = sm.indexOf("<lastmod>", at), b = sm.indexOf("</lastmod>", a);
      if(a > 0 && b > a && a < at + key.length + 40) sm = sm.slice(0, a + 9) + today + sm.slice(b);
      return;
    }
    sm = sm.replace("</urlset>", "  <url>" + key + "<lastmod>" + today + "</lastmod><changefreq>" + freq + "</changefreq><priority>" + pri + "</priority></url>\n</urlset>");
    added++;
  };
  push(listUrl, "weekly", "0.8");
  for(const t of tricks) push(t.url, "monthly", "0.6");
  fs.writeFileSync(SITEMAP_XML, sm);
  console.log("→ patched sitemap.xml (" + (added ? "+" + added + " urls, " : "") + "lastmod → " + today + ")");
}

async function main(){
  const { tricks, source } = await getTricks();
  const shell = readShell();
  const newsband = newsbandOf(shell);
  if(!newsband) console.warn("tricks: newsletter band not found in shell — trick pages will omit it");
  writeIfChanged(DYN_HTML, dynPage(shell, newsband));
  console.log("→ trick.html (dynamic shell for /tricks/p/<id>)");
  if(source === "none"){
    const why = process.env.SUPABASE_URL ? "Supabase unreachable/table missing and no tricks-data.json" : "no SUPABASE_URL/key and no tricks-data.json";
    console.warn("tricks: no source available (" + why + ") — kept existing pages, wrote the dynamic shell only");
    patchSitemap([]);
    return;
  }
  writeData(tricks);
  writeStatic(shell, tricks, newsband);
  patchSitemap(tricks);
  console.log("done — " + tricks.length + " tricks from " + source);
}

main().catch(e => { console.error(e); process.exit(1); });
