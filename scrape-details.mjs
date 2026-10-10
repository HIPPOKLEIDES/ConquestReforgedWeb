// One-off helper: copies the detail pages (showcases, servers, creators) from the live Webflow site
// into src/content/showcase/*.md, src/content/servers/*.md and src/data/youtubers.json.
//
//   node scrape-details.mjs        (needs internet; safe to re-run, overwrites those files)
//   node fetch-assets.mjs          (afterwards: downloads the images these pages reference)
//   node build.mjs
//
// Only needed while the old Webflow site is still online.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const BASE = 'https://www.conquestreforged.com';

const get = async (p) => {
  const r = await fetch(BASE + p);
  if (!r.ok) throw new Error(`${p}: ${r.status}`);
  return r.text();
};
const readJSON = (...p) => JSON.parse(fs.readFileSync(path.join(SRC, ...p), 'utf8'));
const write = (rel, text) => {
  const f = path.join(SRC, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
};

// content between the header decor and the footer decor = the page's own content
function region(html, keepScripts = false) {
  const b = html.slice(html.indexOf('<body'));
  const i = b.indexOf('header_decor');
  const j = b.indexOf('footer_decor');
  const r = b.slice(i, j > i ? j : undefined);
  return keepScripts ? r : r.replace(/<script[\s\S]*?<\/script>/g, '');
}
// a balanced <div ...> block starting at the first occurrence of `marker`
function block(html, marker) {
  const at = html.indexOf(marker);
  if (at < 0) return '';
  const start = html.lastIndexOf('<div', at);
  const re = /<(\/?)div\b[^>]*>/g;
  re.lastIndex = start;
  let depth = 0, m;
  while ((m = re.exec(html))) {
    depth += m[1] ? -1 : 1;
    if (!depth) return html.slice(start, re.lastIndex);
  }
  return '';
}
const decode = (s) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
const strip = (s) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const richInner = (div) => div.replace(/^<div[^>]*>/, '').replace(/<\/div>$/, '').trim();
const cleanRich = (h) =>
  h.replace(/‍/g, '').replace(/<(\/?)figure[^>]*>/g, '').replace(/<figcaption[\s\S]*?<\/figcaption>/g, '')
    .replace(/ (?:class|style|id|data-[\w-]+)="[^"]*"/g, '').replace(/<p>\s*<\/p>/g, '')
    .replace(/https?:\/\/(?:www\.)?conquestreforged\.com\//g, '/');
const ytId = (h) => [...h.matchAll(/youtube\.com%2Fembed%2F([\w-]+)/g)].map((m) => m[1]);

// ---------- showcases ----------
const showcases = readJSON('data', 'showcases.json');
for (const it of showcases) {
  try {
    const raw = await get(`/showcase/${it.slug}`);
    const reg = region(raw);
    const images = [...new Set([...region(raw, true).matchAll(/"url":\s*"(https:\/\/cdn\.prod\.website-files\.com\/[^"]+)"/g)].map((m) => m[1]))];
    const rich = cleanRich(richInner(block(reg, 'w-richtext')));
    const vids = ytId(reg);
    const parts = [];
    for (const v of vids) parts.push(`::youtube[${v}]`);
    for (const u of images) parts.push(`<p><img src="${u}" alt="${it.title.replace(/"/g, '&quot;')}" loading="lazy"></p>`);
    if (rich) parts.push(...rich.split(/(?<=<\/(?:p|h\d|ul|ol|blockquote)>)/).map((s) => s.trim()).filter(Boolean));
    write(`content/showcase/${it.slug}.md`, `---\ntitle: ${it.title}\n---\n\n${parts.join('\n\n')}\n`);
    console.log('showcase', it.slug, images.length + ' images', vids.length + ' videos', rich.length + ' chars');
  } catch (e) { console.warn('showcase FAILED', it.slug, e.message); }
}

// ---------- servers ----------
const servers = readJSON('data', 'servers.json');
const hostLabel = (u) => {
  const h = new URL(u).hostname.replace(/^www\./, '');
  if (/discord/.test(h)) return 'Discord';
  if (/twitter|x\.com/.test(h)) return 'Twitter';
  if (/planetminecraft/.test(h)) return 'Planet Minecraft';
  if (/modrinth/.test(h)) return 'Modrinth';
  if (/youtube/.test(h)) return 'YouTube';
  return h;
};
for (const s of servers) {
  try {
    const reg = region(await get(`/servers/${s.slug}`));
    const rich = cleanRich(richInner(block(reg, 'w-richtext')));
    const ip = strip((reg.match(/class="heading ip link">([^<]*)</) || [])[1] || '');
    const logo = (reg.match(/background-image:url\(&quot;(https:\/\/cdn\.prod\.website-files\.com\/[^&]+)&quot;\)/) || reg.match(/<img[^>]+src="(https:\/\/cdn\.prod\.website-files\.com\/[^"]+)"/) || [])[1] || '';
    const links = [...new Set([...reg.matchAll(/<a [^>]*href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]))]
      .filter((u) => !/conquestreforged\.com|reddit\.com\/r\/ConquestReforged|patreon\.com\/ConquestReforged/i.test(u));
    const meta = [`title: ${s.name}`, ip && `ip: ${ip}`, logo && `logo: ${logo}`, `links: ${links.map((u) => `${hostLabel(u)}|${u}`).join(' ;; ')}`].filter(Boolean).join('\n');
    write(`content/servers/${s.slug}.md`, `---\n${meta}\n---\n\n${rich.split(/(?<=<\/(?:p|h\d|ul|ol)>)/).map((x) => x.trim()).filter(Boolean).join('\n\n')}\n`);
    console.log('server', s.slug, ip, links.length + ' links', rich.length + ' chars');
  } catch (e) { console.warn('server FAILED', s.slug, e.message); }
}

// ---------- creators ----------
const slugify = (n) => n.toLowerCase().replace(/_/g, '-').replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
const creators = readJSON('data', 'youtubers.json');
const list = await get('/serverslist/youtube-channels');
const known = new Set([...list.matchAll(/href="\/youtube-channels\/([^"]+)"/g)].map((m) => m[1]));
for (const c of creators) {
  c.slug = c.slug || (known.has(slugify(c.name)) ? slugify(c.name) : [...known].find((k) => k.replace(/-/g, '') === slugify(c.name).replace(/-/g, '')) || slugify(c.name));
  try {
    const reg = region(await get(`/youtube-channels/${c.slug}`));
    const twitchChan = (reg.match(/twitch\.tv%2F([\w]+)/) || [])[1];
    if (twitchChan) c.twitchChannel = twitchChan;
    console.log('creator', c.slug, twitchChan || '');
  } catch (e) { console.warn('creator FAILED', c.slug, e.message); }
}
write('data/youtubers.json', JSON.stringify(creators, null, 2) + '\n');
console.log('done');
