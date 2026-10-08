'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const SEO = require('../assets/seo');
const { postPage } = require('../scripts/generate-blog');
const { contentHash, modifiedDate } = require('../scripts/generate-seo');
const ROOT = path.resolve(__dirname,'..');

test('article metadata escapes markup and script terminators while keeping valid JSON', () => {
  const title = 'Quotes " & </script><script>bad()</script>';
  const html = postPage({slug:'escaped-title',title,description:title,date:'2026-10-06',html:'<p>Useful body.</p>',tags:[title]});
  const head = html.split('</head>')[0];
  assert.ok(!head.includes('<script>bad()'));
  const graph=JSON.parse(head.match(/id="postStructuredData"[^>]*>([\s\S]*?)<\/script>/)[1]);
  assert.equal(graph['@graph'].find(n=>n['@type']==='BlogPosting').headline,title);
  assert.ok(html.includes('href="/blog#tag=Quotes%20'));
});

test('blank descriptions get topic-specific summaries and invalid image protocols are rejected', () => {
  const p=SEO.normalizePost({slug:'python-basics-variables-data-types',title:'Variables',description:'',html:'<p>Lesson</p>',date:'2026-09-24',cover:'javascript:alert(1)'});
  assert.match(p.seoDescription,/type checking, conversions and user input/);
  assert.equal(p.description,'', 'visible lede is preserved');
  assert.equal(p.image,SEO.SITE+'/og/blog.png');
  assert.ok(p.seoDescription.length<=160);
  assert.equal(SEO.normalizePost({...p,cover:'/og/home.png'}).image,SEO.SITE+'/og/home.png');
});

test('unchanged builds preserve sitemap dates and ignore JSON-LD or whitespace changes', () => {
  const html='<title>Example</title><main><h1>Example</h1><p>Body</p></main>';
  const hash=contentHash(html);
  assert.equal(contentHash(html.replace('</main>','<script type="application/ld+json">{"dateModified":"tomorrow"}</script></main>')),hash);
  assert.equal(modifiedDate({hash,lastmod:'2026-09-24'},hash,'','','2026-10-08'),'2026-09-24');
  assert.equal(modifiedDate({hash,lastmod:'2026-09-24'},'changed','','','2026-10-08'),'2026-10-08');
  assert.equal(modifiedDate({hash,lastmod:'2026-09-24'},'changed','2026-10-06','','2026-10-08'),'2026-10-06');
});

test('published test fixture is explicitly excluded without excluding real testing tutorials', () => {
  assert.equal(SEO.indexableTrick({id:1}),false);
  assert.equal(SEO.indexableTrick({id:3}),true);
  assert.equal(SEO.indexableTrick({id:4,tags:['testing']}),true);
});

test('live hydration refreshes all article metadata and schema together', () => {
  const metas=new Map();
  const ld={textContent:JSON.stringify({'@context':'https://schema.org','@graph':[{'@type':'Person','@id':SEO.SITE+'/#person'},{'@type':'WebSite'},...SEO.postNodes({slug:'refresh',title:'Old title',description:'Old description'})]})};
  const doc={title:'Old',querySelector(selector){return metas.get(selector)||null;},getElementById(){return ld;},createElement(){return {attrs:{},setAttribute(k,v){this.attrs[k]=v;this[k]=v;}};},head:{appendChild(el){const attr=el.attrs.property?'property':'name';metas.set('meta['+attr+'="'+el.attrs[attr]+'"]',el);}}};
  SEO.applyPost(doc,{slug:'refresh',title:'New title',description:'New description',date:'2026-10-06',cover:'/og/home.png'});
  assert.match(doc.title,/New title/);
  for(const name of ['og:title','og:description','og:image']) assert.ok(metas.get('meta[property="'+name+'"]'));
  assert.equal(metas.get('meta[name="twitter:description"]').content,'New description');
  const nodes=JSON.parse(ld.textContent)['@graph'];
  assert.equal(nodes.filter(n=>n['@type']==='BlogPosting').length,1);
  assert.equal(nodes.find(n=>n['@type']==='BlogPosting').headline,'New title');
});

test('SEO-only work preserves baseline CSS and the complete build runs on both hosts', () => {
  const baseline=JSON.parse(fs.readFileSync(path.join(__dirname,'ui-baseline.json'),'utf8'));
  for(const [file,expected] of Object.entries(baseline)){
    const after=fs.readFileSync(path.join(ROOT,file),'utf8');
    const css=s=>[...s.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(x=>x[1].replace(/\r\n/g,'\n'));
    assert.equal(crypto.createHash('sha256').update(JSON.stringify(css(after))).digest('hex'),expected,file+' must preserve existing styles');
  }
  const pkg=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'));
  assert.ok(pkg.scripts.build.indexOf('generate-tricks.js')<pkg.scripts.build.indexOf('generate-llms.js'));
  assert.ok(pkg.scripts.build.includes('prerender-lists.js'));
  assert.ok(pkg.scripts.build.includes('generate-seo.js'));
  assert.match(fs.readFileSync(path.join(ROOT,'.github/workflows/pages.yml'),'utf8'),/run: npm run build/);
});
