'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { main, sitemapUrls } = require('../scripts/ping-search');
const site = 'https://hariomlohardev.github.io';
const xml = `<urlset><url><loc>${site}/</loc></url></urlset>`;
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => body });
function mock(keyBody, postStatus = 200) {
  const calls = [];
  return { calls, request: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/sitemap.xml')) return response(xml);
    if (url.endsWith('/robots.txt')) return response(`Sitemap: ${site}/sitemap.xml`);
    if (url.endsWith('/abcdefgh.txt')) return response(keyBody);
    if (url === 'https://api.indexnow.org/IndexNow') return response('', postStatus);
    throw new Error('Unexpected request: ' + url);
  } };
}
test('without a key, only checks live sitemap and robots; never calls retired pings', async () => {
  const m = mock(''); await main(m.request, ''); assert.equal(m.calls.length, 2);
});
test('does not submit URLs until live key verification succeeds', async () => {
  const m = mock('wrong'); await assert.rejects(main(m.request, 'abcdefgh'), /verification/);
  assert.equal(m.calls.length, 3);
});
test('reports rejected IndexNow submissions as failures', async () => {
  const m = mock('abcdefgh', 403); await assert.rejects(main(m.request, 'abcdefgh'), /HTTP 403/);
});
test('submits published canonical URLs and accepts pending verification response', async () => {
  const m = mock('abcdefgh', 202); await main(m.request, 'abcdefgh');
  assert.deepEqual(JSON.parse(m.calls[3].options.body).urlList, [site + '/']);
});
test('rejects empty or foreign sitemap URLs', () => {
  assert.throws(() => sitemapUrls('<urlset></urlset>'), /canonical/);
  assert.throws(() => sitemapUrls(xml.replace(site, 'https://example.com')), /canonical/);
});
