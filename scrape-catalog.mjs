// One-off helper: turns the cloned /catalog page into data and adds the extra source images supplied by the team.
//   node scrape-catalog.mjs "C:/Users/phil/Downloads/catalog"
//
// Writes src/data/catalog.json (sections + entries), src/content/catalog.shell.html (the page around the lists)
// and copies every used image into src/assets/catalog/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderCatalogItem } from './conquest-render.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC_IMAGES = process.argv[2];
if (!SRC_IMAGES) throw new Error('usage: node scrape-catalog.mjs <folder with the catalog PNGs>');
const body = fs.readFileSync(path.join(ROOT, 'src/clone/catalog.body.html'), 'utf8');
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/clone/catalog.meta.json'), 'utf8'));
const decode = (s) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');

function balanced(html, start) {
  const re = /<(\/?)div\b[^>]*>/g;
  re.lastIndex = start;
  let d = 0, m;
  while ((m = re.exec(html))) { d += m[1] ? -1 : 1; if (!d) return re.lastIndex; }
  return -1;
}

// ---- existing lists
const lists = [];
let shell = '', pos = 0;
const re = /<div role="list" class="catalog w-dyn-items">/g;
let m;
while ((m = re.exec(body))) {
  const start = m.index, end = balanced(body, start);
  const inner = body.slice(start + m[0].length, end - 6);
  const items = [];
  let i = 0;
  while ((i = inner.indexOf('role="listitem"', i)) >= 0) {
    const st = inner.lastIndexOf('<div', i), en = balanced(inner, st);
    const h = inner.slice(st, en);
    const img = (h.match(/<img src="([^"]+)"[^>]*class="base"/) || [])[1];
    items.push({ name: decode((h.match(/class="paragraph-23">([^<]*)</) || [])[1] || ''), file: path.basename(img).replace(/^[0-9a-f]{24}_/, ''), wid: (h.match(/data-w-id="([^"]+)"/) || [])[1] });
    i = en;
  }
  // heading that precedes this list
  const before = body.slice(pos, start);
  const title = (before.match(/<h1[^>]*>([^<]*)<\/h1>(?:(?!<h1)[\s\S])*$/) || [])[1];
  lists.push({ title, wid: items[0].wid, items: items.map(({ name, file }) => ({ name, img: `/assets/catalog/${file}` })) });
  shell += before + m[0] + `<!--LIST ${lists.length - 1}-->`;
  pos = end - 6;
}
shell += body.slice(pos);

// ---- extra images from the supplied folder
const have = new Set(lists.flatMap((l) => l.items.map((i) => path.basename(i.img))));
const all = fs.readdirSync(SRC_IMAGES).filter((f) => f.endsWith('.png'));
const missing = all.filter((f) => !have.has(f));
const SPECIAL = { 'Sandstone.png': 'Sandstone', 'chisled-sandstone.png': 'Chiseled Sandstone', 'whither_rose.png': 'Wither Rose', 'stone_cutter.png': 'Stonecutter', 'red_netherbrick.png': 'Red Nether Bricks', 'block_of_raw_copper.png': 'Block of Raw Copper', 'block_of_raw_gold.png': 'Block of Raw Gold', 'block_of_raw_iron.png': 'Block of Raw Iron', 'candlecake.png': 'Cake with Candle', 'warped_block.png': 'Warped Wart Block', 'wart_block.png': 'Nether Wart Block', 'waterlily.png': 'Lily Pad' };
const nice = (f) => SPECIAL[f] || f.replace(/\.png$/, '').split(/[_-]/).map((w) => (w === 'of' ? 'of' : w[0].toUpperCase() + w.slice(1))).join(' ');
const GROUPS = {
  Wood: ['stripped_crimson_hyphae'],
  Stone: 'chisled-sandstone Sandstone orange_terracotta pink_concrete pink_glazed_terracotta pink_terracotta polished_andesite polished_basalt polished_blackstone_bricks polished_deepslate polished_diorite polished_granite prismarine prismarine_bricks purple_concrete purple_glazed_terracotta purple_terracotta purpur_block purpur_pillar quartz_bricks quartz_pillar_block red_concrete red_glazed_terracotta red_netherbrick red_sandstone red_terracotta redstone_ore reinforced_deepslate smooth_basalt smooth_quartz smooth_quartz_block smooth_red_sandstone smooth_sandstone smooth_stone stone stone_bricks terracotta tuff wart_block warped_block white_concrete white_glazed_terracotta white_terracotta yellow_concrete yellow_glazed_terracotta yellow_terracotta'.split(' '),
  Plants: 'tube_coral tube_coral_block tube_coral_fan twisting_vines vines waterlily weeping_vines wheat white_tulip whither_rose warped_fungus warped_roots'.split(' '),
  Misc: ['wet_sponge', 'candlecake', 'campfire', 'observer', 'repeater'],
  Fabric: ['white_carpet'],
  Metal: 'activator_rail anvil bell blast_furnace block_of_copper block_of_gold block_of_iron block_of_raw_copper block_of_raw_gold block_of_raw_iron cauldron chain chiseled_copper cut_copper detector_rail exposed_copper exposed_cut_copper hopper iron_bars iron_door iron_trapdoor lightning_rod netherite oxidized_copper oxidized_cut_copper powered_rail rail respawn_anchor smithing_table soul_campfire stone_cutter weathered_copper weathered_cut_copper'.split(' '),
};
const place = new Map();
for (const [sec, fs_] of Object.entries(GROUPS)) for (const f of fs_) place.set(f.replace(/\.png$/, '') + '.png', sec);
const unplaced = missing.filter((f) => !place.has(f) && f !== 'andesite.png'); // andesite.png duplicates the existing Andesite (andesirte.png)
console.log('extra images:', missing.length, '| not assigned to a section:', unplaced);
const byTitle = Object.fromEntries(lists.map((l) => [l.title, l]));
// the page's new "Metal" section sits between Misc and Fabric
const metal = { title: 'Metal', wid: byTitle.Wood.wid, items: [] };
lists.splice(lists.indexOf(byTitle.Fabric), 0, metal);
byTitle.Metal = metal;
const names = new Set(lists.flatMap((l) => l.items.map((i) => i.name.toLowerCase())));
for (const f of missing) {
  const sec = place.get(f);
  if (!sec) continue;
  const name = nice(f);
  if (names.has(name.toLowerCase())) { console.log('  skipping duplicate name', name, f); continue; }
  byTitle[sec].items.push({ name, img: `/assets/catalog/${f}` });
}
for (const l of lists) l.items.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

// shell: add the Metal heading + list wrapper in front of the Fabric block
const fabricAt = shell.indexOf('<div class="div-block-13"></div><h1>Fabric</h1>');
const fabricList = lists.indexOf(byTitle.Fabric);
const metalIdx = lists.indexOf(metal);
// renumber: original markers 0..5 (Wood..Misc) and 6 (Fabric); Metal is inserted at index 6, Fabric becomes 7
shell = shell.replace('<!--LIST 6-->', '<!--LIST 7-->');
shell = shell.replace('<div class="div-block-13"></div><h1>Fabric</h1>', `<div class="div-block-13"></div><h1 class="heading-22">Metal</h1><div class="collection-list-wrapper-25 w-dyn-list"><div role="list" class="catalog w-dyn-items"><!--LIST ${metalIdx}--></div></div><div class="div-block-13"></div><h1>Fabric</h1>`);

// copy images
fs.mkdirSync(path.join(ROOT, 'src/assets/catalog'), { recursive: true });
let copied = 0, notFound = [];
for (const l of lists) for (const it of l.items) {
  const f = path.basename(it.img);
  const from = path.join(SRC_IMAGES, f);
  const to = path.join(ROOT, 'src/assets/catalog', f);
  if (fs.existsSync(from)) { fs.copyFileSync(from, to); copied++; }
  else {
    // fall back to the localized Webflow copy
    const alt = fs.readdirSync(path.join(ROOT, 'src/assets')).find((x) => x.endsWith('_' + f));
    if (alt) { fs.copyFileSync(path.join(ROOT, 'src/assets', alt), to); copied++; } else notFound.push(f);
  }
}
console.log('images copied', copied, 'not found', notFound);

fs.mkdirSync(path.join(ROOT, 'src/data'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'src/content'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'src/data/catalog.json'), JSON.stringify({ meta, sections: lists }, null, 1) + '\n');
fs.writeFileSync(path.join(ROOT, 'src/content/catalog.shell.html'), shell);
console.log(lists.map((l) => `${l.title}: ${l.items.length}`).join(', '));
void renderCatalogItem;
