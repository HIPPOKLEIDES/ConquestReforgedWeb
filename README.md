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
- Live preview: `node dev.mjs` (or `npm run dev`) → http://localhost:8080, rebuilds on every change in `src/`
- Downloads (/downloads): step picker (Minecraft version → modpack or mod → loader → launcher) with a "Your download" box and install steps, dressed in the mod's own GUI textures (`src/assets/downloads/gui`, copied from the Conquest Reforged resources). Versions come from Modrinth: `node downloads-tools/fetch-downloads.mjs` snapshots them into `src/data/downloads.json`, and the page refreshes them from the Modrinth API in the browser, so a new release shows up without a push. Launchers, install steps, Patreon tiers and world converters: `src/data/downloads-config.json`. Script/styles: `src/downloads/`
- Minecraft Fashion (/persona): our Character Creator items from the Marketplace catalog. `node persona-tools/fetch-persona.mjs` snapshots the catalog (which items are for sale right now) into `src/data/persona.json` and renders each piece on its own (no mannequin) as a still + turntable WebP into `src/assets/persona` from its source package under `E:/Archive/Minecraft/Bedrock/Persona` (matched by Marketplace thumbnail name; needs the Discord bot's persona renderer and Python Pillow). `--no-render` only refreshes the catalog. We choose which items go on sale: after changing that, re-run, rebuild and push (the page says "For sale in <month>" and drops the "For sale" badges once that month is over). Same page shell as /conquest-bedrock (pack-webflow.css + `src/bedrock/bedrock.css`); own styles/script in `src/persona/`
- Bedrock page Armoury: the pack's own armour + trim textures are drawn in the browser (bedrock.js) from `src/data/bedrock-armoury.json` and `src/assets/bedrock/armor`, both written by `node fetch-bedrock-textures.mjs`
- Bedrock page showcases (/conquest-bedrock): `node fetch-bedrock-textures.mjs` renders the double slabs and gradient walls from the Bedrock resource pack into transparent PNGs (`bedrock-render.mjs`, no dependencies; one strip per double slab with its random-texture frames) (lists and order in that script; gradients with `verified: false` show a Test badge) into `src/assets/bedrock` + `src/data/bedrock-showcase.json`; styles/script in `src/bedrock/`. The overlay pack download is configured in `src/site.json` → `bedrockOverlay` (put the file at that path under `src/`)

## Community contests (/contests)
Build/art contests with Discord sign-in voting (top 3, 3/2/1 points). The pages are shells from `build.mjs`
(`buildContests()`, styles/scripts in `src/contests/`, same frame as /persona); the data lives in Cloudflare D1
and R2 behind a small Worker (`worker/`), which runs only for `/api/*`, `/auth/*` and `/contests/<id>`
(`wrangler.jsonc`). Staff run contests on `/contests/staff`; entrants can also send their own entry with the
community Discord bot's `/submit` (`worker/bot.js`). One-time Cloudflare/Discord setup, local
development (`npm run contests:dev`, `npm test`) and how a contest works: see CONTESTS-SETUP.md.

## Webstudio (visual page design)
Pages designed in Webstudio are exported as static files and dropped into `src/webstudio/`;
`node build.mjs` copies them over `dist/`, so a Webstudio page replaces a generated page at the same path.
News, guides and the data lists stay Markdown/JSON. Webstudio's static export has no sitemap, robots or
redirects, so the build keeps providing those. See WEBSTUDIO.md for setup and workflow.

## Moving hosts later
`dist/` is plain static files. Cloudflare reads `_headers`/`_redirects`; on Hetzner (Apache) put the same
rules in `.htaccess`.

## Detail pages and search
- Showcases: `src/content/showcase/<slug>.md`; servers: `src/content/servers/<slug>.md` (front matter: ip, logo, links);
  creators: entries in `src/data/youtubers.json` (with a `slug`). `node scrape-details.mjs` re-copies them from the old
  Webflow site (only while it is online), then `node fetch-assets.mjs`.
- `/search` is client-side: `build.mjs` writes `search-index.json` from every generated page.
