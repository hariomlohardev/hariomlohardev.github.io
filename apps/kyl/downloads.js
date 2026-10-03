(function (root) {
  'use strict';
  var API = 'https://api.github.com/repos/hariomlohardev/kyl-apks/releases';
  var RELEASES = 'https://github.com/hariomlohardev/kyl-apks/releases';

  function newestRelease(releases) {
    return releases.filter(function (release) {
      return !release.draft && Number.isFinite(Date.parse(release.published_at));
    }).sort(function (a, b) {
      return Date.parse(b.published_at) - Date.parse(a.published_at) || (Number(b.id) || 0) - (Number(a.id) || 0);
    })[0] || null;
  }

  function universalAsset(release) {
    return (release.assets || []).reduce(function (found, asset) {
      if (found || !/(?:^|[-_.])universal(?=[-_.]|$).*\.apk$/i.test(asset.name || '')) return found;
      try {
        var url = new URL(asset.browser_download_url);
        if (url.origin !== 'https://github.com' || !url.pathname.startsWith('/hariomlohardev/kyl-apks/releases/download/')) return null;
        return { name: asset.name, size: Number(asset.size) || 0, url: url.href };
      } catch (_) { return null; }
    }, null);
  }

  async function getReleases(fetcher, signal) {
    var next = API + '?per_page=100', releases = [];
    var visited = new Set();
    while (next) {
      if (visited.has(next)) throw new Error('Repeated release page');
      visited.add(next);
      var response = await fetcher(next, { headers: { Accept: 'application/vnd.github+json' }, signal: signal, cache: 'no-store' });
      if (!response.ok) throw new Error('GitHub releases unavailable: ' + response.status);
      var page = await response.json();
      if (!Array.isArray(page)) throw new Error('Invalid release list');
      releases = releases.concat(page);
      var link = response.headers.get('link') || '';
      var match = link.match(/<([^>]+)>;\s*rel="next"/);
      next = match ? match[1] : null;
      if (next) {
        var url = new URL(next);
        if (url.origin !== 'https://api.github.com' || url.pathname !== '/repos/hariomlohardev/kyl-apks/releases') throw new Error('Unexpected release page');
      }
    }
    return releases;
  }

  function mount(document, fetcher, navigate) {
    var box = document.getElementById('downloadBox');
    if (!box) return;
    var status = document.getElementById('releaseStatus');
    var info = document.getElementById('downloadInfo');
    var links = [document.getElementById('downloadCta'), document.getElementById('universalDownload')];
    var notes = document.getElementById('releaseNotes');
    var inFlight = null, downloading = false;
    navigate = navigate || function (url) { root.location.assign(url); };
    async function refresh() {
    box.setAttribute('aria-busy', 'true');
    notes.hidden = true;
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 15000);
    try {
      var release = newestRelease(await getReleases(fetcher, controller.signal));
      if (!release) throw new Error('No published release');
      var date = new Date(release.published_at).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
      status.textContent = (release.name || release.tag_name) + ' · ' + (release.prerelease ? 'Pre-release' : 'Release') + ' · ' + date;
      if (release.body && String(release.body).trim()) {
        document.getElementById('releaseNotesBody').textContent = String(release.body);
        notes.hidden = false;
      }
      var asset = universalAsset(release);
      if (!asset) {
        info.textContent = 'The newest release does not include a universal APK yet. Check GitHub Releases for availability.';
        links.forEach(function (link) { link.href = RELEASES; link.textContent = 'View downloads on GitHub ↗'; });
        return null;
      }
      info.textContent = asset.name + (asset.size > 0 ? ' · ' + (asset.size / 1048576).toFixed(1) + ' MB' : '');
      links.forEach(function (link) {
        link.href = asset.url;
        link.textContent = 'Download for Android ↓';
        link.setAttribute('aria-label', 'Download for Android — latest Know Your Label universal APK');
      });
      return asset;
    } catch (_) {
      status.textContent = 'Couldn’t check the newest release.';
      info.textContent = 'Open GitHub Releases to download the latest universal APK.';
      links.forEach(function (link) { link.href = RELEASES; link.textContent = 'View downloads on GitHub ↗'; });
      return null;
    } finally {
      clearTimeout(timer);
      box.setAttribute('aria-busy', 'false');
    }
    }
    function load() {
      if (!inFlight) inFlight = refresh().finally(function () { inFlight = null; });
      return inFlight;
    }
    links.forEach(function (link) {
      link.addEventListener('click', async function (event) {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        if (downloading) return;
        downloading = true;
        link.textContent = 'Preparing download…';
        link.setAttribute('aria-busy', 'true');
        try {
          var asset = await load();
          navigate(asset ? asset.url : RELEASES);
        } finally {
          downloading = false;
          link.setAttribute('aria-busy', 'false');
        }
      });
    });
    return load();
  }

  var api = { newestRelease: newestRelease, universalAsset: universalAsset, getReleases: getReleases, mount: mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KYLDownloads = api;
  if (typeof document !== 'undefined') mount(document, root.fetch.bind(root));
})(typeof window !== 'undefined' ? window : globalThis);
