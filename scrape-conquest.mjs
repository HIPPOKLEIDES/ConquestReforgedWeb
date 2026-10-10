// One-off helper: turns the cloned "Custom ..." pages (src/clone/conquest__conquest-custom*.body.html) into data:
//   src/data/conquest/<page>.json         the entries (edit this to add/remove items)
//   src/content/conquest/<page>.shell.html the page around the lists (intro text, links), with <!--LIST n--> markers
// build.mjs renders them back into exactly the same markup (see renderConquestItem).
//
//   node scrape-conquest.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderConquestItem } from './conquest-render.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CLONE = path.join(ROOT, 'src', 'clone');
const PAGES = ['customarmors', 'customelytras', 'customheads', 'customitems', 'custommobs', 'custompaintings', 'customshields'];

const decode = (s) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');

function balanced(html, start) { // html[start] begins a <div ...>
  const re = /<(\/?)div\b[^>]*>/g;
  re.lastIndex = start;
  let d = 0, m;
  while ((m = re.exec(html))) {
    d += m[1] ? -1 : 1;
    if (!d) return re.lastIndex;
  }
  return -1;
}
// what matters visually: ignore srcset/sizes, empty "bind-empty" placeholder elements, whitespace, unsupported attributes
const norm = (h) => h
  .replace(/ (?:srcset|sizes|image-rendering|pointer-events)="[^"]*"/g, '')
  .replace(/<(a|div)[^>]*w-dyn-bind-empty[^>]*><\/\1>/g, '')
  .replace(/<div class="div-block-231"><\/div>/g, '')
  .replace(/<img([^>]*?)\/?>/g, (m, a) => '<img' + [...a.matchAll(/(\w[\w-]*)="([^"]*)"/g)].map((x) => `${x[1]}="${x[2]}"`).sort().join(' ').replace(/^/, ' ') + '>')
  .replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');

let problems = 0;
for (const page of PAGES) {
  const file = path.join(CLONE, `conquest__conquest-${page}.body.html`);
  if (!fs.existsSync(file)) { console.warn('missing', file); continue; }
  const meta = JSON.parse(fs.readFileSync(path.join(CLONE, `conquest__conquest-${page}.meta.json`), 'utf8'));
  let body = fs.readFileSync(file, 'utf8');
  const lists = [];
  let shell = '';
  let pos = 0;
  const re = /<div role="list" class="([^"]*?)\s*w-dyn-items">/g;
  let m;
  while ((m = re.exec(body))) {
    const start = m.index;
    const end = balanced(body, start);
    const inner = body.slice(start + m[0].length, end - '</div>'.length);
    // items
    const items = [];
    let i = 0;
    while ((i = inner.indexOf('role="listitem"', i)) >= 0) {
      const st = inner.lastIndexOf('<div', i);
      const en = balanced(inner, st);
      items.push(inner.slice(st, en));
      i = en;
    }
    const first = items[0];
    const g = (s, r) => (s.match(r) || [])[1];
    const cfg = {
      listClass: m[1].trim(),
      frame: g(first, /class="([^"]*?) w-dyn-item"/),
      inner: g(first, /<div class="itembackdrop"><div class="([^"]+)"/),
      b215: /class="div-block-215"/.test(first),
      grad: /class="div-block-47"/.test(first),
      preview: g(first, /<div[^>]*?class="([^"]+)"><img/),
      img: g(first, /<img[^>]*class="([^"]+)"/),
      nameTag: /<div class="heading-4-copy">/.test(first) ? 'div' : 'a',
      notes: /div-block-242/.test(first) ? 'mob' : /text-block-11/.test(first) ? 'single' : 'none',
      cmd: /commandbox/.test(first),
    };
    const data = items.map((h) => {
      const it = {
        img: g(h, /<img[^>]*?src="([^"]+)"/),
        name: decode(g(h, /class="div-block-230"><(?:a [^>]*|div )class="heading-4-copy">([^<]*)</) || ''),
      };
      const alias = g(h, /<div class="div-block-231"><a[^>]*class="heading-4-copy">([^<]+)</);
      if (alias) it.alias = decode(alias);
      const note = g(h, /class="text-block-11">([^<]*)</);
      if (note) it.note = decode(note);
      const note2 = g(h, /class="text-block-11-copy">([^<]+)</);
      if (note2) it.note2 = decode(note2);
      const cmd = g(h, /class="commandbox">([^<]*)</);
      if (cmd) it.cmd = decode(cmd);
      return it;
    });
    // verify: rendering the data gives back the original markup
    let bad = 0;
    data.forEach((it, k) => {
      if (norm(renderConquestItem(it, cfg)) !== norm(items[k])) {
        if (bad++ < 2) console.warn(`  mismatch in ${page} list ${lists.length} item ${k} (${it.name})\n   want ${norm(items[k]).slice(300, 1100)}\n   got  ${norm(renderConquestItem(it, cfg)).slice(300, 1100)}`);
      }
    });
    problems += bad;
    console.log(page, 'list', lists.length, data.length, 'items', bad ? `${bad} MISMATCHES` : 'ok');
    lists.push({ cfg, items: data });
    shell += body.slice(pos, start + m[0].length) + `<!--LIST ${lists.length - 1}-->`;
    pos = end - '</div>'.length;
  }
  shell += body.slice(pos);
  fs.mkdirSync(path.join(ROOT, 'src', 'data', 'conquest'), { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'src', 'content', 'conquest'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'src', 'data', 'conquest', `${page}.json`), JSON.stringify({ meta, lists }, null, 1) + '\n');
  fs.writeFileSync(path.join(ROOT, 'src', 'content', 'conquest', `${page}.shell.html`), shell);
}
console.log(problems ? `${problems} items differ` : 'all items round-trip');
