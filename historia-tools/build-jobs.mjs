// Builds render job lists for render.html from the pack files.
//   node historia-tools/build-jobs.mjs mobs|doubleslabs|blocks|textures
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACK = process.env.HISTORIA_PACK || 'E:/Archive/Minecraft/Bedrock/Greco-Roman pack/mcm_packaged/HistoriaRome/Content';
const RP = path.join(PACK, 'resource_packs/RP_hrmn');
const RPW = path.join(PACK, 'world_template/resource_packs/RP_hrmn_w');
const BP = path.join(PACK, 'world_template/behavior_packs/BP_hrmn_w');
const stripComments = (s) => s.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str || '');
const readJSON = (f) => JSON.parse(stripComments(fs.readFileSync(f, 'utf8')).replace(/,\s*([}\]])/g, '$1'));
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (e.name.endsWith('.json')) out.push(p);
  }
  return out;
};
// geometry id -> file (relative to pack root)
function geoIndex(root) {
  const idx = {};
  for (const f of walk(path.join(root, 'models'))) {
    let j;
    try { j = readJSON(f); } catch { continue; }
    const rel = path.relative(root, f).split(path.sep).join('/');
    for (const g of j['minecraft:geometry'] || []) idx[g.description.identifier.split(':')[0]] = rel;
    for (const k of Object.keys(j)) if (k.startsWith('geometry.')) idx[k.split(':')[0]] = rel;
  }
  return idx;
}
const first = (v) => (Array.isArray(v) ? v[0] : v);

// ---- multiblocks (mirrors BP scripts/blocks/MultiBlock.js and PlaceCrane.js for a player facing north)
// minimal little-endian NBT reader for .mcstructure files
function readNBT(buf) {
  let o = 0;
  const str = () => { const n = buf.readUInt16LE(o); o += 2; const s = buf.toString('utf8', o, o + n); o += n; return s; };
  const payload = (t) => {
    switch (t) {
      case 1: return buf.readInt8(o++);
      case 2: { const v = buf.readInt16LE(o); o += 2; return v; }
      case 3: { const v = buf.readInt32LE(o); o += 4; return v; }
      case 4: { const v = buf.readBigInt64LE(o); o += 8; return Number(v); }
      case 5: { const v = buf.readFloatLE(o); o += 4; return v; }
      case 6: { const v = buf.readDoubleLE(o); o += 8; return v; }
      case 7: { const n = buf.readInt32LE(o); o += 4; const v = buf.subarray(o, o + n); o += n; return v; }
      case 8: return str();
      case 9: { const et = buf.readInt8(o++); const n = buf.readInt32LE(o); o += 4; const a = []; for (let i = 0; i < n; i++) a.push(payload(et)); return a; }
      case 10: { const c = {}; for (;;) { const tt = buf.readInt8(o++); if (tt === 0) break; const k = str(); c[k] = payload(tt); } return c; }
      case 11: { const n = buf.readInt32LE(o); o += 4; const a = []; for (let i = 0; i < n; i++) { a.push(buf.readInt32LE(o)); o += 4; } return a; }
      case 12: { const n = buf.readInt32LE(o); o += 4; const a = []; for (let i = 0; i < n; i++) { a.push(Number(buf.readBigInt64LE(o))); o += 8; } return a; }
      default: throw new Error('nbt tag ' + t);
    }
  };
  const t = buf.readInt8(o++); str();
  return payload(t);
}
const parseShapeEntry = (s) => (typeof s === 'string' ? JSON.parse(s.replace(/'/g, '"')) : s);
function multiblockLayout(b, file) {
  const mb = b.components?.['rmnmshp:multiblock'];
  if (b.components?.['rmnmshp:place_crane']) {
    const nbt = readNBT(fs.readFileSync(path.join(BP, 'structures/crane_north.mcstructure')));
    const [sx, sy, sz] = nbt.size;
    const pal = nbt.structure.palette.default.block_palette;
    const out = [];
    nbt.structure.block_indices[0].forEach((pi, i) => {
      if (pi < 0) return;
      const e = pal[pi];
      if (!e.name.startsWith(b.description.identifier)) return; // crane, crane_a, crane_b share the structure
      const x = Math.floor(i / (sy * sz)), y = Math.floor(i / sz) % sy, z = i % sz;
      out.push({ part: e.states['rmnmshp:part'], block: e.name, x, y, z });
    });
    return out.length ? out : null;
  }
  if (!mb || !mb.shape) return null;
  const shape = mb.shape;
  if (Array.isArray(shape)) return shape.map((s, i) => ({ part: i + 1, ...parseShapeEntry(s) }));
  const out = [];
  let part = 1;
  const depth = shape.depth || 1;
  for (let y = 0; y < shape.height; y++) for (let x = 0; x < shape.width; x++) for (let z = 0; z < depth; z++) out.push({ part: part++, x, y, z });
  return out.length > 1 ? out : null;
}
function northRotation(b) {
  for (const p of b.permutations || []) {
    if (/cardinal_direction'\)\s*==\s*'north'/.test(p.condition || '')) return p.components?.['minecraft:transformation']?.rotation?.[1] || 0;
  }
  return 0;
}
// rotate a block offset around Y by deg (Bedrock: x east, z south)
function rotY(x, z, deg) {
  const r = ((Math.round(deg / 90) % 4) + 4) % 4;
  return [[x, z], [-z, x], [-x, -z], [z, -x]][r];
}

const mode = process.argv[2];
const jobs = [];
if (mode === 'mobs') {
  for (const [base, root] of [['rp', RP], ['rpw', RPW]]) {
    const idx = geoIndex(root);
    for (const f of walk(path.join(root, 'entity'))) {
      let j;
      try { j = readJSON(f); } catch (e) { console.warn('skip', f, e.message); continue; }
      const d = j['minecraft:client_entity']?.description;
      if (!d || !d.geometry || !d.textures) continue;
      const geoId = d.geometry.default || Object.values(d.geometry)[0];
      const texture = d.textures.default || Object.values(d.textures)[0];
      if (!idx[geoId]) { console.warn('no geo for', d.identifier, geoId); continue; }
      const name = d.identifier.replace(/^.*:/, '');
      jobs.push({ type: 'entity', base, geoFile: idx[geoId], geoId, texture, out: `mobs/${base}/${name}.png` });
    }
  }
}

if (mode === 'blocks') {
  const idx = geoIndex(RPW);
  const allBlocks = {};
  for (const f of walk(path.join(BP, 'blocks'))) { try { const bb = readJSON(f)['minecraft:block']; if (bb) allBlocks[bb.description.identifier] = bb; } catch {} }
  const states = (desc) => {
    const st = {};
    for (const [k, v] of Object.entries(desc.states || desc.properties || {})) st[k] = Array.isArray(v) ? v[0] : (v.values ? v.values.min ?? v.values[0] : v);
    for (const t of Object.values(desc.traits || {})) for (const s of t.enabled_states || []) {
      st[s] = { 'minecraft:cardinal_direction': 'south', 'minecraft:facing_direction': 'south', 'minecraft:block_face': 'up', 'minecraft:vertical_half': 'bottom' }[s] ?? 0;
    }
    return st;
  };
  const evalMolang = (expr, st) => {
    if (typeof expr === 'boolean' || typeof expr === 'number') return !!expr;
    const js = String(expr)
      .replace(/(?:q|query)\.block_state\(\s*'([^']+)'\s*\)/g, (m, k) => JSON.stringify(st[k] ?? 0))
      .replace(/(?:q|query|v|variable)\.[a-z_]+(\([^)]*\))?/gi, '0');
    try { return !!Function(`return (${js});`)(); } catch { return false; }
  };
  for (const f of walk(path.join(BP, 'blocks'))) {
    let j; try { j = readJSON(f); } catch (e) { console.warn('skip', f, e.message); continue; }
    const b = j['minecraft:block']; if (!b) continue;
    const id = b.description.identifier;
    const st = states(b.description);
    let comps = { ...(b.components || {}) };
    for (const p of b.permutations || []) if (evalMolang(p.condition, st)) comps = { ...comps, ...p.components };
    let geo = comps['minecraft:geometry'];
    const hide = [];
    if (geo && typeof geo === 'object') {
      for (const [bone, v] of Object.entries(geo.bone_visibility || {})) if (!evalMolang(v, st)) hide.push(bone);
      geo = geo.identifier;
    }
    const mi = comps['minecraft:material_instances'] || {};
    const materials = {};
    for (const [k, v] of Object.entries(mi)) {
      const val = typeof v === 'string' ? mi[v] : v;
      if (val && val.texture) materials[k] = { texture: val.texture, render_method: val.render_method || 'opaque' };
    }
    const name = id.replace(/^.*:/, '');
    const rel = path.relative(path.join(BP, 'blocks'), f).split(path.sep).join('/');
    const group = rel.split('/').slice(0, -1).join('/');
    if (!geo || geo === 'minecraft:geometry.full_block') {
      const faces = {};
      for (const [k, v] of Object.entries(materials)) faces[k] = v.texture;
      if (!Object.keys(faces).length) { console.warn('no materials', id); continue; }
      jobs.push({ type: 'cube', base: 'rpw', faces, method: (materials['*'] || Object.values(materials)[0]).render_method, out: `blocks/${name}.png`, id, group });
      continue;
    }
    if (!idx[geo]) { console.warn('no geo', id, geo); continue; }
    // multi-block pieces: assemble every part where the pack's placement script would put it (facing north),
    // then turn the arrangement back so the parts can be drawn with their unrotated geometry
    const placed = multiblockLayout(b, f);
    if (placed && !/painting/.test(group)) {
      const partKey = Object.keys(b.description.states || {}).find((k) => /:part$/.test(k));
      const theta = northRotation(b);
      const parts = [];
      for (const { part, x, y, z, block } of placed) {
        const bb = (block && allBlocks[block]) || b;
        const s2 = { ...st, [partKey]: part };
        let c2 = { ...(bb.components || {}) };
        for (const p of bb.permutations || []) if (evalMolang(p.condition, s2)) c2 = { ...c2, ...p.components };
        let g2 = c2['minecraft:geometry'];
        const h2 = [];
        if (g2 && typeof g2 === 'object') { for (const [bone, vv] of Object.entries(g2.bone_visibility || {})) if (!evalMolang(vv, s2)) h2.push(bone); g2 = g2.identifier; }
        let [rx, rz] = rotY(x, z, -theta);
        rx = -rx; // the renderer mirrors x (Blockbench convention) for offsets too
        if (g2 && idx[g2]) parts.push({ geoFile: idx[g2], geoId: g2, hideBones: h2, offset: [16 * rx, 16 * y, 16 * rz] });
      }
      if (parts.length > 1) {
        jobs.push({ type: 'block', base: 'rpw', parts, materials, out: `blocks/${name}.png`, id, group });
        continue;
      }
    }
    jobs.push({ type: 'block', base: 'rpw', geoFile: idx[geo], geoId: geo, materials, hideBones: hide, out: `blocks/${name}.png`, id, group });
  }
}

if (mode === 'doubleslabs') {
  const blocks = readJSON(path.join(RP, 'blocks.json'));
  for (const [name, def] of Object.entries(blocks)) {
    if (!/slab/.test(name) || !/double/.test(name) || !def || !def.textures) continue;
    const t = def.textures;
    const faces = typeof t === 'string' ? { '*': t } : { ...t };
    if (!faces['*'] && !faces.side && !faces.north) faces['*'] = Object.values(t)[0];
    jobs.push({ type: 'cube', base: 'rp', faces, out: `doubleslabs/${name}.png`, id: name });
    // the full block of the same material, for a before/after comparison
    const stem = name.replace(/_?double_?slab\d*|double_stone_slab\d*/, '').replace(/_$/, '');
    const cands = [stem, stem + '_block', stem + 's', stem + '_planks', stem.replace(/_brick$/, '_bricks'), stem.replace(/_tile$/, '_tiles'), stem.replace('end_stone_brick', 'end_bricks'), stem.replace('mossy_cobblestone', 'mossy_cobblestone'), stem.replace('red_nether_brick', 'red_nether_brick'), stem.replace('nether_brick', 'nether_brick'), stem.replace('stone_brick', 'stonebrick'), stem.replace('quartz', 'quartz_block'), stem.replace('purpur', 'purpur_block'), stem.replace('petrified_oak', 'oak_planks')];
    const baseName = cands.find((c) => c && blocks[c] && blocks[c].textures);
    if (baseName) {
      const bt = blocks[baseName].textures;
      const bf = typeof bt === 'string' ? { '*': bt } : { ...bt };
      if (!bf['*'] && !bf.side && !bf.north) bf['*'] = Object.values(bt)[0];
      jobs.push({ type: 'cube', base: 'rp', faces: bf, out: `doubleslabs/${name}__base.png`, id: name + '__base', baseName });
    }
  }
}
// regular full block for double slabs that blocks.json doesn't list (texture files in the retexture pack)
const DS_BASE = {
  acacia: 'planks_acacia', andesite: 'stone_andesite', birch: 'planks_birch', blackstone: 'blackstone', brick: 'brick',
  cobbled_deepslate: 'deepslate/cobbled_deepslate', cobblestone: 'cobblestone', crimson: 'huge_fungus/crimson_planks',
  deepslate_brick: 'deepslate/deepslate_bricks', deepslate_tile: 'deepslate/deepslate_tiles', diorite: 'stone_diorite', stone: 'stone',
  end_stone_brick: 'end_bricks', granite: 'stone_granite', jungle: 'planks_jungle', mossy_cobblestone: 'cobblestone_mossy',
  mud_brick: 'mud_bricks', nether_brick: 'nether_brick', oak: 'planks_oak', pale_oak: 'pale_oak_planks', petrified_oak: 'planks_oak',
  polished_andesite: 'stone_andesite_smooth', polished_blackstone_brick: 'polished_blackstone_bricks', polished_blackstone: 'polished_blackstone',
  polished_deepslate: 'deepslate/polished_deepslate', polished_diorite: 'stone_diorite_smooth', polished_granite: 'stone_granite_smooth',
  prismarine_brick: 'prismarine_bricks', purpur: 'purpur_block', quartz: 'quartz_block_side', resin_brick: 'resin_bricks',
  spruce: 'planks_spruce', warped: 'huge_fungus/warped_planks',
};
if (mode === 'dsbase') {
  const have = new Set(fs.readdirSync(path.join(HERE, 'out/doubleslabs')).filter((f) => f.endsWith('__base.png')).map((f) => f.slice(0, -10)));
  const blocks = readJSON(path.join(RP, 'blocks.json'));
  for (const name of Object.keys(blocks)) {
    if (!/slab/.test(name) || !/double/.test(name) || have.has(name)) continue;
    const stem = name === 'double_stone_slab4' ? 'stone' : name.replace(/_?double_?slab\d*/, '').replace(/_$/, '');
    const tex = DS_BASE[stem];
    if (!tex) { console.warn('no base for', name); continue; }
    const top = { blackstone: 'blackstone_top', quartz: 'quartz_block_top' }[stem];
    jobs.push({ type: 'cube', base: 'rp', direct: true, faces: { '*': `textures/blocks/${tex}`, ...(top ? { up: `textures/blocks/${top}`, down: `textures/blocks/${top}` } : {}) }, out: `doubleslabs/${name}__base.png` });
  }
}

if (mode === 'paintings') {
  // every part of a multi-block painting shows one region of a shared texture; the union of those regions is the picture
  const idx = geoIndex(RPW);
  const geoCache = {};
  const faceRect = (geoId) => {
    const file = idx[geoId]; if (!file) return null;
    geoCache[file] ||= readJSON(path.join(RPW, file));
    for (const g of geoCache[file]['minecraft:geometry'] || []) {
      if (g.description.identifier !== geoId) continue;
      for (const bone of g.bones || []) for (const c of bone.cubes || []) {
        const f = c.uv && (c.uv.north || c.uv.south);
        if (f && f.uv_size && Math.abs(f.uv_size[0]) >= 4) {
          const [u, v] = f.uv, [w, h] = f.uv_size;
          return { tw: g.description.texture_width, th: g.description.texture_height, r: [Math.min(u, u + w), Math.min(v, v + h), Math.max(u, u + w), Math.max(v, v + h)] };
        }
      }
    }
    return null;
  };
  for (const f of walk(path.join(BP, 'blocks'))) {
    if (!/painting/i.test(f)) continue;
    const b = readJSON(f)['minecraft:block']; if (!b) continue;
    const tex = b.components?.['minecraft:material_instances']?.['*']?.texture;
    if (!tex) continue;
    const name = b.description.identifier.replace(/^.*:/, '');
    const partKey = Object.keys(b.description.states || {}).find((k) => /:part$/.test(k));
    const parts = partKey ? b.description.states[partKey] : [null];
    const geos = new Set();
    for (const v of parts) {
      let g = b.components?.['minecraft:geometry'];
      for (const p of b.permutations || []) {
        const m = String(p.condition || '').match(/block_state\('[^']+:part'\)\s*==\s*(\d+)/);
        if (m && v !== null && +m[1] === v && p.components?.['minecraft:geometry']) g = p.components['minecraft:geometry'];
      }
      geos.add(typeof g === 'object' ? g.identifier : g);
    }
    let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity, tw = 16, th = 16;
    for (const g of geos) {
      const fr = faceRect(g); if (!fr) continue;
      tw = fr.tw; th = fr.th;
      u0 = Math.min(u0, fr.r[0]); v0 = Math.min(v0, fr.r[1]); u1 = Math.max(u1, fr.r[2]); v1 = Math.max(v1, fr.r[3]);
    }
    if (!isFinite(u0)) { console.warn('no face uv for', name); continue; }
    jobs.push({ type: 'panel', base: 'rpw', texture: tex, crop: [u0 / tw, v0 / th, (u1 - u0) / tw, (v1 - v0) / th], w: (u1 - u0) / 16, h: (v1 - v0) / 16, out: `paintings/${name}.png` });
  }
}

// entity description by identifier, for both resource packs
function entityIndex() {
  const out = {};
  for (const [base, root] of [['rp', RP], ['rpw', RPW]]) {
    for (const f of walk(path.join(root, 'entity'))) {
      let j; try { j = readJSON(f); } catch { continue; }
      const d = j['minecraft:client_entity']?.description;
      if (d) out[d.identifier.replace(/^.*:/, '')] ||= { base, root, d };
    }
  }
  return out;
}

if (mode === 'anims') {
  // animation id -> file, served by server.mjs as /rp/... or /rpw/...
  const index = {};
  for (const [base, root] of [['rp', RP], ['rpw', RPW]]) {
    for (const f of walk(path.join(root, 'animations'))) {
      let j; try { j = readJSON(f); } catch { continue; }
      for (const id of Object.keys(j.animations || {})) index[id] ||= `${base}/${path.relative(root, f).split(path.sep).join('/')}`;
    }
  }
  fs.mkdirSync(path.join(HERE, 'jobs'), { recursive: true });
  fs.writeFileSync(path.join(HERE, 'jobs/anim-index.json'), JSON.stringify(index));
  const stills = Object.fromEntries([...readJSON(path.join(HERE, 'jobs/mobs.json')), ...readJSON(path.join(HERE, 'jobs/fix.json'))].map((j) => [j.out, j]));
  const ents = entityIndex();
  const wanted = (process.argv[3] || '').split(',').filter(Boolean);
  for (const name of wanted) {
    const still = stills[`mobs/rp/${name}.png`] || stills[`mobs/rpw/${name}.png`];
    const e = ents[name];
    if (!still || !e) { console.warn('no entity/still for', name); continue; }
    const A = e.d.animations || {};
    const pre = (e.d.scripts?.pre_animation || []);
    const pick = (keys) => { for (const k of keys) if (A[k] && !A[k].startsWith('controller.') && index[A[k]]) return A[k]; return null; };
    // mobs whose entity file points at vanilla animations, but whose custom model has its own in the pack
    const OVERRIDE = { iron_golem: ['animation.golem.idle', 'animation.golem.walk'], phantom: ['animation.vulture.fly', null] }[name];
    const idle = OVERRIDE ? OVERRIDE[0] : pick(['idle', 'idle_default', 'general', 'look_at_target_idle']);
    const walkA = OVERRIDE ? OVERRIDE[1] : pick(['walk', 'move', 'walking', 'fly', 'swim', 'run']);
    const extras = ['blink', 'tail', 'wings', 'flap', 'fins'].map((k) => A[k]).filter((x) => x && !x.startsWith('controller.') && index[x]);
    const common = { type: 'anim', base: still.base, geoFile: still.geoFile, geoId: still.geoId, texture: still.texture, hideBones: still.hideBones, layers: still.layers, pre, fps: 15 };
    if (idle) jobs.push({ ...common, anims: [idle, ...extras], out: `anim/${name}/idle` });
    if (walkA) {
      const [abase, ...arel] = index[walkA].split('/');
      const len = readJSON(path.join(abase === 'rp' ? RP : RPW, ...arel)).animations[walkA].animation_length;
      const dur = len || 1.2;
      jobs.push({ ...common, anims: [walkA, ...extras], duration: dur, walkRate: 9.4314 / dur, out: `anim/${name}/walk` });
    }
    console.log(name, 'idle:', idle, 'walk:', walkA);
  }
}

if (mode === 'citizens') {
  const ents = entityIndex();
  const idx = geoIndex(RPW);
  const rcs = {};
  for (const f of walk(path.join(RPW, 'render_controllers'))) { try { Object.assign(rcs, readJSON(f).render_controllers || {}); } catch {} }
  const evalVar = (expr, variant) => { try { return !!Function(`return (${String(expr).replace(/(?:q|query)\.variant/g, variant).replace(/(?:q|query|v|variable)\.\w+/g, '0')});`)(); } catch { return true; } };
  for (const name of (process.argv[3] || '').split(',').filter(Boolean)) {
    const e = ents[name];
    if (!e) { console.warn('no entity', name); continue; }
    const d = e.d;
    const rc = (d.render_controllers || []).map((r) => (typeof r === 'string' ? r : Object.keys(r)[0])).map((r) => rcs[r]).find((r) => r && /variant/.test(JSON.stringify(r)));
    const variants = [];
    if (rc) {
      const arr = (kind) => { const a = rc.arrays?.[kind] || {}; return Object.values(a)[0] || []; };
      const texs = arr('textures'), geos = arr('geometries');
      const n = Math.max(texs.length, geos.length);
      for (let v = 0; v < n; v++) {
        const tk = (texs[v] || texs[0] || 'Texture.default').split('.')[1];
        const gk = (geos[v] || geos[0] || rc.geometry || 'Geometry.default').split('.')[1];
        const hide = [];
        for (const pv of rc.part_visibility || []) for (const [bone, ex] of Object.entries(pv)) if (bone !== '*' && !evalVar(ex, v)) hide.push(bone);
        variants.push({ geoId: d.geometry[gk], texture: d.textures[tk], hideBones: hide });
      }
    } else variants.push({ geoId: d.geometry.default || Object.values(d.geometry)[0], texture: d.textures.default || Object.values(d.textures)[0], hideBones: [] });
    const seen = new Set();
    let i = 0;
    for (const v of variants) {
      const key = JSON.stringify(v);
      if (seen.has(key) || !idx[v.geoId]) continue;
      seen.add(key);
      jobs.push({ type: 'entity', base: 'rpw', geoFile: idx[v.geoId], geoId: v.geoId, texture: v.texture, hideBones: v.hideBones, out: `citizens/${name}/${i++}.png` });
    }
    console.log(name, i, 'variants');
  }
}

if (mode === 'armor') {
  // armour pieces with their own models (attachables in the retexture pack) x every trim pattern in the pack
  const idx = geoIndex(RP);
  const patterns = fs.readdirSync(path.join(RP, 'textures/trims')).filter((f) => /^[a-z]+\.png$/.test(f)).map((f) => f.slice(0, -4));
  const seen = new Set();
  // the player variant of each attachable carries the scale used in game
  const scaleOf = {};
  for (const f of fs.readdirSync(path.join(RP, 'attachables'))) {
    const d = readJSON(path.join(RP, 'attachables', f))['minecraft:attachable']?.description;
    if (!/player/.test(f) || !d) continue;
    const it = Object.keys(d.item || {})[0] || d.identifier.replace(/\.player$/, '');
    if (d.scripts?.scale) scaleOf[it] = +d.scripts.scale;
  }
  for (const f of fs.readdirSync(path.join(RP, 'attachables')).sort()) {
    const d = readJSON(path.join(RP, 'attachables', f))['minecraft:attachable']?.description;
    const item = Object.keys(d?.item || {})[0] || (d?.identifier || '').replace(/.player$/, '');
    const m = item.match(/^minecraft:(\w+?)_(helmet|chestplate|leggings|boots)$/);
    if (!m || seen.has(item)) continue;
    seen.add(item);
    const geoId = Object.values(d.geometry)[0];
    if (!idx[geoId]) { console.warn('no geo', item, geoId); continue; }
    const legs = m[2] === 'leggings';
    jobs.push({
      type: 'armor', base: 'rp', geoFile: idx[geoId], geoId, texture: d.textures.default,
      trims: patterns.map((p) => ({ name: p, texture: `textures/trims/${p}${legs ? '_leggings' : ''}` })),
      scale: scaleOf[item] || 1, material: m[1], slot: m[2], out: `armor/${m[1]}_${m[2]}`,
      ...(m[1] === 'leather' ? { leatherTint: [255, 255, 255] } : {}), // shown undyed (white)
    });
  }
  // every other piece uses the pack's generic armour models with the material's layer texture
  const GENERIC = { chestplate: ['models/entity/humanoid_chest_humanoid.geo.json', '_1'], leggings: ['models/entity/leggings.geo.json', '_2'], boots: ['models/entity/boots.geo.json', '_1'] };
  const TEX = { leather: 'leather', chainmail: 'chain', copper: 'copper', iron: 'iron', golden: 'gold', diamond: 'diamond', netherite: 'netherite' };
  for (const [mat, tex] of Object.entries(TEX)) {
    for (const [slot, [geoFile, layer]] of Object.entries(GENERIC)) {
      if (jobs.some((j) => j.material === mat && j.slot === slot)) continue; // has its own model
      const geoJson = readJSON(path.join(RP, geoFile));
      const geoId = geoJson['minecraft:geometry'][0].description.identifier;
      jobs.push({
        type: 'armor', base: 'rp', geoFile, geoId, texture: `textures/models/armor/${tex}${layer}`, scale: 1,
        trims: patterns.map((p) => ({ name: p, texture: `textures/trims/${p}${slot === 'leggings' ? '_leggings' : ''}` })),
        material: mat, slot, out: `armor/${mat}_${slot}`,
        ...(mat === 'leather' ? { leatherTint: [255, 255, 255] } : {}),
      });
    }
  }
  console.log(jobs.map((j) => `${j.material} ${j.slot}`).join(', '));
}

fs.mkdirSync(path.join(HERE, 'jobs'), { recursive: true });
fs.writeFileSync(path.join(HERE, 'jobs', `${mode}.json`), JSON.stringify(jobs, null, 1));
console.log(mode, jobs.length, 'jobs');
