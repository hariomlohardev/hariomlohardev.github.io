#!/usr/bin/env node
'use strict';
// Final metadata and sitemap pass. No new UI or third-party service is required.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const SEO = require('../assets/seo');
const ROOT = path.resolve(__dirname, '..');
const STATE_FILE = path.join(ROOT, 'seo-state.json');
const SITE = SEO.SITE;
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const read = f => fs.readFileSync(path.join(ROOT,f),'utf8');
function write(file, value){
  const target = path.join(ROOT,file);
  if(fs.existsSync(target) && fs.readFileSync(target,'utf8') === value) return;
  fs.writeFileSync(target,value);
}
function publicPages(){
  const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html') && !/^google/.test(f));
  for(const dir of ['apps','blog/p','projects/p','tricks/p']){
    const visit = folder => {
      if(!fs.existsSync(path.join(ROOT,folder))) return;
      for(const entry of fs.readdirSync(path.join(ROOT,folder),{withFileTypes:true})){
        const file = folder + '/' + entry.name;
        if(entry.isDirectory()) visit(file);
        else if(entry.name.endsWith('.html')) pages.push(file);
      }
    };
    visit(dir);
  }
  pages.push('projects/spam_classifier.html');
  return [...new Set(pages)].sort();
}
function metadata(html){
  const decode = s => String(s || '').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;|&apos;/g,"'");
  const title = decode((html.match(/<title>([\s\S]*?)<\/title>/i)||[])[1]);
  const description = decode((html.match(/<meta name="description" content="([^"]*)/i)||[])[1]);
  const canonical = (html.match(/<link rel="canonical" href="([^"]*)/i)||[])[1];
  const noindex = /<meta name="robots" content="[^"]*noindex/i.test(html);
  return { title, description, canonical, noindex };
}
function contentHash(html){
  const meta = metadata(html);
  const main = (html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)||[])[1] || '';
  // Exclude scripts/JSON-LD and build metadata: a rebuild is not a content edit.
  const content = main.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<!--[^]*?-->/g,'').replace(/\s+/g,' ');
  return crypto.createHash('sha256').update(JSON.stringify([meta.title,meta.description,content])).digest('hex');
}
function modifiedDate(previous, hash, sourceDate, fallback, today){
  if(previous && previous.hash === hash) return sourceDate || previous.lastmod;
  if(previous) return sourceDate || today;
  return sourceDate || fallback || today;
}
function main(){
  const homepage = read('index.html');
  const homeGraph = JSON.parse(homepage.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)[1]);
  const person = homeGraph['@graph'].find(n => n['@type'] === 'Person');
  const website = homeGraph['@graph'].find(n => n['@type'] === 'WebSite');
  const previousXml = read('sitemap.xml');
  const oldDates = Object.fromEntries([...previousXml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(m => {
    const loc=(m[1].match(/<loc>(.*?)<\/loc>/)||[])[1];
    const date=(m[1].match(/<lastmod>(.*?)<\/lastmod>/)||[])[1];
    return [loc,date];
  }));
  let previous={};
  if(fs.existsSync(STATE_FILE)) previous=JSON.parse(fs.readFileSync(STATE_FILE,'utf8'));
  const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
  const state={}, entries=[], seen=new Set();
  for(const file of publicPages()){
    let html=read(file), meta=metadata(html), sourceDate='';
    if(!meta.canonical) continue; // Client-only trick viewer and verification files.
    if(!meta.canonical.startsWith(SITE + '/')) throw new Error(file + ': noncanonical host');
    // First builds may create PNGs after article HTML; only reference files that exist.
    const blogSlug=(file.match(/^blog\/p\/([a-z0-9-]+)\/index\.html$/)||[])[1];
    const generatedImage=blogSlug && fs.existsSync(path.join(ROOT,'og',blogSlug+'.png')) ? SITE+'/og/'+blogSlug+'.png' : '';
    const currentImage=(html.match(/<meta property="og:image" content="([^"]*)/i)||[])[1];
    const useGeneratedImage=generatedImage && currentImage===SITE+'/og/blog.png';
    if(useGeneratedImage) html=html.replace(/(<meta (?:property="og:image"|name="twitter:image") content=")[^"]*/g, '$1'+generatedImage);
    html=html.replace(/<script([^>]*type="application\/ld\+json"[^>]*)>([\s\S]*?)<\/script>/g, (_,attrs,raw) => {
      const doc=JSON.parse(raw);
      for(const node of doc['@graph'] || []){
        if(node['@type']==='Person') { node.image=person.image; node.name=person.name; node.url=person.url; }
        if(node['@type']==='WebSite') Object.assign(node,website);
        if(node['@id']===meta.canonical+'#webpage'){
          node.name=meta.title; node.description=meta.description;
          if(node.dateModified) sourceDate=SEO.isoDate(node.dateModified);
        }
        if(['TechArticle','BlogPosting','CreativeWork'].includes(node['@type']) && node.about && node.about['@id']===SITE+'/#person') delete node.about;
        if(node['@type']==='BlogPosting') {
          if(node.dateModified) sourceDate=SEO.isoDate(node.dateModified);
          if(useGeneratedImage) node.image=generatedImage;
        }
      }
      return '<script'+attrs+'>'+SEO.safeJson(doc,file.startsWith('apps/')?2:undefined)+'</script>';
    });
    // Let answer engines use the complete snippet and image; retain noindex pages.
    if(!meta.noindex) html=html.replace(/(<meta name="robots" content=")[^"]*("\s*\/?>)/,'$1index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1$2');
    write(file,html);
    if(meta.noindex) continue;
    if(seen.has(meta.canonical)) throw new Error('Duplicate canonical: '+meta.canonical);
    seen.add(meta.canonical);
    const hash=contentHash(html);
    const lastmod=modifiedDate(previous[meta.canonical],hash,sourceDate,oldDates[meta.canonical],today);
    state[meta.canonical]={hash,lastmod};
    const image=(html.match(/<meta property="og:image" content="([^"]*)/i)||[])[1];
    entries.push('  <url><loc>'+esc(meta.canonical)+'</loc><lastmod>'+lastmod+'</lastmod>' +
      (image ? '<image:image><image:loc>'+esc(image)+'</image:loc></image:image>' : '') + '</url>');
  }
  write('sitemap.xml','<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.0">\n'+entries.join('\n')+'\n</urlset>\n');
  write('seo-state.json',JSON.stringify(state,null,2)+'\n');
  console.log('SEO: '+entries.length+' canonical pages; accurate metadata and stable sitemap dates');
}
if(require.main===module) main();
module.exports={metadata,contentHash,modifiedDate,publicPages};
