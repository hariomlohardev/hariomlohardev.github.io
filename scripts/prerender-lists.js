#!/usr/bin/env node
/* Pre-render the list pages so a crawler that runs no JavaScript still sees the
 * content.
 *
 * /blog, /tricks and the homepage's latest-logs strip all render client-side from
 * Supabase. Google executes JS and eventually indexes them, but the crawlers that
 * feed AI answers — GPTBot, ClaudeBot, PerplexityBot, CCBot, Bytespider — fetch
 * raw HTML and stop. To them those three pages were empty containers: the site
 * could not be quoted on anything it had actually written.
 *
 * So the same rows the client builds are also written into the HTML at build time,
 * between <!--ssg:*--> markers, from the artifacts the other generators just wrote
 * (tricks-data.json, feed.xml). The client still replaces them on load, so live
 * data and deletions win for humans exactly as before, and the static copy is
 * refreshed on the next build — the same freshness contract blog/p/<slug>/ and
 * tricks/p/<id>/ already live under.
 *
 * Also emits an ItemList per list page so the entries are machine-readable as a
 * set, not just as prose.
 *
 * Run after the generators: node scripts/prerender-lists.js
 */
const fs = require("fs");
const path = require("path");
require('./load-env')();
const SEO = require('../assets/seo.js');

const ROOT = path.resolve(__dirname, "..");
const SITE = "https://hariomlohardev.github.io";
const MAX_ROWS = 20;   // one screen of crawlable rows; the client paginates the rest

const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const read = p => fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";

function fmtDate(iso){
  try {
    return new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
  } catch { return String(iso || "").slice(0, 10); }
}

/* markdown/html → one line of prose, the way the pages' own excerpt() does */
function plain(s){
  return String(s || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|-]+/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const clip = (s, n) => s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s;

/* With no rows to write - a fresh clone, or Supabase with nothing published yet -
 * the marker region goes back to the shimmer placeholders the pages shipped before,
 * so the human loading state is unchanged. aria-busy follows the same fact: true
 * while the region is still a placeholder, false once it holds real content. */
const SKELETON = (n, indent, attrs) => "\n" + Array.from({ length: n }, () => indent + '<div class="skeleton"' + attrs + "></div>").join("\n") + "\n";

function inject(file, name, html){
  const p = path.join(ROOT, file);
  const s = read(p);
  const open = "<!--ssg:" + name + "-->", close = "<!--/ssg:" + name + "-->";
  const i0 = s.indexOf(open), i1 = s.indexOf(close);
  if(i0 < 0 || i1 < 0) throw new Error(file + ": missing " + open + " / " + close + " markers");
  const out = s.slice(0, i0 + open.length) + html + s.slice(i1);
  if(out === s) return false;
  fs.writeFileSync(p, out);
  return true;
}

/* aria-busy on a list container: true only while it is still a placeholder. */
function setBusy(file, id, busy){
  const p = path.join(ROOT, file);
  const s = read(p);
  const i = s.indexOf('id="' + id + '"');
  if(i < 0) throw new Error(file + ': no #' + id);
  const gt = s.indexOf(">", i);
  const tag = s.slice(i, gt).replace(/aria-busy="(?:true|false)"/, 'aria-busy="' + (busy ? "true" : "false") + '"');
  const out = s.slice(0, i) + tag + s.slice(gt);
  if(out === s) return false;
  fs.writeFileSync(p, out);
  return true;
}

/* dateModified on the list page, taken from the newest entry rather than from build time:
 * a rebuild that changed nothing should not claim the page is fresher than its content. */
function setDateModified(file, pageId, iso){
  if(!iso) return false;
  const p = path.join(ROOT, file);
  const s = read(p);
  const open = '<script type="application/ld+json">';
  const i0 = s.indexOf(open);
  if(i0 < 0) throw new Error(file + ": no ld+json block");
  const i1 = s.indexOf("</script>", i0);
  const raw = s.slice(i0 + open.length, i1);
  let doc;
  try { doc = JSON.parse(raw); } catch(e){ throw new Error(file + ": ld+json does not parse — " + e.message); }
  const node = (doc["@graph"] || []).find(n => n && n["@id"] === pageId);
  if(!node) throw new Error(file + ": no node with @id " + pageId);
  if(node.dateModified === iso) return false;
  node.dateModified = iso;
  const out = s.slice(0, i0 + open.length) + JSON.stringify(doc) + s.slice(i1);
  fs.writeFileSync(p, out);
  return true;
}

function itemList(name, url, items){
  const node = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": url + "#list",
    name,
    url,
    mainEntityOfPage: { "@id": url + "#webpage" },
    numberOfItems: items.length,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: it.url,
      name: it.title,
    })),
  };
  return '\n<script type="application/ld+json">' + SEO.safeJson(node) + "</script>\n";
}

/* ── tricks ─────────────────────────────────────────────────────── */
function tricks(){
  let data;
  try { data = JSON.parse(read(path.join(ROOT, "tricks-data.json")) || "{}"); } catch { data = {}; }
  const list = (data.tricks || []).slice(0, MAX_ROWS);
  const rows = list.map(t => {
    const href = "/tricks/p/" + t.id + "/";   // the canonical form; without the slash Pages 301s
    const mins = Math.max(1, t.reading_minutes || Math.ceil((t.word_count || 0) / 200) || 1);
    const tags = (t.tags || []).slice(0, 4).map(x => "<span>" + esc(x) + "</span>").join("");
    return '<article class="row" data-href="' + esc(href) + '">' +
      '<div class="row-no">#' + esc(String(t.id).padStart(3, "0")) + "</div>" +
      '<div class="row-body">' +
        '<div class="row-meta"><span class="sq art" aria-hidden="true"></span> Trick<span>·</span><span>' + esc(fmtDate(t.created_at)) + "</span><span>·</span><span>" + mins + " min read</span></div>" +
        "<h3><a href=\"" + esc(href) + "\">" + esc(t.title) + "</a></h3>" +
        "<p>" + esc(clip(plain(t.raw || t.html), 190)) + "</p>" +
        (tags ? '<div class="row-tags">' + tags + "</div>" : "") +
      "</div>" +
      '<div class="row-arrow" aria-hidden="true">→</div>' +
    "</article>";
  }).join("\n");
  const changed = inject("tricks.html", "list", rows ? "\n" + rows + "\n" : SKELETON(4, "        ", " aria-hidden=\"true\""));
  setBusy("tricks.html", "list", !rows);
  const indexed = list.filter(SEO.indexableTrick);
  const ld = indexed.length ? itemList("Tricks — Hariom Lohar", SITE + "/tricks", indexed.map(t => ({ url: SITE + "/tricks/p/" + t.id + "/", title: t.title }))) : "\n";
  const newest = list.map(t => String(t.updated_at || t.created_at || '')).sort().pop() || '';
  const dm = setDateModified("tricks.html", SITE + "/tricks#webpage", newest);
  return [changed, inject("tricks.html", "list-jsonld", ld) || dm, list.length];
}

/* ── blog + homepage latest, from the feed the blog generator just wrote ── */
function feedItems(){
  const xml = read(path.join(ROOT, "feed.xml"));
  const out = [];
  const one = (block, tag) => { const m = block.match(new RegExp("<" + tag + ">([\\s\\S]*?)</" + tag + ">")); return m ? m[1] : ""; };
  const unesc = s => String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  for(const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)){
    const b = m[1];
    const link = unesc(one(b, "link"));
    const cats = [...b.matchAll(/<category>([\s\S]*?)<\/category>/g)].map(c => unesc(c[1]).trim()).filter(Boolean);
    const pub = one(b, "pubDate");
    out.push({
      title: unesc(one(b, "title")),
      url: link,
      href: link.replace(SITE, "") || "/blog",
      description: unesc(b.includes('<portfolio:description>') ? one(b, 'portfolio:description') : one(b, "description")),
      modified: unesc(one(b, "dcterms:modified")),
      date: pub ? new Date(pub).toISOString().slice(0, 10) : "",
      tags: cats,
    });
  }
  return out;
}

function blog(){
  const items = feedItems();
  const rows = items.slice(0, MAX_ROWS).map((p, i) => {
    const isLog = p.tags.some(t => t.toLowerCase() === "daily-log");
    const tags = p.tags.filter(t => t !== "daily-log" && t !== "article").slice(0, 4).map(x => "<span>" + esc(x) + "</span>").join("");
    return '<article class="row" data-href="' + esc(p.href) + '">' +
      '<div class="row-no">' + String(items.length - i).padStart(3, "0") + "</div>" +
      '<div class="row-body">' +
        '<div class="row-meta"><span class="sq ' + (isLog ? "log" : "art") + '" aria-hidden="true"></span> ' + (isLog ? "Daily log" : "Article") + "<span>·</span><span>" + esc(fmtDate(p.date)) + "</span></div>" +
        "<h3><a href=\"" + esc(p.href) + "\">" + esc(p.title) + "</a></h3>" +
        "<p>" + esc(p.description) + "</p>" +
        (tags ? '<div class="row-tags">' + tags + "</div>" : "") +
      "</div>" +
      '<div class="row-arrow" aria-hidden="true">→</div>' +
    "</article>";
  }).join("\n");
  const changed = inject("blog.html", "list", rows ? "\n" + rows + "\n" : SKELETON(4, "          ", " aria-hidden=\"true\""));
  setBusy("blog.html", "list", !rows);
  const ld = items.length ? itemList("Blog & daily logs — Hariom Lohar", SITE + "/blog", items.slice(0, MAX_ROWS)) : "\n";
  const changedLd = inject("blog.html", "list-jsonld", ld);
  const changedDm = setDateModified("blog.html", SITE + "/blog#webpage", items.map(p => p.modified || p.date).sort().pop() || '');

  const cards = items.slice(0, 3).map(p => {
    const isLog = p.tags.some(t => t.toLowerCase() === "daily-log");
    return '<a href="' + esc(p.href) + '" class="latest-card">' +
      '<div class="lc-meta">' + (isLog ? '<span class="lc-badge">◎ Daily log</span>' : '<span class="lc-badge art">✎ Article</span>') + "<span>" + esc(fmtDate(p.date)) + "</span></div>" +
      "<h3>" + esc(p.title) + "</h3><p>" + esc(p.description) + '</p><span class="open">Open →</span></a>';
  }).join("\n");
  const changedHome = inject("index.html", "latest", cards ? "\n" + cards + "\n" : SKELETON(3, "      ", ""));
  setBusy("index.html", "latestList", !cards);
  return [changed || changedLd || changedDm || changedHome, items.length];
}

/* Build the same project cards that renderArchive() uses, with the same classes. */
function projects(){
  const data = JSON.parse(read(path.join(ROOT, 'projects-data.json')));
  const list = data.projects || data;
  const rows = list.map((p, i) => {
    const live = (p.kind || (p.demoUrl ? 'live' : 'repo')) === 'live';
    const href = p.detailUrl ? p.detailUrl.replace(SITE, '') : '/projects/p/' + (p.slug || p.id) + '/';
    const status = live ? '<span class="status live"><i></i>' + esc(p.statusLabel) + '</span>' :
      '<span class="status ' + (p.status === 'shipped' ? 'shipped' : p.status === 'open-source' ? 'oss' : 'log') + '">' + esc(p.statusLabel) + '</span>';
    const langs = p.languages || [];
    const bar = langs.length > 1 ? '<div class="langbar">' + langs.map(l => '<i style="width:' + Number(l.pct) + '%;background:' + esc(l.color || '#6E6858') + '"></i>').join('') + '</div>' : '';
    const meta = langs.map(l => '<span style="display:inline-flex;align-items:center;gap:6px"><i class="dot" style="background:' + esc(l.color || '#6E6858') + '"></i>' + esc(l.name) + '</span>').join(' · ');
    return '<a class="proj-card rv" href="' + esc(href) + '" style="transition-delay:' + Math.min(i,6)*45 + 'ms" aria-label="' + esc(p.name + ' — ' + p.statusLabel) + '">' +
      '<span class="proj-arrow" aria-hidden="true">↗</span><div class="proj-top"><span class="proj-idx">0' + (i+1) + '</span>' + status +
      (live ? '<span class="kind live">Live</span>' : '<span class="kind code">Code</span>') + '</div><h3>' + esc(p.name) + '</h3><p>' + esc(p.description) + '</p>' +
      '<div class="chips">' + (p.chips || []).map(c => '<span>' + esc(c) + '</span>').join('') + '</div>' + bar + (meta ? '<div class="proj-meta">' + meta + '</div>' : '') + '</a>';
  }).join('\n');
  inject('projects.html', 'projects', '\n' + rows + '\n');
  setBusy('projects.html', 'archiveGrid', false);
  inject('projects.html', 'projects-jsonld', itemList('Projects — Hariom Lohar', SITE + '/projects', list.map(p => ({ title: p.name, url: p.detailUrl || SITE + '/projects/p/' + (p.slug || p.id) + '/' }))));
  const home = JSON.parse(read(path.join(ROOT, 'data.json')));
  inject('index.html', 'projects', '\n' + (home.projects || []).map((p,i) => {
    const ext = /^https?:/.test(p.url);
    return '<a class="repo-card rv" href="' + esc(p.url) + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + ' style="transition-delay:' + i*60 + 'ms">' +
      '<span class="repo-arrow" aria-hidden="true">↗</span><div class="repo-top"><span class="repo-idx">0' + (i+1) + '</span><span class="repo-status">' + esc(p.status) + '</span></div><h3>' + esc(p.name) + '</h3><p>' + esc(p.description) + '</p></a>';
  }).join('\n') + '\n');
}

/* Supabase remains the only source of contributions; no manual snapshot/fake data. */
async function contributions(){
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url || !key) throw new Error('Supabase credentials required to pre-render public contributions');
  const res = await fetch(url.replace(/\/$/, '') + '/rest/v1/site_content?select=data,updated_at&key=eq.opensource&limit=1', {
    headers: { apikey: key, Authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(20000)
  });
  if(!res.ok) throw new Error('Contribution pre-render failed: HTTP ' + res.status);
  const records = await res.json(), row = records[0], stored = row && row.data;
  const prs = Array.isArray(stored) ? stored : (stored && stored.prs) || [];
  const items = prs.map(p => ({ type:'pr', title:p.title, repo:p.repo || '', desc:p.body || '', url:p.html_url,
    state:p.merged ? 'merged' : p.state || 'open', updated:p.updated_at || p.created_at || '' })).concat(
    ((stored && stored.issues) || []).map(p => ({ type:'issue', title:p.title, repo:p.repo || '', desc:p.body || '', url:p.html_url, state:p.state || 'open', updated:p.updated_at || '' }))
  ).filter(p => !p.repo.startsWith('hariomlohardev/')).sort((a,b) => b.updated.localeCompare(a.updated));
  const rows = items.map((it,i) => '<a class="row rv" href="' + esc(it.url) + '" target="_blank" rel="noopener" style="transition-delay:' + Math.min(i,8)*35 + 'ms">' +
    '<div class="row-left"><span class="type-icon ' + it.type + ' ' + esc(it.state) + '" aria-hidden="true"></span><span>No.' + String(i+1).padStart(3,'0') + '</span></div>' +
    '<div class="row-body"><div class="row-meta"><span class="tag ' + (it.state === 'merged' ? 'merged' : it.state === 'closed' ? 'closed' : it.type === 'issue' ? 'type-issue' : 'open') + '">' + (it.type === 'pr' ? 'PR' : 'Issue') + ' · ' + esc(it.state) + '</span><span>' + esc(it.repo) + '</span></div>' +
    '<h3>' + esc(it.title) + '<span class="repo-path">' + esc(it.repo) + '</span></h3>' + (it.desc ? '<p>' + esc(it.desc) + '</p>' : '') + '</div><div class="row-right">' +
    (it.updated ? '<span class="date">' + esc(fmtDate(it.updated)) + '</span>' : '') + '<span class="arrow" aria-hidden="true">→</span></div></a>').join('\n');
  inject('opensource.html', 'contributions', '\n' + (rows || '<div class="empty">No Open Source contributions have been published yet.</div>') + '\n');
  setBusy('opensource.html', 'list', false);
  inject('opensource.html', 'contributions-jsonld', items.length ? itemList('Open Source — Hariom Lohar', SITE + '/opensource', items.map(p => ({ title:p.title, url:p.url }))) : '\n');
  setDateModified('opensource.html', SITE + '/opensource#webpage', (row && row.updated_at) || '');
  const home = prs.slice().sort((a,b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''))).slice(0,4).map((p,i) =>
    '<a class="repo-card rv" href="' + esc(p.html_url) + '" target="_blank" rel="noopener" style="transition-delay:' + i*60 + 'ms"><span class="repo-arrow" aria-hidden="true">↗</span>' +
    '<div class="repo-top"><span class="oss-repo">' + esc(p.repo) + '</span><span class="repo-status">PR · ' + esc(p.merged ? 'merged' : p.state || 'open') + '</span></div>' +
    '<h3>' + esc(p.title) + '</h3><p>' + esc(String(p.body || '').slice(0,140).replace(/\s+/g,' ').trim() || p.title) + '</p></a>').join('\n');
  inject('index.html', 'contributions', '\n' + (home || '<div class="empty" style="grid-column:1/-1">No Open Source contributions published yet.</div>') + '\n');
  return items.length;
}

async function main(){
  const [tChanged, tLd, tCount] = tricks();
  const [bChanged, bCount] = blog();
  projects();
  const cCount = await contributions();
  console.log('prerender-lists: ' + tCount + ' tricks, ' + bCount + ' posts, projects and ' + cCount + ' contributions');
}
if(require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { feedItems, projects, contributions };
