#!/usr/bin/env node
"use strict";
/**
 * ping-search.js — $0 auto-update URLs for search (2023 Google ping deprecated)
 * See: https://developers.google.com/search/blog/2023/06/sitemaps-lastmod-ping
 *   Google RETIRED https://www.google.com/ping?sitemap= in June 2023 (now 404).
 *   Correct way: rely on robots.txt + sitemap.xml lastmod + Search Console + IndexNow/Bing.
 *
 * What this does (free, no key):
 *   1) Checks sitemap.xml + robots.txt lastmod health
 *   2) Pings Bing (still supported) + IndexNow (instant Bing/Yandex)
 *   3) Reports Google status (no ping — shows what to do in Search Console)
 *
 * Usage:
 *   node scripts/ping-search.js                # basic check + Bing ping
 *   node scripts/ping-search.js --verbose      # list every URL + lastmod
 *   INDEXNOW_KEY=xxx node scripts/ping-search.js  # also IndexNow submit
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const ROOT = path.resolve(__dirname, "..");
const SITEMAP = path.join(ROOT, "sitemap.xml");
const ROBOTS = path.join(ROOT, "robots.txt");
const SITE = "https://hariomlohardev.github.io";
const SITEMAP_URL = SITE + "/sitemap.xml";

function get(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode, body: data.slice(0, 800) }));
    });
    req.on("error", (e) => resolve({ ok: false, status: 0, body: e.message }));
    req.setTimeout(8000, () => { req.destroy(); resolve({ ok: false, status: 0, body: "timeout" }); });
  });
}

async function ping(url, label) {
  const r = await get(url);
  const icon = r.ok ? "✓" : "×";
  console.log(`${icon} ${label} -> ${r.status} ${r.ok ? "ok" : r.body.replace(/\n/g, " ").slice(0, 140)}`);
  return r.ok;
}

async function main() {
  const verbose = process.argv.includes("--verbose") || process.argv.includes("-v");
  if (!fs.existsSync(SITEMAP)) { console.error("sitemap.xml not found at", SITEMAP); process.exit(1); }
  const xml = fs.readFileSync(SITEMAP, "utf8");
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  const lastmods = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1].trim());
  console.log(`Found ${locs.length} URLs in sitemap.xml`);
  if (verbose) {
    locs.forEach((u, i) => console.log(`  - ${u}  lastmod=${lastmods[i] || "—"}`));
  } else {
    console.log(`  newest lastmod: ${lastmods.sort().slice(-1)[0] || "—"}  oldest: ${lastmods.sort()[0] || "—"}`);
  }

  // robots.txt check — must expose sitemap
  if (fs.existsSync(ROBOTS)) {
    const robots = fs.readFileSync(ROBOTS, "utf8");
    const hasSitemap = robots.includes("sitemap.xml");
    console.log(`\nrobots.txt: ${hasSitemap ? "✓ has sitemap line" : "× MISSING sitemap line — add: Sitemap: " + SITEMAP_URL}`);
    if (verbose) console.log(robots.trim().split("\n").map((l) => "  " + l).join("\n"));
  }

  console.log("\n[2023] Google sitemap ping is RETIRED (https://developers.google.com/search/blog/2023/06/sitemaps-lastmod-ping)");
  console.log("  -> https://www.google.com/ping?sitemap= now 404. Do NOT ping Google.");
  console.log("  Correct Google flow: robots.txt -> sitemap.xml (with accurate <lastmod>) -> Search Console Sitemaps + URL Inspection.");
  // Optional: show that it 404s if pinged
  const gPing = await get(`https://www.google.com/ping?sitemap=${encodeURIComponent(SITEMAP_URL)}`);
  console.log(`  (check) Google ping endpoint now -> ${gPing.status} ${gPing.ok ? "unexpectedly ok" : "deprecated as expected"}`);

  console.log("\nPinging Bing (still supported)...");
  await ping(`https://www.bing.com/ping?sitemap=${encodeURIComponent(SITEMAP_URL)}`, "Bing sitemap ping");

  // IndexNow — free, instant for Bing/Yandex/Naver/Seznam. Needs key file at /<key>.txt
  const indexNowKey = process.env.INDEXNOW_KEY || "";
  if (indexNowKey) {
    console.log("\nIndexNow (Bing) — submitting all URLs...");
    const payload = JSON.stringify({ host: "hariomlohardev.github.io", key: indexNowKey, keyLocation: `${SITE}/${indexNowKey}.txt`, urlList: locs });
    const keyFile = path.join(ROOT, `${indexNowKey}.txt`);
    if (!fs.existsSync(keyFile)) { fs.writeFileSync(keyFile, indexNowKey); console.log(`  created ${indexNowKey}.txt (commit so Bing can verify)`); }
    const ok = await new Promise((resolve) => {
      const req = https.request({ method: "POST", hostname: "api.indexnow.org", path: "/IndexNow", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } }, (res) => {
        let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: d }));
      });
      req.on("error", (e) => resolve({ ok: false, status: 0, body: e.message }));
      req.setTimeout(8000, () => { req.destroy(); resolve({ ok: false, status: 0, body: "timeout" }); });
      req.write(payload); req.end();
    });
    console.log(`${ok.ok ? "✓" : "×"} IndexNow -> ${ok.status} ${ok.body.slice(0, 200)}`);
  } else {
    console.log("\nIndexNow: skipped (set INDEXNOW_KEY to enable instant Bing indexing)");
    console.log("  Generate: openssl rand -hex 16  ->  INDEXNOW_KEY=<hex> node scripts/ping-search.js");
    console.log("  Then add secret INDEXNOW_KEY in GitHub: Settings -> Secrets -> Actions");
  }

  console.log("\nGoogle (no ping needed):");
  console.log("  1) Ensure sitemap has fresh <lastmod> (generate-blog.js does) and robots.txt has: Sitemap: " + SITEMAP_URL);
  console.log("  2) Search Console -> Sitemaps -> Add " + SITEMAP_URL + " (once) -> it auto-recrawls on lastmod change");
  console.log("  3) For a new post, Search Console -> URL Inspection -> paste new URL -> Request indexing (fastest)");
  console.log(`\nDone — ${locs.length} URLs ready. Bing pinged, Google will crawl via lastmod. Check: ${SITEMAP_URL}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
