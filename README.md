# Conquest Reforged website

Static site, no dependencies (Node 18+). Content lives in files; `node build.mjs` writes `dist/`.

## Deploy (Cloudflare Pages, free)
1. Push this folder to a GitHub repo.
2. Cloudflare → Workers & Pages → Create → Pages → connect the repo.
3. Build command `node build.mjs`, output directory `dist`.
4. Add custom domain conquestreforged.com (move DNS to Cloudflare or add a CNAME).

## Before cancelling Webflow
Images/fonts/video are still hotlinked from Webflow's CDN. Run `node fetch-assets.mjs` once
to download them into `src/assets` and rewrite references, then commit.

## Editing
- Pages: `src/content/pages/*.md`; guides: `src/content/guides/*.md` (+ `src/data/guides.json`)
- News: add `src/content/news/<slug>.md` with front matter (title, date, category, categorySlug, optional author)
- Data: `src/data/*.json` (servers, showcases, creators, team); nav/footer/home: `src/site.json`
- Styles: `src/styles.css`
- Preview: `node build.mjs && node serve.mjs` → http://localhost:8080

## Webstudio (visual page design)
Pages designed in Webstudio are exported as static files and dropped into `src/webstudio/`;
`node build.mjs` copies them over `dist/`, so a Webstudio page replaces a generated page at the same path.
News, guides and the data lists stay Markdown/JSON. Webstudio's static export has no sitemap, robots or
redirects, so the build keeps providing those. See WEBSTUDIO.md for setup and workflow.

## Moving hosts later
`dist/` is plain static files. Cloudflare reads `_headers`/`_redirects`; on Hetzner (Apache) put the same
rules in `.htaccess`.
