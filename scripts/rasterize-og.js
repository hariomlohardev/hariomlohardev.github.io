#!/usr/bin/env node
"use strict";
/* og/*.svg -> og/*.png
 *
 * Every social crawler (X, Facebook, LinkedIn, WhatsApp, Slack, Discord) refuses
 * SVG, so an SVG og:image previews as a blank card. The banners stay SVG in the
 * repo — small, diffable, generated — and this step renders the PNG the crawlers
 * actually need, using the local Chrome so the webfonts resolve.
 *
 * No Chrome, no network, no problem: it logs what it skipped and exits 0, so a
 * build on a machine without a browser still succeeds with the last PNGs.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const OG_DIR = path.join(ROOT, "og");
const FONT = "https://cdn.jsdelivr.net/npm/@fontsource";
const FONT_CSS = [
  `${FONT}/fraunces/latin-400.css`,
  `${FONT}/fraunces/latin-600.css`,
  `${FONT}/archivo/latin-400.css`,
  `${FONT}/archivo/latin-600.css`,
  `${FONT}/space-mono/latin-400.css`,
];

function findChrome() {
  const env = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (env && fs.existsSync(env)) return env;
  const guesses = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  for (const g of guesses) if (g && fs.existsSync(g)) return g;
  return null;
}

function wrapper(svg) {
  // Inline the svg so it shares the document's font faces; the xml prolog is
  // only valid at the top of a standalone file, so drop it.
  const inline = svg.replace(/<\?xml[\s\S]*?\?>\s*/, "");
  const links = FONT_CSS.map(h => `<link rel="stylesheet" href="${h}">`).join("");
  return `<!doctype html><meta charset="utf-8">${links}
<style>html,body{margin:0;padding:0;background:#F6F4EE}svg{display:block}</style>
${inline}`;
}

const chrome = findChrome();
const svgs = fs.existsSync(OG_DIR) ? fs.readdirSync(OG_DIR).filter(f => f.endsWith(".svg")).sort() : [];

if (!chrome) {
  console.log(`· rasterize-og — no Chrome found, keeping the existing PNGs (${svgs.length} svg untouched)`);
  console.log("  set CHROME_PATH=<path to chrome> to render them here");
  process.exit(0);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "og-raster-"));
let made = 0, fresh = 0, failed = 0;

for (const name of svgs) {
  const svgPath = path.join(OG_DIR, name);
  const pngPath = path.join(OG_DIR, name.replace(/\.svg$/, ".png"));
  const svg = fs.readFileSync(svgPath, "utf8");

  if (fs.existsSync(pngPath) && fs.statSync(pngPath).mtimeMs >= fs.statSync(svgPath).mtimeMs) { fresh++; continue; }

  const m = svg.match(/<svg[^>]*\bwidth="(\d+)"[^>]*\bheight="(\d+)"/);
  if (!m) { console.warn(`  ✕ ${name} — no width/height on <svg>`); failed++; continue; }
  const w = +m[1], h = +m[2];

  const html = path.join(tmp, name.replace(/\.svg$/, ".html"));
  fs.writeFileSync(html, wrapper(svg));
  try {
    execFileSync(chrome, [
      "--headless", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
      "--force-device-scale-factor=1", "--virtual-time-budget=9000",
      `--window-size=${w},${h}`, `--screenshot=${pngPath}`, html,
    ], { stdio: "ignore", timeout: 60000 });
  } catch (e) { /* chrome exits non-zero on benign warnings; judge by the file */ }

  if (fs.existsSync(pngPath) && fs.statSync(pngPath).size > 1024) {
    console.log(`→ og/${path.basename(pngPath)}  ${w}×${h}  ${fs.statSync(pngPath).size} B`);
    made++;
  } else {
    console.warn(`  ✕ og/${path.basename(pngPath)} — chrome produced nothing usable`);
    failed++;
  }
}

// a banner that is gone must lose its png too
for (const f of fs.readdirSync(OG_DIR)) {
  if (!f.endsWith(".png")) continue;
  if (svgs.includes(f.replace(/\.png$/, ".svg"))) continue;
  if (f === "avatar-circle.png") continue; // not a banner
  fs.unlinkSync(path.join(OG_DIR, f));
  console.log(`✕ og/${f} — no matching svg`);
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
console.log(`done rasterize-og — ${made} rendered, ${fresh} already current${failed ? `, ${failed} failed` : ""}`);
