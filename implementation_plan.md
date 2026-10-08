# SEO and AI search implementation

Authorized scope: improve discoverability and machine-readable content while keeping the existing UI, visible copy, free domains, and hosting. No database edits, paid services, or production deployment.

Starting commit: `1b6bb07a90a6a56a1e3ab6017081205c362b9c74`.
Working branch: `codex/seo-ai-search`.
Rollback branch: `codex/seo-baseline-2026-10-08`.

- [NEW] `assets/seo.js`: shared, safe article metadata, descriptions, structured data, and explicit test-content indexing policy.
- [MODIFY] `scripts/generate-blog.js`, `api/blog/render.js`, `api/blog/post.js`: deliver actual article content and metadata in the original template; retain live hydration and comments/ratings. Reuse the existing render function for complete live trick pages without adding a paid hosting requirement.
- [MODIFY] `scripts/prerender-lists.js`, `index.html`, `projects.html`, `opensource.html`: pre-render existing card markup and links; retain live data, search, filtering, and animations.
- [NEW] `scripts/generate-seo.js`: synchronize accurate schema, canonical sitemap entries, and index exclusions; preserve modification dates when content is unchanged.
- [MODIFY] `scripts/generate-tricks.js`, `scripts/generate-projects.js`, `scripts/generate-llms.js`: consistent indexing policy, factual metadata, correct AI summaries, and stable content dates.
- [MODIFY] `package.json`, `.github/workflows/pages.yml`, `vercel/build.sh`: one complete build pipeline on both free hosts, with AI indices generated after source snapshots and list prerendering.
- [MODIFY] `vercel.json`, `robots.txt`, `SEO_CHECKLIST.md`: appropriate crawler controls and accurate operating instructions.
- [MODIFY] generated HTML/XML/text/OG assets: regenerate from published sources without changing the design or rewriting articles.
- [MODIFY/NEW] focused SEO regression tests: validate raw HTML, metadata safety, canonical consistency, exclusions, live rendering, and stable sitemap dates.
- [NEW] `task.md`, `system_architecture.md`: completion checklist and reversible handoff instructions.

Validation: syntax/config checks, relevant existing tests, complete build, crawler-visible HTML checks, and browser comparisons of representative desktop/mobile pages with JavaScript enabled and disabled. Preserve baseline CSS and UI structure. Commit completed work on the new branch; leave main at the starting commit.
