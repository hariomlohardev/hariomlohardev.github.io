#!/usr/bin/env node
'use strict';
// Validate actual deployment artifacts, without contacting a third-party service.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const SEO=require('../assets/seo');
const {metadata,publicPages}=require('./generate-seo');
const ROOT=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const canonicalPages=new Map(), titles=new Set();
for(const file of publicPages()){
  const html=read(file), meta=metadata(html);
  if(!meta.canonical) continue;
  const graphs=[...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]));
  if(meta.noindex) continue;
  assert(meta.title && meta.description,file+': missing title or description');
  assert(!titles.has(meta.title),file+': duplicate title');
  titles.add(meta.title);
  assert(!canonicalPages.has(meta.canonical),file+': duplicate canonical');
  canonicalPages.set(meta.canonical,file);
  assert(meta.canonical.startsWith(SEO.SITE+'/'),file+': wrong canonical host');
  assert(html.includes('max-image-preview:large'),file+': limited search preview');
  const main=(html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)||[])[1];
  assert(main && SEO.plain(main).length>30,file+': missing initial page content');
  const nodes=graphs.flatMap(g=>g['@graph'] || [g]);
  assert(nodes.some(n=>n.url===meta.canonical),file+': schema does not identify canonical page');
  for(const image of [...html.matchAll(/<meta (?:property="og:image"|name="twitter:image") content="([^"]*)/g)].map(m=>m[1])){
    assert(/^https?:\/\//.test(image),file+': image must be absolute');
    if(image.startsWith(SEO.SITE+'/')) assert(fs.existsSync(path.join(ROOT,new URL(image).pathname)),file+': missing image '+image);
  }
  for(const person of nodes.filter(n=>n['@type']==='Person')){
    assert.equal(person.image,SEO.SITE+'/assets/hariom-lohar.jpg',file+': author image must be the portrait');
  }
  if(file.startsWith('blog/p/')){
    const body=(html.match(/id="postBody"[^>]*>([\s\S]*?)<\/article>/)||[])[1];
    assert(body && SEO.plain(body).length>200,file+': article missing from initial HTML');
    const article=nodes.find(n=>n['@type']==='BlogPosting');
    assert(article && article.headline && article.datePublished && article.dateModified,file+': incomplete article schema');
    assert(!Number.isNaN(Date.parse(article.dateModified)),file+': invalid modification date');
    assert.equal(article.description,meta.description,file+': article description differs from metadata');
  }
}
const sitemap=read('sitemap.xml');
const sitemapRoot=(sitemap.match(/<urlset\b[^>]*>/)||[])[0] || '';
assert(sitemapRoot.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'),'sitemap must declare the standard URL namespace');
if(sitemap.includes('<image:image>')){
  // Google image sitemap 1.1 requires image:loc; the old 1.0 schema causes parsing errors.
  assert(sitemapRoot.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'),'sitemap must use Google image namespace 1.1');
  for(const image of sitemap.matchAll(/<image:image>([\s\S]*?)<\/image:image>/g)){
    assert(/<image:loc>https?:\/\/[^<]+<\/image:loc>/.test(image[1]),'sitemap image must contain an absolute image:loc');
  }
}
const locations=[...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);
assert.deepEqual(locations.slice().sort(),[...canonicalPages.keys()].sort(),'sitemap must match all indexable canonical HTML');
for(const lastmod of [...sitemap.matchAll(/<lastmod>(.*?)<\/lastmod>/g)].map(m=>m[1])){
  assert(!Number.isNaN(Date.parse(lastmod)),'invalid sitemap date');
  assert(Date.parse(lastmod)<=Date.now(),'sitemap date is in the future');
}
assert(!locations.includes(SEO.SITE+'/tricks/p/1/'),'test fixture must not be indexed');
assert(metadata(read('tricks/p/1/index.html')).noindex,'test fixture must retain noindex');
assert(read('feed.xml').includes('<content:encoded>'),'RSS must contain the full article body');
for(const file of ['llms.txt','llms-full.txt']) assert(!read(file).includes(SEO.SITE+'/tricks/p/1/'),file+': test fixture leaked into AI index');
console.log('SEO verified: '+canonicalPages.size+' canonical pages, full article HTML, valid schema, images and sitemap.');
