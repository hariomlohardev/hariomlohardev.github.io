# Portfolio SEO architecture

## Existing UI and sources

The site remains plain HTML/CSS/JavaScript. No framework, domain, subscription or new runtime dependency was added. The original styles, visible article text and card layouts are preserved.

Supabase supplies published `posts`, published `tricks`, and curated contributions from `site_content` (`key=opensource`). Project details use `projects-data.json`; the home project strip uses `data.json`. Supabase content is read only. Existing browser scripts continue to refresh data and handle interactions.

## Rendering and discovery

```text
Published sources
    -> existing generators and list prerenderer
    -> complete HTML pages + full RSS + PNG previews
    -> shared metadata + canonical sitemap + content/date state
    -> existing AI exports
    -> generated-artifact validation

Vercel blog/trick URL
    -> existing api/blog/render function
    -> published database record
    -> the same original page template with complete content
```

`assets/seo.js` is shared between Node and the article browser script. It normalizes descriptions, canonical URLs, dates, image URLs and BlogPosting/breadcrumb nodes, escapes embedded JSON safely, and refreshes metadata alongside live article content.

`scripts/generate-seo.js` synchronizes factual page/entity metadata and derives the sitemap from actual indexable HTML. `seo-state.json` retains content hashes and last-modified dates so rebuilds do not manufacture freshness. Published source timestamps take precedence.

`scripts/check-seo.js` checks deployment artifacts independently of the source APIs: unique canonical pages/titles, actual initial content, valid JSON-LD, local social-image existence, article metadata and exact sitemap coverage. It runs at the end of the full build.

## Hosts and refresh

GitHub Pages is canonical and serves generated HTML. Vercel serves the existing APIs and mirror, with canonical links pointing to GitHub Pages. The existing shared render function handles both blog and trick detail routes; no extra Vercel function was added. Both hosts invoke `npm run build` using Node 22.

Published content refreshes on the existing GitHub content-change dispatch or scheduled six-hour build. Vercel detail responses read live published rows with a short cache. Browser hydration updates articles without removing the valid static snapshot on a transient network failure. Until a successful rebuild, a GitHub Pages snapshot may lag a database edit/deletion; confirmed missing live Vercel records return 404.

## Search policy and limitations

Public content remains available to standard and named search/AI crawlers. Error, admin, thank-you and legacy viewer pages are excluded from indexing. Published trick id 1 is a visible test fixture and is excluded from the sitemap, AI exports and search ItemList. It is not deleted or hidden from users.

The AI text exports supplement normal crawlable pages for clients that choose to read them. They are not special Google ranking signals. Search position and AI citations depend on external indexing, query relevance, useful content and other signals beyond this repository. Local checks do not confirm production deployment or search ranking.

See `SEO_CHECKLIST.md` for operation, validation results, free follow-up checks and rollback instructions.
