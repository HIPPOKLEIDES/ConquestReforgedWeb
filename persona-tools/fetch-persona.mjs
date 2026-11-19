// Snapshot of Conquest Studios' Character Creator (persona) items on the Minecraft Marketplace for /persona.
//
//   node persona-tools/fetch-persona.mjs            catalog + renders
//   node persona-tools/fetch-persona.mjs --no-render   catalog only (refresh which items are for sale)
//
// 1. Reads the catalog the same way the Discord bot does (Community Discord Bot/persona-sale.js): an anonymous
//    guest sign-in and the unofficial Catalog/Search route. Mojang changes which items are purchasable on the
//    1st of each month, so run this again after that (the page says which month the list is from).
// 2. Finds each item's source package (folder or .zip with Content/persona) under PERSONA_DIR by the name of its
//    Marketplace thumbnail (".../skeleton_body_Thumbnail_0.png" -> a package whose Store Art has
//    skeleton_body_Thumbnail_0.png). Only catalog items are shown, so unpublished work in that folder never leaks.
// 3. Renders the piece on its own (no mannequin) as a slow turntable with the bot's persona renderer
//    (tools/persona-renders/persona-render.js), saved as animated WebP + a still via Python/Pillow.
//    Items without a source package fall back to the catalog thumbnail (which shows the mannequin).
// Writes src/data/persona.json and src/assets/persona/*. build.mjs only reads the snapshot.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PERSONA_DIR = process.env.PERSONA_DIR || 'E:/Archive/Minecraft/Bedrock/Persona';
const RENDERER = process.env.PERSONA_RENDERER || 'E:/Archive/Minecraft/Community Discord Bot/tools/persona-renders/persona-render.js';
const OUT_IMG = path.join(ROOT, 'src', 'assets', 'persona');
const OUT_DATA = path.join(ROOT, 'src', 'data', 'persona.json');
const WORK = path.join(ROOT, 'persona-tools', 'out');

const CATALOG_URL = 'https://20ca2.playfabapi.com';
const TITLE_ID = '20CA2';
const CREATOR_ID = 'master_player_account!4EC9F9D4276F3E34'; // Conquest Studios
const GUEST_DEVICE_ID = 'c0e5a7d1b0f84c1e9a3f2d6b8e4c1a70'; // the website's own fixed guest

const SLOT_NAMES = {
  persona_head: 'Head', persona_hood: 'Hood', persona_outerwear: 'Outerwear', persona_top: 'Top', persona_bottom: 'Bottom',
  persona_legs: 'Legs', persona_feet: 'Feet', persona_back: 'Back', persona_capes: 'Cape', persona_face_accessory: 'Face',
};

const SIZE = 360; // output px
const SUPERSAMPLE = 2;
const FRAMES = 48; // one full turn
const FPS = 8; // 6 s per turn

const args = process.argv.slice(2);
const noRender = args.includes('--no-render');
const only = args.find((a) => !a.startsWith('--'))?.toLowerCase();

// ---------- catalog ----------

async function post(endpoint, body, headers = {}) {
  const res = await fetch(`${CATALOG_URL}/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) throw new Error(`Marketplace catalog ${endpoint} failed (${res.status}): ${json?.errorMessage || 'no response'}`);
  return json.data;
}

async function fetchCatalog() {
  const login = await post('Client/LoginWithIOSDeviceID', { TitleId: TITLE_ID, DeviceId: GUEST_DEVICE_ID, OS: 'iOS', CreateAccount: true });
  const token = (await post('Authentication/GetEntityToken', { Entity: { Id: login.PlayFabId, Type: 'master_player_account' } }, { 'X-Authorization': login.SessionTicket })).EntityToken;
  const raw = [];
  for (let skip = 0; skip < 1000; skip += 100) {
    const data = await post('Catalog/Search', { Search: '', Filter: `creatorId eq '${CREATOR_ID}'`, OrderBy: 'StartDate desc', Top: 100, Skip: skip, Select: 'images,startDate', Expand: 'images' }, { 'X-EntityToken': token });
    const page = data?.Items || [];
    raw.push(...page);
    if (page.length < 100) break;
  }
  return raw;
}

const slugify = (s) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

function toItem(raw) {
  const dp = raw.DisplayProperties || {};
  const name = raw.Title?.NEUTRAL || raw.Title?.neutral || 'Unnamed item';
  const thumb = (raw.Images || []).find((i) => i.Type === 'Thumbnail')?.Url || null;
  return {
    id: raw.Id,
    name,
    slug: slugify(name),
    kind: 'persona',
    type: dp.pieceType || '',
    slot: SLOT_NAMES[dp.pieceType] || titleCase(String(dp.pieceType || '').replace(/^persona_/, '').replace(/_/g, ' ')),
    rarity: dp.rarity ? titleCase(dp.rarity) : '',
    price: typeof dp.price === 'number' ? dp.price : null,
    purchasable: dp.purchasable === true,
    released: raw.StartDate || raw.CreationDate || null,
    thumbUrl: thumb,
    source: thumb ? path.basename(new URL(thumb).pathname).replace(/_Thumbnail_\d+\.png$/i, '') : null,
  };
}

// ---------- source packages ----------

const TAR = process.platform === 'win32' ? 'C:/Windows/System32/tar.exe' : 'tar'; // bsdtar reads .zip

function listZip(file) {
  try { return execFileSync(TAR, ['-tf', file], { encoding: 'utf8', maxBuffer: 1 << 24 }).split(/\r?\n/).filter(Boolean); } catch { return []; }
}

// key (thumbnail base name) -> [{ dir | zip, mtime, rank }]
function indexSources() {
  const index = {};
  const add = (key, entry) => (index[key.toLowerCase()] ||= []).push(entry);
  const walk = (dir, depth) => {
    if (depth > 6) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.startsWith('_')) continue;
        const storeArt = path.join(p, 'Store Art');
        if (fs.existsSync(path.join(p, 'Content', 'persona')) && fs.existsSync(storeArt)) {
          for (const f of fs.readdirSync(storeArt)) {
            const m = f.match(/^(.*)_Thumbnail_\d+\.png$/i);
            if (m) add(m[1], { dir: p, mtime: fs.statSync(path.join(p, 'Content', 'persona')).mtimeMs, rank: p.includes('Catalog Pieces') ? 2 : 1 });
          }
        }
        walk(p, depth + 1);
      } else if (/\.zip$/i.test(e.name)) {
        const files = listZip(p);
        if (!files.some((f) => /^Content\/persona\/.+\.meta\.json$/i.test(f))) continue;
        for (const f of files) {
          const m = f.match(/^Store Art\/(.*)_Thumbnail_\d+\.png$/i);
          if (m) add(m[1], { zip: p, mtime: fs.statSync(p).mtimeMs, rank: 0 });
        }
      }
    }
  };
  walk(PERSONA_DIR, 0);
  return index;
}

// newest, preferring the Catalog Pieces folders (what the Discord bot renders from)
function pickSource(index, key) {
  const list = index[key?.toLowerCase()] || [];
  return list.sort((a, b) => b.rank - a.rank || b.mtime - a.mtime)[0] || null;
}

function contentDir(src, key) {
  if (src.dir) return path.join(src.dir, 'Content', 'persona');
  const dest = path.join(WORK, 'src', key);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  execFileSync(TAR, ['-xf', src.zip, '-C', dest]);
  return path.join(dest, 'Content', 'persona');
}

// ---------- rendering (piece only, no mannequin) ----------

const require = createRequire(import.meta.url);
let R = null;

function findFile(dir, test) {
  const name = fs.existsSync(dir) && fs.readdirSync(dir).find(test);
  return name ? path.join(dir, name) : null;
}

// Like the bot's loadPiece, but without the mannequin. Textures a piece paints onto the body or head
// (texture_sources, e.g. a tunic under a cuirass or a face under a helmet) are drawn on the body cubes on their
// own, so only the painted part shows.
function loadPiece(dir) {
  const meta = R.readJsonLoose(findFile(dir, (n) => n.endsWith('.meta.json')));
  const geometryJson = R.readJsonLoose(findFile(dir, (n) => n.endsWith('.geometry.json')));
  const sources = (meta.geometry_sources || []).filter((s) =>
    (!s.body_size || s.body_size === 'medium' || s.body_size === 'any') &&
    (!s.arm_size || s.arm_size === 'wide' || s.arm_size === 'any')); // both sides of one-sided pieces (left + right leg)
  if (!sources.length) throw new Error('no medium-body geometry');
  const bones = R.personaSkeleton();
  const empty = (w, h) => R.makeTexture({ width: w, height: h, data: new Uint8Array(w * h * 4) });
  let body = null, head = null;
  for (const t of meta.texture_sources || []) {
    const png = R.readPng(path.join(dir, t.texture));
    if (t.use_face_uv || png.width === 32 || png.width === 64) head = R.makeTexture(png); else body = R.makeTexture(png);
  }
  if (body || head) R.addMannequin(bones, { bodyTexture: body || empty(128, 128), headTexture: head || empty(32, 32), zones: [] });
  let textureFrames = 1;
  const textures = {};
  for (const s of sources) {
    const frames = s.animated ? s.frames || 1 : 1;
    textureFrames = Math.max(textureFrames, frames);
    const g = R.findGeometry(geometryJson, s.geometry);
    const uw = g.texturewidth || g.description?.texture_width, uh = g.textureheight || g.description?.texture_height;
    const key = `${s.texture}|${uw}|${uh}`;
    textures[key] ||= R.makeTexture(R.readPng(path.join(dir, s.texture)), frames, uw, uh);
    R.addGeometry(bones, g, textures[key]);
  }
  return { bones, type: meta.piece_type, textureFrames };
}

function painted(t, [u1, v1, u2, v2]) {
  const x0 = Math.floor(Math.min(u1, u2) * t.scaleU), x1 = Math.ceil(Math.max(u1, u2) * t.scaleU);
  const y0 = Math.floor(Math.min(v1, v2) * t.scaleV), y1 = Math.ceil(Math.max(v1, v2) * t.scaleV);
  for (let y = Math.max(0, y0); y < Math.min(t.frameHeight, y1); y++) for (let x = Math.max(0, x0); x < Math.min(t.width, x1); x++) if (t.png.data[(y * t.width + x) * 4 + 3] >= 128) return true;
  return false;
}
const sub = (a, b) => a.map((v, i) => v - b[i]);
const norm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };

// Fits the piece in frame for every angle of the turn: bounding sphere of all quads around the turn axis.
function fitCamera(piece) {
  // only faces with something painted on them (the body cubes carrying a piece's body texture are mostly empty)
  const quads = R.buildQuads(piece.bones).filter((q) => painted(q.texture, q.uv));
  const pts = quads.flatMap((q) => q.corners);
  const min = [0, 1, 2].map((i) => Math.min(...pts.map((p) => p[i]))), max = [0, 1, 2].map((i) => Math.max(...pts.map((p) => p[i])));
  const center = [0, (min[1] + max[1]) / 2, 0];
  const radius = Math.max(...pts.map((p) => Math.hypot(p[0], p[1] - center[1], p[2])));
  const focal = 51.15, tanHalf = 17.5 / focal;
  const dist = (radius / Math.sin(Math.atan(tanHalf))) * 1.04;
  const dir = norm([0.62, 0.38, -0.86]); // front three-quarter view from slightly above, like the Marketplace thumbnails
  return { position: center.map((c, i) => c + dir[i] * dist), target: center, focal };
}

function renderTurntable(piece, outDir) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const preset = fitCamera(piece);
  const full = SIZE * SUPERSAMPLE;
  const camera = R.makeCamera(preset, full, full);
  const base = piece.type === 'persona_back' ? 144 : 0; // back pieces start with their back to the camera (which looks from ~36° to the side)
  for (let i = 0; i < FRAMES; i++) {
    const yaw = base - (i / FRAMES) * 360;
    const textureFrame = Math.floor((i / FRAMES) * piece.textureFrames * 2) % piece.textureFrames;
    const img = R.downsample(R.rasterize(R.buildQuads(piece.bones, {}, [0, yaw, 0]), camera, full, full, textureFrame), full, full, SUPERSAMPLE);
    fs.writeFileSync(path.join(outDir, `${String(i).padStart(3, '0')}.png`), R.encodePng(img, SIZE, SIZE));
  }
}

const PY = `
import sys, glob
from PIL import Image
src, spin, still, fps = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
frames = [Image.open(f).convert('RGBA') for f in sorted(glob.glob(src + '/*.png'))]
frames[0].save(still, 'WEBP', quality=88, method=6)
frames[0].save(spin, 'WEBP', save_all=True, append_images=frames[1:], duration=int(1000 / fps), loop=0, quality=80, method=6, minimize_size=True)
`;

function encode(framesDir, spin, still) {
  const py = path.join(os.tmpdir(), 'persona-webp.py');
  fs.writeFileSync(py, PY);
  execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-I', py, framesDir, spin, still, String(FPS)], { stdio: 'inherit' });
}

async function download(url, file) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

// ---------- main ----------

const raw = await fetchCatalog();
const items = raw.filter((r) => r.ContentType === 'PersonaDurable').map(toItem);
console.log(`${items.length} Character Creator items, ${items.filter((i) => i.purchasable).length} for sale`);

const previous = fs.existsSync(OUT_DATA) ? JSON.parse(fs.readFileSync(OUT_DATA, 'utf8')) : { items: [] };
const prevBySlug = Object.fromEntries((previous.items || []).map((i) => [i.slug, i]));
fs.mkdirSync(OUT_IMG, { recursive: true });
const index = noRender ? null : indexSources();
if (!noRender) R = require(RENDERER);
const missing = [];

for (const item of items) {
  const prev = prevBySlug[item.slug] || {};
  const thumbFile = path.join(OUT_IMG, `${item.slug}-thumb.png`);
  if (item.thumbUrl && (!noRender || !fs.existsSync(thumbFile))) await download(item.thumbUrl, thumbFile).catch((e) => console.warn(`  thumbnail: ${e.message}`));
  item.thumb = fs.existsSync(thumbFile) ? `/assets/persona/${item.slug}-thumb.png` : null;
  item.img = prev.img || null;
  item.spin = prev.spin || null;
  if (noRender || (only && !item.slug.includes(only))) continue;
  const src = pickSource(index, item.source);
  if (!src) { missing.push(item.name); item.img = item.spin = null; console.log(`  no source  ${item.name} (${item.source})`); continue; }
  try {
    const piece = loadPiece(contentDir(src, item.source));
    const frames = path.join(WORK, 'frames', item.slug);
    renderTurntable(piece, frames);
    encode(frames, path.join(OUT_IMG, `${item.slug}-spin.webp`), path.join(OUT_IMG, `${item.slug}.webp`));
    item.img = `/assets/persona/${item.slug}.webp`;
    item.spin = `/assets/persona/${item.slug}-spin.webp`;
    console.log(`  rendered   ${item.name}  <- ${path.relative(PERSONA_DIR, src.dir || src.zip)}`);
  } catch (e) {
    missing.push(item.name);
    console.log(`  failed     ${item.name}: ${e.message}`);
  }
}

const now = new Date();
const data = {
  fetchedAt: now.toISOString(),
  month: now.toISOString().slice(0, 7), // which month's "for sale" list this is (UTC)
  items: items.map(({ thumbUrl, source, ...rest }) => rest),
  emotes: previous.emotes || [], // reserved for emotes once some are on the Marketplace
};
fs.writeFileSync(OUT_DATA, JSON.stringify(data, null, 2) + '\n');
console.log(`wrote ${path.relative(ROOT, OUT_DATA)} (${data.month})`);
if (missing.length) console.log(`no render (catalog thumbnail used): ${missing.join(', ')}`);
