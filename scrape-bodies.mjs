// One-off helper: replaces the body of every news post and guide with the original rich-text HTML from the live
// Webflow site (keeps the front matter), so headings, figures and embeds render exactly like the original.
//
//   node scrape-bodies.mjs && node fetch-assets.mjs && node build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'https://www.conquestreforged.com';

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
const inner = (div) => div.replace(/^<div[^>]*>/, '').replace(/<\/div>$/, '').trim();
const clean = (h) => h
  .replace(/https?:\/\/(?:www\.)?conquestreforged\.com\//g, '/')
  .replace(/youtube\.com\/embed/g, 'youtube-nocookie.com/embed')
  .replace(/<iframe([^>]*?) title="[^"]*"/g, '<iframe$1')
  .replace(/\n\s*\n/g, '\n');

async function run(dir, marker, urlPrefix) {
  const d = path.join(ROOT, 'src', 'content', dir);
  for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.md'))) {
    const slug = f.replace(/\.md$/, '');
    const res = await fetch(`${BASE}/${urlPrefix}/${slug}`);
    if (!res.ok) { console.warn(dir, slug, 'HTTP', res.status); continue; }
    const html = await res.text();
    const body = inner(block(html, marker));
    if (!body) { console.warn(dir, slug, 'no body found'); continue; }
    const text = fs.readFileSync(path.join(d, f), 'utf8').replace(/\r/g, '');
    const m = text.match(/^---\n[\s\S]*?\n---\n/);
    fs.writeFileSync(path.join(d, f), (m ? m[0] : '') + '\n' + clean(body) + '\n');
    console.log(dir, slug, body.length);
  }
}
await run('news', 'rich-text-block-10', 'news');
await run('guides', 'rich-text-block-13-copy', 'guides');
