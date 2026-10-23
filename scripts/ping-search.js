#!/usr/bin/env node
'use strict';
// Run after deployment; submit URLs from the published sitemap.
const SITE = 'https://hariomlohardev.github.io';
async function readLive(url, request = fetch) {
  const response = await request(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}
function sitemapUrls(xml) {
  if (!/<urlset\b/.test(xml)) throw new Error('Live sitemap is not a URL set');
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim().replace(/&amp;/g, '&'));
  if (!urls.length || urls.some(url => !url.startsWith(SITE + '/'))) throw new Error('Live sitemap must contain canonical site URLs');
  return urls;
}
async function main(request = fetch, key = process.env.INDEXNOW_KEY || '') {
  const urls = sitemapUrls(await readLive(SITE + '/sitemap.xml', request));
  const robots = await readLive(SITE + '/robots.txt', request);
  if (!robots.includes('Sitemap: ' + SITE + '/sitemap.xml')) throw new Error('Live robots.txt is missing the sitemap');
  console.log(`Live sitemap and robots.txt accessible: ${urls.length} canonical URLs.`);
  if (process.argv.includes('--verbose')) urls.forEach(url => console.log(url));
  if (key) {
    if (!/^[a-zA-Z0-9-]{8,128}$/.test(key)) throw new Error('Invalid IndexNow key format');
    const keyLocation = `${SITE}/${key}.txt`;
    if ((await readLive(keyLocation, request)).trim() !== key) throw new Error('Publish the IndexNow verification file before submitting URLs');
    const response = await request('https://api.indexnow.org/IndexNow', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: new URL(SITE).host, key, keyLocation, urlList: urls })
    });
    if (!response.ok) throw new Error(`IndexNow submission failed: HTTP ${response.status}`);
    console.log(`IndexNow accepted submission (HTTP ${response.status}); indexing is not guaranteed.`);
  } else {
    console.log('IndexNow skipped: no INDEXNOW_KEY configured. Publish its verification file before enabling.');
  }
  console.log('Google: use Search Console sitemap submission and URL Inspection. No retired ping endpoints are called.');
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main, sitemapUrls };
