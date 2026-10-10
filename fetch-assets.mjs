// Downloads every image/font/video the site still hotlinks from Webflow's CDN (and imgur)
// into src/assets and rewrites the references, so the site no longer depends on Webflow.
//
//   node fetch-assets.mjs        (run on a computer with normal internet access)
//   node build.mjs               (rebuild afterwards)
//
// Safe to re-run: already-downloaded files are skipped.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const ASSETS = path.join(SRC, 'assets');
fs.mkdirSync(ASSETS, { recursive: true });

const URL_RE = /https?:\/\/(?:cdn\.prod\.website-files\.com|i\.imgur\.com)\/[^\s"'()<>\\]+/g;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (p !== ASSETS) walk(p, out); }
    else if (/\.(json|md|css|mjs|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(SRC);
const urls = new Set();
for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(URL_RE)) urls.add(m[0]);

const taken = new Map(); // local name -> url
const mapping = new Map(); // url -> /assets/name
for (const u of urls) {
  const decoded = decodeURIComponent(u);
  let name = decoded.split('?')[0].split('/').pop().replace(/[^\w.\-]+/g, '_');
  if (taken.has(name) && taken.get(name) !== u) name = `${mapping.size}_${name}`;
  taken.set(name, u);
  mapping.set(u, '/assets/' + name);
}

let ok = 0, failed = [];
for (const [u, local] of mapping) {
  const dest = path.join(SRC, local);
  if (fs.existsSync(dest)) { ok++; continue; }
  try {
    const res = await fetch(u);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    ok++;
    console.log('downloaded', local);
  } catch (e) {
    failed.push(`${u} (${e.message})`);
  }
}

// Rewrite references only for files that actually downloaded.
let rewritten = 0;
for (const f of files) {
  let text = fs.readFileSync(f, 'utf8'), changed = false;
  for (const [u, local] of mapping) {
    if (text.includes(u) && fs.existsSync(path.join(SRC, local))) { text = text.split(u).join(local); changed = true; }
  }
  if (changed) { fs.writeFileSync(f, text); rewritten++; }
}

console.log(`\n${ok}/${mapping.size} assets present, ${rewritten} source files updated.`);
if (failed.length) { console.log('Failed:\n  ' + failed.join('\n  ')); process.exitCode = 1; }
