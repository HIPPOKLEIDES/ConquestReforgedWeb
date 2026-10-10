// Copies the two pack pages (/conquest-pack, /conquest-bedrock) from the live Webflow site as faithful clones:
// original markup + Webflow's own stylesheet and scripts, stored locally in src/clone/.
//   node clone-packs.mjs && node fetch-assets.mjs && node build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'src', 'clone');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'https://www.conquestreforged.com';
const text = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(u + ' ' + r.status); return r.text(); };
let css = '';
const scripts = new Map();
const queue = ['conquest-pack', 'conquest-bedrock'];
const seen = new Set(queue);
for (let qi = 0; qi < queue.length; qi++) {
  const route = queue[qi];
  const slug = route.replace(/\//g, '__');
  let h = await text(`${BASE}/${route}`);
  for (const m of h.matchAll(/href="\/((?:conquest|biomespecific-blocks|biomespecifics-1-18)\/[\w-]+|catalog)"/g)) if (!seen.has(m[1])) { seen.add(m[1]); queue.push(m[1]); }
  // images whose file names contain parentheses: download them under safe names
  for (const m of [...h.matchAll(/https:\/\/cdn\.prod\.website-files\.com\/[^"\s,]*\([^"\s,]*/g)]) {
    const u = m[0]; if (!h.includes(u)) continue;
    const safe = '/assets/' + decodeURIComponent(u).split('/').pop().replace(/[^\w.\-]+/g, '_');
    const dest = path.join(ROOT, 'src', safe);
    if (!fs.existsSync(dest)) { const r = await fetch(u); if (r.ok) fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer())); else { console.warn('img', r.status, u); continue; } }
    h = h.split(u).join(safe);
  }
  const cssUrl = h.match(/href="(https:\/\/cdn\.prod\.website-files\.com[^"]+\.css)"/)[1];
  if (!css) css = await text(cssUrl);
  // local copies of the scripts the page uses (webflow runtime + slider plugin)
  for (const m of h.matchAll(/<script[^>]+src="([^"]+)"/g)) {
    const u = m[1];
    if (/googletag|^\/|avljl|cloudfront|code\.jquery|cdnjs|website-files/.test(u) && !/gtm|\/avljl/.test(u)) {
      if (!scripts.has(u)) scripts.set(u, 'wf-' + scripts.size + '.js');
    }
  }
  const head = h.slice(0, h.indexOf('<body'));
  let body = h.slice(h.indexOf('<body'));
  body = body.replace(/<noscript>[\s\S]*?<\/noscript>/g, '');
  fs.writeFileSync(path.join(OUT, slug + '.body.html'), body);
  fs.writeFileSync(path.join(OUT, slug + '.meta.json'), JSON.stringify({
    title: (head.match(/<title>([^<]*)/) || [])[1] || slug,
    description: (head.match(/name="description"/) ? head.match(/<meta content="([^"]*)" name="description"/) : [])?.[1] || '',
    wfPage: (head.match(/data-wf-page="([^"]+)"/) || [])[1],
    wfSite: (head.match(/data-wf-site="([^"]+)"/) || [])[1],
  }, null, 1));
}
fs.writeFileSync(path.join(OUT, 'webflow.css'), css);
const map = {};
for (const [u, name] of scripts) {
  try { fs.writeFileSync(path.join(OUT, name), await text(u.startsWith('http') ? u : BASE + u)); map[u] = name; } catch (e) { console.warn('skip', u, e.message); }
}
fs.writeFileSync(path.join(OUT, 'scripts.json'), JSON.stringify(map, null, 1));
console.log('cloned', queue.length, 'pages', Object.keys(map));
