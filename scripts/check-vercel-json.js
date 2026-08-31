#!/usr/bin/env node
/* vercel.json is validated against Vercel's schema BEFORE the build runs, and a
 * failure there is invisible locally: the deployment goes straight to ERROR with
 * no build log, production silently keeps serving the previous commit, and every
 * push after it fails the same way. That is how a `"//"` comment key inside a
 * headers entry kept four commits off hariomlohardev.vercel.app.
 *
 * So: JSON takes no comments, and entries take no keys Vercel does not define.
 * Checked here rather than discovered at deploy time. Run by `npm run check`.
 */
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "vercel.json");
const KEYS = {
  headers: ["source", "headers", "has", "missing"],
  rewrites: ["source", "destination", "has", "missing"],
  redirects: ["source", "destination", "permanent", "statusCode", "has", "missing"],
  crons: ["path", "schedule"],
};

const errors = [];
let doc;
try {
  doc = JSON.parse(fs.readFileSync(FILE, "utf8"));
} catch (e) {
  console.error("vercel.json is not valid JSON: " + e.message);
  process.exit(1);
}

(function noCommentKeys(node, where) {
  if (Array.isArray(node)) return node.forEach((v, i) => noCommentKeys(v, where + "[" + i + "]"));
  if (!node || typeof node !== "object") return;
  for (const k of Object.keys(node)) {
    if (k.startsWith("//") || k.startsWith("#")) errors.push(where + ": comment key " + JSON.stringify(k) + " — JSON has no comments, and Vercel rejects the extra property");
    noCommentKeys(node[k], where + "." + k);
  }
})(doc, "vercel.json");

for (const [field, allowed] of Object.entries(KEYS)) {
  (doc[field] || []).forEach((entry, i) => {
    for (const k of Object.keys(entry)) {
      if (!allowed.includes(k)) errors.push(field + "[" + i + "]: unknown property " + JSON.stringify(k) + " (allowed: " + allowed.join(", ") + ")");
    }
  });
}

if (errors.length) {
  console.error("vercel.json would fail Vercel's schema validation:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("vercel.json ok (" + (doc.headers || []).length + " header rules, " + (doc.rewrites || []).length + " rewrites, " + (doc.redirects || []).length + " redirects)");
