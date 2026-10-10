// Static site builder for conquestreforged.com — zero dependencies, Node 18+.
//   node build.mjs      -> writes ./dist
// Content lives in ./src: Markdown in src/content, structured lists in src/data.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const POSTS_PER_PAGE = 10;

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
<link rel="stylesheet" href="/styles.css?v=${cssHash.v}">
</head>
<body class="ws">
${wsChrome.bg}
${wsChrome.header}
${body}
${wsChrome.footer}
${wsChrome.banner}
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
    const html = md(body, 2);
    const firstP = [...html.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((x) => x[1]).find((x) => stripTags(x).trim().length > 40) || '';
    return { ...meta, slug, html, excerpt: meta.excerpt || stripTags(firstP).slice(0, 260) };
  }).sort((a, b) => b.date.localeCompare(a.date));
}

function postMeta(p) {
  const a = authors[p.author] || {};
  return `<div class="post-meta">${a.avatar ? `<img src="${a.avatar}" alt="">` : ''}${p.author ? `<div class="who"><b>${esc(p.author)}</b><br>${esc(a.role || '')}</div>` : ''}<div class="tag">${fmtDate(p.date)}<br>${esc(p.category || '')}</div></div>`;
}
function postCard(p) {
  return `<article class="post-card">${postMeta(p)}<h3><a href="/news/${p.slug}">${esc(p.title)}</a></h3><p>${esc(p.excerpt)}${p.excerpt.length >= 260 ? '…' : ''}</p><a href="/news/${p.slug}">Read the full post →</a></article>`;
}
function catLinks(active) {
  return `<nav class="cat-links" aria-label="News categories"><a href="/news"${active === 'all' ? ' aria-current="page"' : ''}>All News</a>${site.newsCategories.map((c) => `<a href="/news-category/${c.slug}"${active === c.slug ? ' aria-current="page"' : ''}>${esc(c.label)}</a>`).join('')}</nav>`;
}

function buildNews(posts) {
  const pages = Math.max(1, Math.ceil(posts.length / POSTS_PER_PAGE));
  for (let n = 1; n <= pages; n++) {
    const slice = posts.slice((n - 1) * POSTS_PER_PAGE, n * POSTS_PER_PAGE);
    const urlPath = n === 1 ? '/news' : `/news/page/${n}`;
    const pager = pages > 1 ? `<div class="pager"><span>${n > 1 ? `<a href="${n === 2 ? '/news' : `/news/page/${n - 1}`}">← Newer</a>` : ''}</span><span>${n < pages ? `<a href="/news/page/${n + 1}">Older →</a>` : ''}</span></div>` : '';
    const voice = n === 1 ? `<section class="voice"><h2>Voice of the Community</h2><p>Spread news of your own projects (Conquest related) under the hashtag <a href="https://twitter.com/hashtag/WeAreConquest" rel="noopener" target="_blank">#WeAreConquest</a> to get featured.</p></section>` : '';
    const inner = `${catLinks('all')}${slice.map(postCard).join('\n')}${pager}${voice}<p class="rss-link"><a href="/news/rss.xml">RSS feed</a></p>`;
    emit(urlPath, layout({ title: n === 1 ? 'News' : `News (page ${n})`, description: 'Get the latest news about Conquest Reforged right from the source!', urlPath, body: page('Latest News', inner) }));
  }
  posts.forEach((p, i) => {
    const urlPath = `/news/${p.slug}`;
    const newer = posts[i - 1], older = posts[i + 1];
    const nav = `<div class="pager"><span>${older ? `<a href="/news/${older.slug}">← ${esc(older.title)}</a>` : ''}</span><span>${newer ? `<a href="/news/${newer.slug}">${esc(newer.title)} →</a>` : ''}</span></div>`;
    const inner = `${postMeta(p)}<h2>${esc(p.title)}</h2>\n${p.html}\n${nav}<p><a href="/news">← All news</a></p>`;
    emit(urlPath, layout({ title: p.title, description: p.excerpt, urlPath, body: page('News', inner) }));
  });
  for (const c of site.newsCategories) {
    const list = posts.filter((p) => p.categorySlug === c.slug);
    const urlPath = `/news-category/${c.slug}`;
    const inner = `${catLinks(c.slug)}${list.length ? list.map(postCard).join('\n') : '<p>No posts in this category yet.</p>'}`;
    emit(urlPath, layout({ title: c.label, description: `Conquest Reforged news: ${c.label}`, urlPath, body: page(c.label, inner) }));
  }
  const rssItems = posts.slice(0, 20).map((p) => `<item><title>${esc(p.title)}</title><link>${site.url}/news/${p.slug}</link><guid>${site.url}/news/${p.slug}</guid><pubDate>${new Date(p.date + 'T12:00:00Z').toUTCString()}</pubDate><description>${esc(p.excerpt)}</description></item>`).join('');
  emitRaw('news/rss.xml', `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(site.name)} News</title><link>${site.url}/news</link><description>${esc(site.description)}</description>${rssItems}</channel></rss>`);
}

// ---------- showcases ----------
function buildShowcases() {
  const items = readJSON('data', 'showcases.json');
  const cards = items.map((it) => {
    const hasPage = exists('content', 'showcase', it.slug + '.md');
    const img = it.thumb ? `<img class="thumb" src="${it.thumb}" alt="" loading="lazy">` : `<img class="thumb fallback" src="${site.fallbackThumb}" alt="" loading="lazy">`;
    const inner = `${img}<div class="body"><h3>${esc(it.title)}</h3><p>made by ${esc(it.author)}<br>${fmtDate(it.date)}</p></div>`;
    if (hasPage) {
      const { body } = parseDoc(readText('content', 'showcase', it.slug + '.md'));
      emit(`/showcase/${it.slug}`, layout({ title: it.title, description: `${it.title}, made by ${it.author}`, urlPath: `/showcase/${it.slug}`, ogImage: it.thumb, body: page('Showcase', `<h2>${esc(it.title)}</h2><p class="muted">made by ${esc(it.author)} · ${fmtDate(it.date)}</p>${md(body)}<p><a href="/showcases">← All showcases</a></p>`) }));
      return `<a class="card" href="/showcase/${it.slug}">${inner}</a>`;
    }
    return `<div class="card">${inner}</div>`;
  });
  const inner = `<div class="grid">${cards.join('\n')}</div><div class="voice"><p>Want a chance to be featured? Tweet us your build with <a href="https://twitter.com/hashtag/weareconquest" rel="noopener" target="_blank">#WeAreConquest</a> or join our <a href="https://discord.gg/ZagrZvn" rel="noopener" target="_blank">Discord</a>.</p></div>`;
  emit('/showcases', layout({ title: 'Community Showcases', description: 'Check out some of these awesome projects', urlPath: '/showcases', body: page('Community Showcases', inner) }));
}

// ---------- servers ----------
function buildServers() {
  const items = readJSON('data', 'servers.json');
  const tags = [...new Set(items.flatMap((i) => i.tags))];
  const cards = items.map((s) => {
    const link = s.url ? `<div class="links"><a class="pill" href="${s.url}" rel="noopener" target="_blank">Visit</a></div>` : '';
    return `<div class="card" data-tags="${esc(s.tags.join('|'))}"><img class="thumb fallback" src="${s.image || site.fallbackThumb}" alt="" loading="lazy"><div class="body"><h3>${esc(s.name)}</h3><p>${esc(s.tags.join(' | '))}</p></div>${link}</div>`;
  });
  cards.push(`<a class="card cta-card" href="/team"><img src="${site.fallbackThumb}" alt=""><h3>This could be you</h3><p>Want your <b>Conquest Reforged</b> server featured? Contact the team to get it added!</p></a>`);
  const filters = `<div class="filters" role="group" aria-label="Filter servers"><button type="button" aria-pressed="true" data-tag="">All Servers</button>${tags.map((t) => `<button type="button" aria-pressed="false" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>`;
  const script = `<script>
(function(){var b=document.querySelectorAll('.filters button'),c=document.querySelectorAll('.grid .card[data-tags]');
b.forEach(function(x){x.addEventListener('click',function(){var t=x.dataset.tag;b.forEach(function(y){y.setAttribute('aria-pressed',y===x)});
c.forEach(function(card){card.style.display=(!t||card.dataset.tags.split('|').indexOf(t)>-1)?'':'none'})})})})();
</script>`;
  emit('/serverslist/servers', layout({ title: 'Servers', description: 'Bored of single player? Check out these awesome servers and share your creativity and fun with the rest of our fantastic community!', urlPath: '/serverslist/servers', body: page('Servers', `${filters}<div class="grid">${cards.join('\n')}</div>${script}`) }));
}

// ---------- video creators ----------
function buildYoutubers() {
  const items = readJSON('data', 'youtubers.json');
  const card = (c) => `<div class="card"><div class="body"><h3>${esc(c.name)}</h3><p>Content: ${esc(c.content)}<br>Language: ${esc(c.lang)}</p></div><div class="links">${c.yt ? `<a class="pill yt" href="${esc(c.yt)}" rel="noopener" target="_blank">YouTube</a>` : ''}${c.tw ? `<a class="pill tw" href="${esc(c.tw)}" rel="noopener" target="_blank">Twitch</a>` : ''}</div></div>`;
  const inner = `<div class="grid">${items.map(card).join('\n')}</div><div class="voice"><p>Your channel is not featured or you know one that isn't? Contact the <a href="/team">team</a> to get it added!</p></div>`;
  emit('/serverslist/youtube-channels', layout({ title: 'Content Creators', description: 'Find content creators who use Conquest Reforged here!', urlPath: '/serverslist/youtube-channels', body: page('Video Creators', inner) }));
}

// ---------- guides ----------
function buildGuides() {
  const items = readJSON('data', 'guides.json');
  const cards = items.map((g) => {
    const has = exists('content', 'guides', g.slug + '.md');
    const meta = `by ${esc(g.author)}<br>${fmtDate(g.date)}${g.updated ? ` · updated ${fmtDate(g.updated)}` : ''}`;
    const inner = `<img class="thumb${g.image ? '' : ' fallback'}" src="${g.image || site.fallbackThumb}" alt="" loading="lazy"><div class="body"><h3>${esc(g.title)}</h3><p>${meta}</p></div>`;
    if (has) {
      const { body } = parseDoc(readText('content', 'guides', g.slug + '.md'));
      const inner2 = `<h2>${esc(g.title)}</h2><p class="muted">by ${esc(g.author)} · ${fmtDate(g.date)}${g.updated ? ` · updated ${fmtDate(g.updated)}` : ''}</p>${md(body)}<p><a href="/guides">← All guides</a></p>`;
      emit(`/guides/${g.slug}`, layout({ title: g.title, description: `Conquest Reforged guide: ${g.title}`, urlPath: `/guides/${g.slug}`, ogImage: g.image, body: page('Guides', inner2) }));
      return `<a class="card" href="/guides/${g.slug}">${inner}</a>`;
    }
    warnings.push(`guide "${g.slug}" has no src/content/guides/${g.slug}.md yet — card is not linked`);
    return `<div class="card">${inner}</div>`;
  });
  emit('/guides', layout({ title: 'Guides', description: 'These guides aim to make your experience with the mod more streamlined and enjoyable.', urlPath: '/guides', body: page('Official Guides', `<div class="grid">${cards.join('\n')}</div>`) }));
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

// ---------- run ----------
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
emitRaw('styles.css', cssHash.css);
if (exists('assets')) fs.cpSync(path.join(SRC, 'assets'), path.join(DIST, 'assets'), { recursive: true });

const posts = loadPosts();
buildHome();
buildMarkdownPage('info.md', '/info');
buildMarkdownPage('downloads.md', '/downloads');
buildMarkdownPage('faq.md', '/faq');
buildNews(posts);
buildShowcases();
buildServers();
buildYoutubers();
buildGuides();
buildTeam();
build404();

emitRaw('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${site.url}/sitemap.xml\n`);
emitRaw('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${generated.map((u) => `<url><loc>${site.url}${u === '/' ? '' : u}</loc></url>`).join('')}</urlset>`);
// Old Webflow URLs that no longer exist as pages.
emitRaw('_redirects', `/mod / 301
/youtube-channels/* /serverslist/youtube-channels 301
/servers/* /serverslist/servers 301
/server-categories/* /serverslist/servers 301
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
