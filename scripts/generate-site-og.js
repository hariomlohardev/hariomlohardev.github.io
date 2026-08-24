#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const OG_DIR = path.join(ROOT, "og");
function escSvg(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function siteOg({slug, title1, title2, kicker, description, urlPath, alt}){
  const u = `hariomlohardev.github.io${urlPath}`;
  // title handling: if title2 present, render two lines, else one
  const t1 = escSvg(title1);
  const t2 = title2 ? escSvg(title2) : null;
  const d = escSvg(description);
  const k = escSvg(kicker);
  const aria = escSvg(alt);
  const y1 = t2 ? 220 : 240;
  const y2 = t2 ? 304 : null;
  const barY = t2 ? 330 : 272;
  const descY = t2 ? 382 : 322;
  const subY = t2 ? 414 : 354;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="2246" height="1588" viewBox="0 0 2246 1588" role="img" aria-label="${aria}">
<rect width="2246" height="1588" fill="#F6F4EE"/>
<defs><pattern id="g" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0 H0 V24" fill="none" stroke="#DAD5C6" stroke-width="1" opacity="0.55"/></pattern><pattern id="g2" width="120" height="120" patternUnits="userSpaceOnUse"><path d="M120 0 H0 V120" fill="none" stroke="#C4BEAC" stroke-width="1" opacity="0.35"/></pattern></defs>
<rect width="2246" height="1588" fill="url(#g)"/><rect width="2246" height="1588" fill="url(#g2)"/>
<rect x="0" y="0" width="2246" height="8" fill="#B93A13"/>
<rect x="0" y="8" width="2246" height="1" fill="#181611" opacity="0.12"/>
<rect x="0" y="0" width="2246" height="40" fill="#181611"/>
<text x="32" y="26" fill="#EFECE2" font-family="'Space Mono',ui-monospace,monospace" font-size="11" letter-spacing="1.6">LAB NOTEBOOK №01 — HARIOM LOHAR</text>
<text x="1168" y="26" fill="#C4BEAC" font-family="'Space Mono',ui-monospace,monospace" font-size="10" text-anchor="end">${escSvg(u)}</text>
<rect x="42" y="58" width="1116" height="528" rx="0" fill="#FBFAF6" stroke="#181611" stroke-width="2"/>
<!-- top tape -->
<rect x="514" y="52" width="172" height="15" rx="2" fill="#FFFFFF" stroke="rgba(24,22,17,0.08)" transform="rotate(-1 600 59)"/>
<rect x="62" y="104" width="9" height="9" fill="#B93A13" transform="rotate(45 66.5 108.5)"/>
<text x="82" y="112" fill="#5F594A" font-family="'Space Mono',ui-monospace,monospace" font-size="11" letter-spacing="1.4">${k}</text>
<text x="62" y="${y1}" fill="#181611" font-family="'Fraunces',Georgia,serif" font-size="82" font-weight="600" letter-spacing="-2.2">${t1}</text>
${t2 ? `<text x="62" y="${y2}" fill="#181611" font-family="'Fraunces',Georgia,serif" font-size="82" font-weight="600" font-style="italic" letter-spacing="-2.2">${t2}</text>` : ``}
<rect x="62" y="${barY}" width="420" height="10" fill="#B93A13" opacity="0.95"/>
<text x="62" y="${descY}" fill="#37342B" font-family="'Archivo',system-ui,sans-serif" font-size="19" letter-spacing="0">${d}</text>
<text x="62" y="${subY}" fill="#5F594A" font-family="'Space Mono',ui-monospace,monospace" font-size="11">${escSvg(u)} · Lab Notebook №01 · Open notebook, open source.</text>
<g transform="translate(62 500)">
  <rect width="210" height="36" fill="#181611"/>
  <text x="18" y="23" fill="#F6F4EE" font-family="'Space Mono',ui-monospace,monospace" font-size="11" letter-spacing="1">hariomlohardev ↗</text>
  <rect x="224" width="170" height="36" fill="#FFFFFF" stroke="#181611" stroke-width="1.2"/>
  <text x="250" y="23" fill="#181611" font-family="'Space Mono',ui-monospace,monospace" font-size="11" letter-spacing="0.8">Open page →</text>
</g>
<text x="1138" y="523" fill="#5F594A" font-family="'Space Mono',ui-monospace,monospace" font-size="11" text-anchor="end">◎ Lab Notebook №01</text>
</svg>`;
}
const pages = [
  {slug:"home", title1:"HARIOM", title2:"LOHAR", kicker:"01 — HOME · hariomlohardev.github.io/", description:"Python, Django, Flutter & AGI Research — rebuilding intelligence from first principles.", urlPath:"/", alt:"Hariom Lohar — Python, Django, Flutter & AGI Research — Lab Notebook No.01"},
  {slug:"about", title1:"ABOUT", title2:"HARIOM", kicker:"05 — ABOUT · FIELD NOTES · hariomlohardev.github.io/about", description:"Self-taught from India, Harvard CS50P 2026 — 8 hours a day, committed in public.", urlPath:"/about", alt:"About Hariom Lohar — CS50P, Python & AGI Lab Notebook — portrait and field notes"},
  {slug:"blog", title1:"BLOG &", title2:"LOGS", kicker:"05b — BLOG · DAILY LOGS · hariomlohardev.github.io/blog", description:"Blog & daily logs — AGI from first principles, CNNs, Transformers and PyTorch.", urlPath:"/blog", alt:"Blog & Daily Logs — Hariom Lohar — AGI from first principles, CNNs, Transformers"},
  {slug:"projects", title1:"SELECTED", title2:"BUILDS", kicker:"02 — PROJECTS · hariomlohardev.github.io/projects", description:"Live spam classifier bench & AGI Research archive — backends that stay up.", urlPath:"/projects", alt:"Projects by Hariom Lohar — live spam classifier bench & AGI Research archive"},
  {slug:"opensource", title1:"OPEN", title2:"SOURCE", kicker:"03 — OPEN SOURCE · hariomlohardev.github.io/opensource", description:"Open source PRs & contributions — Python, LangChain, and the commons.", urlPath:"/opensource", alt:"Open Source — Hariom Lohar | PRs & Contributions — Lab Notebook No.01"},
  {slug:"community", title1:"SIGMOID", title2:"COMMUNITY", kicker:"07 — COMMUNITY · hariomlohardev.github.io/community", description:"SIGMOID — open lab group and Telegram — build in public, one log at a time.", urlPath:"/community", alt:"SIGMOID Community — Hariom Lohar Lab — open lab group and Telegram"},
  {slug:"contact", title1:"CONTACT", title2:"FILE", kicker:"06 — CONTACT · hariomlohardev.github.io/contact", description:"Contact Hariom Lohar — Python, Django, Flutter & AGI — freelance and collabs.", urlPath:"/contact", alt:"Contact — Hariom Lohar — Python, Django, Flutter & AGI — freelance and collabs"},
  {slug:"404", title1:"404", title2:"NOT FOUND", kicker:"— ERROR · hariomlohardev.github.io/404", description:"Page not found — Lab Notebook №01 — Hariom Lohar. Return to the lab?", urlPath:"/404", alt:"404 Not Found — Hariom Lohar — Lab Notebook No.01"},
  {slug:"thanks", title1:"THANKS", title2:"SENT", kicker:"— CONTACT · hariomlohardev.github.io/thanks", description:"Message sent — Hariom Lohar will reply within 24 hours (IST).", urlPath:"/thanks", alt:"Thanks — message sent to Hariom Lohar — Lab Notebook No.01"},
];
try{fs.mkdirSync(OG_DIR,{recursive:true});}catch{}
for(const p of pages){
  const svg = siteOg(p);
  fs.writeFileSync(path.join(OG_DIR, p.slug + ".svg"), svg);
  console.log(`→ og/${p.slug}.svg`);
}
console.log("done site og");
