// Renders the pictures for the two showcases on /conquest-bedrock (double slabs, gradient walls) from the
// Conquest Bedrock resource pack into src/assets/bedrock (transparent PNGs, see bedrock-render.mjs) and writes
// src/data/bedrock-showcase.json.
//   node fetch-bedrock-textures.mjs [path to the RP folder]      (or set CONQUEST_RP)
// The lists below are the order shown on the page; the first 6 of each are visible before "Show all".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { texture, renderBlock, renderWall, encodePNG8 } from './bedrock-render.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const RP = process.argv[2] || process.env.CONQUEST_RP || 'G:/arbeit/_Conquest/mcm/GITHUB/Conquest_Medieval/packs/RP';
const OUT_IMG = path.join(ROOT, 'src', 'assets', 'bedrock');
const OUT_DATA = path.join(ROOT, 'src', 'data', 'bedrock-showcase.json');

// Gradients: walls that blend from the first texture (bottom) to the last (top). Built from the averaged colour
// of every texture in the pack: each list is the smoothest path between a start and an end colour, through
// textures of compatible materials (rough stone, masonry, brick, earth, plaster, ice) with 3+ random variants.
// Steps are texture files in textures/blocks (all random variants _1, _2 ... are used too).
// Rules (checked below, a warning is printed otherwise): every step has at least 3 random variants; bottom and
// top differ clearly in colour (CIE Lab distance >= 10); each step is close to the next (distance <= maxStep,
// default 14, or the gradient's own maxStep).
// verified: false shows a "Test" badge on the page until someone has checked in game that they blend like that.
const GRADIENTS = [
  { name: '#1 Moss to grey stone', desc: 'Mossy rubble at the foot, plain grey stone above', steps: ['hardened_clay_stained_green', 'concrete_black', 'smooth_basalt', 'stone'], verified: false },
  { name: '#2 Soot to pale stone', desc: 'Sooty black rubble rising into pale diorite', steps: ['blackstone', 'deepslate/cracked_deepslate_bricks', 'stone_andesite_smooth', 'smooth_basalt', 'stone', 'end_stone', 'stone_diorite'], verified: false },
  { name: '#3 Dark to light masonry', desc: 'Dark deepslate bricks fading to light dressed stone', steps: ['deepslate/deepslate_bricks', 'deepslate/cobbled_deepslate', 'stone_granite', 'stonebrick', 'end_stone_side', 'stone_diorite_smooth'], verified: false },
  { name: '#4 Mossy rubble to limestone', desc: 'Overgrown rubble turning into pale limestone', steps: ['hardened_clay_stained_green', 'concrete_black', 'cobblestone_mossy', 'concrete_green', 'end_stone_side', 'stone_diorite_smooth'], verified: false },
  { name: '#5 Red rock to sandstone', desc: 'Red rubble at the foot, warm sandstone at the top', steps: ['natural_red_sandstone', 'concrete_orange', 'mud_bricks', 'tuff_bricks', 'natural_sandstone'], verified: false },
  { name: '#6 Mossy cobble to sandstone', desc: 'Mossy cobbles giving way to sandstone brick', steps: ['cobblestone_mossy', 'mud_bricks', 'tuff_bricks', 'natural_sandstone'], verified: false },
  { name: '#7 Brick to sandstone', desc: 'Dark brick base under sandstone ashlar', steps: ['nether_brick', 'brick', 'mud_bricks', 'tuff_bricks'], verified: false },
  { name: '#8 Brick to grey stone', desc: 'Brick patching at the foot of a stone brick wall', steps: ['brick', 'stonebrick_cracked', 'stonebrick'], verified: false },
  { name: '#9 Dark rubble to stone brick', desc: 'Black rubble footing under grey stone brick', steps: ['blackstone', 'deepslate/deepslate_bricks', 'deepslate/cobbled_deepslate', 'stone_granite', 'stonebrick'], verified: false },
  { name: '#10 Earth', desc: 'Dark soil to coarse dirt, gravel and stone', steps: ['dirt', 'coarse_dirt', 'gravel', 'stone'], verified: false },
  { name: '#14 Red rubble to cream', desc: 'Red sandstone at the foot, red rubble fading through tuff to cream stone', steps: ['natural_red_sandstone', 'hardened_clay_stained_red', 'hardened_clay', 'tuff', 'hardened_clay_stained_white'], verified: false },
  { name: '#15 Andesite to diorite', desc: 'Dark andesite rising through stone to light diorite', steps: ['stone_andesite', 'smooth_basalt', 'stone', 'end_stone', 'stone_diorite'], verified: false },
];

// id = the double slab block in blocks.json. slab = its slab block in blocks.json, or faces given as texture
// files (for slabs the pack leaves at their vanilla file names). name/desc as on the old page.
const LIST = [
  { id: 'cobblestone_double_slab', slab: 'cobblestone_slab', name: 'Cobblestone', desc: 'Top texture, fan pattern setts' },
  { id: 'oak_double_slab', slab: { all: 'planks_oak' }, name: 'Oak Wood', desc: 'Carved oak wood' },
  { id: 'stone_brick_double_slab', slab: 'stone_brick_slab', name: 'Stone Brick', desc: 'Chiseled stone brick capital' },
  { id: 'brick_double_slab', slab: 'brick_slab', name: 'Brick', desc: 'Mossy brick' },
  { id: 'quartz_double_slab', slab: { side: 'quartz_block_side', up: 'quartz_block_top' }, name: 'Quartz', desc: 'Wattle and daub frame (randomized)' },
  { id: 'dark_oak_double_slab', slab: { all: 'planks_big_oak' }, name: 'Dark Oak Wood', desc: 'Shoji' },
  { id: 'mossy_cobblestone_double_slab', slab: 'mossy_cobblestone_slab', name: 'Mossy Cobblestone', desc: 'Top texture, dirty fan pattern setts' },
  { id: 'spruce_double_slab', slab: { all: 'planks_spruce' }, name: 'Spruce Wood', desc: 'Carved spruce wood' },
  { id: 'birch_double_slab', slab: { all: 'planks_birch' }, name: 'Birch Wood', desc: 'Carved birch wood' },
  { id: 'jungle_double_slab', slab: { all: 'planks_jungle' }, name: 'Jungle Wood', desc: 'Carved jungle wood' },
  { id: 'acacia_double_slab', slab: { all: 'planks_acacia' }, name: 'Acacia Wood', desc: 'Perpendicular acacia planks' },
  { id: 'end_stone_brick_double_slab', slab: 'end_stone_brick_slab', name: 'End Stone Brick', desc: 'Sandstone tudor cross frames (randomized)' },
  { id: 'smooth_quartz_double_slab', slab: { all: 'quartz_block_bottom' }, name: 'Smooth Quartz', desc: 'Wattle and daub frame' },
  { id: 'crimson_double_slab', slab: { all: 'huge_fungus/crimson_planks' }, name: 'Crimson', desc: 'Sandstone tudor frame' },
  { id: 'warped_double_slab', slab: { all: 'huge_fungus/warped_planks' }, name: 'Warped', desc: 'Thatch' },
  { id: 'cut_sandstone_double_slab', slab: { side: 'sandstone_smooth_slab', up: 'sandstone_top' }, name: 'Cut Sandstone', desc: 'Cut sandstone capital' },
  { id: 'smooth_sandstone_double_slab', slab: 'smooth_sandstone_slab', name: 'Smooth Sandstone', desc: 'Mossy smooth sandstone' },
  { id: 'red_sandstone_double_slab', slab: 'red_sandstone_slab', name: 'Red Sandstone', desc: 'Mossy red sandstone' },
  { id: 'smooth_red_sandstone_double_slab', slab: 'smooth_red_sandstone_slab', name: 'Smooth Red Sandstone', desc: 'Mossy smooth red sandstone' },
  { id: 'granite_double_slab', slab: 'granite_slab', name: 'Granite', desc: 'Smooth red granite' },
  { id: 'polished_granite_double_slab', slab: 'polished_granite_slab', name: 'Polished Granite', desc: 'Dark stained polished granite' },
  { id: 'diorite_double_slab', slab: 'diorite_slab', name: 'Diorite', desc: 'Dark weathered diorite' },
  { id: 'polished_diorite_double_slab', slab: 'polished_diorite_slab', name: 'Polished Diorite', desc: 'Weathered polished diorite' },
  { id: 'andesite_double_slab', slab: 'andesite_slab', name: 'Andesite', desc: '' },
  { id: 'polished_andesite_double_slab', slab: 'polished_andesite_slab', name: 'Polished Andesite', desc: 'Cracks between the bricks, made to mix with regular polished andesite' },
  { id: 'normal_stone_double_slab', slab: 'normal_stone_slab', name: 'Stone', desc: 'Smooth stone' },
  { id: 'nether_brick_double_slab', slab: 'nether_brick_slab', name: 'Nether Brick', desc: 'Nether brick pillar' },
  { id: 'red_nether_brick_double_slab', slab: 'red_nether_brick_slab', name: 'Red Nether Brick', desc: 'Dark nether brick column' },
  { id: 'mangrove_double_slab', slab: 'mangrove_slab', name: 'Mangrove Wood', desc: '' },
  { id: 'bamboo_double_slab', slab: { all: 'bamboo_planks' }, name: 'Bamboo', desc: 'Log wall' },
  { id: 'bamboo_mosaic_double_slab', slab: { all: 'bamboo_mosaic' }, name: 'Bamboo Mosaic', desc: 'Stacked firewood' },
  { id: 'double_cut_copper_slab', slab: { all: 'cut_copper' }, name: 'Cut Copper', desc: 'Cross hatched metal plating' },
  { id: 'exposed_double_cut_copper_slab', slab: { all: 'exposed_cut_copper' }, name: 'Exposed Cut Copper', desc: 'Rusty cross hatched metal plating (also weathered and oxidized)' },
];

const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '').replace(/^\s*\/\/.*$/gm, ''));
const blocks = readJSON(path.join(RP, 'blocks.json'));
const terrain = readJSON(path.join(RP, 'textures', 'terrain_texture.json')).texture_data;
const problems = [];
// vanilla terrain keys blocks.json uses that this pack's terrain_texture.json doesn't define -> vanilla file name
const VANILLA = { cut_sandstone_slab_top: 'sandstone_top', smooth_red_sandstone: 'red_sandstone_top' };


const BLOCKS = path.join(RP, 'textures', 'blocks');
// every random variant of a texture file: name.png, name_1.png, name_2.png ... (absolute paths)
function variants(name) {
  const dir = path.join(BLOCKS, path.dirname(name)), base = path.basename(name);
  if (!fs.existsSync(path.join(dir, base + '.png'))) return [];
  const extra = fs.readdirSync(dir).filter((f) => f.startsWith(base + '_') && /^_\d+\.png$/.test(f.slice(base.length)))
    .sort((a, b) => parseInt(a.slice(base.length + 1)) - parseInt(b.slice(base.length + 1)));
  return [path.join(dir, base + '.png'), ...extra.map((f) => path.join(dir, f))];
}
// terrain key (or texture file name) -> every texture it can show in game, as absolute png paths.
// "variations" are the pack's random textures; plain arrays are data values, only the first counts.
function textureFiles(key) {
  let t = terrain[key]?.textures;
  if (Array.isArray(t)) t = t[0];
  if (t && typeof t === 'object' && t.variations) {
    return t.variations.map((v) => path.join(RP, v.path + '.png')).filter((f) => fs.existsSync(f));
  }
  if (t && typeof t === 'object') t = t.path;
  if (t) { const f = path.join(RP, t + '.png'); return fs.existsSync(f) ? [f] : []; }
  return variants(VANILLA[key] || key);
}
// blocks.json textures (string or per-face object) -> { up, down, south, east } texture keys
function facesOf(tex) {
  if (typeof tex === 'string') return { up: tex, down: tex, south: tex, east: tex };
  const side = tex.side || tex.south || tex.north;
  return { up: tex.up || side, down: tex.down || tex.up || side, south: tex.south || side, east: tex.east || side };
}

fs.rmSync(OUT_IMG, { recursive: true, force: true });
fs.mkdirSync(OUT_IMG, { recursive: true });
fs.copyFileSync(path.join(RP, 'pack_icon.png'), path.join(OUT_IMG, 'pack_icon.png')); // download card icon
fs.copyFileSync(path.join(RP, 'textures', 'environment', 'sun.png'), path.join(OUT_IMG, 'sun.png')); // feature tile (skybox)
const copied = new Map();
function copyFile(src) {
  if (!copied.has(src)) {
    const name = path.relative(BLOCKS, src).replace(/[\\/]/g, '__');
    copied.set(src, name);
    fs.copyFileSync(src, path.join(OUT_IMG, name));
  }
  return `/assets/bedrock/${copied.get(src)}`;
}
// a few plain textures the page uses as small icons (feature cards)
for (const t of ['stonebrick', 'cobblestone_double_slab_top', 'planks_oak_double_slab', 'tuff_bricks']) copyFile(path.join(BLOCKS, t + '.png'));

// ---- rendering: every block and wall becomes one transparent PNG (palette PNG, see bedrock-render.mjs) ----
// SCALE = output pixels per CSS pixel; 1.25 stays sharp on most high-DPI screens at a fraction of 2x's size.
const SCALE = 1.25, BLOCK = 92, CELL = 24, FRAMES = 3, COLORS = +(process.env.BEDROCK_COLORS || 128); // palette size; 128 looks the same as 256 here
let rendered = 0, bytes = 0;
function save(name, im) {
  const buf = encodePNG8(im.w, im.h, im.rgba, COLORS);
  fs.writeFileSync(path.join(OUT_IMG, name), buf);
  rendered++; bytes += buf.length;
  return { src: `/assets/bedrock/${name}`, w: +(im.w / SCALE).toFixed(1), h: +(im.h / SCALE).toFixed(1) };
}
// pictures side by side in cells as big as the largest one (cells marked bottom: true sit at the cell's bottom)
function strip(ims) {
  const cw = Math.max(...ims.map((m) => m.w)), ch = Math.max(...ims.map((m) => m.h)), W2 = cw * ims.length;
  const rgba = Buffer.alloc(W2 * ch * 4);
  ims.forEach((m, i) => {
    const ox = i * cw + Math.floor((cw - m.w) / 2), oy = m.bottom ? ch - m.h : Math.floor((ch - m.h) / 2);
    for (let y = 0; y < m.h; y++) m.rgba.copy(rgba, ((oy + y) * W2 + ox) * 4, y * m.w * 4, (y + 1) * m.w * 4);
  });
  return { w: W2, h: ch, rgba };
}
// each face -> every texture it can show (more than one = random textures)
function resolve(faces, label) {
  const out = {};
  for (const side of ['up', 'south', 'east']) {
    out[side] = textureFiles(faces[side]);
    if (!out[side].length) { problems.push(`${label}: texture "${faces[side]}" not found`); return null; }
  }
  return out;
}
const pickFaces = (f, i) => ({ up: f.up[i % f.up.length], south: f.south[i % f.south.length], east: f.east[i % f.east.length] });

const out = [];
for (const e of LIST) {
  const db = blocks[e.id];
  if (!db) { problems.push(`${e.id}: not in blocks.json`); continue; }
  let slabFaces;
  if (typeof e.slab === 'string') {
    if (!blocks[e.slab]) { problems.push(`${e.id}: slab ${e.slab} not in blocks.json`); continue; }
    slabFaces = facesOf(blocks[e.slab].textures);
  } else {
    const s = e.slab;
    slabFaces = { up: s.up || s.all, down: s.up || s.all, south: s.side || s.all, east: s.side || s.all };
  }
  const slab = resolve(slabFaces, `${e.id} slab`), double = resolve(facesOf(db.textures), e.id);
  if (!slab || !double) continue;
  // one strip per card: [slab, double slab frame 1, frame 2, ...]. The slab keeps its first textures; the double
  // slab gets up to FRAMES frames stepping through its random textures, which the page fades between every
  // 2 seconds. One strip (one shared palette) is far smaller than separate pictures.
  const n = Math.min(FRAMES, Math.max(double.up.length, double.south.length, double.east.length));
  const frames = Array.from({ length: n }, (_, i) => renderBlock(pickFaces(double, i), { s: BLOCK * SCALE }));
  const slabIm = renderBlock(pickFaces(slab, 0), { slab: true, s: BLOCK * SCALE });
  const img = save(`ds-${e.id}.png`, strip([{ ...slabIm, bottom: true }, ...frames]));
  out.push({ id: e.id, name: e.name, desc: e.desc, img: { src: img.src, w: +(img.w / (n + 1)).toFixed(1), h: img.h, cells: n + 1 } });
}

// block name for a texture file, looked up in the pack: texture -> terrain keys -> blocks using them.
// Prefers the double slab when the texture is a double slab texture, then a full block, then the key name.
const keysOf = {};
for (const [k, v] of Object.entries(terrain)) {
  const add = (x) => { const p = typeof x === 'string' ? x : x?.path; if (p) (keysOf[p.replace('textures/blocks/', '')] ||= []).push(k); else x?.variations?.forEach(add); };
  [].concat(v.textures).forEach(add);
}
const blocksUsing = (k) => Object.entries(blocks).filter(([, v]) => v.textures === k || (v.textures && typeof v.textures === 'object' && Object.values(v.textures).includes(k))).map(([b]) => b);
const NAME_FIX = { brick_block: 'Bricks', copper_block: 'Block of Copper', nether_brick: 'Nether Bricks', normal_stone_double_slab: 'Stone Double Slab', end_stone_side: 'End Stone', hardened_clay: 'Terracotta', flattened_dirt: 'Dirt' };
const title = (id) => NAME_FIX[id] || id
  .replace(/^wool_colored_(\w+)$/, (m, c) => `${c === 'silver' ? 'light_gray' : c}_wool`) // wool texture keys -> block names
  .replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
function blockName(file) {
  const keys = keysOf[file] || [];
  const ds = keys.find((k) => /doubleslab/.test(k));
  if (ds) { const b = blocksUsing(ds).find((id) => /double/.test(id)); if (b) return title(b); }
  const k = keys[0];
  if (!k) return title(path.basename(file));
  const ids = blocksUsing(k);
  const exact = ids.find((b) => b === k || b === k + 's' || b === k + '_block');
  if (exact || NAME_FIX[k]) return title(exact || k);
  const full = ids.find((b) => !/_(slab|wall|stairs)$/.test(b));
  return title(/^flattened_/.test(k) || /_(mossy|top)$/.test(k) ? full || k : k);
}

// ---- gradient checks: average colour of a texture (all its variants) in CIE Lab ----
function labOf(files) {
  const lab = files.map((file) => {
    const im = texture(file);
    let r = 0, g = 0, b = 0; const n = im.w * im.h;
    for (let i = 0; i < im.px.length; i += 4) { r += im.px[i]; g += im.px[i + 1]; b += im.px[i + 2]; }
    const lin = (c) => { c /= 255 * n; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92; };
    const R = lin(r), G = lin(g), B = lin(b), f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const X = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047), Y = f(R * 0.2126 + G * 0.7152 + B * 0.0722), Z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
    return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
  });
  return [0, 1, 2].map((i) => lab.reduce((s, v) => s + v[i], 0) / lab.length);
}
const MIN_VARIANTS = 3, MIN_CONTRAST = 10, MAX_STEP = 14;
// blocks a player can't normally get in survival never go into a gradient
const UNOBTAINABLE = /structure|command|jigsaw|barrier|infested|spawner|vault|trial|bedrock|reinforced|budding|petrified|light_block|border|build_(allow|deny)|portal|end_gateway|frosted_ice/;

// ---- gradient walls (9 wide, 10 high, 1 deep), laid out the way the Conquest gradient guide (/guides/gradients)
// describes a 'drip' gradient: materials follow each other in order (one never touches the material two steps
// away), each border runs as a ragged line that wanders up and down a block at a time with the odd block
// dripping further down, and there is no random splatter. An optional cap texture fills the top row. Every
// block picks one of the texture's random variants, never the same one as the block to its left or above. ----
const W = 9, H = 10, D = 1;
const rand = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
function layoutWall(g, texOf) {
  const seed = [...g.name].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7), r = rand(seed);
  const n = g.steps.length, C = W + D; // front face and side face unrolled into one grid, so the corner joins up
  const Hs = g.cap ? H - 1 : H, band = Hs / n, minBand = band >= 2.5 ? 2 : 1, A = Math.max(1, Math.floor(band / 2));
  const border = [];
  for (let k = 1; k < n; k++) {
    let o = Math.round((r() * 2 - 1) * A);
    border[k] = Array.from({ length: C }, (_, x) => {
      if (x) o = Math.max(-A, Math.min(A, o + [-1, 0, 0, 1][Math.floor(r() * 4)]));
      const drip = r() < 0.22 ? 1 : 0;
      return Math.max(1, Math.min(Hs - 1, Math.round(k * band + o) - drip));
    });
  }
  for (let k = 2; k < n; k++) for (let x = 0; x < C; x++) border[k][x] = Math.min(Hs - 1, Math.max(border[k][x], border[k - 1][x] + minBand));
  const CAP = -1, idx = Array.from({ length: H }, (_, y) => Array.from({ length: C }, (_, x) => {
    if (y >= Hs) return CAP;
    let m = 0; for (let k = 1; k < n; k++) if (y >= border[k][x]) m = k;
    return m;
  }));
  for (let y = 0; y < Hs; y++) for (let x = 1; x < C; x++) { const d = idx[y][x] - idx[y][x - 1]; if (Math.abs(d) > 1) idx[y][x] = idx[y][x - 1] + Math.sign(d); }
  const pick = (vars, avoid) => { const free = vars.filter((v) => !avoid.includes(v)); const from = free.length ? free : vars; return from[Math.floor(r() * from.length)]; };
  const cell = Array.from({ length: H }, () => new Array(C));
  for (let y = H - 1; y >= 0; y--) for (let x = 0; x < C; x++) cell[y][x] = pick(texOf(idx[y][x]), [x > 0 && cell[y][x - 1], y < H - 1 && cell[y + 1][x]]);
  let prev = null;
  const top = Array.from({ length: W }, (_, x) => (prev = pick(texOf(idx[H - 1][x]), [cell[H - 1][x], prev])));
  return { cell: (x, y) => cell[y][x], top: (x) => top[x] };
}

const gradients = [];
for (const [gi, g] of GRADIENTS.entries()) {
  const bad = [...g.steps, g.cap || ''].filter((s) => UNOBTAINABLE.test(s));
  if (bad.length) { problems.push(`gradient ${g.name}: ${bad.join(', ')} can't be obtained in survival, left out`); continue; }
  const files = g.steps.map(variants), capFiles = g.cap ? variants(g.cap) : null;
  const missing = g.steps.filter((s, i) => !files[i].length);
  if (missing.length || (g.cap && !capFiles.length)) { problems.push(`gradient ${g.name}: ${[...missing, ...(g.cap && !capFiles.length ? [g.cap] : [])].join(', ')} not found`); continue; }
  if (!g.ref) {
    const few = g.steps.filter((s, i) => files[i].length < MIN_VARIANTS);
    if (few.length) problems.push(`gradient ${g.name}: ${few.join(', ')} has fewer than ${MIN_VARIANTS} random variants (the wall will show repeats)`);
    const labs = files.map(labOf), [a, b] = [labs[0], labs.at(-1)];
    const contrast = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    labs.slice(1).forEach((l, i) => { const d = Math.hypot(...l.map((v, j) => v - labs[i][j])); if (d > (g.maxStep || MAX_STEP)) problems.push(`gradient ${g.name}: ${g.steps[i]} -> ${g.steps[i + 1]} is too big a jump (${d.toFixed(1)}, want <= ${g.maxStep || MAX_STEP})`); });
    if (contrast < MIN_CONTRAST) problems.push(`gradient ${g.name}: bottom and top look too alike (contrast ${contrast.toFixed(1)}, want ${MIN_CONTRAST}+)`);
  }
  const lay = layoutWall(g, (m) => (m === -1 ? capFiles : files[m]));
  const img = save(`gradient-${gi + 1}.png`, renderWall({ W, H, D, c: CELL * SCALE, cell: lay.cell, top: lay.top }));
  const steps = g.steps.map((s, i) => ({ name: blockName(s), icon: copyFile(files[i][0]) }));
  if (g.cap) steps.push({ name: blockName(g.cap), icon: copyFile(capFiles[0]) });
  gradients.push({ name: g.name, desc: g.desc, verified: g.verified, img, steps });
}

fs.writeFileSync(OUT_DATA, JSON.stringify({ doubleSlabs: out, gradients }, null, 1) + '\n');
const total = fs.readdirSync(OUT_IMG).reduce((s, f) => s + fs.statSync(path.join(OUT_IMG, f)).size, 0);
console.log(`${out.length} double slabs, ${gradients.length} gradients: ${rendered} pictures rendered (${(bytes / 1048576).toFixed(2)} MB), ${copied.size} icon textures; src/assets/bedrock is ${(total / 1048576).toFixed(2)} MB`);
for (const p of problems) console.warn('  ! ' + p);
