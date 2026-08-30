#!/usr/bin/env node
"use strict";
/**
 * load-env.js — zero-deps .env loader for the local build.
 *
 * Why it exists: the generators read process.env only, so a stale token sitting in
 * the machine's environment (e.g. an expired GITHUB_TOKEN in the Windows user env)
 * silently shadows the live value in .env — the build then falls back to anonymous
 * GitHub calls and to the deprecated posts.json instead of Supabase.
 *
 * So .env WINS over pre-existing process.env: on this machine .env is the source of
 * truth for secrets. No-op when .env is absent, which is the case in GitHub Actions
 * and on Vercel — there the real environment (secrets / project env vars) is used.
 *
 * Usage: require("./load-env")();   // at the top of a generator
 */
const fs = require("fs");
const path = require("path");

function parse(text) {
  const out = {};
  String(text).split(/\r?\n/).forEach(line => {
    if (!line || /^\s*#/.test(line)) return;
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]*)$/);
    if (!m) return;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  });
  return out;
}

function loadEnv(file) {
  const f = file || path.join(path.resolve(__dirname, ".."), ".env");
  let text;
  try { text = fs.readFileSync(f, "utf8"); } catch { return { loaded: false, keys: [] }; }
  const vars = parse(text);
  const keys = Object.keys(vars);
  keys.forEach(k => { process.env[k] = vars[k]; });
  return { loaded: true, keys };
}

module.exports = loadEnv;
module.exports.parse = parse;
