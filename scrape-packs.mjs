// One-off helper: copies the two resource-pack pages (/conquest-pack, /conquest-bedrock) from the live
// Webflow site into src/content/pages/*.md (rendered by build.mjs with the new look).
//   node scrape-packs.mjs && node fetch-assets.mjs && node build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'https://www.conquestreforged.com';
const decode = (s) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');

// drop every element (balanced) whose opening tag matches `re`
function dropBlocks(html, re) {
  let out = html, m;
  while ((m = re.exec(out))) {
    const tag = (m[0].match(/^<(\w+)/) || [])[1];
    const open = new RegExp(`<(/?)${tag}\b[^>]*>`, 'g');
    open.lastIndex = m.index;
    let depth = 0, end = -1, x;
    while ((x = open.exec(out))) { depth += x[1] ? -1 : 1; if (!depth) { end = open.lastIndex; break; } }
    if (end < 0) break;
    out = out.slice(0, m.index) + out.slice(end);
    re.lastIndex = 0;
  }
  return out;
}

function simplify(html) {
  let h = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/g, '');
  h = dropBlocks(h, /<(\w+)[^>]*class="[^"]*(?:w-condition-invisible|w-dyn-hide|w-dyn-bind-empty)[^"]*"[^>]*>/);
  h = h.replace(/\u200d/g, '');
  // keep a small set of tags/attributes
  h = h.replace(/<(\/?)(\w+)([^>]*)>/g, (m, close, tag, attrs) => {
    tag = tag.toLowerCase();
    if (/^h[1-6]$/.test(tag) || ['p', 'ul', 'ol', 'li', 'strong', 'em', 'br', 'blockquote'].includes(tag)) return close ? `</${tag}>` : `<${tag}>`;
    if (tag === 'a') { if (close) return '</a>'; const href = (attrs.match(/href="([^"]*)"/) || [])[1]; return href && href !== '#' ? `<a href="${href}">` : '<a>'; }
    if (tag === 'img') { const src = (attrs.match(/\ssrc="([^"]+)"/) || [])[1]; const alt = (attrs.match(/alt="([^"]*)"/) || [])[1] || ''; return src ? `<img src="${src}" alt="${alt}" loading="lazy">` : ''; }
    if (tag === 'iframe') { const src = (attrs.match(/src="([^"]+)"/) || [])[1] || ''; if (/embedly/.test(src)) return ''; return close ? '' : ''; }
    if (tag === 'div' || tag === 'section') return close ? '</div>' : '<div>';
    return '';
  });
  return h;
}

// Turn a flat run of simplified HTML into tokens: headings, paragraphs, links (with text/images), loose text
function tokens(seg) {
  const out = [];
  const re = /<(h[1-6])>([\s\S]*?)<\/>|<p>([\s\S]*?)<\/p>|<ul>([\s\S]*?)<\/ul>|<a(?: href="([^"]*)")?>([\s\S]*?)<\/a>|(<img [^>]*>)|([^<]+)/g;
  let m;
  const clean = (t) => decode(t.replace(/<(?!\/?(?:strong|em|a))[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  while ((m = re.exec(seg))) {
    if (m[1]) { const t = clean(m[2]); if (t) out.push({ k: 'h', level: m[1], t }); }
    else if (m[3] !== undefined) { const t = clean(m[3]); if (t) out.push({ k: 'p', t }); }
    else if (m[4] !== undefined) out.push({ k: 'raw', t: `<ul>${m[4]}</ul>` });
    else if (m[6] !== undefined) { const img = (m[6].match(/<img [^>]*>/) || [])[0] || ''; const t = clean(m[6].replace(/<img [^>]*>/g, '')); out.push({ k: 'a', href: m[5] || '', t, img }); }
    else if (m[7]) out.push({ k: 'img', img: m[7] });
    else if (m[8] && clean(m[8])) out.push({ k: 't', t: clean(m[8]) });
  }
  return out;
}
// consecutive "link + following text lines" become list items
function renderSections(toks) {
  const html = [];
  let list = [];
  const flush = () => { if (list.length) { html.push(`<ul>${list.join('')}</ul>`); list = []; } };
  let cur = null;
  const endItem = () => { if (cur) { list.push(`<li>${cur.img ? cur.img + ' ' : ''}${cur.href ? `<a href="${cur.href}">${cur.t}</a>` : `<strong>${cur.t}</strong>`}${cur.more.length ? ' &mdash; ' + cur.more.join(', ') : ''}</li>`); cur = null; } };
  for (const t of toks) {
    if (t.k === 'a' && t.t) { endItem(); cur = { href: /^\/conquest\//.test(t.href) ? '' : t.href, t: t.t, img: '', more: [] }; }
    else if ((t.k === 'img' || (t.k === 'a' && !t.t)) && cur && !cur.img) cur.img = (t.img || '').replace(/<img /, '<img style="height:48px;width:auto;vertical-align:middle" ');
    else if ((t.k === 't' || t.k === 'p') && cur) { if (!/^(?:\d|for Minecraft$)/.test(t.t) || cur.more.length) cur.more.push(t.t); else cur.more.push(t.t); }
    else { endItem(); flush(); if (t.k === 'h') html.push(`<h2>${t.t}</h2>`); else if (t.k === 'p' || t.k === 't') html.push(`<p>${t.t}</p>`); else if (t.k === 'img') html.push(`<p>${t.img}</p>`); else if (t.k === 'raw') html.push(t.t); else if (t.k === 'a') html.push(`<p><a href="${t.href}">${t.img || t.t}</a></p>`); }
  }
  endItem(); flush();
  return html;
}

async function page(slug, title, heading, description) {
  const html = await (await fetch(`${BASE}/${slug}`)).text();
  const b = html.slice(html.indexOf('<body'));
  const i = b.indexOf('header_decor');
  const j = b.indexOf('footer_decor');
  let seg = simplify(b.slice(i > 0 ? i : 0, j > i ? j : undefined));
  seg = seg.replace(/^[^<]*(?=<)/, '');
  seg = seg.replace(/<div>\s*<\/div>/g, '').replace(/<\/?div>/g, '\n').replace(/<img[^>]*header_decor[^>]*>|<img[^>]*footer_decor[^>]*>/g, '');
  seg = seg.replace(/<(h\d|p|li|strong|em|a)>\s*<\/\1>/g, '').replace(/\s*\n\s*/g, '\n').replace(/\n{2,}/g, '\n');
  seg = decode(seg).replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n));
  let lines;
  if (slug === 'conquest-pack') {
    // The top of this page is wrapped in link blocks that defeat the parser, so the intro is written by hand
    // (text copied from the original); the downloads / features / mod-support lists below are generated.
    const C = 'https://cdn.prod.website-files.com/5a4a68ddf6b9a40001c2e07e/';
    const intro = [
      `<img src="${C}66f423caadb3d6b594a4d4e7_conquest_page_banner.webp" alt="Conquest_ banner" loading="lazy">`,
      `<p>Make sure to use <a href="https://optifine.net/">Optifine</a> or other mods to provide optifine features with this pack.</p>`,
      `<h2>Join the Conquest community_</h2>`,
      `<p>Conquest is a Medieval inspired resource-pack taking a lot of influences from other packs like "John Smith" and games like "Stronghold". Many builders all around the globe have used Conquest_ to manifest their visions. Follow their footsteps and create worlds to call your own with all the visual fidelity you could ask for!</p>`,
      `<h2>Custom content by the Community_</h2>`,
      `<p>Thanks to the continued dedication of people like you, there are always incredible projects coming forth using Conquest_. You can explore some of them here and send in your own to be displayed along with them in the future.</p>`,
      `<ul><li><a href="https://www.curseforge.com/minecraft/mc-mods/victorymod">victorymod</a> &mdash; Custom Mod for Minecraft 1.15: a mod that introduces new decorational blocks in the Conquest style</li><li><a href="https://www.mediafire.com/file/2omnichdwuzmstd/%2832x%29_Conquest_-_Armor_%26_Weapons.rar/file">1.13+ Conquest weapons</a> &mdash; Addonpack for Minecraft 1.12 (weapons and armor backported)</li><li><a href="https://www.planetminecraft.com/texture_pack/roman-banner-pack/">Roman Banners</a> &mdash; Addonpack for Minecraft 1.8</li><li><a href="https://www.planetminecraft.com/texture-pack/origines-of-rome---conquest-addon-pack-32x32-mc-18/">Origines of Rome</a> &mdash; Addonpack for Minecraft 1.8</li><li><a href="https://www.planetminecraft.com/project/catalne">Catalne</a> &mdash; CustomWorld for Minecraft 1.15</li></ul>`,
      `<h2>What can you expect?</h2>`,
      ...[1, 2, 3, 4, 5, 6].map((n) => `<!--slide${n}-->`),
      `<h2>Get updates early_</h2>`,
      `<p>This pack is still in development, so many textures will be changed and added over time. Through some ad-links and the "Curse reward system", Monsterfish gets some compensation for the time spent on the project and keeping it free for everyone to enjoy.</p>`,
      `<p>An early access feature is offered to everyone supporting the work by donating or becoming a Patreon. So far, the lowest amount to get access to the tool is $5, though this might change in the future.</p>`,
      `<div class="btn-row"><a class="btn" href="https://www.patreon.com/Monsterfish_">Become a Patreon</a></div>`,
    ];
    const from = seg.indexOf('Conquest_ Downloads');
    const tail = from > 0 ? seg.slice(seg.lastIndexOf('<h', from)) : seg;
    const toks = tokens(tail).filter((t) => !(t.k === 'h' && /All Rights Reserved/i.test(t.t)));
    lines = [...intro, ...renderSections(toks)].filter((l) => !/^<!--slide/.test(l));
  } else {
    // one block per line so the Markdown renderer passes them through
    lines = seg.split(/(?<=<\/(?:h\d|p|ul|ol|blockquote)>)|\n/).map((x) => x.trim()).filter(Boolean);
  }
  // the parser leaves headings as loose "h1>Text" fragments in a few places: turn them back into headings
  const body = lines.join('\n\n')
    .replace(/<p>h1>([^<]*)<\/p>\s*<p>\/h1><\/p>/g, '<h2>$1</h2>')
    .replace(/,?\s*h1>([^<]*?),?\s*\/h1>/g, '</li></ul><h2>$1</h2><ul>')
    .replace(/<p>\/?h[1-6]>[^<]*<\/p>/g, '')
    // the mod-support intro got merged into the last "special features" item; split it back out
    .replace(/ &mdash; Thanks to our diligent community members, you can also enjoy plentiful mod-support\., If you cannot find support for the mod you are looking for and are capable of making your own, why not come over to Discord and get it added to the list\?<\/li>/,
      '</li></ul><h2>Mod-support</h2><p>Thanks to our diligent community members, you can also enjoy plentiful mod-support. If you cannot find support for the mod you are looking for and are capable of making your own, why not come over to <a href="https://discord.gg/xWY26r3Zb3">Discord</a> and get it added to the list?</p><ul>')
    // drop the repeated page menu and legal footer that trail the lists
    .replace(/<h2>All Rights Reserved<\/h2>[\s\S]*$/, '')
    .replace(/<ul>\s*<\/ul>/g, '').replace(/<li>\s*<\/li>/g, '')
    // Bedrock page: drop the empty duplicate link, use h2 for section headings, unlink the unported catalog page
    .replace(/<a>To the Marketplace<\/a>/g, '').replace(/<h1>/g, '<h2>').replace(/<\/h1>/g, '</h2>').replace(/<br><\/h2>/g, '</h2>')
    .replace(/<a href="\/catalog">([\s\S]*?)<\/a>/g, '$1').replace(/ click to see\s*(<br>)?\s*<\/p>/, '</p>');
  const out = `---\ntitle: ${title}\ndescription: ${description}\nheading: ${heading}\n---\n\n${body}\n`;
  fs.mkdirSync(path.join(ROOT, 'src/content/pages'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, `src/content/pages/${slug}.md`), out);
  console.log(slug, lines.length + ' blocks', out.length + ' chars');
}
await page('conquest-bedrock', 'Foundations of Conquest_ (Bedrock)', 'Foundations of Conquest_', 'The Conquest_ resource pack for Minecraft Bedrock Edition.');
await page('conquest-pack', 'Conquest_ Resourcepack (Java)', 'Conquest_', 'The original Conquest_ resource pack for Minecraft Java Edition.');
