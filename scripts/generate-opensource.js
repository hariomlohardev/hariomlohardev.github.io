#!/usr/bin/env node
"use strict";
/**
 * generate-opensource.js — auto open-source contributions snapshot
 * Fetches GitHub public API → opensource-data.json + patches sitemap.xml + optionally og/opensource.svg
 * Zero deps, uses built-in https. Works anonymous (60/hr) or with GITHUB_TOKEN (5k/hr via env).
 * Run locally: node scripts/generate-opensource.js
 * In CI: GITHUB_TOKEN=${{ secrets.GITHUB_TOKEN }} node scripts/generate-opensource.js
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.resolve(__dirname, "..");
const OUT_JSON = path.join(ROOT, "opensource-data.json");
const SITEMAP_XML = path.join(ROOT, "sitemap.xml");
const OG_DIR = path.join(ROOT, "og");
const SITE = "https://hariomlohardev.github.io";
const USER = "hariomlohardev";

function escHtml(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function escXml(s){ return escHtml(s); }
function escSvg(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function todayISO(){
  // IST date like rest of site (generate-blog uses YYYY-MM-DD, we do same ISO UTC date)
  return new Date().toISOString().slice(0,10);
}
function todayISTISO(){
  // generate generated_at with +05:30 offset similar to other scripts
  try{
    const d = new Date();
    // format as YYYY-MM-DDTHH:MM:SS+05:30
    const pad=n=>String(n).padStart(2,'0');
    const utc = d.getTime() + (d.getTimezoneOffset()*60000);
    const ist = new Date(utc + (5.5*3600000));
    return ist.toISOString().replace('Z','+05:30').slice(0,19)+'+05:30';
  }catch{ return new Date().toISOString(); }
}

function ghHeaders(useToken=true){
  const h = {
    "User-Agent": "hariomlohardev-opensource-snapshot",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  if(useToken){
    const tok = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GH_PAT || "";
    if(tok) h["Authorization"] = "Bearer " + tok.trim();
  }
  return h;
}

function httpsGet(url, useToken=true){
  return new Promise((resolve)=>{
    try{
      const u = new URL(url);
      const opts = {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: "GET",
        headers: ghHeaders(useToken)
      };
      const req = https.request(opts, (res)=>{
        let data="";
        res.on("data", c=> data+=c);
        res.on("end", ()=>{
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data,
            remaining: res.headers["x-ratelimit-remaining"],
            reset: res.headers["x-ratelimit-reset"]
          });
        });
      });
      req.on("error", e=> resolve({ status:0, headers:{}, body: String(e.message), remaining: null }));
      req.setTimeout(12000, ()=>{ req.destroy(); resolve({ status:0, headers:{}, body:"timeout", remaining:null}); });
      req.end();
    }catch(e){
      resolve({ status:0, headers:{}, body:String(e.message), remaining:null });
    }
  });
}

async function ghGet(url, verbose){
  const hasToken = !!(process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GH_PAT);
  let r = await httpsGet(url, true);
  if(verbose) console.log(`  GET ${url} -> ${r.status} remaining=${r.remaining}` + (hasToken ? " (with token)" : " (anonymous)"));
  if(r.status===401 && hasToken){
    console.warn(`  ! 401 Bad credentials — retrying anonymously (clear GITHUB_TOKEN/GH_TOKEN if this repeats)`);
    r = await httpsGet(url, false);
    if(verbose) console.log(`  RETRY ${url} -> ${r.status} remaining=${r.remaining} (anonymous)`);
  }
  return r;
}

function safeJson(s){
  try{ return JSON.parse(s); }catch{ return null; }
}

async function main(){
  const verbose = process.argv.includes("--verbose") || process.argv.includes("-v");
  console.log("[opensource] fetching GitHub → opensource-data.json");
  let reposRaw = [], prsRaw = [], eventsRaw = [];
  let rateRemaining = null;

  // 1) repos
  const reposUrl = `https://api.github.com/users/${USER}/repos?per_page=100&sort=updated`;
  const r1 = await ghGet(reposUrl, verbose);
  rateRemaining = r1.remaining;
  if(r1.status===200){
    const j = safeJson(r1.body);
    if(Array.isArray(j)) reposRaw = j;
  } else {
    console.warn(`  ! repos fetch failed: ${r1.status} ${r1.body.slice(0,180)}`);
  }

  // 2) PRs via search (covers contributions to any repo)
  const prUrl = `https://api.github.com/search/issues?q=author:${USER}+type:pr&per_page=30&sort=updated`;
  const r2 = await ghGet(prUrl, verbose);
  if(r2.remaining) rateRemaining = r2.remaining;
  if(r2.status===200){
    const j = safeJson(r2.body);
    if(j && Array.isArray(j.items)) prsRaw = j.items;
  } else {
    console.warn(`  ! prs fetch failed: ${r2.status} ${r2.body.slice(0,200)}`);
  }

  // 3) public events (recent push/pr/issue)
  const evUrl = `https://api.github.com/users/${USER}/events/public?per_page=50`;
  const r3 = await ghGet(evUrl, verbose);
  if(r3.remaining) rateRemaining = r3.remaining;
  if(r3.status===200){
    const j = safeJson(r3.body);
    if(Array.isArray(j)) eventsRaw = j;
  } else {
    console.warn(`  ! events fetch failed: ${r3.status} ${r3.body.slice(0,180)}`);
  }

  // if all three failed and we have an existing snapshot, keep it (offline mode)
  const haveAny = reposRaw.length || prsRaw.length || eventsRaw.length;
  if(!haveAny){
    if(fs.existsSync(OUT_JSON)){
      console.warn("[opensource] all fetches failed — keeping existing opensource-data.json (offline)");
      // still patch sitemap and generate og if needed, but don't overwrite data
      patchSitemap();
      await ensureOg();
      console.log(`[opensource] done (offline cache) — rate remaining ${rateRemaining||"?"}`);
      return;
    } else {
      // no cache and API failed — write a minimal fallback so page still renders
      console.warn("[opensource] API failed and no cache — writing fallback from projects-data.json");
      let fallbackRepos=[];
      try{
        const raw = JSON.parse(fs.readFileSync(path.join(ROOT,"projects-data.json"),"utf8"));
        const arr = raw.projects || raw;
        fallbackRepos = arr.map(p=> ({
          id: p.id, name: p.name, full_name: `hariomlohardev/${p.slug||p.id}`,
          html_url: p.repoUrl || p.url, description: p.description, language: (p.languages&&p.languages[0]&&p.languages[0].name)||"Python",
          stargazers_count: 0, forks_count:0, updated_at: todayISO(), pushed_at: todayISO(), fork:false, topics: p.chips||[]
        }));
      }catch{}
      reposRaw = fallbackRepos;
    }
  }

  // normalize repos
  const repos = reposRaw.map(r=> ({
    id: r.id || r.name,
    name: r.name,
    full_name: r.full_name || `${USER}/${r.name}`,
    html_url: r.html_url,
    description: r.description || "",
    language: r.language || (r.topics&&r.topics[0]) || "—",
    stars: r.stargazers_count || 0,
    forks: r.forks_count || 0,
    updated_at: (r.updated_at||"").slice(0,10),
    pushed_at: (r.pushed_at||"").slice(0,10),
    fork: !!r.fork,
    topics: Array.isArray(r.topics) ? r.topics.slice(0,6) : [],
    is_fork: !!r.fork
  }))
  .filter(r=> !r.fork || r.stars>0) // keep forks only if starred (signal)
  .sort((a,b)=> (b.stars - a.stars) || (b.updated_at||"").localeCompare(a.updated_at||""));

  // normalize PRs
  const prs = prsRaw.map(it=>{
    // repository_url is https://api.github.com/repos/OWNER/REPO
    let repoSlug = "";
    try{ const u = new URL(it.repository_url); const parts = u.pathname.split("/").filter(Boolean); repoSlug = parts.slice(1).join("/"); }catch{}
    const state = it.state; // open/closed
    const merged = it.pull_request && it.pull_request.merged_at ? true : false;
    const mergedLabel = merged ? "merged" : state;
    return {
      id: it.id,
      number: it.number,
      title: it.title,
      html_url: it.html_url,
      repo: repoSlug,
      repository_url: it.repository_url,
      state: mergedLabel,
      merged: merged,
      created_at: (it.created_at||"").slice(0,10),
      updated_at: (it.updated_at||"").slice(0,10),
      body: (it.body||"").slice(0,180),
      user: (it.user && it.user.login) || USER
    };
  });

  // normalize events → activity summary
  const activity = eventsRaw.slice(0,30).map(ev=>{
    const repo = ev.repo && ev.repo.name ? ev.repo.name : "";
    let kind="activity", title="", url=`https://github.com/${repo}`;
    let at = (ev.created_at||"").slice(0,10);
    if(ev.type==="PushEvent"){
      const msgs = (ev.payload && ev.payload.commits) ? ev.payload.commits.map(c=>c.message).slice(0,2).join(" · ").slice(0,120) : "";
      kind="push";
      title = `Pushed ${ev.payload && ev.payload.size ? ev.payload.size : 1} commit(s)${msgs?` — ${msgs}`:""}`;
      url = `https://github.com/${repo}/commits`;
    } else if(ev.type==="PullRequestEvent"){
      const pr = ev.payload && ev.payload.pull_request;
      kind="pr";
      title = `${ev.payload.action||"pull_request"} PR #${pr&&pr.number||""} — ${(pr&&pr.title)||ev.type}`;
      url = pr && pr.html_url ? pr.html_url : url;
    } else if(ev.type==="IssuesEvent"){
      const iss = ev.payload && ev.payload.issue;
      kind="issue";
      title = `${ev.payload.action||"issue"} #${iss&&iss.number||""} — ${(iss&&iss.title)||""}`.slice(0,140);
      url = iss && iss.html_url ? iss.html_url : url;
    } else if(ev.type==="CreateEvent"){
      title = `Created ${ev.payload.ref_type||""} ${ev.payload.ref||""}`.trim();
      kind="create";
    } else if(ev.type==="WatchEvent"){
      title = `Starred ${repo}`;
      kind="star";
    } else if(ev.type==="ForkEvent"){
      title = `Forked ${repo}`;
      kind="fork";
    } else {
      title = ev.type.replace("Event","");
    }
    return { type: ev.type, kind, repo, title: title.slice(0,140), url, at };
  }).filter(a=> a.repo && !a.repo.startsWith(`${USER}/${USER}`.toLowerCase()) || true); // keep all

  const stars_total = repos.reduce((s,r)=> s + (r.stars||0), 0);

  if (repos.length === 0) {
    throw new Error("[opensource] abort: repos empty — refusing to write empty snapshot (check GITHUB_TOKEN / rate limit); keeping existing " + path.relative(ROOT, OUT_JSON));
  }

  const out = {
    generated_at: todayISTISO(),
    generated_at_iso: new Date().toISOString(),
    user: USER,
    site: SITE,
    stats: {
      repos: repos.length,
      prs: prs.length,
      events: activity.length,
      stars_total
    },
    repos,
    prs,
    activity
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));
  console.log(`→ ${path.relative(ROOT, OUT_JSON)} — ${repos.length} repos, ${prs.length} PRs, ${activity.length} events — stars ${stars_total} — remaining ${rateRemaining||"?"}`);

  patchSitemap();
  await ensureOg();
  console.log("[opensource] done");
}

function patchSitemap(){
  if(!fs.existsSync(SITEMAP_XML)){
    console.warn("sitemap.xml not found, skipping patch");
    return;
  }
  let sitemap = fs.readFileSync(SITEMAP_XML,"utf8");
  const loc = `${SITE}/opensource`;
  const today = todayISO();
  if(sitemap.includes(loc)){
    // update lastmod to today if older
    // replace the <lastmod> for that loc
    const re = new RegExp(`(<loc>${escXml(loc)}<\\/loc>\\s*<lastmod>)[^<]+(<\\/lastmod>)`);
    if(re.test(sitemap)){
      sitemap = sitemap.replace(re, `$1${today}$2`);
      fs.writeFileSync(SITEMAP_XML, sitemap);
      console.log(`→ patched ${path.relative(ROOT, SITEMAP_XML)} lastmod → ${today} for opensource.html`);
    } else {
      console.log("sitemap already has opensource.html, no lastmod to patch");
    }
  } else {
    // inject before </urlset>
    const entry = `  <url><loc>${escXml(loc)}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>\n`;
    if(sitemap.includes("</urlset>")){
      sitemap = sitemap.replace("</urlset>", entry + "</urlset>");
    } else {
      sitemap += "\n" + entry;
    }
    fs.writeFileSync(SITEMAP_XML, sitemap);
    console.log(`→ patched ${path.relative(ROOT, SITEMAP_XML)} (+ opensource.html)`);
  }
}

async function ensureOg(){
  // optional og image for opensource.html — mirrors generate-blog.js ogSvg but static here
  try{
    if(!fs.existsSync(OG_DIR)) fs.mkdirSync(OG_DIR, {recursive:true});
    const out = path.join(OG_DIR, "opensource.svg");
    // only regenerate if missing or older than 7 days — cheap check: always write (tiny)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#FFFEFB"/>
  <rect x="0" y="0" width="1200" height="630" fill="none" stroke="#0B1220" stroke-width="12"/>
  <g opacity="0.35">
    <path d="M0 24 H1200 M0 48 H1200 M0 72 H1200 M0 96 H1200 M0 120 H1200" stroke="#E3ECFB" stroke-width="1"/>
    <path d="M24 0 V630 M48 0 V630 M72 0 V630 M96 0 V630" stroke="#E3ECFB" stroke-width="1"/>
  </g>
  <rect x="42" y="42" width="1116" height="546" fill="#FFFFFF" stroke="#0B1220" stroke-width="2"/>
  <rect x="42" y="42" width="1116" height="38" fill="#0B1220"/>
  <text x="62" y="66" font-family="Fragment Mono, monospace" font-size="11" letter-spacing="2" fill="#FFD400">LAB NOTEBOOK No.01 — HARIOM LOHAR</text>
  <text x="1098" y="66" font-family="Fragment Mono, monospace" font-size="10" fill="#8A9AB6" text-anchor="end">hariomlohardev.github.io/opensource.html</text>
  <text x="62" y="148" font-family="Fragment Mono, monospace" font-size="12" letter-spacing="4" fill="#6E7D9A">OPEN SOURCE — AUTO-SYNCED</text>
  <text x="62" y="250" font-family="Bricolage Grotesque, sans-serif" font-size="86" font-weight="800" fill="#0B1220">OPEN</text>
  <text x="62" y="334" font-family="Bricolage Grotesque, sans-serif" font-size="86" font-weight="800" fill="transparent" stroke="#0B1220" stroke-width="3">SOURCE</text>
  <rect x="62" y="360" width="420" height="14" fill="#FFD400" stroke="#0B1220" stroke-width="1.5" transform="rotate(-0.6 62 360)"/>
  <text x="62" y="420" font-family="Instrument Sans, sans-serif" font-size="20" fill="#334155">Contributions by Hariom Lohar (hariomlohardev) — repos, PRs &amp; activity.</text>
  <text x="62" y="452" font-family="Fragment Mono, monospace" font-size="11" fill="#6E7D9A">Auto-synced from api.github.com/users/hariomlohardev — Live on hariomlohardev.github.io</text>
  <g transform="translate(62 490)">
    <rect width="210" height="36" fill="#0B1220" stroke="#0B1220"/>
    <text x="16" y="23" font-family="Fragment Mono, monospace" font-size="11" letter-spacing="1" fill="#FFD400">hariomlohardev ↗</text>
    <rect x="224" width="160" height="36" fill="#FFD400" stroke="#0B1220"/>
    <text x="240" y="23" font-family="Fragment Mono, monospace" font-size="11" letter-spacing="1" fill="#0B1220" font-weight="600">View on GitHub →</text>
  </g>
</svg>`;
    fs.writeFileSync(out, svg);
    console.log(`→ ${path.relative(ROOT, out)}`);
  }catch(e){
    console.warn("og fail", e.message);
  }
}

main().catch(e=>{ console.error(e); process.exit(1); });
