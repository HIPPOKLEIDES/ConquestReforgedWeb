// /conquest-bedrock showcases: which card is open, Show all / Show fewer, tap-to-open on touch screens, keeping an
// open card's frame on screen, and fading through the double slabs' random textures.
(function () {
  var touch = matchMedia('(hover: none)').matches;
  var MARGIN = 14;

  // ---- random textures: a double slab picture with data-f="pos|pos|..." (frames in its strip image) fades to
  // the next frame every 2 seconds; only cards on screen take part ----
  var cycling = new Set(), tick = 0;
  var io = 'IntersectionObserver' in window && new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      e.target.querySelectorAll('[data-f]').forEach(function (p) {
        if (!p._f) p._f = p.getAttribute('data-f').split('|');
        if (e.isIntersecting) cycling.add(p); else cycling.delete(p);
      });
    });
  }, { rootMargin: '100px' });
  if (io) document.querySelectorAll('.sx-card').forEach(function (c) { if (c.querySelector('[data-f]')) io.observe(c); });
  setInterval(function () {
    if (document.hidden || !cycling.size) return;
    tick++;
    cycling.forEach(function (p) {
      // the next frame fades in on the inner layer, then becomes the picture's own position
      var pos = p._f[tick % p._f.length], layer = p.firstElementChild;
      layer.style.backgroundPosition = pos;
      layer.classList.add('in');
      setTimeout(function () { p.style.backgroundPosition = pos; layer.classList.remove('in'); }, 900);
    });
  }, 2000);

  // ---- keeping an open frame on screen: near the bottom of the screen it is lifted so its bottom stays just
  // above the screen edge, and it follows the page back down to its own place while scrolling ----
  function px(el, name) { return parseFloat(getComputedStyle(el).getPropertyValue(name)) || 0; }
  function lift(card) {
    var root = card.closest('[data-sx]'), r = card.getBoundingClientRect();
    var over = r.top + px(root, '--card-h') + px(root, '--drop') - (innerHeight - MARGIN);
    card.style.setProperty('--lift', Math.max(0, Math.min(over, r.top - MARGIN)) + 'px'); // never above the top
  }
  function unlift(card) { card.style.setProperty('--lift', '0px'); }

  // ---- which card is open (mouse): the card whose own box is under the pointer. Checked on every mouse move
  // and on every scroll, so scrolling the page under a still mouse opens whatever card it now points at ----
  var hot = null, mx = -1, my = -1, idle = null;
  function cardAt(x, y) {
    var el = document.elementFromPoint(x, y), c = el && el.closest && el.closest('.sx-card');
    return c && c.closest('[data-sx]') ? c : null;
  }
  function setHot(c) {
    if (c === hot) { if (c) lift(c); return; }
    if (hot) { hot.classList.remove('hot'); unlift(hot); }
    hot = c;
    if (c) { c.classList.add('hot'); lift(c); }
  }
  if (!touch) {
    document.addEventListener('mousemove', function (e) { mx = e.clientX; my = e.clientY; setHot(cardAt(mx, my)); }, { passive: true });
    document.documentElement.addEventListener('mouseleave', function () { mx = my = -1; setHot(null); });
  }
  addEventListener('scroll', function () {
    if (mx >= 0) setHot(cardAt(mx, my));
    var open = hot || document.querySelector('.sx-card.open');
    if (!open) return;
    // follow the scroll without easing, ease again once scrolling stops
    var root = open.closest('[data-sx]');
    root.classList.add('live');
    lift(open);
    clearTimeout(idle);
    idle = setTimeout(function () { root.classList.remove('live'); }, 140);
  }, { passive: true });
  addEventListener('resize', function () { if (hot) lift(hot); });

  document.querySelectorAll('[data-sx]').forEach(function (root) {
    var btn = root.querySelector('.sx-more .bx-btn');
    var cards = Array.prototype.slice.call(root.querySelectorAll('.sx-card'));
    var shown = +root.getAttribute('data-initial') || 6;

    // keyboard
    cards.forEach(function (c) {
      c.addEventListener('focus', function () { lift(c); });
      c.addEventListener('blur', function () { if (c !== hot) unlift(c); });
    });

    if (btn) btn.addEventListener('click', function () {
      var opening = root.classList.contains('collapsed');
      root.classList.toggle('collapsed', !opening);
      root.classList.toggle('expanded', opening);
      btn.setAttribute('aria-expanded', opening);
      btn.querySelector('span').textContent = btn.getAttribute(opening ? 'data-less' : 'data-more');
      cards.forEach(function (c, i) {
        c.classList.remove('reveal', 'open');
        if (opening && i >= shown) { c.style.setProperty('--i', i - shown); void c.offsetWidth; c.classList.add('reveal'); }
      });
      // after collapsing from far down, bring the section back into view
      var sec = root.closest('.bx-sec') || root;
      if (!opening && sec.getBoundingClientRect().top < 0) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // touch: tap a card to open it, tap again or elsewhere to close
    if (touch) {
      var hint = root.parentNode.querySelector('.bx-hint b');
      if (hint) hint.textContent = 'Tap';
      cards.forEach(function (c) {
        c.addEventListener('click', function (e) {
          e.stopPropagation();
          var was = c.classList.contains('open');
          document.querySelectorAll('.sx-card.open').forEach(function (o) { o.classList.remove('open'); unlift(o); });
          if (!was) { c.classList.add('open'); lift(c); }
        });
      });
    }
  });
  if (touch) document.addEventListener('click', function () {
    document.querySelectorAll('.sx-card.open').forEach(function (o) { o.classList.remove('open'); unlift(o); });
  });
})();

// Marketplace banner: show the dark bar behind it only once the arrow has reached the top of the screen
(function () {
  var bars = document.querySelectorAll('.bx-page .div-block-239');
  if (!bars.length) return;
  function update() {
    bars.forEach(function (b) {
      if (getComputedStyle(b).display === 'none') return;
      b.classList.toggle('bx-stuck', b.querySelector('.button-18').getBoundingClientRect().top <= 12);
    });
  }
  // Webflow moves the banner a frame or so after the scroll event, so keep checking for a moment after each scroll
  var until = 0, running = false;
  function loop() {
    update();
    if (performance.now() < until) requestAnimationFrame(loop); else running = false;
  }
  function kick() { until = performance.now() + 500; if (!running) { running = true; requestAnimationFrame(loop); } }
  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', update);
  setTimeout(update, 400);
})();

// Armoury: the Conquest pack's own armour and trim textures drawn on the standard armour model, in the browser.
//  - the armour texture (128x64, vanilla layout at double size) is wrapped onto boxes (head, body, arms, legs)
//  - a trim texture is laid over it after recolouring: each pixel's grey is looked up in the pack's colour key
//    (trim_palette.png) and takes the colour at the same position in the chosen material's palette; pixels that
//    aren't in the key keep their own colour
//  - a small z-buffer rasteriser (orthographic view, nearest-neighbour texels) draws it, so the statue can be turned
(function () {
  var grid = document.querySelector('.arm-grid[data-armoury]');
  var canvas = grid && grid.querySelector('.arm-stage canvas');
  if (!canvas) return;
  var D = null, T = 2; // T = texels per model unit (128px wide armour textures)
  var state = { piece: '', trim: '', mat: 'gold', yaw: -22, pitch: 10 };
  var FRONT = -22, BACK = 158;

  // ---------- images ----------
  var imgs = {}, datas = {};
  function img(src) {
    if (!imgs[src]) imgs[src] = new Promise(function (ok, bad) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = bad; i.src = src; });
    return imgs[src];
  }
  function pixels(src) {
    if (!datas[src]) datas[src] = img(src).then(function (i) {
      var c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight;
      var x = c.getContext('2d'); x.drawImage(i, 0, 0);
      return x.getImageData(0, 0, c.width, c.height);
    });
    return datas[src];
  }
  var hex = function (h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; };
  var keyIndex = null; // 'r,g,b' -> position in the colour key
  function keyOf(r, g, b) { return keyIndex[(r << 16) | (g << 8) | b]; }

  // ---------- the model: boxes with vanilla UV unfolding ----------
  // a box at (x,y,z) with size (w,h,d), texture origin (u,v) in 64x32 units, grown by "grow" on every side
  function boxFaces(x, y, z, w, h, d, grow, u, v, mirror) {
    var x0 = x - grow, y0 = y - grow, z0 = z - grow, W = w + 2 * grow, H = h + 2 * grow, Dp = d + 2 * grow, x1 = x0 + W, y1 = y0 + H, z1 = z0 + Dp;
    var f = [
      { O: [x0, y0, z0], U: [W, 0, 0], V: [0, H, 0], n: [0, 0, -1], r: [u + d, v + d, w, h] },            // front
      { O: [x1, y0, z1], U: [-W, 0, 0], V: [0, H, 0], n: [0, 0, 1], r: [u + 2 * d + w, v + d, w, h] },    // back
      { O: [x0, y0, z1], U: [0, 0, -Dp], V: [0, H, 0], n: [-1, 0, 0], r: [u, v + d, d, h] },              // x- side
      { O: [x1, y0, z0], U: [0, 0, Dp], V: [0, H, 0], n: [1, 0, 0], r: [u + d + w, v + d, d, h] },        // x+ side
      { O: [x0, y0, z1], U: [W, 0, 0], V: [0, 0, -Dp], n: [0, -1, 0], r: [u + d, v, w, d] },              // top
      { O: [x0, y1, z0], U: [W, 0, 0], V: [0, 0, Dp], n: [0, 1, 0], r: [u + d + w, v, w, d] }             // bottom
    ];
    if (mirror) { // a mirrored box is the same box reflected through its own centre plane
      var cx = x0 + W / 2;
      f.forEach(function (q) { q.O[0] = 2 * cx - q.O[0]; q.U[0] = -q.U[0]; q.V[0] = -q.V[0]; q.n[0] = -q.n[0]; });
    }
    return f;
  }
  var BODY = { head: [-4, -8, -4, 8, 8, 8, 0, 0], hat: [-4, -8, -4, 8, 8, 8, 32, 0], body: [-4, 0, -2, 8, 12, 4, 16, 16], rarm: [-8, 0, -2, 4, 12, 4, 40, 16], larm: [4, 0, -2, 4, 12, 4, 40, 16, 1], rleg: [-4, 12, -2, 4, 12, 4, 0, 16], lleg: [0, 12, -2, 4, 12, 4, 0, 16, 1] };
  var ARMOUR_PARTS = { helmet: ['head', 'hat'], chestplate: ['body', 'rarm', 'larm'], leggings: ['body', 'rleg', 'lleg'], boots: ['rleg', 'lleg'] };
  var FRAMING = { helmet: [-5, 20], chestplate: [7, 27], leggings: [17, 25], boots: [21, 17] }; // [centre y, height shown] in model units
  function partFaces(name, grow) { var p = BODY[name]; if (name === 'hat') grow += 0.5; /* the outer head layer sits half a unit further out */ return boxFaces(p[0], p[1], p[2], p[3], p[4], p[5], grow, p[6], p[7], p[8]); }

  // a player skin on the statue: [x, y, z, w, h, d, grow, u, v, mirror] per box; the outer layer sits a little further out
  function skinBoxes(sk) {
    var aw = sk.slim ? 3 : 4, b = [
      [-4, -8, -4, 8, 8, 8, 0, 0, 0], [-4, -8, -4, 8, 8, 8, 0.5, 32, 0],
      [-4, 0, -2, 8, 12, 4, 0, 16, 16],
      [sk.slim ? -7 : -8, 0, -2, aw, 12, 4, 0, 40, 16],
      [-4, 12, -2, 4, 12, 4, 0, 0, 16]
    ];
    if (sk.legacy) { b.push([4, 0, -2, aw, 12, 4, 0, 40, 16, 1], [0, 12, -2, 4, 12, 4, 0, 0, 16, 1]); }
    else b.push([-4, 0, -2, 8, 12, 4, 0.25, 16, 32], [sk.slim ? -7 : -8, 0, -2, aw, 12, 4, 0.25, 40, 32], [-4, 12, -2, 4, 12, 4, 0.25, 0, 32],
      [4, 0, -2, aw, 12, 4, 0, 32, 48], [4, 0, -2, aw, 12, 4, 0.25, 48, 48], [0, 12, -2, 4, 12, 4, 0, 16, 48], [0, 12, -2, 4, 12, 4, 0.25, 0, 48]);
    return b;
  }

  // ---------- rasteriser ----------
  // fast = 1 sample per pixel (while dragging/turning), otherwise 2x2 supersampling for smooth edges.
  // Buffers are kept per canvas and reused; each face only visits the pixels of its own parallelogram.
  function render(target, items, fr, yaw, pitch, withMannequin, skin, fast) { // items: [{ slot, tex }]
    var SS = fast ? 1 : 2, W = target.width, H = target.height, w = W * SS, h = H * SS;
    var B = target._buf;
    if (!B || B.w !== w || B.h !== h) B = target._buf = { w: w, h: h, col: new Uint8Array(w * h * 3), alpha: new Uint8Array(w * h), zb: new Float32Array(w * h), out: new ImageData(W, H) };
    var col = B.col, alpha = B.alpha, zb = B.zb;
    alpha.fill(0); zb.fill(1e9);
    var rb = Math.cos(pitch * Math.PI / 180), sb = Math.sin(pitch * Math.PI / 180), ra = Math.cos(yaw * Math.PI / 180), sa = Math.sin(yaw * Math.PI / 180);
    var scale = h / fr[1], cy = fr[0];
    function rot(x, y, z, move) { // yaw about y, then pitch about x
      if (move) y -= cy;
      var x1 = x * ra + z * sa, z1 = -x * sa + z * ra;
      return [x1, y * rb - z1 * sb, y * sb + z1 * rb];
    }
    var L = [-0.45, -0.65, -0.62], Lm = Math.hypot(L[0], L[1], L[2]); L = [L[0] / Lm, L[1] / Lm, L[2] / Lm];
    function face(q, sampler, flat, solid) {
      var n = rot(q.n[0], q.n[1], q.n[2], 0);
      if (solid && n[2] > 1e-6) return; // closed, opaque box: faces turned away are hidden anyway
      var o = rot(q.O[0], q.O[1], q.O[2], 1), pu = rot(q.O[0] + q.U[0], q.O[1] + q.U[1], q.O[2] + q.U[2], 1), pv = rot(q.O[0] + q.V[0], q.O[1] + q.V[1], q.O[2] + q.V[2], 1);
      var ox = w / 2 + o[0] * scale, oy = h / 2 + o[1] * scale;
      var ux = (pu[0] - o[0]) * scale, uy = (pu[1] - o[1]) * scale, uz = pu[2] - o[2], vx = (pv[0] - o[0]) * scale, vy = (pv[1] - o[1]) * scale, vz = pv[2] - o[2];
      var det = ux * vy - uy * vx;
      if (Math.abs(det) < 1e-4) return;
      var inv = 1 / det, lit = 0.5 + 0.5 * Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
      var minx = Math.max(0, Math.floor(Math.min(ox, ox + ux, ox + vx, ox + ux + vx))), maxx = Math.min(w - 1, Math.ceil(Math.max(ox, ox + ux, ox + vx, ox + ux + vx)));
      var miny = Math.max(0, Math.floor(Math.min(oy, oy + uy, oy + vy, oy + uy + vy))), maxy = Math.min(h - 1, Math.ceil(Math.max(oy, oy + uy, oy + vy, oy + uy + vy)));
      var fr0 = flat && flat[0] * lit, fr1 = flat && flat[1] * lit, fr2 = flat && flat[2] * lit;
      var td = sampler && sampler.data, tw = sampler && sampler.width, th = sampler && sampler.height, sc = sampler && sampler.width / 64;
      var sA = vy * inv, tA = -uy * inv; // s and t change by these per pixel step in x
      for (var py = miny; py <= maxy; py++) {
        var Y = py + 0.5 - oy, sB = -Y * vx * inv, tB = Y * ux * inv;
        // the x range of this row where 0 <= s < 1 and 0 <= t < 1
        var lo = -Infinity, hi = Infinity, a, b;
        if (sA !== 0) { a = -sB / sA; b = (1 - sB) / sA; if (a > b) { var c1 = a; a = b; b = c1; } lo = Math.max(lo, a); hi = Math.min(hi, b); } else if (sB < 0 || sB >= 1) continue;
        if (tA !== 0) { a = -tB / tA; b = (1 - tB) / tA; if (a > b) { var c2 = a; a = b; b = c2; } lo = Math.max(lo, a); hi = Math.min(hi, b); } else if (tB < 0 || tB >= 1) continue;
        var x0 = Math.max(minx, Math.ceil(lo + ox - 0.5) - 1), x1 = Math.min(maxx, Math.floor(hi + ox - 0.5) + 1);
        if (x0 > x1) continue;
        var X = x0 + 0.5 - ox, s = sA * X + sB, t = tA * X + tB, row = py * w;
        for (var px = x0; px <= x1; px++, s += sA, t += tA) {
          if (s < 0 || s >= 1 || t < 0 || t >= 1) continue;
          var z = o[2] + s * uz + t * vz, i = row + px;
          if (z >= zb[i]) continue;
          if (flat) { zb[i] = z; alpha[i] = 1; col[i * 3] = fr0; col[i * 3 + 1] = fr1; col[i * 3 + 2] = fr2; continue; }
          var tx = (q.r[0] + s * q.r[2]) * sc | 0, ty = (q.r[1] + t * q.r[3]) * sc | 0;
          if (tx >= tw) tx = tw - 1; if (ty >= th) ty = th - 1;
          var k = (ty * tw + tx) * 4;
          if (td[k + 3] < 128) continue;
          zb[i] = z; alpha[i] = 1; col[i * 3] = td[k] * lit; col[i * 3 + 1] = td[k + 1] * lit; col[i * 3 + 2] = td[k + 2] * lit;
        }
      }
    }
    if (withMannequin && skin) skinBoxes(skin).forEach(function (p) { boxFaces(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9]).forEach(function (q) { face(q, skin.tex, null, false); }); });
    else if (withMannequin) Object.keys(BODY).forEach(function (nm) { if (nm === 'hat') return; partFaces(nm, 0).forEach(function (q) { face(q, null, [226, 217, 200], true); }); });
    items.forEach(function (it) {
      var grow = it.slot === 'leggings' ? 0.5 : 1;
      ARMOUR_PARTS[it.slot].forEach(function (nm) { partFaces(nm, grow).forEach(function (q) { face(q, it.tex, null, false); }); });
    });
    var out = B.out, od = out.data;
    if (SS === 1) {
      for (var p = 0, n1 = W * H; p < n1; p++) {
        var o1 = p * 4;
        if (!alpha[p]) { od[o1 + 3] = 0; continue; }
        od[o1] = col[p * 3]; od[o1 + 1] = col[p * 3 + 1]; od[o1 + 2] = col[p * 3 + 2]; od[o1 + 3] = 255;
      }
    } else {
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
        var r = 0, g = 0, bl = 0, cnt = 0, j0 = (y * 2) * w + x * 2;
        for (var m = 0; m < 4; m++) {
          var j = j0 + (m >> 1) * w + (m & 1);
          if (alpha[j]) { cnt++; r += col[j * 3]; g += col[j * 3 + 1]; bl += col[j * 3 + 2]; }
        }
        var o2 = (y * W + x) * 4;
        if (!cnt) { od[o2 + 3] = 0; continue; }
        od[o2] = r / cnt; od[o2 + 1] = g / cnt; od[o2 + 2] = bl / cnt; od[o2 + 3] = cnt * 255 / 4;
      }
    }
    target.getContext('2d').putImageData(out, 0, 0);
  }

  // ---------- the texture of a piece with a trim and material ----------
  var trimIdx = {}; // trim file -> Int8Array of key positions per pixel (-1 = not in the key), plus its pixels
  function trimLayer(src) {
    if (!trimIdx[src]) trimIdx[src] = pixels(src).then(function (im) {
      var idx = new Int8Array(im.width * im.height).fill(-2);
      for (var i = 0; i < idx.length; i++) {
        if (im.data[i * 4 + 3] < 8) continue;
        var k = keyOf(im.data[i * 4], im.data[i * 4 + 1], im.data[i * 4 + 2]);
        idx[i] = k === undefined ? -1 : k;
      }
      return { im: im, idx: idx };
    });
    return trimIdx[src];
  }
  var texMemo = {}, texReady = {}, texOrder = [];
  function texKey(piece, trim, mat) { return piece.id + '|' + (trim || '') + '|' + (mat ? mat.id : ''); }
  function composite(piece, trim, mat) {
    var key = texKey(piece, trim, mat);
    if (!texMemo[key]) {
      texMemo[key] = buildTexture(piece, trim, mat).then(function (tex) { texReady[key] = tex; return tex; });
      texOrder.push(key);
      if (texOrder.length > 80) { var old = texOrder.shift(); delete texMemo[old]; delete texReady[old]; } // keep memory bounded
    }
    return texMemo[key];
  }
  function buildTexture(piece, trim, mat) {
    var pal = mat && ((piece.darker === mat.id && mat.dark) ? mat.dark : mat.pal);
    var jobs = [pixels(piece.tex), piece.overlay ? pixels(piece.overlay) : null, trim ? trimLayer(D.trims + trim + (piece.slot === 'leggings' ? '_leggings.png' : '.png')) : null];
    return Promise.all(jobs).then(function (r) {
      var base = r[0], out = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height), d = out.data;
      if (r[1]) { // leather: the overlay goes on top of the base
        var ov = r[1].data;
        for (var i = 0; i < d.length; i += 4) if (ov[i + 3] > 8) { d[i] = ov[i]; d[i + 1] = ov[i + 1]; d[i + 2] = ov[i + 2]; d[i + 3] = 255; }
      }
      if (r[2]) {
        var tl = r[2], td = tl.im.data;
        for (var p = 0; p < tl.idx.length; p++) {
          var k = tl.idx[p]; if (k === -2) continue;
          var o = p * 4;
          if (k >= 0 && pal) { d[o] = pal[k][0]; d[o + 1] = pal[k][1]; d[o + 2] = pal[k][2]; } else { d[o] = td[o]; d[o + 1] = td[o + 1]; d[o + 2] = td[o + 2]; }
          d[o + 3] = 255;
        }
      }
      return out;
    });
  }

  // ---------- page ----------
  var mats = {}, pieces = {}, ticket = 0, anim = 0;
  // paint the single view; synchronous when its texture is already built
  function renderMain(fast) {
    var t = ++ticket, p = pieces[state.piece], m = mats[state.mat], ready = texReady[texKey(p, state.trim, m)];
    var paint = function (tex) { if (t === ticket) render(canvas, [{ slot: p.slot, tex: tex }], FRAMING[p.slot], state.yaw, state.pitch, true, null, fast); };
    if (ready) paint(ready); else composite(p, state.trim, m).then(paint);
  }
  // paint the full figure
  function renderSet(fast) {
    if (!setCanvas) return;
    var t = ++setTicket, list = SLOTS.filter(function (s) { return worn[s]; }).map(function (s) { return worn[s]; });
    var keys = list.map(function (w) { return texKey(pieces[w.piece], w.trim, mats[w.mat]); });
    var paint = function (texs) { if (t === setTicket) render(setCanvas, list.map(function (w, i) { return { slot: pieces[w.piece].slot, tex: texs[i] }; }), [7.5, 35], state.yaw, state.pitch, true, skin, fast); };
    if (keys.every(function (k) { return texReady[k]; })) paint(keys.map(function (k) { return texReady[k]; }));
    else Promise.all(list.map(function (w) { return composite(pieces[w.piece], w.trim, mats[w.mat]); })).then(paint);
  }
  // turning: at most one repaint per frame, quick (1 sample per pixel) while moving, full quality once it settles
  var frameReq = 0, settle = 0;
  function turned() {
    if (!frameReq) frameReq = requestAnimationFrame(function () {
      frameReq = 0; renderMain(true); renderSet(true); syncViews();
      clearTimeout(settle); settle = setTimeout(function () { renderMain(false); renderSet(false); }, 160);
    });
  }
  function draw() {
    var p = pieces[state.piece], m = mats[state.mat];
    renderMain(false);
    drawSet();
    var cap = p.name + (state.trim ? ' · ' + state.trim.charAt(0).toUpperCase() + state.trim.slice(1) + ' trim · ' + m.name : ' · no trim');
    grid.querySelector('.arm-caption').textContent = cap;
    canvas.setAttribute('aria-label', cap);
    sync();
  }
  // ---------- the full figure: the last piece chosen for each body part, wearing the current trim and material ----------
  var SLOTS = ['helmet', 'chestplate', 'leggings', 'boots'], setCanvas = grid.parentNode.querySelector('.arm-set canvas'), setTicket = 0;
  // each body part remembers its own piece, trim pattern and trim material: { piece, trim, mat } or null
  var skin = null; // { tex: ImageData, slim, legacy } once a username has been applied
  function loadSkin(raw) {
    var box = grid.parentNode.querySelector('.arm-skin'), msg = box.querySelector('.arm-skin-msg'), name = (raw || '').trim();
    var say = function (text, bad) { msg.textContent = text; msg.classList.toggle('bad', !!bad); };
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) { say('Enter a Minecraft username: 3 to 16 letters, numbers or underscores.', true); return; }
    say('Looking up ' + name + '…');
    var timed = function (u, o) { var c = new AbortController(), id = setTimeout(function () { c.abort(); }, 9000); return fetch(u, Object.assign({ signal: c.signal }, o || {})).then(function (x) { clearTimeout(id); return x; }, function (e) { clearTimeout(id); throw e; }); };
    var image = function (u) { return new Promise(function (ok, bad) { var i = new Image(); i.crossOrigin = 'anonymous'; i.onload = function () { ok(i); }; i.onerror = bad; i.src = u; }); };
    // 1) does the user exist? (the skin services answer with a default skin for any name)
    timed('https://playerdb.co/api/player/minecraft/' + encodeURIComponent(name)).then(function (res) {
      if (res.status === 400 || res.status === 404) return { missing: true };
      return res.json().then(function (j) { return j && j.success && j.data && j.data.player ? { id: j.data.player.raw_id, name: j.data.player.username } : { id: null, name: name }; });
    }, function () { return { id: null, name: name }; }) // lookup service down: try the name directly
    .then(function (who) {
      if (who.missing) { say('No Minecraft user called ' + name + ' was found.', true); return; }
      var key = who.id || who.name;
      return image('https://mc-heads.net/skin/' + encodeURIComponent(key)).catch(function () { return image('https://minotar.net/skin/' + encodeURIComponent(key)); }).then(function (img) {
        var c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        var x = c.getContext('2d'); x.drawImage(img, 0, 0);
        var data = x.getImageData(0, 0, c.width, c.height), k = c.width / 64, legacy = c.height * 2 <= c.width + 1 && c.height < c.width;
        // modern slim ("Alex") skins leave the last column of the right arm empty
        var slim = !legacy && data.data[((20 * k | 0) * c.width + (54 * k | 0)) * 4 + 3] === 0;
        skin = { tex: data, slim: slim, legacy: legacy, name: who.name };
        say('Showing the skin of ' + who.name + (slim ? ' (slim arms)' : '') + '.');
        drawSet();
      });
    }).catch(function () { say('Couldn\'t load that skin right now. Check the name and try again.', true); });
  }
  var worn = { helmet: null, chestplate: null, leggings: null, boots: null };
  var niceTrim = function (s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; };
  function drawSet() {
    if (!setCanvas) return;
    renderSet(false);
    var list = SLOTS.filter(function (s) { return worn[s]; });
    grid.parentNode.querySelector('.arm-set .arm-caption').textContent = list.length ? list.length + (list.length === 1 ? ' piece worn' : ' pieces worn') : 'Nothing worn';
    SLOTS.forEach(function (s) {
      var row = grid.parentNode.querySelector('.arm-worn [data-slot="' + s + '"]'), w = worn[s];
      if (!row) return;
      var b = row.querySelector('b'), small = b.querySelector('small');
      b.firstChild.nodeValue = w ? pieces[w.piece].name : 'Nothing';
      if (!small) { small = document.createElement('small'); b.appendChild(small); }
      small.textContent = w ? (w.trim ? niceTrim(w.trim) + ' trim · ' + mats[w.mat].name : 'No trim') : '';
      row.classList.toggle('empty', !w);
      row.querySelector('button').disabled = !w;
    });
  }
  // the piece in the single view is also the worn piece of its body part, so changing its trim or material changes that
  function wearCurrent() {
    var p = pieces[state.piece], w = worn[p.slot];
    if (w && w.piece === state.piece) { w.trim = state.trim; w.mat = state.mat; }
  }
  function sync() {
    grid.querySelectorAll('.arm-pieces button').forEach(function (b) { b.classList.toggle('on', b.dataset.piece === state.piece); b.setAttribute('aria-pressed', b.dataset.piece === state.piece); });
    grid.querySelectorAll('.arm-trims button').forEach(function (b) { b.classList.toggle('on', b.dataset.trim === state.trim); b.setAttribute('aria-pressed', b.dataset.trim === state.trim); });
    grid.querySelectorAll('.arm-mats button').forEach(function (b) { b.classList.toggle('on', b.dataset.mat === state.mat); b.setAttribute('aria-pressed', b.dataset.mat === state.mat); });
    grid.querySelector('.arm-mats').setAttribute('aria-disabled', !state.trim);
    syncViews();
  }
  var viewButtons = grid.querySelectorAll('.arm-views button'), lastFront = null;
  function syncViews() {
    var front = Math.cos((state.yaw - FRONT) * Math.PI / 180) > 0;
    if (front === lastFront) return;
    lastFront = front;
    viewButtons.forEach(function (b) { b.classList.toggle('on', (b.dataset.view === 'front') === front); });
  }
  function turnTo(yaw) { // ease to a yaw
    var from = state.yaw, d = ((yaw - from + 540) % 360) - 180, t0 = performance.now(), my = ++anim;
    (function step(now) {
      if (my !== anim) return;
      var k = Math.min(1, (now - t0) / 350), e = 1 - Math.pow(1 - k, 3);
      state.yaw = from + d * e;
      if (k < 1) { turned(); requestAnimationFrame(step); } else { renderMain(false); renderSet(false); syncViews(); }
    })(t0);
  }
  function thumbs() { // a small picture of every piece on its button
    D.pieces.forEach(function (p) {
      var b = grid.querySelector('.arm-pieces button[data-piece="' + p.id + '"]'), c = b && b.querySelector('canvas');
      if (!c) return;
      composite(p, '', null).then(function (tex) { render(c, [{ slot: p.slot, tex: tex }], FRAMING[p.slot], FRONT, 8, true, null, false); });
    });
  }
  function start(data) {
    D = data;
    var kx = {}; D.key.forEach(function (h, i) { var c = hex(h); kx[(c[0] << 16) | (c[1] << 8) | c[2]] = i; });
    // the key lists its colours twice near the end (black); the first position wins
    for (var i = D.key.length - 1; i >= 0; i--) { var c = hex(D.key[i]); kx[(c[0] << 16) | (c[1] << 8) | c[2]] = i; }
    keyIndex = kx;
    D.materials.forEach(function (m) { mats[m.id] = { id: m.id, name: m.name, pal: m.palette.map(hex), dark: m.darker ? m.darker.map(hex) : null }; });
    D.pieces.forEach(function (p) { pieces[p.id] = p; });
    state.piece = pieces.iron_helmet ? 'iron_helmet' : D.pieces[0].id;
    state.trim = D.patterns.indexOf('silence') >= 0 ? 'silence' : '';
    worn[pieces[state.piece].slot] = { piece: state.piece, trim: state.trim, mat: state.mat };
    [['.arm-pieces button', 'piece'], ['.arm-trims button', 'trim'], ['.arm-mats button', 'mat']].forEach(function (pair) {
      grid.querySelectorAll(pair[0]).forEach(function (b) { b.addEventListener('click', function () {
          state[pair[1]] = b.dataset[pair[1]];
          if (pair[1] === 'piece') {
            var p = pieces[state.piece], w = worn[p.slot];
            if (w && w.piece === state.piece) { state.trim = w.trim; state.mat = w.mat; } // a worn piece shows its own trim again
            else worn[p.slot] = { piece: state.piece, trim: state.trim, mat: state.mat };  // a new piece starts with the trim chosen so far
          } else wearCurrent();
          draw();
        }); });
    });
    grid.parentNode.querySelectorAll('.arm-worn [data-slot] button').forEach(function (b) { b.addEventListener('click', function () { worn[b.parentNode.dataset.slot] = null; drawSet(); }); });
    var form = grid.parentNode.querySelector('.arm-skin');
    if (form) {
      form.addEventListener('submit', function (e) { e.preventDefault(); loadSkin(form.querySelector('input').value); });
      form.querySelector('.arm-skin-reset').addEventListener('click', function () {
        skin = null; form.querySelector('input').value = ''; var m = form.querySelector('.arm-skin-msg'); m.textContent = ''; m.classList.remove('bad'); drawSet();
      });
    }
    var all = grid.parentNode.querySelector('.arm-worn-clear');
    if (all) all.addEventListener('click', function () { SLOTS.forEach(function (s) { worn[s] = null; }); drawSet(); });
    grid.querySelectorAll('.arm-views button').forEach(function (b) { b.addEventListener('click', function () { turnTo(b.dataset.view === 'front' ? FRONT : BACK); }); });
    // drag on the preview to turn the statue freely
    var x0 = null, y0 = null;
    [canvas, setCanvas].filter(Boolean).forEach(function (cv) { cv.addEventListener('pointerdown', function (e) { x0 = e.clientX; y0 = e.clientY; anim++; try { cv.setPointerCapture(e.pointerId); } catch (_) {} }); });
    addEventListener('pointerup', function () { if (x0 !== null) { x0 = null; clearTimeout(settle); renderMain(false); renderSet(false); } });
    [canvas, setCanvas].filter(Boolean).forEach(function (cv) { cv.addEventListener('pointermove', function (e) {
      if (x0 === null) return;
      state.yaw += (e.clientX - x0) * 0.8; state.pitch = Math.max(-5, Math.min(35, state.pitch - (e.clientY - y0) * 0.3));
      x0 = e.clientX; y0 = e.clientY; turned();
    }); });
    img(D.pieces[0].tex).then(function () { draw(); thumbs(); });
  }
  function load() { fetch(grid.getAttribute('data-armoury')).then(function (r) { return r.json(); }).then(start); }
  // only start once the section comes near the screen
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); load(); } }, { rootMargin: '400px 0px' });
    io.observe(canvas);
  } else load();
})();
