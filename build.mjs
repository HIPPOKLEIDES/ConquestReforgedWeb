// Static site builder for conquestreforged.com — zero dependencies, Node 18+.
//   node build.mjs      -> writes ./dist
// Content lives in ./src: Markdown in src/content, structured lists in src/data.

import fs from 'node:fs';
import path from 'node:path';
import { scopeCss } from './wf-scope.mjs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const POSTS_PER_PAGE = 2;

const readText = (...p) => fs.readFileSync(path.join(SRC, ...p), 'utf8');
const readJSON = (...p) => JSON.parse(readText(...p));
const exists = (...p) => fs.existsSync(path.join(SRC, ...p));
const site = readJSON('site.json');
const authors = readJSON('data', 'authors.json');
const warnings = [];
const generated = []; // every URL path we emit, used for the sitemap + link check

// ---------- helpers ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtDate = (iso) =>
  new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

function emit(urlPath, html) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.endsWith('.html') ? urlPath.slice(1) : path.join(urlPath.slice(1), 'index.html');
  const file = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  generated.push(urlPath);
}
function emitRaw(rel, content) {
  const file = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function parseDoc(text) {
  const m = text.replace(/\r/g, '').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: m[2] };
}

// ---------- tiny markdown ----------
function inline(s) {
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => /\.mp4$/.test(src) ? `<video src="${src}" aria-label="${alt}" autoplay muted loop playsinline preload="metadata"></video>` : `<img src="${src}" alt="${alt}" loading="lazy">`);
  s = s.replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, (_, t, u) => {
    const ext = /^https?:/.test(u) ? ' rel="noopener" target="_blank"' : '';
    return `<a href="${u}"${ext}>${t}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/(^|[^*\w])\*([^*]+)\*(?!\w)/g, '$1<em>$2</em>');
  return s;
}

function md(src, shift = 0) {
  const out = [];
  let para = [];
  let list = [];
  let olist = [];
  let olistStart = 1;
  const flush = () => {
    if (para.length) out.push('<p>' + inline(para.join(' ')) + '</p>');
    if (list.length) out.push('<ul>' + list.map((i) => '<li>' + inline(i) + '</li>').join('') + '</ul>');
    if (olist.length) out.push(`<ol${olistStart > 1 ? ` start="${olistStart}"` : ''}>` + olist.map((i) => '<li>' + inline(i) + '</li>').join('') + '</ol>');
    para = []; list = []; olist = []; olistStart = 1;
  };
  for (const raw of src.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flush(); continue; }
    if ((m = line.match(/^::youtube\[([\w-]+)\]/))) {
      flush();
      out.push(`<div class="embed"><iframe src="https://www.youtube-nocookie.com/embed/${m[1]}" title="YouTube video" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`);
      continue;
    }
    if (/^::discord/.test(line)) {
      flush();
      out.push(`<iframe class="discord-widget" src="${esc(site.discordWidget)}" title="Discord server" loading="lazy" sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"></iframe>`);
      continue;
    }
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { flush(); { const lv = Math.min(6, m[1].length + shift); out.push(`<h${lv}>${inline(m[2])}</h${lv}>`); } continue; }
    if (/^---+$/.test(line)) { flush(); out.push('<hr class="rule">'); continue; }
    if ((m = line.match(/^[-*]\s+(.*)$/))) { if (para.length || olist.length) flush(); list.push(m[1]); continue; }
    if ((m = line.match(/^(\d+)\.\s+(.*)$/))) { if (para.length || list.length) flush(); if (!olist.length) olistStart = +m[1]; olist.push(m[2]); continue; }
    if (line.startsWith('<')) { flush(); out.push(line); continue; }
    if (list.length || olist.length) flush();
    para.push(line.trim());
  }
  flush();
  return out.join('\n');
}

const stripTags = (h) => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// ---------- layout ----------
const cssHash = (() => {
  const css = readText('styles.css').replace('{{NYALA}}', site.fonts.nyala).replace('{{POSTER}}', site.homePoster);
  return { css, v: crypto.createHash('md5').update(css).digest('hex').slice(0, 8) };
})();

// Webflow's own stylesheet, re-scoped under .wfs: pages that reproduce original Webflow markup use it
const wfScoped = (() => {
  const f = path.join(SRC, 'clone', 'webflow.css');
  if (!fs.existsSync(f)) return { css: '', v: '0' };
  const css = scopeCss(fs.readFileSync(f, 'utf8')).replace(/https:\/\/cdn\.prod\.website-files\.com\/[^\s"')]+/g, (u) => {
    const name = decodeURIComponent(u).split('?')[0].split('/').pop().replace(/[^\w.\-]+/g, '_');
    return exists('assets/' + name) ? '/assets/' + name : u;
  });
  return { css, v: crypto.createHash('md5').update(css).digest('hex').slice(0, 8) };
})();

// The header, footer and social banner are designed in Webstudio (a shared Slot). Lift them, and the
// Webstudio stylesheet, out of the export so generated pages (news, guides, ...) match exactly.
const wsChrome = (() => {
  const dir = path.join(SRC, 'webstudio');
  const file = ['info/index.html', 'index.html'].map((f) => path.join(dir, f)).find((f) => fs.existsSync(f));
  if (!file) return null;
  const html = fs.readFileSync(file, 'utf8');
  const block = (tag, from = 0) => {
    const start = html.indexOf(`<${tag}`, from);
    if (start < 0) return null;
    const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
    re.lastIndex = start;
    let depth = 0, m;
    while ((m = re.exec(html))) {
      depth += m[1] ? -1 : 1;
      if (!depth) return { html: html.slice(start, re.lastIndex), end: re.lastIndex };
    }
    return null;
  };
  const header = block('header'), footer = block('footer');
  if (!header || !footer) return null;
  const banner = block('div', footer.end);
  const css = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map((m) => m[0]);
  const bg = html.match(/<img[^>]*66f2fafd978e2b9a9b3ed8d1_background[^>]*>/);
  return { header: header.html, footer: footer.html, banner: banner ? banner.html : '', css, bg: bg ? bg[0] : '' };
})();


// Small corrections applied on top of the Webstudio chrome (footer link spacing, search button position, current-page glow)
const FIX_CSS = `<style id="cr-fix">header{z-index:60!important}@media(min-width:901px){footer a[href="/team"],footer a[href="/faq"],footer a[href="/guides"]{position:absolute!important;top:13px;transform:translateX(-50%);margin:0!important;text-align:center}footer a[href="/team"]{left:calc(50% - 328px)}footer a[href="/faq"]{left:calc(50% - 161.5px)}footer a[href="/guides"]{left:calc(50% + .5px)}footer a[href*="patreon.com"]{position:absolute!important;top:13px;left:calc(50% + 308.5px);margin:0!important}form.crsearch{left:calc(50% + 150px)!important}}footer a.cr-cur{text-shadow:0 0 21px #d6ff00}</style>`;
const FIX_JS = `<script>(function(){function m(){var p=location.pathname.replace(/[/]$/,'')||'/';document.querySelectorAll('footer a').forEach(function(a){var h=a.getAttribute('href')||'';if(h.charAt(0)==='/'&&(p===h||p.indexOf(h+'/')===0))a.classList.add('cr-cur')})}m();addEventListener('load',function(){m();setTimeout(m,1500)})})();</script>`;

function layout({ title, description, body, urlPath, home = false, ogImage }) {
  const full = title === site.name ? title : `${title} | ${site.name}`;
  const canonical = site.url + (urlPath === '/' ? '' : urlPath);
  if (wsChrome) {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(full)}</title>
<meta name="description" content="${esc(description || site.description)}">
<link rel="canonical" href="${canonical}">
<link rel="icon" href="${site.logo}">
<link rel="alternate" type="application/rss+xml" title="${esc(site.name)} News" href="/news/rss.xml">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(full)}">
<meta property="og:description" content="${esc(description || site.description)}">
<meta property="og:image" content="${ogImage || site.logo}">
<meta name="twitter:card" content="summary_large_image">
${wsChrome.css.join('\n')}
${body.includes('class="wfs ') ? `<link rel="stylesheet" href="/assets/wf-scoped.css?v=${wfScoped.v}">` : ''}
<link rel="stylesheet" href="/styles.css?v=${cssHash.v}">
${FIX_CSS}
</head>
<body class="ws">
${wsChrome.bg}
${wsChrome.header}
${body}
${wsChrome.footer}
${wsChrome.banner}
${FIX_JS}
</body>
</html>
`;
  }
  const link = (l) => {
    const ext = /^https?:/.test(l.href);
    const cur = !ext && (urlPath === l.href || urlPath.startsWith(l.href + '/')) ? ' aria-current="page"' : '';
    return `<a class="nav-btn" href="${l.href}"${cur}${ext ? ' rel="noopener" target="_blank"' : ''}>${esc(l.label)}</a>`;
  };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(full)}</title>
<meta name="description" content="${esc(description || site.description)}">
<link rel="canonical" href="${canonical}">
<link rel="icon" href="${site.logo}">
<link rel="alternate" type="application/rss+xml" title="${esc(site.name)} News" href="/news/rss.xml">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(full)}">
<meta property="og:description" content="${esc(description || site.description)}">
<meta property="og:image" content="${ogImage || site.logo}">
<meta name="twitter:card" content="summary_large_image">
<link rel="preload" href="${site.fonts.nyala}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/styles.css?v=${cssHash.v}">
</head>
<body${home ? ' class="home"' : ''}>
${home ? `<div class="home-bg" aria-hidden="true"><video autoplay muted loop playsinline preload="metadata" poster="${site.homePoster}"><source src="${site.homeVideo}" type="video/mp4"></video></div>` : ''}
<header class="site-header">
  <div class="bar">
    <nav class="nav-group left" aria-label="Main">${site.navLeft.map(link).join('')}</nav>
    <a class="logo-link" href="/" aria-label="${esc(site.name)} home"><img src="${site.logo}" alt="${esc(site.name)}" width="118" height="118"></a>
    <nav class="nav-group right" aria-label="Community">${site.navRight.map(link).join('')}</nav>
  </div>
  <img class="header-decor" src="${site.headerDecor}" alt="">
  <div class="socials-col">${site.socials.map((s) => `<a href="${s.href}" rel="noopener" target="_blank" aria-label="${esc(s.label)}"><img src="${s.img}" alt="${esc(s.label)}"></a>`).join('')}</div>
</header>
${body}
<footer class="site-footer">
  <img class="footer-decor" src="${site.footerDecor}" alt="">
  <div class="bar">
    ${site.footerLinks.map((l) => `<a class="foot-btn" href="${l.href}">${esc(l.label)}</a>`).join('')}
    <a class="patreon-chest" href="${site.patreon.href}" rel="noopener" target="_blank" style="background-image:url('${site.patreon.img}')" aria-label="Support us on Patreon"><span>Patreon</span></a>
  </div>
</footer>
</body>
</html>
`;
}

const wfPage = (inner) => `<div class="wfs wfs-page"><div class="content">${inner}</div></div>`;
const page = (heading, inner) => `<main class="page">\n${heading ? `<h1 class="heading">${esc(heading)}</h1>\n` : ''}${inner}\n</main>`;

// ---------- pages from markdown ----------
function buildMarkdownPage(file, urlPath) {
  const { meta, body } = parseDoc(readText('content', 'pages', file));
  emit(urlPath, layout({ title: meta.title, description: meta.description, urlPath, body: page(meta.heading, md(body)) }));
}

// ---------- home ----------
function buildHome() {
  const s = site.homeSplash;
  const body = `<main class="home-main">
  <a class="splash" href="${s.href}"><img src="${s.image}" alt="Update" width="400"><p>${esc(s.text)}</p></a>
  <nav class="hex-row" aria-label="Quick links">
    ${site.homeButtons.map((b) => `<a class="hex" href="${b.href}" style="width:${b.size}px"><img src="${b.img}" alt=""><span>${esc(b.label)}</span></a>`).join('\n    ')}
  </nav>
</main>`;
  emit('/', layout({ title: site.name, description: site.description, urlPath: '/', home: true, body }));
}

// ---------- news ----------
function loadPosts() {
  const dir = path.join(SRC, 'content', 'news');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => {
    const { meta, body } = parseDoc(fs.readFileSync(path.join(dir, f), 'utf8'));
    const slug = f.replace(/\.md$/, '');
    const html = md(body);
    const firstP = [...html.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((x) => x[1]).find((x) => stripTags(x).trim().length > 40) || '';
    return { ...meta, slug, html, excerpt: meta.excerpt || stripTags(firstP).slice(0, 260) };
  }).sort((a, b) => b.date.localeCompare(a.date) || b.slug.localeCompare(a.slug));
}

const catColor = (slug) => (site.newsCategories.find((c) => c.slug === slug) || {}).color || '#90d400';
// YouTube embeds in news bodies use the original Webflow rich-text video markup
const richVideo = (html) => html.replace(/<div class="embed"><iframe src="([^"]+)"[^>]*><\/iframe><\/div>/g, (m, src) => `<figure style="padding-bottom:33.723653395784545%" class="w-richtext-align-center w-richtext-figure-type-video"><div><iframe src="${src}" scrolling="no" frameborder="0" allowfullscreen="true"></iframe></div></figure>`);
const tweet = (p) => `<div class="html-embed-5 w-embed w-script"><div><a href="https://twitter.com/share?ref_src=twsrc%5Etfw" class="twitter-share-button" data-size="large" data-text="Check out the latest article ${esc(p.title)} at Conquestreforged.com/news " data-via="ConReforged" data-hashtags="weareconquest" data-show-count="false">Tweet</a></div></div>`;
const rssLink = `<a href="/news/rss.xml" class="link-block-11 w-inline-block"><img src="/assets/66f4431cbfd7c7873b961641_rss_button.webp" width="30" height="30" alt="rss feed" class="image-49"></a>`;
function newsItem(p) {
  const a = authors[p.author] || {};
  const col = catColor(p.categorySlug);
  return `<div role="listitem" class="collection-item w-dyn-item"><div class="w-clearfix"><div class="div-block-77"><div class="div-block-78 w-clearfix"><div class="div-block-79"><div class="text-block-7">posted by:</div>${a.avatar ? `<img width="20" src="${a.avatar}" alt="${esc(p.author)}" class="image-34">` : ''}<div class="text-block-5">${esc(p.author || '')}</div></div><div class="text-block-6 link">${esc(a.role || '')}</div></div><div class="div-block-76 w-clearfix"><div class="text-block-3">${fmtDate(p.date)}</div><div style="background-color:${col}" class="text-block-4">${esc(p.category || '')}</div></div></div><a href="/news/${p.slug}" class="heading-3 w-inline-block w-clearfix"><h3 class="heading-3 text-copy">${esc(p.title)}</h3></a><div style="border-color:${col};background-color:${col}" class="div-block-17"></div><div class="rich-text-block-2 w-richtext">${richVideo(p.html)}</div><div class="div-block-95">${tweet(p)}${rssLink}</div></div></div>`;
}
function newsTabs(active) {
  return `<div class="div-block-150"><a href="/news" class="button-10 w-button${active === 'all' ? ' w--current' : ''}">All News</a><div class="collection-list-wrapper-10 w-dyn-list"><div role="list" class="collection-list-9 w-dyn-items">${site.newsCategories.map((c) => `<div role="listitem" class="collection-item-11 w-dyn-item"><a style="color:${c.color}" href="/news-category/${c.slug}" class="button-9 w-button${active === c.slug ? ' w--current' : ''}">${esc(c.label)}</a></div>`).join('')}</div></div></div>`;
}
function newsList(heading, active, slice, pager) {
  return wfPage(`<div class="div-block-8 w-clearfix"><div class="div-block-10 w-clearfix"><h1 class="heading"><strong class="bold-text-2">${esc(heading)}</strong></h1><div class="div-block-13">${newsTabs(active)}</div><div class="collection-list-wrapper w-dyn-list"><div role="list" class="w-clearfix w-dyn-items">${slice.map(newsItem).join('')}</div>${pager}</div></div></div>`);
}
const wfPager = (n, pages, base) => pages > 1 ? `<div role="navigation" aria-label="List" class="w-pagination-wrapper">${n > 1 ? `<a href="${n === 2 ? base : `${base}/page/${n - 1}`}" aria-label="Previous Page" class="w-pagination-previous"><svg class="w-pagination-previous-icon" height="12px" width="12px" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" transform="translate(0, 1)"><path fill="none" stroke="currentColor" fill-rule="evenodd" d="M8 10L4 6l4-4"></path></svg><div class="w-inline-block">Previous</div></a>` : ''}${n < pages ? `<a href="${base}/page/${n + 1}" aria-label="Next Page" class="w-pagination-next"><div class="w-inline-block">Next</div><svg class="w-pagination-next-icon" height="12px" width="12px" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" transform="translate(0, 1)"><path fill="none" stroke="currentColor" fill-rule="evenodd" d="M4 2l4 4-4 4"></path></svg></a>` : ''}</div>` : '';

function buildNews(posts) {
  const pages = Math.max(1, Math.ceil(posts.length / POSTS_PER_PAGE));
  for (let n = 1; n <= pages; n++) {
    const slice = posts.slice((n - 1) * POSTS_PER_PAGE, n * POSTS_PER_PAGE);
    const urlPath = n === 1 ? '/news' : `/news/page/${n}`;
    emit(urlPath, layout({ title: n === 1 ? 'News' : `News (page ${n})`, description: 'Get the latest news about Conquest Reforged right from the source!', urlPath, body: newsList('Latest News', 'all', slice, wfPager(n, pages, '/news')) }));
  }
  posts.forEach((p) => {
    const urlPath = `/news/${p.slug}`;
    const body = wfPage(`<div class="div-block-8 w-clearfix"><h1 id="Headline" class="heading">${esc(p.title)}</h1><div class="div-block-12-copy"><div class="div-block-165"><div class="div-block-164"><div style="background-color:${catColor(p.categorySlug)}" class="text-block-2-copy w-clearfix">  </div><div class="text-block-2 w-clearfix"> written by </div><a href="/news" class="link-block-19 w-inline-block"><div class="text-block-2 w-clearfix">${esc(p.author || '')}</div></a><div class="text-block-2 w-clearfix"> on </div><div class="text-block-2 w-clearfix">${fmtDate(p.date)}</div></div><div class="div-block-166"></div><div><div class="rich-text-block-10 w-richtext">${richVideo(p.html)}</div><div class="div-block-95">${tweet(p)}${rssLink}</div><a href="#Headline" class="button-12 w-button">Back to top</a></div></div></div></div>`);
    emit(urlPath, layout({ title: p.title, description: p.excerpt, urlPath, body }));
  });
  for (const c of site.newsCategories) {
    const list = posts.filter((p) => p.categorySlug === c.slug);
    const pg = Math.max(1, Math.ceil(list.length / POSTS_PER_PAGE));
    for (let n = 1; n <= pg; n++) {
      const urlPath = n === 1 ? `/news-category/${c.slug}` : `/news-category/${c.slug}/page/${n}`;
      emit(urlPath, layout({ title: c.label, description: `Conquest Reforged news: ${c.label}`, urlPath, body: newsList('Latest News', c.slug, list.slice((n - 1) * POSTS_PER_PAGE, n * POSTS_PER_PAGE), wfPager(n, pg, `/news-category/${c.slug}`)) }));
    }
  }
  const rssItems = posts.slice(0, 20).map((p) => `<item><title>${esc(p.title)}</title><link>${site.url}/news/${p.slug}</link><guid>${site.url}/news/${p.slug}</guid><pubDate>${new Date(p.date + 'T12:00:00Z').toUTCString()}</pubDate><description>${esc(p.excerpt)}</description></item>`).join('');
  emitRaw('news/rss.xml', `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(site.name)} News</title><link>${site.url}/news</link><description>${esc(site.description)}</description>${rssItems}</channel></rss>`);
}

const richImages = (html) => html.replace(/<p>\s*(<img [^>]*>)\s*<\/p>/g, '<figure class="w-richtext-align-center w-richtext-figure-type-image"><div>$1</div></figure>');
const rich = (html) => richImages(richVideo(html));
const catTabs = (base, cats, active, allLabel) => `<div class="collection-list-wrapper-6 w-dyn-list"><div role="list" class="collection-list-4 w-dyn-items"><div role="listitem" class="collection-item-6 w-dyn-item"><a href="${base.all}" class="button-3 xxx w-button">${allLabel}</a></div>${cats.map((c) => `<div role="listitem" class="collection-item-6 w-dyn-item"><a href="${base.prefix}/${c.slug}" class="button-3 xxx w-button${active === c.slug ? ' w--current' : ''}">${esc(c.label)}</a></div>`).join('')}</div></div>`;
const wfHead = (h1, extra = '') => `<div class="div-block-64${extra}"><h1 class="heading"><strong class="bold-text-2">${esc(h1)}</strong></h1></div><div class="div-block-13"></div>`;
const LIGHTBOX = `<script>(function(){var l=document.querySelectorAll('.w-lightbox');if(!l.length)return;var o=document.createElement('div');o.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.9);display:none;align-items:center;justify-content:center;cursor:zoom-out';var im=document.createElement('img');im.style.cssText='max-width:94vw;max-height:94vh;box-shadow:0 0 30px #000';o.appendChild(im);document.body.appendChild(o);var imgs=[].map.call(l,function(a){return a.querySelector('img').src}),cur=0;function show(i){cur=(i+imgs.length)%imgs.length;im.src=imgs[cur];o.style.display='flex'}o.addEventListener('click',function(){o.style.display='none'});addEventListener('keydown',function(e){if(o.style.display!=='flex')return;if(e.key==='Escape')o.style.display='none';if(e.key==='ArrowRight')show(cur+1);if(e.key==='ArrowLeft')show(cur-1)});[].forEach.call(l,function(a,i){a.addEventListener('click',function(e){e.preventDefault();show(i)})})})();</script>`;

// ---------- showcases ----------
function buildShowcases() {
  const items = readJSON('data', 'showcases.json');
  const cats = readJSON('data', 'showcase-categories.json');
  const thumbOf = (it) => it.thumb || (it.gallery && it.gallery[0]) || site.fallbackThumb;
  const featuredCard = (it) => `<div role="listitem" class="collection-item-14 w-dyn-item w-col w-col-6"><div class="div-block-181"><div class="div-block-177"><img src="${thumbOf(it)}" alt="" class="image-70"></div><div class="div-block-179"><div class="div-block-50-copy"><h1 class="heading-5-copy name">${esc(it.title)}</h1><div class="div-block-180"><div class="text-block-37">made by</div><div class="text-block-38">${esc(it.author)}</div></div><div class="text-block-40">${fmtDate(it.date)}</div></div></div></div><a href="/showcase/${it.slug}" class="link-block-22 w-inline-block"></a></div>`;
  const smallCard = (it) => `<div role="listitem" class="collection-item-2 w-dyn-item"><a href="/showcase/${it.slug}" class="link-block-21 w-inline-block"><div class="div-block-30"><div class="div-block-31"><div class="div-block-50-copy-copy"><div class="div-block-183"><h1 class="heading-5-copy name">${esc(it.title)}</h1><div class="text-block-37">made by</div><div class="text-block-38">${esc(it.author)}</div></div></div></div><div title="submit" style="background-image:url(&quot;${thumbOf(it)}&quot;)" class="div-block-49-copy"></div><div class="text-block-40-copy">${fmtDate(it.date)}</div></div></a><div class="div-block-48-showcase"><img src="${site.fallbackThumb}" alt="" class="image-32"><div class="text-block-16">Want a chance to be featured? Tweet us your build with <a href="https://twitter.com/hashtag/weareconquest?src=hashtag_click" target="_blank">#WeAreConquest</a> or join our <a href="https://discord.gg/ZagrZvn" target="_blank">Discord</a>.</div></div></div>`;
  const tabs = (a) => catTabs({ all: '/showcases', prefix: '/showcase-categories' }, cats, a, 'All Categories');
  emit('/showcases', layout({ title: 'Community Showcases', description: 'Check out some of these awesome projects', urlPath: '/showcases', body: wfPage(`<div class="div-block-8 w-clearfix">${wfHead('Community Showcases')}${tabs('all')}<div class="div-block-13"></div><div class="collection-list-wrapper-14 w-dyn-list"><div role="list" class="collection-list-12 w-dyn-items w-row">${items.slice(0, 2).map(featuredCard).join('')}</div></div><div class="div-block-182"><div class="collection-list-wrapper-2 w-dyn-list"><div role="list" class="collection-list w-dyn-items">${items.slice(2).map(smallCard).join('')}</div></div></div></div>`) }));
  for (const c of cats) {
    const list = items.filter((it) => (it.cats || []).includes(c.slug));
    emit(`/showcase-categories/${c.slug}`, layout({ title: c.label, description: `Community showcases: ${c.label}`, urlPath: `/showcase-categories/${c.slug}`, body: wfPage(`<div class="div-block-8 w-clearfix">${wfHead('Community Showcases')}${tabs(c.slug)}<div class="div-block-13"></div><div class="collection-list-wrapper-2 w-dyn-list"><div role="list" class="collection-list w-dyn-items">${list.map(smallCard).join('')}</div></div></div>`) }));
  }
  items.forEach((it, i) => {
    if (!exists('content', 'showcase', it.slug + '.md')) return;
    const { body } = parseDoc(readText('content', 'showcase', it.slug + '.md'));
    const older = items[i + 1], newer = items[i - 1];
    const gallery = (it.gallery && it.gallery.length ? it.gallery : [thumbOf(it)]);
    const author = it.authorLink ? `<a href="${esc(it.authorLink)}" class="link-block-23 w-inline-block"><div class="text-block-42">${esc(it.author)}</div></a>` : `<div class="text-block-42">${esc(it.author)}</div>`;
    const title = it.link ? `<a href="${esc(it.link)}" class="link-block-25 w-inline-block"><h1 class="heading-copy">${esc(it.title)}</h1></a>` : `<h1 class="heading-copy">${esc(it.title)}</h1>`;
    const more = items.slice(0, 4).map((m) => `<div role="listitem" class="collection-item-17 w-dyn-item w-col w-col-3"><a href="/showcase/${m.slug}" class="link-block-24 w-inline-block${m.slug === it.slug ? ' w--current' : ''}"><img src="${thumbOf(m)}" alt="" class="image-74"><div class="text-block-47">${esc(m.title)}</div><div class="text-block-48">${fmtDate(m.date)}</div></a></div>`).join('');
    const inner = `<div class="div-block-8 w-clearfix"><div class="div-block-64 fix"><div class="div-block-192">${title}<div class="div-block-184"><div class="text-block-41">a project by</div>${author}</div></div></div><div class="div-block-13"></div><div class="div-block-188"><div class="text-block-43">Published: </div><div class="text-block-44">${fmtDate(it.date)}</div></div><div class="div-block-186"></div><img src="${gallery[0]}" alt="" class="image-75"><div class="collection-list-wrapper-16 w-dyn-list"><div role="list" class="collection-list-13 w-dyn-items">${gallery.map((g) => `<div role="listitem" class="collection-item-15 w-dyn-item w-dyn-repeater-item"><a href="#" class="lightbox-link-3 w-inline-block w-lightbox"><img src="${g}" alt="" class="image-73"><img src="${g}" alt="" class="showcase-image"><img src="${g}" alt="" class="showcase-image-copy"><img src="${g}" alt="" class="image-72"></a></div>`).join('')}</div></div><div class="rich-text-block-11 w-richtext">${rich(md(body))}</div><div class="collection-list-wrapper-17 w-dyn-list"><div role="list" class="collection-list-15 w-dyn-items">${(it.cats || []).map((s) => { const c = cats.find((x) => x.slug === s); return c ? `<div role="listitem" class="collection-item-16 w-dyn-item"><a href="/showcase-categories/${s}" class="w-inline-block"><div class="text-block-45">${esc(c.label)}</div></a></div>` : ''; }).join('')}</div></div><div class="div-block-13"></div><div class="div-block-189"><div class="div-block-191">${older ? `<a href="/showcase/${older.slug}" class="button-14 w-button">previous Project</a>` : ''}</div><div class="div-block-190">${newer ? `<a href="/showcase/${newer.slug}" class="button-13 w-button">next Project</a>` : ''}</div></div><div class="collection-list-wrapper-19 w-dyn-list"><div role="list" class="collection-list-17 w-dyn-items w-row">${more}</div></div></div>${LIGHTBOX}`;
    emit(`/showcase/${it.slug}`, layout({ title: it.title, description: `${it.title}, made by ${it.author}`, urlPath: `/showcase/${it.slug}`, ogImage: thumbOf(it), body: wfPage(inner) }));
  });
}

// ---------- servers ----------
function buildServers() {
  const items = readJSON('data', 'servers.json');
  const tags = [...new Set(items.flatMap((i) => i.tags))];
  const details = {};
  for (const s of items) {
    if (!exists('content', 'servers', s.slug + '.md')) continue;
    const { meta, body } = parseDoc(readText('content', 'servers', s.slug + '.md'));
    details[s.slug] = { meta, body };
  }
  const cards = items.map((s) => {
    const d = details[s.slug];
    const inner = `<img class="thumb fallback" src="${(d && d.meta.logo) || s.image || site.fallbackThumb}" alt="" loading="lazy"><div class="body"><h3>${esc(s.name)}</h3><p>${esc(s.tags.join(' | '))}</p></div>`;
    return d ? `<a class="card" href="/servers/${s.slug}" data-tags="${esc(s.tags.join('|'))}">${inner}</a>` : `<div class="card" data-tags="${esc(s.tags.join('|'))}">${inner}${s.url ? `<div class="links"><a class="pill" href="${s.url}" rel="noopener" target="_blank">Visit</a></div>` : ''}</div>`;
  });
  cards.push(`<a class="card cta-card" href="/team"><img src="${site.fallbackThumb}" alt=""><h3>This could be you</h3><p>Want your <b>Conquest Reforged</b> server featured? Contact the team to get it added!</p></a>`);
  const filters = `<div class="filters" role="group" aria-label="Filter servers"><button type="button" aria-pressed="true" data-tag="">All Servers</button>${tags.map((t) => `<button type="button" aria-pressed="false" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>`;
  const script = `<script>
(function(){var b=document.querySelectorAll('.filters button'),c=document.querySelectorAll('.grid .card[data-tags]');
b.forEach(function(x){x.addEventListener('click',function(){var t=x.dataset.tag;b.forEach(function(y){y.setAttribute('aria-pressed',y===x)});
c.forEach(function(card){card.style.display=(!t||card.dataset.tags.split('|').indexOf(t)>-1)?'':'none'})})})})();
</script>`;
  emit('/serverslist/servers', layout({ title: 'Servers', description: 'Bored of single player? Check out these awesome servers and share your creativity and fun with the rest of our fantastic community!', urlPath: '/serverslist/servers', body: page('Servers', `${filters}<div class="grid">${cards.join('\n')}</div>${script}`) }));
  for (const s of items) {
    const d = details[s.slug];
    if (!d) continue;
    const links = (d.meta.links || '').split(' ;; ').filter(Boolean).map((l) => l.split('|')).map(([label, url]) => `<a class="btn" href="${esc(url)}" rel="noopener" target="_blank">${esc(label)}</a>`).join('');
    const others = items.filter((o) => o.slug !== s.slug && details[o.slug]).map((o) => `<a href="/servers/${o.slug}">${esc(o.name)}</a>`).join(' · ');
    const inner = `${d.meta.logo ? `<img src="${d.meta.logo}" alt="${esc(s.name)}" style="max-width:260px">` : ''}${d.meta.ip ? `<p><strong>IP:</strong> ${esc(d.meta.ip)}</p>` : ''}${md(d.body)}${links ? `<div class="btn-row">${links}</div>` : ''}<p class="muted">${esc(s.tags.join(' | '))}</p>${others ? `<p>Other servers: ${others}</p>` : ''}<p><a href="/serverslist/servers">← All servers</a></p>`;
    emit(`/servers/${s.slug}`, layout({ title: s.name, description: `${s.name}, a server using Conquest Reforged`, urlPath: `/servers/${s.slug}`, ogImage: d.meta.logo, body: page(s.name, inner) }));
  }
}

// ---------- video creators ----------
function buildYoutubers() {
  const items = readJSON('data', 'youtubers.json');
  const card = (c) => {
    const inner = `<div class="body"><h3>${esc(c.name)}</h3><p>Content: ${esc(c.content)}<br>Language: ${esc(c.lang)}</p></div>`;
    const pills = `<div class="links">${c.yt ? `<a class="pill yt" href="${esc(c.yt)}" rel="noopener" target="_blank">YouTube</a>` : ''}${c.tw ? `<a class="pill tw" href="${esc(c.tw)}" rel="noopener" target="_blank">Twitch</a>` : ''}</div>`;
    return `<div class="card">${c.slug ? `<a href="/youtube-channels/${c.slug}" style="color:inherit">${inner}</a>` : inner}${pills}</div>`;
  };
  const inner = `<div class="grid">${items.map(card).join('\n')}</div><div class="voice"><p>Your channel is not featured or you know one that isn't? Contact the <a href="/team">team</a> to get it added!</p></div>`;
  emit('/serverslist/youtube-channels', layout({ title: 'Content Creators', description: 'Find content creators who use Conquest Reforged here!', urlPath: '/serverslist/youtube-channels', body: page('Video Creators', inner) }));
  for (const c of items) {
    if (!c.slug) continue;
    const e = c.embed;
    const yt = (src) => `<div class="embed"><iframe src="${src}" title="${esc(c.name)} video" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`;
    // Twitch only embeds on the domain named in `parent`, so the page fills it in from its own address
    const player = !e ? '' : e.type === 'twitch'
      ? `<div class="embed"><iframe data-twitch="${esc(e.id)}" title="${esc(c.name)} on Twitch" allowfullscreen></iframe></div><script>document.querySelectorAll('iframe[data-twitch]').forEach(function(f){f.src='https://player.twitch.tv/?channel='+f.dataset.twitch+'&muted=true&parent='+location.hostname})</script>`
      : e.type === 'youtube-list' ? yt(`https://www.youtube-nocookie.com/embed/videoseries?list=${esc(e.id)}`) : yt(`https://www.youtube-nocookie.com/embed/${esc(e.id)}`);
    const where = [c.yt && `their Videos on <a href="${esc(c.yt)}" rel="noopener" target="_blank">YouTube</a>`, c.tw && `their Streams on <a href="${esc(c.tw)}" rel="noopener" target="_blank">Twitch</a>`].filter(Boolean).join(' and ');
    const body = `<h2>Meet ${esc(c.name)}</h2>${player}<p>${esc(c.name)} makes Content using Conquest in ${esc(c.lang)}.${where ? ` You can find out more about ${where}.` : ''}</p>${c.status ? `<p>${esc(c.status)}</p>` : ''}<p>Hope you guys find some good entertainment over there and support the creators whatever way you can if you enjoy what they do.</p><div class="btn-row">${c.yt ? `<a class="btn" href="${esc(c.yt)}" rel="noopener" target="_blank">YouTube</a>` : ''}${c.tw ? `<a class="btn" href="${esc(c.tw)}" rel="noopener" target="_blank">Twitch</a>` : ''}</div><p><a href="/serverslist/youtube-channels">← All creators</a></p>`;
    emit(`/youtube-channels/${c.slug}`, layout({ title: c.name, description: `${c.name} makes content using Conquest Reforged`, urlPath: `/youtube-channels/${c.slug}`, body: page('Video Creators', body) }));
  }
}

// ---------- guides ----------
function buildGuides() {
  const items = readJSON('data', 'guides.json');
  const gcats = site.guideCategories;
  const icon = (c, link) => `<a title="${esc(c.title)}" href="${link}" class="w-inline-block"><img src="${c.icon}" alt="${esc(c.title)}" class="guide-category-icons"></a>`;
  const card = (g) => `<div role="listitem" class="collection-item-14 w-dyn-item w-col w-col-6"><div class="div-block-181"><div class="div-block-177"><img src="${g.image || site.fallbackThumb}" alt="" class="image-70"></div><div class="div-block-179"><div class="div-block-50-copy"><div class="div-block-195"><div class="text-block-50">${fmtDate(g.date)}</div></div><div class="div-block-197"><div class="text-block-52">${esc(g.title)}</div><div class="div-block-198"><div class="text-block-37">by</div><div class="text-block-38">${esc(g.author)}</div></div></div></div></div></div><a href="/guides/${g.slug}" class="link-block-22 w-inline-block"></a><div class="div-block-194">${gcats.filter((c) => c.slug === g.cat).map((c) => icon(c, `/guides/${g.slug}`)).join('')}</div></div>`;
  const tabs = (a) => catTabs({ all: '/guides', prefix: '/guide-categories' }, gcats, a, 'All Categories');
  const small = (g) => `<div role="listitem" class="collection-item-2-copy w-dyn-item"><a href="/guides/${g.slug}" class="link-block-21 w-inline-block"><div class="div-block-30"><div class="div-block-31"><div class="div-block-50-copy-copy"><div class="div-block-183"><h1 class="heading-5-copy name">${esc(g.title)}</h1><div class="text-block-37-copy"> by</div><div class="text-block-38-copy">${esc(g.author)}</div></div></div></div><div title="submit" style="background-image:url(&quot;${g.image || site.fallbackThumb}&quot;)" class="div-block-49-copy-copy"></div><div class="text-block-40-copy">${fmtDate(g.date)}</div></div></a><div class="guidecastegories_small">${gcats.filter((c) => c.slug === g.cat).map((c) => `<a title="${esc(c.title)}" href="/guides/${g.slug}" class="w-inline-block"><img src="${c.icon}" alt="${esc(c.title)}" class="guide-category-icons-small"></a>`).join('')}</div><div class="div-block-48-showcase"><img src="${site.fallbackThumb}" alt="" class="image-32"><div class="text-block-16">Want a chance to be featured? Tweet us your build with <a href="https://twitter.com/hashtag/weareconquest?src=hashtag_click" target="_blank">#WeAreConquest</a> or join our <a href="https://discord.gg/ZagrZvn" target="_blank">Discord</a>.</div></div></div>`;
  const byDate = (list) => list.map((g, i) => [g, i]).sort((a, b) => b[0].date.localeCompare(a[0].date) || a[1] - b[1]).map((x) => x[0]);
  const smallList = (list) => list.length ? `<div class="div-block-182"><div class="collection-list-wrapper-2 w-dyn-list"><div role="list" class="collection-list w-dyn-items">${byDate(list).map(small).join('')}</div></div></div>` : `<div class="div-block-182"><div class="collection-list-wrapper-2 w-dyn-list"><div class="w-dyn-empty"><div>No items found.</div></div></div></div>`;
  const listPage = (urlPath, title, active, list, big) => emit(urlPath, layout({ title, description: 'These guides aim to make your experience with the mod more streamlined and enjoyable.', urlPath, body: wfPage(`<div class="div-block-8 w-clearfix">${wfHead('Official Guides')}${tabs(active)}<div class="div-block-13"></div>${big ? `<div class="collection-list-wrapper-14 w-dyn-list"><div role="list" class="collection-list-12 w-dyn-items w-row">${list.slice(0, 4).map(card).join('')}</div></div>` : ''}${smallList(list)}</div>`) }));
  listPage('/guides', 'Guides', 'all', items, true);
  for (const c of gcats) listPage(`/guide-categories/${c.slug}`, c.label, c.slug, items.filter((g) => g.cat === c.slug), false);
  for (const g of items) {
    if (!exists('content', 'guides', g.slug + '.md')) { warnings.push(`guide "${g.slug}" has no src/content/guides/${g.slug}.md yet`); continue; }
    const { body } = parseDoc(readText('content', 'guides', g.slug + '.md'));
    const other = items.filter((x) => x.slug !== g.slug && exists('content', 'guides', x.slug + '.md'));
    const inner = `<div class="div-block-8 w-clearfix"><div class="div-block-64"><h1 class="heading">${esc(g.title)}</h1></div><div class="div-block-13"></div><div class="rich-text-block-13-copy w-richtext">${rich(md(body))}</div><div class="div-block-13-copy"></div><div class="collection-list-wrapper-20 w-dyn-list"><div role="list" class="collection-list-18 w-dyn-items w-dyn-hide"></div><div class="empty-state-2 w-dyn-empty"><div>No items found.</div></div></div><div class="div-block-13"></div><div class="text-block-51"><strong>Other Guides:</strong></div><div class="collection-list-wrapper-14-copy w-dyn-list"><div role="list" class="collection-list-12 w-dyn-items w-row">${other.map((o) => `<div role="listitem" class="collection-item-14-copy w-dyn-item w-col w-col-6"><a href="/guides/${o.slug}" class="w-inline-block"><div class="div-block-182"><img src="${o.image || site.fallbackThumb}" alt="" class="image-77"></div><div class="div-block-196"><div>${esc(o.title)}</div></div></a></div>`).join('')}</div></div></div>`;
    emit(`/guides/${g.slug}`, layout({ title: g.title, description: `Conquest Reforged guide: ${g.title}`, urlPath: `/guides/${g.slug}`, ogImage: g.image, body: wfPage(inner) }));
  }
}

// ---------- search ----------
// Client-side search: a JSON index of every generated page + a /search page that filters it.
function buildSearch() {
  const docs = [];
  for (const u of generated) {
    if (u.endsWith('.html')) continue;
    const file = path.join(DIST, u === '/' ? 'index.html' : path.join(u.slice(1), 'index.html'));
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, 'utf8');
    const main = (html.match(/<main class="page">([\s\S]*?)<\/main>/) || [])[1];
    if (!main) continue;
    const title = stripTags((html.match(/<title>([^<]*)<\/title>/) || [])[1] || u).replace(/ \| Conquest Reforged$/, '');
    docs.push({ u, t: title, x: stripTags(main.replace(/<script[\s\S]*?<\/script>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 4000) });
  }
  emitRaw('search-index.json', JSON.stringify(docs));
  const script = `<script>
(function(){
var q=(new URLSearchParams(location.search).get('q')||'').trim(),box=document.getElementById('q'),out=document.getElementById('results');
box.value=q;if(!q){out.innerHTML='<p class="muted">Type something to search news, guides, servers, creators and showcases.</p>';return}
var terms=q.toLowerCase().split(/\s+/).filter(Boolean);
fetch('/search-index.json').then(function(r){return r.json()}).then(function(docs){
 var hits=docs.map(function(d){var t=d.t.toLowerCase(),x=d.x.toLowerCase(),s=0;
  for(var i=0;i<terms.length;i++){var a=t.split(terms[i]).length-1,b=x.split(terms[i]).length-1;if(!a&&!b){s=0;break}s+=a*5+b}
  return {d:d,s:s}}).filter(function(h){return h.s>0}).sort(function(a,b){return b.s-a.s}).slice(0,30);
 if(!hits.length){out.innerHTML='<p>No results for <b></b>.</p>';out.querySelector('b').textContent=q;return}
 out.innerHTML=hits.map(function(h){var x=h.d.x,i=x.toLowerCase().indexOf(terms[0]),st=Math.max(0,i-60),sn=x.slice(st,st+180);
  var el=document.createElement('div');el.className='post-card';var a=document.createElement('h3');var l=document.createElement('a');l.href=h.d.u;l.textContent=h.d.t;a.appendChild(l);var p=document.createElement('p');p.textContent=(st>0?'… ':'')+sn+(x.length>st+180?' …':'');el.appendChild(a);el.appendChild(p);return el.outerHTML}).join('');
});
})();
</script>`;
  const form = `<form action="/search" method="get" role="search" style="display:flex;gap:10px;margin:0 0 18px"><input id="q" name="q" type="search" placeholder="search…" style="flex:1;font:inherit;font-size:20px;padding:6px 12px;border:1px solid #999;border-radius:10px"><button class="btn" type="submit">Search</button></form><div id="results"></div>`;
  emit('/search', layout({ title: 'Search', description: 'Search the Conquest Reforged site', urlPath: '/search', body: page('Search', form + script) }));
}

// ---------- team / contact ----------
function buildTeam() {
  const team = readJSON('data', 'team.json');
  const member = (m) => {
    const links = [m.twitter && `<a href="${m.twitter}" rel="noopener" target="_blank">Twitter</a>`, m.twitch && `<a href="${m.twitch}" rel="noopener" target="_blank">Twitch</a>`, m.pmc && `<a href="${m.pmc}" rel="noopener" target="_blank">PMC</a>`].filter(Boolean).join('');
    return `<div class="member"><img src="${m.avatar}" alt="${esc(m.name)}" loading="lazy"><div><h3>${esc(m.name)}</h3><p class="role">${esc(m.role)}</p><p class="quote">${esc(m.quote)}</p><p class="disc">Discord: ${esc(m.discord)}</p>${links ? `<p class="ln">${links}</p>` : ''}</div></div>`;
  };
  const intro = md(`**Technical support and answers to general inquiries** can be found on our [Discord server’s](https://discord.gg/ZagrZvn) **#support** channel.

For **sharing your builds** with us, you can tweet **@ConReforged** and use the [#WeAreConquest](https://twitter.com/hashtag/WeAreConquest) [#WeAreReforged](https://twitter.com/hashtag/WeAreReforged) hashtags. Our [Discord server](https://discord.gg/ZagrZvn) also has **#promotion** and **#builds** channels, which we check often.

For more **private inquiries**, send us an email at [conquestreforged@gmail.com](mailto:conquestreforged@gmail.com).`);
  const inner = `${intro}<h2>Meet the TEAM</h2><div class="team-grid">${team.map(member).join('\n')}</div><p>Do you have programming experience and interest in the project? Helping hands are always welcome. Just contact us via <a href="https://discord.gg/ZagrZvn" rel="noopener" target="_blank">Discord</a>.</p>${md('::discord')}`;
  emit('/team', layout({ title: 'The Conquest Reforged team', description: 'Meet our team of hardworking and chill individuals always open to making Conquest Reforged even better tomorrow.', urlPath: '/team', body: page('Contact', inner) }));
}

// ---------- 404 ----------
function build404() {
  emitRaw('404.html', layout({ title: 'Page not found', description: 'Page not found', urlPath: '/404', body: page('Page not found', '<p>That page wandered off. Try the <a href="/">home page</a>, the <a href="/news">news</a>, or the <a href="/downloads">downloads</a>.</p>') }));
}

// Pack pages are faithful clones of the original Webflow pages (own design, own stylesheet): see clone-packs.mjs
function buildClones() {
  const dir = path.join(SRC, 'clone');
  if (!fs.existsSync(path.join(dir, 'webflow.css'))) return;
  const scripts = JSON.parse(fs.readFileSync(path.join(dir, 'scripts.json'), 'utf8'));
  emitRaw('assets/pack-webflow.css', fs.readFileSync(path.join(dir, 'webflow.css'), 'utf8').replace(/https:\/\/cdn\.prod\.website-files\.com\/[^\s"')]+/g, (u) => {
    const name = decodeURIComponent(u).split('?')[0].split('/').pop().replace(/[^\w.\-]+/g, '_');
    return exists('assets/' + name) ? '/assets/' + name : u;
  }));
  for (const [u, name] of Object.entries(scripts)) emitRaw('assets/' + name, fs.readFileSync(path.join(dir, name)));
  for (const f0 of fs.readdirSync(dir).filter((n) => n.endsWith('.body.html'))) {
    const slug = f0.replace('.body.html', '').replace(/__/g, '/');
    const f = path.join(dir, f0);
    if (!fs.existsSync(f)) continue;
    const meta = JSON.parse(fs.readFileSync(path.join(dir, f0.replace('.body.html', '.meta.json')), 'utf8'));
    let body = fs.readFileSync(f, 'utf8');
    body = body.replace(/<script[^>]*\ssrc="([^"]+)"[^>]*>(?:<\/script>)?/g, (m, u) => (scripts[u] ? `<script src="/assets/${scripts[u]}"></script>` : m));
    body = body.replace(/https?:\/\/(?:www\.)?conquestreforged\.com\//g, '/');
    emit('/' + slug, `<!DOCTYPE html><html data-wf-page="${meta.wfPage}" data-wf-site="${meta.wfSite}" lang="en"><head><meta charset="utf-8"><title>${esc(meta.title)}</title><meta name="description" content="${esc(meta.description)}"><meta property="og:title" content="${esc(meta.title)}"><meta property="og:description" content="${esc(meta.description)}"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/assets/pack-webflow.css"><script>!function(o,c){var n=c.documentElement,t=" w-mod-";n.className+=t+"js",("ontouchstart"in o||o.DocumentTouch&&c instanceof DocumentTouch)&&(n.className+=t+"touch")}(window,document);</script><link rel="icon" href="${site.logo}"><style>.truncate{white-space:nowrap;text-overflow:ellipsis}</style></head>${body}</html>`);
  }
}

// ---------- run ----------
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
emitRaw('styles.css', cssHash.css);
emitRaw('assets/wf-scoped.css', wfScoped.css);
if (exists('assets')) fs.cpSync(path.join(SRC, 'assets'), path.join(DIST, 'assets'), { recursive: true });

const posts = loadPosts();
buildHome();
buildMarkdownPage('info.md', '/info');
buildMarkdownPage('downloads.md', '/downloads');
buildMarkdownPage('faq.md', '/faq');
buildClones();
buildNews(posts);
buildShowcases();
buildServers();
buildYoutubers();
buildGuides();
buildTeam();
build404();
buildSearch();

emitRaw('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${site.url}/sitemap.xml\n`);
// pages designed in Webstudio are not in `generated`, so list them too
const wsUrls = [];
(function scan(d, rel = '') {
  const dir = path.join(SRC, 'webstudio', d);
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && e.name !== 'assets') scan(path.join(d, e.name), rel + '/' + e.name);
  }
  if (fs.existsSync(path.join(dir, 'index.html'))) wsUrls.push(rel || '/');
})('');
const sitemapUrls = [...new Set([...generated.filter((u) => !u.endsWith('.html')), ...wsUrls])];
emitRaw('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemapUrls.map((u) => `<url><loc>${site.url}${u === '/' ? '' : u}</loc></url>`).join('')}</urlset>`);
// Old Webflow URLs that no longer exist as pages.
emitRaw('_redirects', `/server-categories/* /serverslist/servers 301
/showcase-categories/* /showcases 301
/guide-categories/* /guides 301
/contact /team 301
/download-instructions /downloads 301
`);
emitRaw('_headers', `/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n/styles.css\n  Cache-Control: public, max-age=3600\n`);

// ---------- Webstudio pages ----------
// Drop a Webstudio static export (CLI `build --template ssg`, or the downloaded zip) into
// src/webstudio/. Its files are copied over dist/, so any page it contains replaces ours.
const WS = path.join(SRC, 'webstudio');
const wsPages = [];
if (fs.existsSync(WS)) {
  fs.cpSync(WS, DIST, { recursive: true });
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'index.html') wsPages.push('/' + path.relative(WS, d).split(path.sep).join('/'));
    }
  })(WS);
  // Webstudio pages are a React app: after loading, React re-renders HTML Embeds and drops whatever their
  // inline <script>s set up. Park those scripts, then re-run them once the page has settled.
  const RUN_EMBEDS = `<script>(function(){var done=0,t;function run(){if(done)return;done=1;document.querySelectorAll('.w-html-embed script').forEach(function(s){var n=document.createElement('script');n.text=s.textContent;s.parentNode.replaceChild(n,s)})}function settle(){clearTimeout(t);t=setTimeout(run,350)}function go(){settle();var o=new MutationObserver(settle);o.observe(document.body,{childList:true,subtree:true});setTimeout(function(){o.disconnect();run()},4000)}if(document.readyState==='complete')go();else addEventListener('load',go)})();</script>`;
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (e.name !== 'index.html') continue;
      const out = path.join(DIST, path.relative(WS, p));
      const html = fs.readFileSync(out, 'utf8');
      if (!/<script>/.test(html)) continue;
      // header (holds the fixed search button) must sit above the fixed footer bar
      fs.writeFileSync(out, html.replace(/<script>/g, '<script type="text/plain">').replace('</head>', FIX_CSS + '</head>').replace('</body>', RUN_EMBEDS + FIX_JS + '</body>'));
    }
  })(WS);
  // Images pasted into Webstudio as HTML keep editor URLs like /cgi/asset/<name>_<21-char id>.webp.
  // Point them at our local copy /assets/<name>.webp when we have one.
  let rewritten = 0;
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(html|css|js)$/.test(e.name)) continue;
      const before = fs.readFileSync(p, 'utf8');
      const after = before.replace(/\/cgi\/(?:asset|image)\/([^"'\s?)\\]+?)_[A-Za-z0-9_-]{21}(\.\w+)(?:\?[^"'\s)\\]*)?/g, (m, name, ext) =>
        exists(`assets/${name}${ext}`) ? (rewritten++, `/assets/${name}${ext}`) : m);
      if (after !== before) fs.writeFileSync(p, after);
    }
  })(DIST);
  console.log(`Copied Webstudio export (${wsPages.length} pages, ${rewritten} editor image URLs rewritten)`);
}

// ---------- link check ----------
const known = new Set([...generated, ...wsPages].map((u) => u.replace(/\/$/, '') || '/'));
const redirectSources = ['/mod', '/contact', '/download-instructions'];
let broken = 0;
for (const u of generated) {
  const rel = u === '/' ? 'index.html' : path.join(u.slice(1), 'index.html');
  const html = fs.readFileSync(path.join(DIST, rel), 'utf8');
  for (const m of html.matchAll(/href="(\/[^"#?]*)/g)) {
    const t = m[1].replace(/\/$/, '') || '/';
    if (t.startsWith('/assets/')) {
      if (!fs.existsSync(path.join(DIST, decodeURIComponent(t)))) { console.warn(`  missing asset on ${u}: ${t}`); broken++; }
      continue;
    }
    if (/\.(css|xml|txt)$/.test(t) || known.has(t) || redirectSources.includes(t)) continue;
    console.warn(`  broken internal link on ${u}: ${m[1]}`);
    broken++;
  }
}
console.log(`Built ${generated.length} pages into dist/  (${posts.length} news posts)`);
warnings.forEach((w) => console.warn('  note: ' + w));
if (broken) { console.error(`${broken} broken internal link(s)`); process.exitCode = 1; }
