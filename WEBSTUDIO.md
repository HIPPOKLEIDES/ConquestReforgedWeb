# Webstudio hybrid workflow

## Split of responsibilities
| Content | Where | Who |
|---|---|---|
| Landing/marketing pages (home, downloads, info, team layouts) | Webstudio | non-coders |
| News posts, guides | Markdown in `src/content/` | anyone who can add a file |
| Servers, creators, showcases, team lists | JSON in `src/data/` | anyone |
| sitemap, robots, redirects, RSS, cache headers | `build.mjs` | automatic |

## How a Webstudio page gets onto the site
1. Design and Publish/export the page in Webstudio (static export, "ssg" template).
2. Put the exported files in `src/webstudio/` (CLI: `npx webstudio build --template ssg`, or the downloaded zip).
3. `node build.mjs` copies them over `dist/`. A Webstudio page replaces the generated page at the same path.
4. Push to GitHub; Cloudflare Pages rebuilds.

## Known limits (from Webstudio's docs)
- Static export has no redirects, sitemap.xml or robots.txt (build.mjs keeps providing them),
  no dynamic pages and no client-side navigation (full page loads).
- Export uses absolute URLs; preview with `npx serve dist`, not by opening files.
- Webstudio pages and Markdown-generated pages are styled separately. News/guide pages will not
  automatically get a Webstudio header/footer; the header/footer must be recreated in both
  (or the generated pages restyled to match).
- Webflow import is copy/paste per section only (no full-site import, no HTML paste). Rebuilding
  the pages is manual work.

## Self-hosting the builder (the editor itself)
The editor is separate from the website. Options:
- Ardacraft's existing self-hosted Webstudio: ask them for an account/project, no new infrastructure.
- Our own: community stack (builder, publisher, Postgres, PostgREST, MinIO) via Docker on a Hetzner
  VPS, using the `webstudio-community` images. Docs describe this as hard to run in production; only
  do this if sharing Ardacraft's is not possible.
- Webstudio Cloud (free tier) also works for designing; export is the same.

The visitor-facing site stays on Cloudflare Pages either way, so editor hosting never affects traffic.

## Notes from building the home page
- The free Webstudio plan caps each uploaded asset at 4.5 MB. The home video was re-encoded to 3.3 MB
  (`src/assets/home-bg.mp4`, 1152x720, no audio).
- Pasting HTML into Webstudio creates real, editable elements (select the parent first; each paste
  goes inside the selected element). `url()` backgrounds and `<video>` tags are not accepted by paste;
  use an `<img>` instead, and an HTML Embed component for the video.
- Pasted images keep editor URLs (`/cgi/asset/<name>_<id>.webp`) rather than linking to the asset.
  `build.mjs` rewrites those to `/assets/<name>.webp`. Images added through Webstudio's own
  "Choose source" picker are handled by the Webstudio export itself.
- The home video and poster are referenced as `/assets/home-bg.mp4` and `/assets/..._lobb.avif`, so
  they show in the live site but not inside the Webstudio editor canvas.
- No hover effects or responsive (mobile) rules came across the paste; those are set in Webstudio's
  Style panel (states and breakpoints).

## Export recipe (tested)
In an empty folder outside the repo:
```
npx webstudio@latest link --link "<Webstudio share link with build access>"
npx webstudio@latest sync
npx webstudio@latest build --template ssg
npm install && npm run build
```
Copy `dist/client/` (minus `.vite/`) into `src/webstudio/`, then `node build.mjs`.
The share link contains a token: keep it out of the repo. The CLI saves it in your user config folder.

## Pages built in Webstudio so far
- Landing (`/`, the Webstudio page named "Home": the "WeAreConquest" page with three cards), Mod (`/mod`, the mod's home page),
  Info (`/info`), Downloads (`/downloads`) and FAQ (`/faq`). They replace the
  Markdown-generated versions at the same path. (`src/content/pages/*.md` for these are now unused.)
- Header, footer and the social banner live in one shared **Slot** (same on every page). Edit it on any page
  and it changes everywhere. To use it on a new page, copy the Slot from another page and paste it
  onto the new page's body.
- The nav is one HTML Embed (hover menus: Download -> Changelog, Community -> Youtube/Reddit). Edit its
  links in the embed's code box (Settings tab).
- Info page: the Discord widget and the inventory video are HTML Embeds; images use `/assets/...` paths
  so they appear on the live site but not in the editor canvas.
- Webstudio hides new pages from search engines by default. Untick "Exclude this page from search
  results" in each page's settings (done for Home and Info).
- Webstudio only applies edits while its browser tab is visible on screen.

## How generated pages get the Webstudio look
`build.mjs` lifts the header, footer, social banner, background image and Webstudio stylesheet out of
`src/webstudio/info/index.html` and wraps every generated page (news, guides, team, showcases, servers,
youtube, 404) in them. Change the Slot in Webstudio, re-export, and the generated pages follow. Content panel
styling for those pages is the `body.ws` rules at the bottom of `src/styles.css`.

## Font note
Webstudio names the uploaded font file "Nyala", but the pasted styles use "Nyala 0". The Slot's header holds a
small HTML Embed with an `@font-face` that declares "Nyala 0", so the font loads on every page. If you restyle
text in Webstudio's Style panel, pick "Nyala" or "Nyala 0".

## Scripts inside HTML Embeds
Webstudio pages are a React app, which rebuilds HTML Embeds after loading and drops what their scripts set up.
`build.mjs` parks those scripts (`type="text/plain"`) and re-runs them once the page settles, so carousels,
the before/after slider and the nav highlight work on Webstudio pages. Generated pages run them normally.
Embed scripts should be idempotent and only touch elements inside their own embed.

## Embed code backups
`webstudio-embeds/` holds the code pasted into Webstudio's HTML Embeds (nav-header.html for the shared header).
Webstudio is the source of truth; these files are copies so the code can be restored or re-pasted
(open the embed in Webstudio > Settings > Code, select all, paste).

## Landing page and pack pages
- `/` is the studio landing page (no shared header/footer, just the social tab). Its cards link to `/mod`,
  `/conquest-pack` and `/conquest-bedrock`. The mod's own home page is `/mod`; the shared header's logo and the mobile
  menu's "Home" link point there.
- `/conquest-pack` and `/conquest-bedrock` are generated from `src/content/pages/*.md` (copied from the old site with
  `node scrape-packs.mjs`; the Java page's intro is hand-written inside that script). The Java page's sub-pages
  under `/conquest/...` (special-feature galleries) were not ported, so those entries are plain text.
