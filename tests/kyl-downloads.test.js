const test = require('node:test');
const assert = require('node:assert/strict');
const { newestRelease, universalAsset, getReleases, mount } = require('../apps/kyl/downloads');
const base = 'https://github.com/hariomlohardev/kyl-apks/releases/download/v1/';
const asset = name => ({ name, size: 1048576, browser_download_url: base + name });

test('newest published release includes prereleases and ignores drafts', () => {
  const latest = { published_at: '2026-10-03', prerelease: true };
  assert.equal(newestRelease([{ published_at: '2026-09-01' }, { published_at: '2026-12-01', draft: true }, latest]), latest);
  assert.equal(newestRelease([]), null);
});

test('universal APK is selected instead of any ABI-specific APK', () => {
  const universal = asset('kyl-v1-universal.apk');
  assert.equal(universalAsset({ assets: [asset('kyl-arm64-v8a.apk'), universal, asset('kyl-x86_64.apk')] }).url, universal.browser_download_url);
  assert.equal(universalAsset({ assets: [asset('kyl-arm64-v8a.apk')] }), null);
  assert.equal(universalAsset({ assets: [asset('notuniversal.apk')] }), null);
  assert.equal(universalAsset({ assets: [{ ...universal, browser_download_url: 'https://example.com/universal.apk' }] }), null);
});

test('release pagination considers newer publications on later pages', async () => {
  let count = 0;
  const releases = await getReleases(async () => {
    count++;
    return { ok: true, headers: { get: () => count === 1 ? '<https://api.github.com/repos/hariomlohardev/kyl-apks/releases?per_page=100&page=2>; rel="next"' : null }, json: async () => [{ id: count, published_at: count === 1 ? '2026-09-01' : '2026-10-03' }] };
  });
  assert.equal(newestRelease(releases).id, 2);
});

function downloadDocument() {
  const ids = Object.fromEntries(['downloadBox', 'releaseStatus', 'downloadInfo', 'downloadCta', 'universalDownload', 'releaseNotes', 'releaseNotesBody'].map(id => [id, { attributes: {}, events: {}, textContent: '', setAttribute(key, value) { this.attributes[key] = value; }, addEventListener(key, handler) { this.events[key] = handler; } }]));
  return { ids, getElementById: id => ids[id] };
}

test('both CTAs download the latest universal APK directly and show its size', async () => {
  const document = downloadDocument();
  const universal = asset('kyl-v2-universal.apk');
  await mount(document, async () => ({ ok: true, headers: { get: () => null }, json: async () => [
    { published_at: '2026-09-01', assets: [asset('kyl-v1-universal.apk')] },
    { name: 'KYL beta', published_at: '2026-10-03', prerelease: true, body: '<b>notes</b>', assets: [asset('kyl-arm64-v8a.apk'), universal] }
  ] }));
  for (const id of ['downloadCta', 'universalDownload']) {
    assert.equal(document.ids[id].href, universal.browser_download_url);
    assert.equal(document.ids[id].textContent, 'Download for Android ↓');
  }
  assert.match(document.ids.downloadInfo.textContent, /1.0 MB/);
  assert.match(document.ids.releaseStatus.textContent, /Pre-release/);
  assert.equal(document.ids.releaseNotesBody.textContent, '<b>notes</b>');
  assert.equal(document.ids.downloadBox.attributes['aria-busy'], 'false');
});

test('latest release without universal does not silently download an older or split APK', async () => {
  const document = downloadDocument();
  await mount(document, async () => ({ ok: true, headers: { get: () => null }, json: async () => [
    { published_at: '2026-09-01', assets: [asset('old-universal.apk')] },
    { published_at: '2026-10-03', assets: [asset('kyl-arm64-v8a.apk')] }
  ] }));
  assert.match(document.ids.downloadInfo.textContent, /does not include a universal APK/);
  assert.equal(document.ids.downloadCta.href, 'https://github.com/hariomlohardev/kyl-apks/releases');
});

test('GitHub failure leaves working releases links and clears loading', async () => {
  const document = downloadDocument();
  await mount(document, async () => ({ ok: false, status: 403 }));
  assert.match(document.ids.releaseStatus.textContent, /Couldn’t check/);
  assert.equal(document.ids.universalDownload.href, 'https://github.com/hariomlohardev/kyl-apks/releases');
  assert.equal(document.ids.downloadBox.attributes['aria-busy'], 'false');
});

test('top click waits for the initial request and starts a direct universal download', async () => {
  const document = downloadDocument();
  const universal = asset('kyl-v2-universal.apk');
  let resolve, requested = 0, target, prevented = false;
  const initial = mount(document, () => { requested++; return new Promise(done => { resolve = done; }); }, url => { target = url; });
  const clicked = document.ids.downloadCta.events.click({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(target, undefined);
  resolve({ ok: true, headers: { get: () => null }, json: async () => [{ published_at: '2026-10-03', assets: [universal] }] });
  await Promise.all([initial, clicked]);
  assert.equal(requested, 1);
  assert.equal(target, universal.browser_download_url);
});

test('clicking later refreshes the release and downloads the newly published universal APK', async () => {
  const document = downloadDocument();
  let requested = 0, target;
  await mount(document, async () => {
    requested++;
    return { ok: true, headers: { get: () => null }, json: async () => [{ published_at: '2026-10-03', assets: [asset('kyl-v' + requested + '-universal.apk')] }] };
  }, url => { target = url; });
  await document.ids.downloadCta.events.click({ preventDefault() {} });
  assert.equal(requested, 2);
  assert.equal(target, base + 'kyl-v2-universal.apk');
});
