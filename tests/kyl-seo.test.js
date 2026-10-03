const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = file => fs.readFileSync(file, 'utf8');
const page = read('apps/kyl/index.html');
const graph = JSON.parse(page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];

test('app metadata identifies KYL, Android, and the canonical developer page', () => {
  assert.match(page, /<title>Know Your Label \(KYL\).*AI Food Label Scanner.*Android<\/title>/);
  assert.match(page, /name="author" content="Hariom Lohar"/);
  assert.match(page, /rel="canonical" href="https:\/\/hariomlohardev.github.io\/apps\/kyl\/"/);
  assert.match(page, /name="robots" content="index, follow/);
  assert.match(page, /property="og:image" content="https:\/\/hariomlohardev.github.io\/og\/kyl.png"/);
  const png = fs.readFileSync('og/kyl.png');
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
});

test('application schema connects to the real author and avoids invented ratings', () => {
  const app = graph.find(node => Array.isArray(node['@type']) && node['@type'].includes('MobileApplication'));
  assert.equal(app.name, 'Know Your Label');
  assert.equal(app.operatingSystem, 'Android');
  const author = graph.find(node => node['@id'] === app.author['@id']);
  assert.equal(author.name, 'Hariom Lohar');
  assert.equal(author.alternateName, 'hariomlohardev');
  assert.equal(app.featureList.length, 13);
  assert.equal(app.aggregateRating, undefined);
  assert.equal(app.review, undefined);
  assert.equal(app.offers, undefined);
});

test('all FAQ answers in structured data are visible and preserve the food safety limit', () => {
  const faq = graph.find(node => node['@type'] === 'FAQPage');
  assert.equal(faq.mainEntity.length, 8);
  for (const q of faq.mainEntity) {
    assert(page.includes('<summary>' + q.name + '</summary>'));
    assert(page.includes('<p>' + q.acceptedAnswer.text + '</p>'));
  }
  assert(faq.mainEntity.some(q => q.acceptedAnswer.text.includes('a photo cannot confirm that food is allergy-safe')));
});

test('sitemap and static app listing give crawlers links to the canonical app', () => {
  const sitemap = read('sitemap.xml');
  for (const url of ['https://hariomlohardev.github.io/apps/', 'https://hariomlohardev.github.io/apps/kyl/']) {
    assert.equal(sitemap.split('<loc>' + url + '</loc>').length - 1, 1);
  }
  assert.match(read('apps/index.html'), /class="app-card" href="\/apps\/kyl\/"/);
});

test('AI discovery facts remain in both generated indexes and their generator', () => {
  for (const file of ['llms.txt', 'llms-full.txt', 'apps/kyl/llms.txt', 'ai.txt']) {
    const text = read(file);
    assert(text.includes('Know Your Label'));
    assert(text.includes('https://hariomlohardev.github.io/apps/kyl/'));
    assert.match(text, /a photo cannot confirm that food is allergy-safe/i);
  }
  const generator = read('scripts/generate-llms.js');
  assert.match(generator, /fs.readFileSync\(path.join\(ROOT, "apps", "kyl", "llms.txt"\)/);
  assert(generator.includes('${APP_FACTS}'));
  assert(generator.includes('## Apps — Know Your Label (KYL)'));
});

test('AI search crawlers can access app paths while private paths stay disallowed', () => {
  const robots = read('robots.txt');
  for (const agent of ['OAI-SearchBot', 'Claude-SearchBot', 'Google-Extended', 'meta-externalagent']) assert(robots.includes('User-agent: ' + agent));
  assert(robots.includes('Allow: /'));
  assert(!robots.includes('Disallow: /apps'));
  assert(robots.includes('Disallow: /admin/'));
  assert(robots.includes('Disallow: /api/'));
});
