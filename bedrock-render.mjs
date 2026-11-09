// Renders the /conquest-bedrock showcase pictures (blocks, slabs, gradient walls) from pack textures into
// transparent PNGs, so the page shows plain images instead of assembling 3D faces from hundreds of textures.
// No dependencies: a small PNG reader/writer and an orthographic rasteriser matching the old CSS 3D view.
import fs from 'node:fs';
import zlib from 'node:zlib';

export function png(file) {
  const b = fs.readFileSync(file); let p = 8, w, h, bd, ct, pal, trns; const idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p), type = b.toString('ascii', p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; if (d[12]) return null; }
    else if (type === 'PLTE') pal = d; else if (type === 'tRNS') trns = d; else if (type === 'IDAT') idat.push(d);
    p += 12 + len;
  }
  if (bd !== 8) return null;
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct], raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch;
  const out = new Uint8Array(w * h * 4), cur = new Uint8Array(stride), prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const r = raw[y * (stride + 1) + 1 + x], a = x >= ch ? cur[x - ch] : 0, up = prev[x], c = x >= ch ? prev[x - ch] : 0;
      let v; if (f === 0) v = r; else if (f === 1) v = r + a; else if (f === 2) v = r + up; else if (f === 3) v = r + ((a + up) >> 1);
      else { const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c); v = r + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c); }
      cur[x] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, i = x * ch;
      if (ct === 6) out.set(cur.subarray(i, i + 4), o); else if (ct === 2) { out.set(cur.subarray(i, i + 3), o); out[o + 3] = 255; }
      else if (ct === 3) { const k = cur[i]; out[o] = pal[k * 3]; out[o + 1] = pal[k * 3 + 1]; out[o + 2] = pal[k * 3 + 2]; out[o + 3] = trns && k < trns.length ? trns[k] : 255; }
      else { out[o] = out[o + 1] = out[o + 2] = cur[i]; out[o + 3] = ct === 4 ? cur[i + 1] : 255; }
    }
    prev.set(cur);
  }
  return { w, h, px: out };
}

const cache = new Map();
/** Decoded texture (RGBA), cached by path. */
export function texture(file) {
  if (!cache.has(file)) {
    const im = png(file);
    if (!im) throw new Error(`can't read ${file}`);
    cache.set(file, im);
  }
  return cache.get(file);
}

// ---------- PNG writer (RGBA, per-row filter picked by smallest sum, deflate level 9) ----------
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); out.write(type, 4, 'ascii'); data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};
export function encodePNG(w, h, rgba) {
  const stride = w * 4, raw = Buffer.alloc((stride + 1) * h), cand = Array.from({ length: 5 }, () => Buffer.alloc(stride));
  for (let y = 0; y < h; y++) {
    const row = rgba.subarray(y * stride, (y + 1) * stride), up = y ? rgba.subarray((y - 1) * stride, y * stride) : null;
    let best = 0, bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const o = cand[f]; let sum = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= 4 ? row[x - 4] : 0, b = up ? up[x] : 0, c = up && x >= 4 ? up[x - 4] : 0;
        let p;
        if (f === 0) p = 0; else if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1;
        else { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        const v = (row[x] - p) & 255; o[x] = v; sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) { bestSum = sum; best = f; }
    }
    raw[y * (stride + 1)] = best; cand[best].copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- rasteriser: orthographic view like the CSS transform rotateX(ax) rotateY(ay) ----------
// Coordinates follow CSS: x right, y down, z towards the viewer. A face is an origin O plus edge vectors U and
// V (3D); sample(u, v) returns [r, g, b, a] for u, v in 0..1. Faces are drawn in order with 4x4 supersampling,
// so edges get smooth alpha; texels are sampled nearest-neighbour to keep the pixel-art look.
function projector(ax, ay) {
  const rx = (ax * Math.PI) / 180, ry = (ay * Math.PI) / 180;
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry);
  return ([x, y, z]) => {
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy; // rotateY
    return [x1, y * cx - z1 * sx]; // rotateX, then drop depth
  };
}
const SS = 4;
function rasterise(faces, ax, ay, pad = 2) {
  const P = projector(ax, ay);
  const f2 = faces.map((f) => {
    const o = P(f.O), u = P(f.O.map((v, i) => v + f.U[i])), v = P(f.O.map((w, i) => w + f.V[i]));
    return { ...f, o, du: [u[0] - o[0], u[1] - o[1]], dv: [v[0] - o[0], v[1] - o[1]] };
  });
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of f2) for (const [px, py] of [f.o, [f.o[0] + f.du[0], f.o[1] + f.du[1]], [f.o[0] + f.dv[0], f.o[1] + f.dv[1]], [f.o[0] + f.du[0] + f.dv[0], f.o[1] + f.du[1] + f.dv[1]]]) {
    x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py);
  }
  x0 = Math.floor(x0) - pad; y0 = Math.floor(y0) - pad;
  const w = Math.ceil(x1) + pad - x0, h = Math.ceil(y1) + pad - y0;
  const acc = new Float32Array(w * h * 4); // premultiplied RGBA
  for (const f of f2) {
    const det = f.du[0] * f.dv[1] - f.du[1] * f.dv[0];
    const bx0 = Math.max(0, Math.floor(Math.min(f.o[0], f.o[0] + f.du[0], f.o[0] + f.dv[0], f.o[0] + f.du[0] + f.dv[0]) - x0));
    const bx1 = Math.min(w - 1, Math.ceil(Math.max(f.o[0], f.o[0] + f.du[0], f.o[0] + f.dv[0], f.o[0] + f.du[0] + f.dv[0]) - x0));
    const by0 = Math.max(0, Math.floor(Math.min(f.o[1], f.o[1] + f.du[1], f.o[1] + f.dv[1], f.o[1] + f.du[1] + f.dv[1]) - y0));
    const by1 = Math.min(h - 1, Math.ceil(Math.max(f.o[1], f.o[1] + f.du[1], f.o[1] + f.dv[1], f.o[1] + f.du[1] + f.dv[1]) - y0));
    for (let py = by0; py <= by1; py++) for (let px = bx0; px <= bx1; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy2 = 0; sy2 < SS; sy2++) for (let sx2 = 0; sx2 < SS; sx2++) {
        const X = px + x0 + (sx2 + 0.5) / SS - f.o[0], Y = py + y0 + (sy2 + 0.5) / SS - f.o[1];
        const u = (X * f.dv[1] - Y * f.dv[0]) / det, v = (Y * f.du[0] - X * f.du[1]) / det;
        if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
        const c = f.sample(u, v), al = c[3] / 255;
        r += c[0] * f.light * al; g += c[1] * f.light * al; b += c[2] * f.light * al; a += al;
      }
      if (!a) continue;
      const n = SS * SS, fa = a / n, i = (py * w + px) * 4;
      // "over" compositing in premultiplied space
      acc[i] = r / n + acc[i] * (1 - fa); acc[i + 1] = g / n + acc[i + 1] * (1 - fa); acc[i + 2] = b / n + acc[i + 2] * (1 - fa);
      acc[i + 3] = fa + acc[i + 3] * (1 - fa);
    }
  }
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const al = acc[i * 4 + 3];
    if (al <= 0) continue;
    out[i * 4] = Math.min(255, Math.round(acc[i * 4] / al)); out[i * 4 + 1] = Math.min(255, Math.round(acc[i * 4 + 1] / al));
    out[i * 4 + 2] = Math.min(255, Math.round(acc[i * 4 + 2] / al)); out[i * 4 + 3] = Math.round(Math.min(1, al) * 255);
  }
  return { w, h, rgba: out };
}
const texel = (im, u, v) => { const x = Math.min(im.w - 1, Math.floor(u * im.w)), y = Math.min(im.h - 1, Math.floor(v * im.h)), o = (y * im.w + x) * 4; return [im.px[o], im.px[o + 1], im.px[o + 2], im.px[o + 3]]; };

/**
 * A block or slab as the page used to show it in CSS (rotateX(-30deg) rotateY(-45deg); light: top 1, front .8,
 * right .62). faces: { up, south, east } texture paths. s = footprint in output pixels.
 */
export function renderBlock(faces, { slab = false, s = 184 } = {}) {
  const h = slab ? s / 2 : s, top = texture(faces.up), south = texture(faces.south), east = texture(faces.east);
  const side = (im) => (u, v) => texel(im, u, 1 - h / s + v * (h / s)); // a slab shows the lower half of its side texture
  return rasterise([
    { O: [-s / 2, s / 2 - h, -s / 2], U: [s, 0, 0], V: [0, 0, s], light: 1, sample: (u, v) => texel(top, u, v) },
    { O: [-s / 2, s / 2 - h, s / 2], U: [s, 0, 0], V: [0, h, 0], light: 0.8, sample: side(south) },
    { O: [s / 2, s / 2 - h, s / 2], U: [0, 0, -s], V: [0, h, 0], light: 0.62, sample: side(east) },
  ], -30, -45);
}

/**
 * A wall of W x H x D blocks (rotateX(-20deg) rotateY(-32deg); light: top 1, front .9, right .6).
 * cell(x, y) gives the texture path for column x (0..W-1 front, W..W+D-1 the right side) and row y (0 = bottom);
 * top(x, z) the texture of the top face. c = block size in output pixels.
 */
export function renderWall({ W, H, D, cell, top, c = 48 }) {
  const grid = (cols, rows, at) => (u, v) => {
    const cx = Math.min(cols - 1, Math.floor(u * cols)), cy = Math.min(rows - 1, Math.floor(v * rows));
    return texel(texture(at(cx, cy)), u * cols - cx, v * rows - cy);
  };
  return rasterise([
    { O: [-W * c / 2, -H * c / 2, -D * c / 2], U: [W * c, 0, 0], V: [0, 0, D * c], light: 1, sample: grid(W, D, (x, z) => top(x, z)) },
    { O: [-W * c / 2, -H * c / 2, D * c / 2], U: [W * c, 0, 0], V: [0, H * c, 0], light: 0.9, sample: grid(W, H, (x, r) => cell(x, H - 1 - r)) },
    { O: [W * c / 2, -H * c / 2, D * c / 2], U: [0, 0, -D * c], V: [0, H * c, 0], light: 0.6, sample: grid(D, H, (x, r) => cell(W + x, H - 1 - r)) },
  ], -20, -32);
}

// ---------- palette PNG (PNG-8 with alpha): median-cut to <= 256 colours, far smaller for pixel art ----------
export function encodePNG8(w, h, rgba, maxColors = 256) {
  // unique colours (alpha rounded to 17 levels: only edge pixels are partly transparent)
  const counts = new Map();
  for (let i = 0; i < w * h; i++) {
    const a = rgba[i * 4 + 3], qa = a === 0 ? 0 : Math.round(a / 16) * 16 > 255 ? 255 : Math.round(a / 16) * 16;
    const key = qa === 0 ? 0 : ((rgba[i * 4] << 24) | (rgba[i * 4 + 1] << 16) | (rgba[i * 4 + 2] << 8) | qa) >>> 0;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const cols = [...counts].filter(([k]) => k !== 0).map(([k, n]) => [k >>> 24, (k >>> 16) & 255, (k >>> 8) & 255, k & 255, n]);
  let boxes = [cols];
  while (boxes.length < maxColors - 1) {
    // split the box with the widest (count-weighted) channel range
    let bi = -1, bc = 0, br = 0;
    boxes.forEach((b, i) => { if (b.length < 2) return; for (let c = 0; c < 4; c++) { let lo = 255, hi = 0; for (const p of b) { if (p[c] < lo) lo = p[c]; if (p[c] > hi) hi = p[c]; } const r = (hi - lo) * (c === 3 ? 2 : 1) * Math.sqrt(b.length); if (r > br) { br = r; bi = i; bc = c; } } });
    if (bi < 0) break;
    const b = boxes[bi].sort((p, q) => p[bc] - q[bc]); let total = 0; for (const p of b) total += p[4];
    let acc = 0, cut = 1; for (let i = 0; i < b.length - 1; i++) { acc += b[i][4]; if (acc >= total / 2) { cut = i + 1; break; } }
    boxes.splice(bi, 1, b.slice(0, cut), b.slice(cut));
  }
  const pal = boxes.filter((b) => b.length).map((b) => { const s = [0, 0, 0, 0]; let n = 0; for (const p of b) { for (let c = 0; c < 4; c++) s[c] += p[c] * p[4]; n += p[4]; } return s.map((v) => Math.round(v / n)); });
  pal.unshift([0, 0, 0, 0]); // index 0 = fully transparent
  const nearest = new Map(), idx = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = rgba[i * 4 + 3]; if (a < 8) continue;
    const key = ((rgba[i * 4] << 24) | (rgba[i * 4 + 1] << 16) | (rgba[i * 4 + 2] << 8) | a) >>> 0;
    let k = nearest.get(key);
    if (k === undefined) {
      let bd = Infinity; k = 1;
      for (let j = 1; j < pal.length; j++) { const p = pal[j], d = (p[0] - rgba[i * 4]) ** 2 + (p[1] - rgba[i * 4 + 1]) ** 2 + (p[2] - rgba[i * 4 + 2]) ** 2 + 2 * (p[3] - a) ** 2; if (d < bd) { bd = d; k = j; } }
      nearest.set(key, k);
    }
    idx[i] = k;
  }
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w + 1)] = 0; idx.copy(raw, y * (w + 1) + 1, y * w, (y + 1) * w); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 3;
  const plte = Buffer.alloc(pal.length * 3), trns = Buffer.alloc(pal.length);
  pal.forEach((p, i) => { plte[i * 3] = p[0]; plte[i * 3 + 1] = p[1]; plte[i * 3 + 2] = p[2]; trns[i] = p[3]; });
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('tRNS', trns), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
