# Conquest Reforged website

Static site, no dependencies (Node 18+). Content lives in files; `node build.mjs` writes `dist/`.

## Deploy (Cloudflare Pages, free)
Repo: https://github.com/HIPPOKLEIDES/ConquestReforgedWeb (branch `main`).
1. Cloudflare → Workers & Pages → Create → Pages → Connect to Git → pick the repo.
2. Project name `conquestreforgedweb`. Build command `node build.mjs`. Deploy command `npx wrangler deploy`
   (reads `wrangler.jsonc`, which serves `dist/` as static assets). Leave Path empty.
3. Environment variable `NODE_VERSION` = `22`.
4. Deploy. The site is then live at `<project>.pages.dev` for review.
5. Later, once everything is ported: add custom domain conquestreforged.com (move DNS to Cloudflare or
   add a CNAME). Do not change DNS before then; Webflow keeps serving the live domain until you do.

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
