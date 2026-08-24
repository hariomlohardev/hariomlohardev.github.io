#!/usr/bin/env node
"use strict";
/**
 * curate-opensource.js — add PR urls to opensource-curated.json
 * Usage:
 *   node scripts/curate-opensource.js https://github.com/numpy/numpy/pull/32223 https://github.com/hariomlohardev/inkdown/pull/27
 *   node scripts/curate-opensource.js --list
 *   node scripts/curate-opensource.js --remove https://github.com/numpy/numpy/pull/32223
 *
 * No deps, uses https. Requires no token for public PRs (60/hr anon). Set GITHUB_TOKEN env for higher rate.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const CURATED = path.resolve(__dirname, "../opensource-curated.json");

function readCurated(){
  try{ return JSON.parse(fs.readFileSync(CURATED,"utf8")); }catch(e){ return {generated_at:new Date().toISOString(), prs:[], issues:[]}; }
}
function writeCurated(j){
  j.generated_at = new Date().toISOString();
  j.generated_at_iso = j.generated_at;
  fs.writeFileSync(CURATED, JSON.stringify(j,null,2)+"\n", "utf8");
  console.log(`wrote ${CURATED} — ${j.prs.length} prs`);
}

function ghGet(url){
  return new Promise((res,rej)=>{
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: "GET",
      headers: {
        "User-Agent": "hariomlohardev-curate",
        "Accept": "application/vnd.github+json",
        ...(process.env.GITHUB_TOKEN ? {Authorization: `Bearer ${process.env.GITHUB_TOKEN}`} : {})
      }
    };
    const req = https.request(opts, r=>{
      let d=""; r.on("data",c=>d+=c); r.on("end",()=>{
        if(r.statusCode>=200 && r.statusCode<300){
          try{ res(JSON.parse(d)); }catch(e){ rej(e); }
        } else rej(new Error(`GET ${url} -> ${r.statusCode} ${d.slice(0,200)}`));
      });
    });
    req.on("error", rej); req.end();
  });
}

async function fetchPR(prUrl){
  // prUrl: https://github.com/owner/repo/pull/123
  const m = prUrl.match(/github\.com\/([^\/]+\/[^\/]+)\/pull\/(\d+)/);
  if(!m) throw new Error(`Bad PR url: ${prUrl}`);
  const repo = m[1];
  const num = m[2];
  const api = `https://api.github.com/repos/${repo}/pulls/${num}`;
  console.log(`fetching ${api}`);
  const j = await ghGet(api);
  return {
    title: j.title,
    repo: j.base ? j.base.repo.full_name : repo,
    html_url: j.html_url,
    state: j.merged_at ? "merged" : j.state,
    merged: !!j.merged_at,
    body: (j.body||"").slice(0,300).replace(/\s+/g,' ').trim() || j.title,
    updated_at: j.updated_at,
    created_at: j.created_at,
    number: j.number
  };
}

async function main(){
  const args = process.argv.slice(2);
  if(args.includes("--list")){
    const j=readCurated();
    console.log(JSON.stringify(j,null,2));
    return;
  }
  if(args.includes("--remove")){
    const idx=args.indexOf("--remove");
    const url=args[idx+1];
    if(!url){ console.error("usage: --remove <pr_url>"); process.exit(1); }
    const j=readCurated();
    const before=j.prs.length;
    j.prs=j.prs.filter(p=>p.html_url !== url);
    console.log(`removed ${before - j.prs.length}`);
    writeCurated(j);
    return;
  }
  const urls = args.filter(a=> a.startsWith("http"));
  if(!urls.length){
    console.log("Usage: node scripts/curate-opensource.js <pr_url> [<pr_url> ...]");
    console.log("Example: node scripts/curate-opensource.js https://github.com/numpy/numpy/pull/32223");
    const j=readCurated();
    console.log(`Currently curated: ${j.prs.length} prs`);
    j.prs.forEach(p=> console.log(` - ${p.repo} #${p.number} — ${p.title} [${p.state}]`));
    return;
  }
  const curated = readCurated();
  for(const url of urls){
    if(curated.prs.some(p=> p.html_url===url || p.html_url.replace(/\/$/,'')===url.replace(/\/$/,''))){
      console.log(`skip dup ${url}`);
      continue;
    }
    try{
      const pr = await fetchPR(url);
      curated.prs.push(pr);
      console.log(`added ${pr.repo} #${pr.number} — ${pr.title}`);
    }catch(e){ console.error(`failed ${url}: ${e.message}`); }
  }
  // sort by updated_at desc
  curated.prs.sort((a,b)=> String(b.updated_at).localeCompare(String(a.updated_at)));
  writeCurated(curated);
}

main().catch(e=>{ console.error(e); process.exit(1); });
