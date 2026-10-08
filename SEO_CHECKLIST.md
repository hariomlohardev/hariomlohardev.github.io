# SEO and AI search — Hariom Lohar

The canonical site remains https://hariomlohardev.github.io/ with the existing free Vercel backend/mirror. No paid domain, subscription, new dependency, or design change is needed.

## Implemented

- Published articles are delivered as complete HTML with their existing title, body, author, date, tags and social controls. Browser hydration still refreshes the published record and its metadata.
- Vercel uses the same templates for live blog and trick URLs, including records published since its last deployment. Unknown records return 404; temporary trick-source failures return 503.
- Blog/trick lists, the home latest strip, projects and published contributions are present in the initial HTML. Existing browser filtering, menus, animations and live data remain in place.
- Article and project search titles identify the actual topic. Empty article descriptions get factual summaries used only in search/social metadata.
- Article JSON-LD, canonical links, Open Graph and Twitter metadata agree with the published source. Person schema uses the actual portrait, not a certificate image. Existing app facts and visible FAQs are retained without invented ratings or prices.
- Social crawlers receive generated PNGs or the supplied cover; a generic existing PNG is used if a new banner cannot be rasterized.
- RSS includes complete article HTML. Existing `llms.txt` and `llms-full.txt` exports include all published blog articles and indexable tricks, preserving Markdown/code in the full export.
- The published test trick (id 1) stays in the existing UI but is marked `noindex` and excluded from the sitemap, search ItemList and AI exports. Admin, error, thank-you and legacy viewer pages retain their indexing exclusions.
- General and named AI crawler groups permit public pages and assets while excluding backend/build-source directories. `llms.txt` is an optional convenience for consumers that read it; Google does not use it as a special ranking signal.
- One complete build runs on GitHub Pages and Vercel. It ends with a check of every indexable canonical HTML page, structured data, image assets and sitemap.

## Build and validation

Use Node 22 with the existing Supabase environment variables. Credentials are read from the environment or ignored local env files. Published database rows are the source; this work does not write to the database.

```sh
npm run check
npm test
npm run build
npm run check:seo
```

`npm run build` generates the favicon, published blog pages/RSS, project pages, trick pages, existing list/card markup, PNG previews, consistent metadata/sitemap, and AI exports, then checks the deployment artifacts. GitHub Pages does not require an npm install for these build steps; Vercel installs the existing runtime API dependencies.

Keep `seo-state.json` versioned. It records hashes and sitemap modification dates. Source `updated_at` timestamps are preferred for published content; unchanged static pages keep their previous date. If a static page changes, its date advances on the next build. Merely rebuilding must not claim all content changed. Keep this state synchronized when committing local content/build changes.

Keep prerender markers in the templates. List JSON-LD markers belong inside `<main>` so the trick template splicer cannot accidentally copy list schema into a detail page. Published contributions remain sourced from Supabase rather than manually maintained fixtures.

Pushing the merged `main` branch starts the configured GitHub Pages deployment workflow. Publication completes when that workflow succeeds. The existing content-change dispatch and six-hour scheduled builds refresh published database content. Vercel publication follows its existing Git integration; check its deployment status separately.

## Verified locally on 8 October 2026

- Complete production build passed for 7 articles, 6 project details, 2 visible tricks, 3 published contributions and 25 indexable canonical pages.
- Syntax/config checks and 28 regression tests passed, including live rendering, safe metadata escaping, indexing exclusions, stable sitemap dates and app/download regressions.
- Baseline CSS fingerprints match across the existing templates.
- Isolated Chrome comparisons at 1440 px and 375 px matched the original headings, live article content, card content and measured layout for the homepage, projects, contributions and an article. No horizontal overflow or uncaught browser exceptions occurred on those pages.
- With JavaScript disabled, the checked project and contribution pages contained their real cards and the checked article contained its full body.

These are local artifact/browser checks, not a measurement of live Google rankings or production host headers.

## Free checks after publication

1. Open the canonical sitemap and a published article. Confirm article text exists in the original response, the response is 200, and the canonical host is GitHub Pages.
2. In Google Search Console, select the property `https://hariomlohardev.github.io/`. If it is not already verified, add a URL-prefix property for that exact URL and follow Google's HTML-file verification instructions. In Sitemaps, submit `sitemap.xml` (without a leading slash when the property prefix is already shown) or confirm the existing submission succeeds. This sitemap lists GitHub Pages canonical URLs, so use this property for the main submission. If a fetch fails, inspect the exact sitemap URL with **Test live URL**, expand **Page availability**, and check **Crawl allowed: Yes** and **Page fetch: Successful** before resubmitting. Use URL Inspection to test the homepage, blog, app page and strongest articles, then request indexing for those representative URLs. The sitemap covers the remaining pages.
3. Check the Vercel mirror's public article/trick response for complete HTML and a GitHub Pages canonical. Check a missing record for a real 404. Avoid adding a blanket mirror/API `noindex` rule that could reach rewritten public article responses.
4. Check the Google Rich Results Test for relevant article/app markup. Valid schema supports understanding and eligibility; it does not guarantee a rich result.
5. Keep public profile links consistent with the canonical site and continue publishing useful, original work. Technical improvements cannot guarantee first position for every query.
6. Optionally add the site to Bing Webmaster Tools by importing the verified Google Search Console property. Confirm that the canonical sitemap was imported or submit it there. No paid domain or SEO subscription is needed.

References: [Google AI search guidance](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide), [Google canonical guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [Search Console property setup](https://support.google.com/webmasters/answer/34592), [Bing site import](https://www2.bing.com/webmasters/help/add-and-verify-site-12184f8b).

## Image sitemap compatibility fix — October 8, 2026

The image extension must declare `xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"`. The previous `1.0` namespace caused Search Console's incorrect-namespace and missing `family_friendly` errors even though the XML was well formed. Each image needs `image:image` and an absolute `image:loc`; do not add the obsolete `family_friendly` tag. The final SEO build check now rejects the old namespace and missing image locations. See [Google's image sitemap specification](https://developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps).

After the corrected sitemap is deployed, resubmit it in the GitHub Pages property. The Vercel image parsing error and GitHub Pages fetch error are separate findings; a successful HTTP response from a local check does not prove Google can fetch it. Use Google's live inspection to diagnose any remaining fetch failure. See [Google's sitemap report troubleshooting](https://support.google.com/webmasters/answer/7451001).

## Reversible branches

Working branch: `codex/seo-ai-search`.

Saved baseline: `codex/seo-baseline-2026-10-08`, at commit `1b6bb07a90a6a56a1e3ab6017081205c362b9c74`. This original snapshot remains available after merging the improvement branch into `main`.

After saving any subsequent work, switch to the old version with:

```sh
git switch codex/seo-baseline-2026-10-08
```

Return to the improvements with:

```sh
git switch codex/seo-ai-search
```

Branch switching changes the local checkout, not an already deployed site. If these changes are later merged and deployed, revert the SEO change commit(s) on the deployment branch and redeploy to roll back production. Preserve the improvement branch so the work remains recoverable. Generated untracked files from a build can remain on disk after a switch; inspect `git status` before comparing old and new builds.
