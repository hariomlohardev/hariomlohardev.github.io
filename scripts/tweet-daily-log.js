#!/usr/bin/env node
"use strict";
/**
 * tweet-daily-log.js — $0 auto-tweet for hariomlohardev.github.io
 * Reads posts.json (sorted desc) → composes tweet for latest post → POSTs to X API v2 /2/tweets via OAuth 1.0a
 * Zero extra hosting, runs in GitHub Actions. Dry-run if secrets missing.
 * Env: X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET (primary @HariomloharAGI)
 *      X_API_KEY_ALT, X_API_SECRET_ALT, X_ACCESS_TOKEN_ALT, X_ACCESS_SECRET_ALT (optional @hariomlohardev)
 *      DRY_RUN=1 to force log-only, TWEET_TEXT override for testing
 * Trigger: .github/workflows/tweet-daily-log.yml on push paths posts/*.md or manual dispatch
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const POSTS_JSON = path.join(ROOT, "posts.json");
const SITE = "https://hariomlohardev.github.io";

// --- helpers ---
function esc(s){ return String(s); }

function composeTweet(post){
  // Tweet layout (readable, viral): title \n\n desc \n\n url \n tags
  // Keep ≤ 280 chars (X counts any URL as 23 chars via t.co)
  const title = post.title;
  const url = post.url;
  const tagStr = (post.tags||[]).map(t=>"#"+t.replace(/[^a-z0-9]/gi,"")).join(" ");
  const extra = " #HariomLohar #hariomlohardev";
  const tagsBlock = `${tagStr}${extra}`.trim();
  const rawDesc = (post.description||"").trim();
  const TCO = 23;
  const urlLine = TCO; // counted
  // reserve: title + \n\n + desc + \n\n + urlLine + \n + tagsBlock
  const reserveNoDesc = title.length + 4 + urlLine + 1 + tagsBlock.length;
  let maxDesc = 280 - reserveNoDesc - 2; // -2 for \n\n between desc and url
  if(maxDesc < 24) maxDesc = 24;
  let desc = rawDesc;
  if(desc.length > maxDesc) desc = desc.slice(0, maxDesc-1).trimEnd() + "…";
  let tweet = `${title}\n\n${desc}\n\n${url}\n${tagsBlock}`;
  // hard cap 280 using counted URL length: if over, shrink desc further
  // compute counted length (replace real url len with TCO)
  function countedLen(s){ return s.length - url.length + TCO; }
  while(countedLen(tweet) > 280 && desc.length > 20){
    desc = desc.slice(0, Math.max(20, desc.length - 12)).trimEnd() + "…";
    tweet = `${title}\n\n${desc}\n\n${url}\n${tagsBlock}`;
  }
  if(countedLen(tweet) > 280) tweet = `${title}\n\n${url}\n${tagsBlock}`.slice(0, 279);
  return tweet;
}

// OAuth 1.0a header for api.twitter.com
function oauthHeader({method, url, params, consumerKey, consumerSecret, token, tokenSecret}){
  const oauth = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now()/1000).toString(),
    oauth_token: token,
    oauth_version: '1.0',
  };
  const all = {...params, ...oauth};
  const paramStr = Object.keys(all).sort().map(k=> `${encodeURIComponent(k)}=${encodeURIComponent(all[k])}`).join('&');
  const base = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(paramStr)}`;
  const key = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  const sig = crypto.createHmac('sha1', key).update(base).digest('base64');
  oauth.oauth_signature = sig;
  return 'OAuth ' + Object.keys(oauth).sort().map(k=> `${encodeURIComponent(k)}="${encodeURIComponent(oauth[k])}"`).join(', ');
}

async function postTweet(text, creds, label){
  const url = 'https://api.twitter.com/2/tweets';
  const method = 'POST';
  const body = JSON.stringify({text});
  if(!creds.consumerKey || !creds.consumerSecret || !creds.token || !creds.tokenSecret){
    console.log(`[dry-run:${label}] missing creds — would tweet:\n---\n${text}\n---\n(${text.length} chars)`);
    return {dryRun:true};
  }
  if(process.env.DRY_RUN==="1"){
    console.log(`[dry-run:${label}] DRY_RUN=1 — would tweet:\n---\n${text}\n---`);
    return {dryRun:true};
  }
  const header = oauthHeader({
    method, url, params:{},
    consumerKey: creds.consumerKey,
    consumerSecret: creds.consumerSecret,
    token: creds.token,
    tokenSecret: creds.tokenSecret,
  });
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': header,
      'Content-Type': 'application/json',
    },
    body,
  });
  const data = await res.json().catch(()=> ({}));
  if(!res.ok){
    console.error(`[error:${label}] X API ${res.status}`, JSON.stringify(data, null, 2));
    // handle duplicate (187) vs rate limit (429) etc.
    if(data.detail && data.detail.includes("duplicate")){
      console.log(`[info:${label}] duplicate — skipping`);
      return {duplicate:true, data};
    }
    throw new Error(`X post failed ${label}: ${res.status} ${JSON.stringify(data)}`);
  }
  console.log(`[ok:${label}] tweeted id=${data.data && data.data.id} — ${text.slice(0,60)}…`);
  return data;
}

// --- main ---
(async () => {
  if(!fs.existsSync(POSTS_JSON)){ console.error("posts.json missing — run node scripts/generate-blog.js first"); process.exit(1); }
  const posts = JSON.parse(fs.readFileSync(POSTS_JSON,"utf8"));
  if(!Array.isArray(posts) || !posts.length){ console.error("posts.json empty"); process.exit(1); }

  // Detect changed post vs latest: if env CHANGED_SLUG provided (from workflow git diff), use that; else latest
  let target = posts[0];
  const changedSlug = process.env.CHANGED_SLUG || process.env.TWEET_SLUG;
  if(changedSlug){
    const found = posts.find(p=>p.slug===changedSlug);
    if(found) target = found;
    else console.warn(`CHANGED_SLUG ${changedSlug} not in posts.json, using latest ${target.slug}`);
  } else if(process.env.GITHUB_ACTIONS){
    // try to detect changed files via CHANGED_FILES env (space-separated) set by workflow
    const changedFiles = (process.env.CHANGED_FILES||"").split(/\s+/).filter(Boolean);
    const mdFile = changedFiles.find(f=>f.startsWith("posts/") && f.endsWith(".md") && !f.includes("README"));
    if(mdFile){
      try{
        const raw = fs.readFileSync(path.join(ROOT, mdFile),"utf8");
        const m = raw.match(/slug:\s*["']?([^"'\n]+)["']?/);
        const slugFromMd = m ? m[1].trim().replace(/^["']|["']$/g,"") : null;
        const byFile = slugFromMd ? posts.find(p=>p.slug===slugFromMd) : null;
        if(byFile) target = byFile;
        else {
          // fallback by filename
          const base = path.basename(mdFile).replace(/\.md$/,"").replace(/^\d{4}-\d{2}-\d{2}-/,"");
          const byBase = posts.find(p=>p.slug===base);
          if(byBase) target = byBase;
        }
      }catch(e){ console.warn("changed file detect fail", e.message); }
    }
  }

  const override = process.env.TWEET_TEXT;
  const text = override ? String(override).slice(0,280) : composeTweet(target);
  console.log(`→ target: ${target.slug} — ${target.title} (${text.length} chars)`);
  console.log(`→ tweet preview:\n---\n${text}\n---`);

  // dedup check: optional .last-tweeted file (committed) — skip if same slug already tweeted this run
  const lastFile = path.join(ROOT, ".last-tweeted");
  try{
    if(fs.existsSync(lastFile)){
      const last = fs.readFileSync(lastFile,"utf8").trim();
      if(last===target.slug && !process.env.FORCE_TWEET){
        console.log(`[skip] ${target.slug} already in .last-tweeted — set FORCE_TWEET=1 to override`);
        // still exit 0 so workflow doesn't fail
        process.exit(0);
      }
    }
  }catch(e){}

  const primary = {
    consumerKey: process.env.X_API_KEY,
    consumerSecret: process.env.X_API_SECRET,
    token: process.env.X_ACCESS_TOKEN,
    tokenSecret: process.env.X_ACCESS_SECRET,
  };
  const alt = {
    consumerKey: process.env.X_API_KEY_ALT,
    consumerSecret: process.env.X_API_SECRET_ALT,
    token: process.env.X_ACCESS_TOKEN_ALT,
    tokenSecret: process.env.X_ACCESS_SECRET_ALT,
  };
  const hasPrimary = primary.consumerKey && primary.consumerSecret && primary.token && primary.tokenSecret;
  const hasAlt = alt.consumerKey && alt.consumerSecret && alt.token && alt.tokenSecret;

  if(!hasPrimary && !hasAlt){
    console.log("[dry-run] no X creds set — logged preview only. Set X_API_KEY etc as GitHub Secrets to enable posting.");
    if(process.env.GITHUB_ACTIONS && !process.env.DRY_RUN) process.exit(0); // don't fail CI when secrets not yet set
    return;
  }

  // post
  let posted = false;
  if(hasPrimary){
    await postTweet(text, primary, "primary:@HariomloharAGI");
    posted = true;
  }
  if(hasAlt){
    // slight delay to avoid duplicate detection if same text
    if(hasPrimary) await new Promise(r=>setTimeout(r, 1200));
    // For alt, optionally append same text — X will allow same text from different account
    await postTweet(text, alt, "alt:@hariomlohardev");
    posted = true;
  }

  // update .last-tweeted locally (workflow will commit it if POST_TWEET_COMMIT=1)
  if(posted){
    try{ fs.writeFileSync(lastFile, target.slug+"\n"); console.log(`→ wrote .last-tweeted = ${target.slug}`); }catch(e){ console.warn("write .last-tweeted fail", e.message); }
  }
  console.log("done");
})().catch(e=>{ console.error(e); process.exit(1); });
