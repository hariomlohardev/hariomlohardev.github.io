#!/usr/bin/env node
"use strict";
/* carousel/<slug>.json -> carousel/out/<slug>/NN.png  (Instagram-ready)
 *
 * A carousel is the same design language as the site, re-flowed for a 4:5
 * phone frame: paper ground, engineering grid, ink header bar, one sheet card,
 * Fraunces display over Archivo body over Space Mono chrome, vermilion used
 * once per slide. DESIGN.md is the spec; this file is that spec at 1080px.
 *
 * Slides are authored as JSON, not as hand-placed coordinates, because a
 * carousel is mostly wrapped paragraphs, bullets and code -- the three things
 * SVG text cannot wrap. So the slide is HTML, laid out by Chrome, and Chrome
 * screenshots it. Fonts are inlined as data URIs, so rendering is offline and
 * byte-deterministic: same JSON in, same PNG out.
 *
 * No Chrome, no network, no problem: it still writes the preview page and
 * exits 0, so you can review the design in a browser and render later.
 *
 *   node scripts/generate-carousel.js              # every carousel/*.json
 *   node scripts/generate-carousel.js demo-post    # just that one
 *   node scripts/generate-carousel.js --square     # 1080x1080 instead of 4:5
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT, "carousel");
const OUT_DIR = path.join(SRC_DIR, "out");
const FONT_DIR = path.join(ROOT, "assets", "fonts");

const W = 1080;
const SQUARE = process.argv.includes("--square");
const H = SQUARE ? 1080 : 1350;          // 4:5 is the tallest frame the feed allows

/* ---------------------------------------------------------------- assets */

const FACES = [
  ["Fraunces", 400, "normal", "fraunces-latin-400-normal.woff2"],
  ["Fraunces", 600, "normal", "fraunces-latin-600-normal.woff2"],
  ["Fraunces", 400, "italic", "fraunces-latin-400-italic.woff2"],
  ["Fraunces", 600, "italic", "fraunces-latin-600-italic.woff2"],
  ["Archivo", 400, "normal", "archivo-latin-400-normal.woff2"],
  ["Archivo", 500, "normal", "archivo-latin-500-normal.woff2"],
  ["Archivo", 600, "normal", "archivo-latin-600-normal.woff2"],
  ["Space Mono", 400, "normal", "space-mono-latin-400-normal.woff2"],
  ["Space Mono", 400, "italic", "space-mono-latin-400-italic.woff2"],
];

let fontCssCache = null;
function fontCss() {
  if (fontCssCache !== null) return fontCssCache;
  const rules = [];
  for (const [family, weight, style, file] of FACES) {
    const f = path.join(FONT_DIR, file);
    if (!fs.existsSync(f)) { console.warn(`  · missing assets/fonts/${file}`); continue; }
    rules.push(`@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};`
      + `font-display:block;src:url(data:font/woff2;base64,${fs.readFileSync(f).toString("base64")}) format('woff2')}`);
  }
  fontCssCache = rules.join("");
  return fontCssCache;
}

function dataUri(rel) {
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f)) return "";
  const ext = path.extname(f).slice(1).toLowerCase();
  const mime = ext === "svg" ? "image/svg+xml" : ext === "jpg" ? "image/jpeg" : `image/${ext}`;
  return `data:${mime};base64,${fs.readFileSync(f).toString("base64")}`;
}

function findChrome() {
  const env = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (env && fs.existsSync(env)) return env;
  // forward slashes on purpose: node accepts them on Windows and they survive
  // every shell and heredoc that would otherwise eat a backslash
  const guesses = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    path.join(process.env.LOCALAPPDATA || ".", "Google", "Chrome", "Application", "chrome.exe"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium", "/usr/bin/chromium-browser",
  ];
  for (const g of guesses) if (g && fs.existsSync(g)) return g;
  return null;
}

/* ------------------------------------------------------------------ text */

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* Slide copy is authored with four inline marks, so the JSON stays readable:
 *   *italic*  -> Fraunces italic, the roman+italic pairing headings use
 *   _mark_    -> the soft-vermilion underline highlight
 *   `code`    -> mono chip
 *   → ↗ ◆ ✓   -> pass straight through, they are the icon set
 */
function inline(s) {
  return keepEntities(esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<mark>$1</mark>')
    .replace(/ -- /g, ' &#8212; '));
}

/* ------------------------------------------------------------------- css */
/* DESIGN.md sections 2 and 3, verbatim tokens; every size below is that scale
 * re-cut for a 1080px frame held at reading distance. */
const CSS = `
:root{
  --paper:#F6F4EE; --paper-2:#EFECE2; --sheet:#FBFAF6;
  --ink:#181611; --ink-2:#37342B; --body:#3B382E; --muted:#5F594A; --muted-2:#6E6858;
  --line:#DAD5C6; --line-2:#C4BEAC;
  --accent:#B93A13; --accent-soft:rgba(185,58,19,.12);
  --green:#1E7A4E;
  --serif:'Fraunces',Georgia,serif;
  --sans:'Archivo',system-ui,sans-serif;
  --mono:'Space Mono',ui-monospace,monospace;
}
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:var(--paper)}

/* the frame */
.slide{position:relative;overflow:hidden;background:var(--paper);
  background-image:
    repeating-linear-gradient(to right, var(--line) 0 1px, transparent 1px 27px),
    repeating-linear-gradient(to bottom, var(--line) 0 1px, transparent 1px 27px),
    repeating-linear-gradient(to right, var(--line-2) 0 1px, transparent 1px 135px),
    repeating-linear-gradient(to bottom, var(--line-2) 0 1px, transparent 1px 135px)}
.slide::after{content:"";position:absolute;inset:0;z-index:9;pointer-events:none;
  opacity:.05;mix-blend-mode:multiply;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E")}
.top{position:absolute;inset:0 0 auto;height:12px;background:var(--accent)}
.bar{position:absolute;inset:12px 0 auto;height:56px;background:var(--ink);
  display:flex;align-items:center;justify-content:space-between;padding:0 34px;
  font:400 19px/1 var(--mono);letter-spacing:.14em;color:var(--paper-2)}
.bar span:last-child{letter-spacing:.06em;color:var(--line-2)}
.sheet{position:absolute;left:40px;right:40px;top:92px;bottom:40px;background:var(--sheet);
  border:2px solid var(--ink);padding:66px 56px 42px;display:flex;flex-direction:column}
.tape{position:absolute;left:50%;top:-13px;width:210px;height:26px;
  transform:translateX(-50%) rotate(-1deg);background:#FCFBF7;
  border:1px solid rgba(24,22,17,.07);box-shadow:0 1px 0 rgba(24,22,17,.05)}
.grow{flex:1 1 auto;min-height:24px}
.ft{margin-top:26px;padding-top:26px;border-top:1px solid var(--line);
  display:flex;align-items:center;justify-content:space-between;
  font:400 19px/1 var(--mono);letter-spacing:.08em;color:var(--muted)}
.ft b{font-weight:400;color:var(--ink)}

/* type */
.kicker{display:flex;align-items:center;gap:16px;font:400 21px/1 var(--mono);
  letter-spacing:.2em;text-transform:uppercase;color:var(--muted)}
.dia{width:14px;height:14px;background:var(--accent);transform:rotate(45deg);flex:none}
h1{font:600 104px/.95 var(--serif);letter-spacing:-.035em;color:var(--ink)}
h1 em{font-style:italic}
h2{font:600 72px/.98 var(--serif);letter-spacing:-.03em;color:var(--ink)}
h2 em{font-style:italic;color:var(--muted)}
p{font:400 31px/1.62 var(--sans);color:var(--body)}
.sub{font:400 33px/1.5 var(--sans);color:var(--ink-2)}
.quote{font:400 italic 60px/1.32 var(--serif);color:var(--ink-2);letter-spacing:-.015em}
.quote.big{font-size:68px}
mark{background:linear-gradient(transparent 58%, var(--accent-soft) 58%);color:inherit}
code{font:400 .86em var(--mono);background:var(--paper-2);border:1px solid var(--line);
  padding:2px 8px;white-space:nowrap}
.mono{font:400 21px/1.55 var(--mono);letter-spacing:.04em;color:var(--muted-2)}
.rule{height:14px;width:400px;background:var(--accent)}

/* components */
ul{list-style:none;display:flex;flex-direction:column;gap:26px}
li{display:flex;gap:20px;font:400 31px/1.45 var(--sans);color:var(--body)}
li .dia{margin-top:.5em;width:13px;height:13px}
li b{font-weight:600;color:var(--ink)}
.stamp{align-self:flex-start;font:400 22px/1 var(--mono);letter-spacing:.16em;
  text-transform:uppercase;color:var(--accent);border:3px solid var(--accent);
  padding:15px 21px;transform:rotate(-7deg);box-shadow:6px 6px 0 var(--accent-soft)}
.btn{align-self:flex-start;display:inline-flex;align-items:center;gap:16px;
  font:400 24px/1 var(--mono);letter-spacing:.15em;text-transform:uppercase;
  background:var(--ink);color:var(--paper);padding:24px 32px}
/* 2x2, not 4-across: a 4:5 slide is a phone frame, and DESIGN.md already says
 * the stats ledger goes 2x2 at phone width. It also gives the numbers the room
 * to be the loudest thing on the slide instead of a thin strip in the middle. */
.ledger{display:grid;grid-template-columns:repeat(2,1fr);
  border-top:2px solid var(--ink);border-bottom:2px solid var(--ink)}
.cell{padding:44px 30px 38px;border-left:1px solid var(--line)}
.cell:nth-child(odd){border-left:0}
.cell:nth-child(n+3){border-top:1px solid var(--line)}
.num{font:600 124px/1 var(--serif);letter-spacing:-.045em;color:var(--ink);white-space:nowrap}
.num sup{font:400 italic 34px var(--serif);color:var(--accent);vertical-align:super;margin-left:3px}
.lab{margin-top:18px;display:flex;align-items:flex-start;gap:10px;min-height:2.6em;
  font:400 19px/1.3 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.lab .dia{width:9px;height:9px;flex:none;margin-top:.34em}
.file{align-self:flex-start;background:var(--ink);color:var(--line-2);
  font:400 19px/1 var(--mono);letter-spacing:.12em;padding:13px 20px}
.code{background:var(--ink);color:var(--paper-2);border:2px solid var(--ink);
  font:400 25px/1.7 var(--mono);padding:28px 32px;white-space:pre-wrap;word-break:break-word}
.code .c{color:#8C8474}
.code .s{color:#D9D2BE}
.ava{width:172px;height:172px;border-radius:50%;border:2px solid var(--ink);object-fit:cover;display:block}
.logo{display:flex;align-items:center;gap:18px}
.logo svg{width:56px;height:56px;display:block}
.logo b{font:600 34px/1 var(--serif);letter-spacing:-.02em;color:var(--ink)}
.logo i{display:block;font:400 italic 19px/1 var(--mono);color:var(--muted);margin-top:8px;letter-spacing:.06em}
.swipe{display:flex;align-items:center;gap:14px;font:400 24px/1 var(--mono);
  letter-spacing:.22em;text-transform:uppercase;color:var(--accent)}
/* plots: the frame owns the geometry, the svg only owns the curve */
.plot{border-top:2px solid var(--ink);border-bottom:1px solid var(--line);
  background:var(--paper);padding:0}
.plot svg{display:block;width:100%;height:auto}
.legend{display:flex;flex-wrap:wrap;gap:34px;margin-top:24px;
  font:400 20px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.legend span{display:flex;align-items:center;gap:12px}
.legend i{width:34px;height:0;flex:none;border-top-width:4px;border-top-style:solid}
.row{display:flex;align-items:center;justify-content:space-between;gap:32px}
.stack{display:flex;flex-direction:column}
`;

const MONOGRAM = `<svg viewBox="0 0 44 44" fill="none" aria-hidden="true">`
  + `<path d="M7 6 V38" stroke="#181611" stroke-width="5"/><path d="M23 6 V38" stroke="#181611" stroke-width="5"/>`
  + `<path d="M7 22 H23" stroke="#B93A13" stroke-width="5"/><path d="M23 38 H38" stroke="#181611" stroke-width="5"/>`
  + `<circle cx="37" cy="7" r="3.4" fill="#B93A13"/></svg>`;

/* Numeric character references survive escaping, so the JSON can stay pure
 * ASCII and still say &#8594; for an arrow or &#8470; for a numero sign. */
const keepEntities = (s) => s.replace(/&amp;(#[0-9]{2,5}|[a-z]{2,8});/gi, "&$1;");
const txt = (s) => keepEntities(esc(s));

const pad2 = (n) => String(n).padStart(2, "0");
const kicker = (s) => s ? `<div class="kicker"><i class="dia"></i><span>${txt(s)}</span></div>` : "";
const stamp = (s) => s ? `<div class="stamp">${txt(s)}</div>` : "";

/* ---------------------------------------------------------------- plots */
/* Curves are computed, never drawn by eye: a plot that misplaces its own peak
 * is a lie told in ink. One polyline per series, coloured by the tokens --
 * ink is the data, a muted dash is the assumption, vermilion is the answer,
 * because vermilion only ever marks the thing that matters. */
/* the top band is label room: two marks 0.2 apart collide on one row, so the
 * labels stack into lanes above the plot instead of overprinting each other */
const PLOT = { w: 888, h: 500, l: 10, r: 10, t: 106, b: 56 };
const LANE_H = 36, CH = 17.5;   // 25px Space Mono advance, letter-spacing included

/* p^(a-1) (1-p)^(b-1) -- the Beta kernel, which is also the Bernoulli
 * likelihood with a = heads+1 and b = tails+1. Same shape, two names. */
const betaKernel = (a, b) => (x) => Math.pow(x, a - 1) * Math.pow(1 - x, b - 1);

function sample(fn, x0, x1, steps) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    pts.push([x, fn(x)]);
  }
  return pts;
}

/* scale a series so its own peak is 1: these are shapes being compared, and
 * three densities at true scale would leave two of them flat on the floor */
const toPeak = (pts) => {
  const m = pts.reduce((a, q) => Math.max(a, q[1]), 0) || 1;
  return pts.map(([x, y]) => [x, y / m]);
};

const STROKE = { ink: "var(--ink)", accent: "var(--accent)", muted: "var(--muted)" };

function plot(o) {
  const { w, h, r, t, b } = PLOT;
  // a labelled y axis needs a gutter to live in, or the marks strike through it
  const l = o.yticks ? 96 : PLOT.l;
  const iw = w - l - r, ih = h - t - b;
  const [x0, x1] = o.xdom, [y0, y1] = o.ydom;
  const X = (x) => l + ((x - x0) / (x1 - x0)) * iw;
  const Y = (y) => t + (1 - (y - y0) / (y1 - y0)) * ih;
  const n1 = (v) => Math.round(v * 10) / 10;
  const path = (pts) => pts.map(([x, y]) => n1(X(x)) + "," + n1(Y(y))).join(" ");
  const anchor = (x) => (X(x) > w - 96 ? "end" : X(x) < 96 ? "start" : "middle");
  const base = Y(y0);
  let g = "";

  for (const tk of o.xticks || []) {
    g += `<line x1="${n1(X(tk.x))}" y1="${t - 14}" x2="${n1(X(tk.x))}" y2="${base}"`
      + ` style="stroke:var(--line);stroke-width:1"/>`;
    if (tk.label) g += `<text x="${n1(X(tk.x))}" y="${base + 34}" text-anchor="${anchor(tk.x)}"`
      + ` style="fill:var(--muted-2);font:400 20px var(--mono);letter-spacing:.06em">${esc(tk.label)}</text>`;
  }

  /* only where y means something: a peak-normalised shape has no y to read,
   * but a truncated axis without labels is a chart that hides its own floor */
  for (const tk of o.yticks || []) {
    const yy = n1(Y(tk.y));
    g += `<line x1="${l}" y1="${yy}" x2="${w - r}" y2="${yy}" style="stroke:var(--line);stroke-width:1"/>`;
    if (tk.label) g += `<text x="${l - 16}" y="${yy + 7}" text-anchor="end" style="fill:var(--muted-2);`
      + `font:400 20px var(--mono);letter-spacing:.06em">${esc(tk.label)}</text>`;
  }

  for (const sr of o.series || []) {
    if (sr.fill) g += `<polygon points="${n1(X(x0))},${base} ${path(sr.pts)} ${n1(X(x1))},${base}"`
      + ` style="fill:var(--accent-soft)"/>`;
    g += `<polyline points="${path(sr.pts)}" fill="none" style="stroke:${STROKE[sr.stroke] || STROKE.ink};`
      + `stroke-width:${sr.width || 5};stroke-linejoin:round;stroke-linecap:round`
      + (sr.dash ? `;stroke-dasharray:14 11` : ``) + `"/>`;
  }

  /* bars are placed, not sampled -- but each height comes from the formula
   * in the CHART kind, so the honesty rule holds one level up. The 2px inset
   * is the surface gap between fills. */
  const bw = o.barW || 0;
  for (const br of o.bars || []) {
    const bcol = STROKE[br.stroke] || STROKE.ink;
    const bx0 = n1(X(br.x - bw / 2) + 2), bx1 = n1(X(br.x + bw / 2) - 2);
    const by = n1(Y(br.y));
    g += `<rect x="${bx0}" y="${by}" width="${Math.max(bx1 - bx0, 2)}"`
      + ` height="${Math.max(base - by, 0)}" style="fill:${bcol}"/>`;
    if (br.top) g += `<text x="${n1(X(br.x))}" y="${by - 16}" text-anchor="middle"`
      + ` style="fill:${bcol};font:400 25px var(--mono);letter-spacing:.06em">${txt(br.top)}</text>`;
  }

  const lanes = [];
  const lane = (span) => {
    for (let i = 0; ; i++) {
      const row = lanes[i] || (lanes[i] = []);
      if (row.every((o2) => span[1] < o2[0] - 12 || span[0] > o2[1] + 12)) { row.push(span); return i; }
    }
  };

  for (const mk of o.marks || []) {
    const mx = n1(X(mk.x)), col = STROKE[mk.stroke] || STROKE.ink;
    const an = anchor(mk.x), lw = String(mk.label).length * CH;
    const span = an === "end" ? [mx - lw, mx] : an === "start" ? [mx, mx + lw] : [mx - lw / 2, mx + lw / 2];
    g += `<line x1="${mx}" y1="${t - 16}" x2="${mx}" y2="${base}" style="stroke:${col};`
      + `stroke-width:3` + (mk.dash ? `;stroke-dasharray:10 8` : ``) + `"/>`;
    if (mk.at != null) g += `<circle cx="${mx}" cy="${n1(Y(mk.at))}" r="11" style="fill:${col}"/>`;
    g += `<text x="${mx}" y="${t - 40 - lane(span) * LANE_H}" text-anchor="${an}" style="fill:${col};`
      + `font:400 25px var(--mono);letter-spacing:.1em">${txt(mk.label)}</text>`;
  }

  g += `<line x1="${l}" y1="${base}" x2="${w - r}" y2="${base}" style="stroke:var(--ink);stroke-width:2"/>`;
  return `<div class="plot"><svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${g}</svg></div>`;
}

/* Two shapes this notebook needs. Both take the same knobs the post talks
 * about, so the picture cannot drift from the arithmetic beside it. */
/* binary entropy in bits. The walls are defined as 0 -- 0 log 0 is 0 by
 * continuity, and Math.log2(0) is not a number you want anywhere near a plot. */
const H2 = (p) => (p <= 0 || p >= 1) ? 0 : -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
const dp2 = (v) => v.toFixed(2);

const CHART = {
  /* likelihood, prior and posterior over one parameter, with both estimates
   * marked where their own curve peaks */
  posterior(c) {
    const n = c.n, h = c.heads, a = c.a, b = c.b;
    const mle = h / n;
    const map = (h + a - 1) / (n + a + b - 2);
    return {
      xdom: [0, 1], ydom: [0, 1.08],
      xticks: [{ x: 0, label: "0" }, { x: .25 }, { x: .5, label: "0.5" }, { x: .75 }, { x: 1, label: "1" }],
      series: [
        { pts: toPeak(sample(betaKernel(a, b), 0, 1, 240)), stroke: "muted", dash: true, width: 4 },
        { pts: toPeak(sample(betaKernel(h + 1, n - h + 1), 0, 1, 240)), stroke: "ink" },
        { pts: toPeak(sample(betaKernel(h + a, n - h + b), 0, 1, 240)), stroke: "accent", fill: true, width: 6 },
      ],
      marks: [
        { x: map, at: 1, label: "MAP " + dp2(map), stroke: "accent" },
        { x: mle, at: 1, label: "MLE " + dp2(mle), stroke: "ink", dash: true },
      ],
    };
  },

  /* what the prior is worth as the data arrives: every flip a head, so MLE
   * never moves off the wall and MAP climbs toward it */
  shrink(c) {
    const a = c.a, b = c.b, up = c.upto || 40, at = c.at || 3;
    const mapAt = (n) => (n + a - 1) / (n + a + b - 2);
    return {
      xdom: [1, up], ydom: [.45, 1.03],
      yticks: [{ y: .5, label: "0.50" }, { y: .75, label: "0.75" }, { y: 1, label: "1.00" }],
      xticks: [{ x: 1, label: "1 flip" }, { x: 10, label: "10" }, { x: 20, label: "20" },
               { x: 30, label: "30" }, { x: up, label: up + " flips" }],
      series: [
        { pts: sample(() => 1, 1, up, 2), stroke: "ink", dash: true, width: 4 },
        { pts: sample(mapAt, 1, up, 240), stroke: "accent", width: 6 },
      ],
      marks: [{ x: at, at: mapAt(at), label: dp2(mapAt(at)) + " at " + at, stroke: "accent" }],
    };
  },

  /* the hump: 0 at both walls by definition, 1.00 at the fair coin.
   * The whole post in one curve, so the curve itself is the accent. */
  binary(c) {
    const at = c.at || [0.1, 0.5];
    return {
      xdom: [0, 1], ydom: [0, 1.14],
      xticks: [{ x: 0, label: "certain" }, { x: .5, label: "fair" }, { x: 1, label: "certain" }],
      yticks: [{ y: .5, label: "0.50" }, { y: 1, label: "1.00" }],
      series: [{ pts: sample(H2, 0, 1, 240), stroke: "accent", width: 6 }],
      marks: at.map((q) => ({ x: q, at: H2(q),
        label: dp2(H2(q)) + (q === 0.5 ? " fair" : ""),
        stroke: q === 0.5 ? "accent" : "ink", dash: q !== 0.5 })),
    };
  },

  /* one bar per distribution: bias deletes information, and bars make
   * "less" visible in a way a second curve never does */
  mixbars(c) {
    const coins = c.coins || [];
    const hs = coins.map((d) => H2(d.p));
    const top = Math.max.apply(null, hs.concat([0]));
    return {
      xdom: [0, coins.length + 1], ydom: [0, 1.18], barW: 0.62,
      xticks: coins.map((d, i) => ({ x: i + 1, label: d.label })),
      yticks: [{ y: .5, label: "0.50" }, { y: 1, label: "1.00" }],
      series: [],
      bars: coins.map((d, i) => ({ x: i + 1, y: hs[i],
        stroke: hs[i] === top ? "accent" : "ink", top: dp2(hs[i]) })),
    };
  },
};

const legendRow = (items) => `<div class="legend">` + items.map((it) =>
  `<span><i style="border-top-color:${STROKE[it.stroke] || STROKE.ink};`
  + `border-top-style:${it.dash ? "dashed" : "solid"}"></i>${txt(it.label)}</span>`).join("") + `</div>`;

/* --------------------------------------------------------------- slides */
/* Every slide is the same skeleton: kicker, one display line, one supporting
 * block, and whatever the type adds. The variation is in what fills the
 * middle -- never in the frame, because the frame is the recognizable part. */
const SLIDE = {
  cover(s, ctx) {
    return kicker(s.kicker || ctx.topic)
      + `<div class="grow"></div>`
      + `<h1>${inline(s.title)}</h1>`
      + `<div class="rule" style="margin-top:40px"></div>`
      + (s.sub ? `<p class="sub" style="margin-top:36px">${inline(s.sub)}</p>` : "")
      + `<div class="grow"></div>`
      + `<div class="row">`
      +   `<div class="logo">${MONOGRAM}<span><b>${txt(ctx.handle)}</b>`
      +     `<i>lab notebook &#8470;01</i></span></div>`
      +   `<div class="swipe"><span>swipe</span><span>&#8594;</span></div>`
      + `</div>`;
  },

  lead(s, ctx) {
    return kicker(s.kicker)
      + `<div class="grow"></div>`
      + `<p class="quote big">${inline(s.quote)}</p>`
      + (s.text ? `<p style="margin-top:44px">${inline(s.text)}</p>` : "")
      + `<div class="grow"></div>`
      + (s.stamp ? stamp(s.stamp) : "")
      + (s.meta ? `<p class="mono"${s.stamp ? ` style="margin-top:30px"` : ``}>${inline(s.meta)}</p>` : "");
  },

  body(s, ctx) {
    return kicker(s.kicker)
      + (s.h2 ? `<h2 style="margin-top:30px">${inline(s.h2)}</h2>` : "")
      + (s.text ? `<p style="margin-top:34px">${inline(s.text)}</p>` : "")
      + (s.bullets ? `<ul style="margin-top:44px">`
          + s.bullets.map((b) => `<li><i class="dia"></i><span>${inline(b)}</span></li>`).join("")
          + `</ul>` : "")
      + `<div class="grow"></div>`
      + (s.note ? `<p class="mono">${inline(s.note)}</p>` : "");
  },

  code(s, ctx) {
    const line = (l) => {
      const e = esc(l);
      if (/^\s*#/.test(l)) return `<span class="c">${e}</span>`;
      return e.replace(/("[^"]*"|'[^']*')/g, '<span class="s">$1</span>');
    };
    return kicker(s.kicker)
      + (s.h2 ? `<h2 style="margin-top:30px">${inline(s.h2)}</h2>` : "")
      + (s.text ? `<p style="margin-top:32px">${inline(s.text)}</p>` : "")
      + `<div style="margin-top:44px" class="stack">`
      +   (s.file ? `<div class="file">${txt(s.file)}</div>` : "")
      +   `<div class="code">${s.lines.map(line).join("\n")}</div>`
      + `</div>`
      + `<div class="grow"></div>`
      + (s.note ? `<p class="mono">${inline(s.note)}</p>` : "");
  },

  ledger(s, ctx) {
    const cells = s.stats.map((st) => `<div class="cell">`
      + `<div class="num">${txt(st.n)}${st.sup ? `<sup>${txt(st.sup)}</sup>` : ""}</div>`
      + `<div class="lab"><i class="dia"></i><span>${txt(st.label)}</span></div>`
      + `</div>`).join("");
    return kicker(s.kicker)
      + (s.h2 ? `<h2 style="margin-top:30px">${inline(s.h2)}</h2>` : "")
      + (s.text ? `<p style="margin-top:32px">${inline(s.text)}</p>` : "")
      + `<div class="grow" style="flex-grow:.75"></div>`
      + `<div class="ledger">${cells}</div>`
      + `<div class="grow" style="flex-grow:1.25"></div>`
      + (s.note ? `<p class="mono">${inline(s.note)}</p>` : "");
  },

  chart(s, ctx) {
    const c = s.chart || {};
    const opt = (CHART[c.kind] || CHART.posterior)(c);
    return kicker(s.kicker)
      + (s.h2 ? `<h2 style="margin-top:26px">${inline(s.h2)}</h2>` : "")
      + (s.text ? `<p style="margin-top:28px">${inline(s.text)}</p>` : "")
      + `<div class="grow" style="flex-grow:.6"></div>`
      + plot(opt)
      + (s.legend ? legendRow(s.legend) : "")
      + `<div class="grow"></div>`
      + (s.note ? `<p class="mono">${inline(s.note)}</p>` : "");
  },

  quote(s, ctx) {
    return `<div class="grow"></div>`
      + `<i class="dia" style="width:22px;height:22px;margin:0 0 44px 6px"></i>`
      + `<p class="quote big">${inline(s.quote)}</p>`
      + (s.text ? `<p style="margin-top:40px">${inline(s.text)}</p>` : "")
      + `<div class="grow"></div>`
      + (s.meta ? `<p class="mono">${inline(s.meta)}</p>` : "");
  },

  cta(s, ctx) {
    const ava = ctx.avatar ? `<img class="ava" src="${ctx.avatar}" alt="">` : MONOGRAM;
    return kicker(s.kicker)
      + `<div class="grow"></div>`
      + `<div class="row" style="justify-content:flex-start;gap:34px">`
      +   ava
      +   `<div class="stack"><b style="font:600 44px/1 var(--serif);letter-spacing:-.02em">`
      +     `${txt(ctx.handle)}</b>`
      +     `<span class="mono" style="margin-top:14px">${txt(s.role || "")}</span></div>`
      + `</div>`
      + (s.h2 ? `<h2 style="margin-top:52px">${inline(s.h2)}</h2>` : "")
      + (s.text ? `<p style="margin-top:30px">${inline(s.text)}</p>` : "")
      + `<div class="grow"></div>`
      + `<div class="row">`
      +   (s.button ? `<div class="btn"><span>${txt(s.button)}</span><span>&#8599;</span></div>` : `<span></span>`)
      +   stamp(s.stamp)
      + `</div>`;
  },
};

/* ---------------------------------------------------------------- pages */

function frame(s, i, n, ctx) {
  const render = SLIDE[s.type] || SLIDE.body;
  return `<section class="slide" style="width:${W}px;height:${H}px">`
    + `<div class="top"></div>`
    + `<header class="bar"><span>LAB NOTEBOOK &#8470;01 &#8212; HARIOM LOHAR</span>`
    +   `<span>${txt(ctx.url)}</span></header>`
    + `<div class="sheet"><div class="tape"></div>`
    +   render(s, ctx)
    +   `<footer class="ft"><span><b>${pad2(i + 1)}</b> / ${pad2(n)}</span>`
    +     `<span>${txt(s.foot || ctx.topic)}</span></footer>`
    + `</div></section>`;
}

const doc = (body, extra) => `<!doctype html><meta charset="utf-8">`
  + `<style>${fontCss()}${CSS}${extra || ""}</style>${body}`;

function previewPage(slides, ctx) {
  const s = 0.42;
  const cards = slides.map((html, i) => `<figure class="thumb">`
    + `<div class="box"><div class="scaler">${html}</div></div>`
    + `<figcaption><span>${pad2(i + 1)} &#183; ${ctx.slides[i].type}</span>`
    + `<button class="one" data-i="${i}">download png</button></figcaption></figure>`).join("");

  const head = `<header class="hd"><div>`
    + `<h1>${txt(ctx.topic)}</h1>`
    + `<p>${slides.length} slides &#183; ${W}&#215;${H} (${SQUARE ? "1:1" : "4:5"}) &#183; ready for the feed</p>`
    + `</div><div class="acts">`
    + `<button id="all">download all ${slides.length}</button>`
    + (ctx.caption ? `<button id="cap">copy caption</button>` : "")
    + `<span id="st"></span></div></header>`;

  const body = `<main class="board">${head}<section class="grid">${cards}</section>`
    + (ctx.caption ? `<pre id="capsrc" hidden>${esc(ctx.caption)}</pre>` : "")
    + `</main>`;

  const ui = `
.board{padding:26px 30px 60px;background:#26241F;min-height:100vh}
.hd{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;
  padding-bottom:20px;border-bottom:1px solid #4A463D;margin-bottom:30px;flex-wrap:wrap}
.hd h1{font:400 15px/1.4 'Space Mono',monospace;letter-spacing:.18em;text-transform:uppercase;color:#F6F4EE}
.hd p{font:400 13px/1.5 'Space Mono',monospace;color:#8C8474;margin-top:8px;letter-spacing:.06em}
.acts{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
button{font:400 12px/1 'Space Mono',monospace;letter-spacing:.14em;text-transform:uppercase;
  color:#F6F4EE;background:transparent;border:1px solid #6E6858;padding:12px 16px;cursor:pointer}
button:hover{background:#B93A13;border-color:#B93A13}
button:disabled{opacity:.45;cursor:default}
#all{background:#B93A13;border-color:#B93A13}
#st{font:400 12px/1 'Space Mono',monospace;color:#8C8474;letter-spacing:.08em}
.grid{display:flex;flex-wrap:wrap;gap:34px;align-items:flex-start}
.thumb{width:${Math.round(W * s)}px}
.box{width:${Math.round(W * s)}px;height:${Math.round(H * s)}px;overflow:hidden;
  box-shadow:0 20px 44px rgba(0,0,0,.45)}
.scaler{transform:scale(${s});transform-origin:0 0;width:${W}px;height:${H}px}
figcaption{margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:10px}
figcaption span{font:400 12px/1 'Space Mono',monospace;letter-spacing:.16em;
  text-transform:uppercase;color:#8C8474}
figcaption button{padding:9px 12px;font-size:11px}
`;

  /* The export runs in the browser: clone the slide into an svg foreignObject,
   * carrying the same @font-face data URIs the page already holds, paint that
   * into a 1080-wide canvas and hand back a PNG blob. No server, no Chrome
   * flags, no dependency -- open the file, click, done. */
  const js = `
const W=${W}, H=${H}, SLUG=${JSON.stringify(ctx.slug)};
const FONTS=document.getElementById('fc').textContent;
const SCSS=document.getElementById('sc').textContent;
const st=document.getElementById('st');
const slides=[...document.querySelectorAll('.scaler > .slide')];
const say=(m)=>{st.textContent=m};
const ell=String.fromCharCode(8230);

function svgFor(i){
  const clone=slides[i].cloneNode(true);
  clone.setAttribute('xmlns','http://www.w3.org/1999/xhtml');
  const inner=new XMLSerializer().serializeToString(clone);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'">'
    +'<foreignObject x="0" y="0" width="'+W+'" height="'+H+'">'
    +'<div xmlns="http://www.w3.org/1999/xhtml"><style>'+FONTS+SCSS+'</style>'+inner+'</div>'
    +'</foreignObject></svg>';
}

async function blobFor(i){
  const url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svgFor(i));
  const img=new Image();
  await new Promise((ok,no)=>{
    img.onload=ok;
    img.onerror=()=>no(new Error('slide '+(i+1)+' would not render in this browser'));
    img.src=url;
  });
  const c=document.createElement('canvas');
  c.width=W;c.height=H;
  const g=c.getContext('2d');
  g.fillStyle='#F6F4EE';g.fillRect(0,0,W,H);
  g.drawImage(img,0,0,W,H);
  return await new Promise(ok=>c.toBlob(ok,'image/png'));
}

async function save(i){
  const b=await blobFor(i);
  const a=document.createElement('a');
  a.href=URL.createObjectURL(b);
  a.download=SLUG+'-'+String(i+1).padStart(2,'0')+'.png';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),4000);
  return b.size;
}

document.querySelectorAll('.one').forEach(btn=>btn.addEventListener('click',async()=>{
  const i=+btn.dataset.i;
  btn.disabled=true;say('rendering '+(i+1)+ell);
  try{const n=await save(i);say('saved slide '+(i+1)+' ('+Math.round(n/1024)+' kB)')}
  catch(e){say(e.message)}
  btn.disabled=false;
}));

document.getElementById('all').addEventListener('click',async(e)=>{
  const b=e.currentTarget;
  b.disabled=true;
  try{
    for(let i=0;i<slides.length;i++){
      say('rendering '+(i+1)+' of '+slides.length+ell);
      await save(i);
      await new Promise(r=>setTimeout(r,260));
    }
    say('saved '+slides.length+' png to your downloads folder');
  }catch(err){say(err.message)}
  b.disabled=false;
});

const capBtn=document.getElementById('cap');
if(capBtn) capBtn.addEventListener('click',async()=>{
  try{
    await navigator.clipboard.writeText(document.getElementById('capsrc').textContent);
    say('caption copied');
  }catch(e){say('clipboard blocked -- the text is in caption.txt')}
});
`;

  return `<!doctype html><meta charset="utf-8"><title>${txt(ctx.topic)} &#8212; carousel</title>`
    + `<style id="fc">${fontCss()}</style><style id="sc">${CSS}</style><style>${ui}</style>`
    + body + `<script>${js}</script>`;
}

/* ----------------------------------------------------------------- main */

function build(file) {
  const slug = path.basename(file, ".json");
  const spec = JSON.parse(fs.readFileSync(file, "utf8"));
  const ctx = {
    handle: spec.handle || "hariomlohardev",
    url: spec.url || "hariomlohardev.github.io",
    topic: spec.topic || slug,
    avatar: spec.avatar ? dataUri(spec.avatar) : "",
    slides: spec.slides,
    slug: slug,
    caption: spec.caption || '',
  };
  const n = spec.slides.length;
  const html = spec.slides.map((s, i) => frame(s, i, n, ctx));

  const dir = path.join(OUT_DIR, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "preview.html"), previewPage(html, ctx));
  if (spec.caption) fs.writeFileSync(path.join(dir, "caption.txt"), spec.caption.trim() + "\n");

  const chrome = findChrome();
  if (!chrome) {
    console.log(`- ${slug}: preview written, no Chrome found so no PNGs`);
    console.log(`  open carousel/out/${slug}/preview.html, or set CHROME_PATH to render`);
    return;
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `carousel-${slug}-`));
  let made = 0;
  for (let i = 0; i < n; i++) {
    const page = path.join(tmp, `${pad2(i + 1)}.html`);
    const png = path.join(dir, `${pad2(i + 1)}.png`);
    fs.writeFileSync(page, doc(html[i], `html,body{width:${W}px;height:${H}px;overflow:hidden}`));
    try {
      // The same slide rendered to two different PNGs across runs: old headless
      // screenshots whatever the compositor has, so a slow layer landed as a
      // pale seam over the paper. New headless plus these two flags make Chrome
      // finish every compositor stage before it draws -- byte-identical output.
      execFileSync(chrome, [
        "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
        "--run-all-compositor-stages-before-draw",
        "--disable-new-content-rendering-timeout",
        "--force-device-scale-factor=1", "--virtual-time-budget=9000",
        `--window-size=${W},${H}`, `--screenshot=${png}`, page,
      ], { stdio: "ignore", timeout: 60000 });
    } catch (e) { /* chrome exits non-zero on benign warnings; judge by the file */ }
    if (fs.existsSync(png) && fs.statSync(png).size > 2048) {
      console.log(`  -> carousel/out/${slug}/${pad2(i + 1)}.png  ${W}x${H}  ${fs.statSync(png).size} B  (${spec.slides[i].type})`);
      made++;
    } else {
      console.warn(`  x  ${pad2(i + 1)}.png - chrome produced nothing usable`);
    }
  }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  console.log(`${slug}: ${made}/${n} slides at ${W}x${H}${spec.caption ? " + caption.txt" : ""}`);
}

const wanted = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const files = (fs.existsSync(SRC_DIR) ? fs.readdirSync(SRC_DIR) : [])
  .filter((f) => f.endsWith(".json"))
  .filter((f) => !wanted.length || wanted.includes(path.basename(f, ".json")))
  .map((f) => path.join(SRC_DIR, f));

if (!files.length) {
  console.log(`no carousel spec found in carousel/${wanted.length ? ` matching ${wanted.join(", ")}` : ""}`);
  process.exit(0);
}
for (const f of files) build(f);
