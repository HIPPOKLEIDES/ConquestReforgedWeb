// Historia: Rome page: nav, catalogue tabs/search, bestiary filters, gallery lightbox, reveal-on-scroll.
(function () {
  var nav = document.querySelector('.nav');
  var onScroll = function () { nav.classList.toggle('solid', window.scrollY > 40); };
  onScroll();
  addEventListener('scroll', onScroll, { passive: true });
  var toggle = document.querySelector('.nav-toggle');
  toggle.addEventListener('click', function () {
    var open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
  });
  document.querySelectorAll('.nav-links a').forEach(function (a) {
    a.addEventListener('click', function () { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', false); });
  });

  // highlight the section in view
  var links = {};
  document.querySelectorAll('.nav-links a').forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
  if ('IntersectionObserver' in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting && links[e.target.id]) {
          Object.keys(links).forEach(function (k) { links[k].classList.toggle('active', k === e.target.id); });
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(links).forEach(function (id) { var s = document.getElementById(id); if (s) spy.observe(s); });

    var rev = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); rev.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -10% 0px' });
    document.querySelectorAll('.reveal').forEach(function (el) { rev.observe(el); });

    // only play the background videos while they are on screen
    var vids = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { var p = e.target.play(); if (p && p.catch) p.catch(function () {}); } else e.target.pause(); });
    });
    document.querySelectorAll('video').forEach(function (v) { vids.observe(v); });
  } else {
    document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); });
  }

  // catalogue
  var tabs = document.querySelectorAll('.cat-tabs button');
  var items = document.querySelectorAll('.item');
  var search = document.querySelector('.cat-search input');
  var empty = document.querySelector('.cat-empty');
  var more = document.querySelector('.cat-more');
  var group = '', expanded = false, PREVIEW = 48;
  function applyCatalog() {
    var q = (search.value || '').trim().toLowerCase();
    var shown = 0, cap = (!group && !q && !expanded) ? PREVIEW : Infinity;
    items.forEach(function (it) {
      var ok = (!group || it.dataset.group === group) && (!q || it.dataset.search.indexOf(q) !== -1);
      it.hidden = !ok || shown >= cap;
      if (ok) shown++;
    });
    empty.hidden = shown > 0;
    more.hidden = !(shown > cap);
  }
  more.querySelector('button').addEventListener('click', function () { expanded = true; applyCatalog(); });
  tabs.forEach(function (b) {
    b.addEventListener('click', function () {
      tabs.forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
      group = b.dataset.group;
      applyCatalog();
    });
  });
  search.addEventListener('input', function () {
    if (search.value && group) { group = ''; tabs.forEach(function (x, i) { x.classList.toggle('on', i === 0); }); }
    applyCatalog();
  });
  applyCatalog();

  // bestiary filters
  var mobBtns = document.querySelectorAll('.mob-filters button');
  mobBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      mobBtns.forEach(function (x) { x.classList.toggle('on', x === b); });
      document.querySelectorAll('.mob').forEach(function (m) { m.hidden = !!b.dataset.kind && m.dataset.kind !== b.dataset.kind; });
    });
  });

  // double slabs: tap to compare on touch screens
  document.querySelectorAll('.ds.has-base').forEach(function (d) {
    d.addEventListener('click', function () { d.classList.toggle('flip'); });
  });
  if (matchMedia('(hover: none)').matches) document.querySelectorAll('.ds-hint').forEach(function (h) { h.textContent = 'tap: regular block'; });

  var still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // citizens with several looks: cross-fade through them while the section is on screen
  var cyclers = Array.prototype.slice.call(document.querySelectorAll('.citizen.cycles'));
  var czVisible = false;
  if (cyclers.length && !still && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (e) { czVisible = e[0].isIntersecting; }).observe(document.getElementById('citizens'));
    var tick = 0;
    setInterval(function () {
      if (!czVisible || document.hidden) return;
      tick++;
      cyclers.forEach(function (c, i) {
        if ((tick + i) % 2) return; // stagger so the cards don't all change at once
        var imgs = c.querySelectorAll('img');
        var cur = c.querySelector('img.on');
        var idx = Array.prototype.indexOf.call(imgs, cur);
        cur.classList.remove('on');
        imgs[(idx + 1) % imgs.length].classList.add('on');
      });
    }, 1400);
  }

  // bestiary: idle loop by default, walk cycle on hover, still image for reduced motion
  document.querySelectorAll('.mob img').forEach(function (img) {
    if (still) { img.src = img.dataset.still; return; }
    var card = img.closest('.mob');
    if (img.dataset.walk) {
      card.addEventListener('mouseenter', function () { img.src = img.dataset.walk; });
      card.addEventListener('mouseleave', function () { img.src = img.dataset.idle || img.dataset.still; });
      card.addEventListener('click', function () { // touch screens: tap toggles walking
        if (!matchMedia('(hover: none)').matches) return;
        img.src = img.src.indexOf(img.dataset.walk) === -1 ? img.dataset.walk : (img.dataset.idle || img.dataset.still);
      });
    }
  });

  // armoury: base render + trim layer recoloured with the chosen material's palette
  (function () {
    var holder = document.getElementById('armoury-data');
    var canvas = document.querySelector('.arm-stage canvas');
    if (!holder || !canvas) return;
    var A = JSON.parse(holder.textContent);
    if (!A.pieces || !A.pieces.length) return;
    var ctx = canvas.getContext('2d');
    var hex = function (h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; };
    var mats = {}; A.materials.forEach(function (m) { mats[m.id] = { name: m.name, pal: m.palette.map(hex), dark: m.darker ? m.darker.map(hex) : null }; });
    var pieces = {}; A.pieces.forEach(function (p) { pieces[p.id] = p; });
    var state = { piece: pieces.iron_helmet ? 'iron_helmet' : A.pieces[0].id, trim: A.patterns.indexOf('ward') >= 0 ? 'ward' : '', mat: 'redstone', view: 'front' };
    var imgs = {}, layers = {};
    function img(src) {
      if (!imgs[src]) imgs[src] = new Promise(function (ok, bad) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = bad; i.src = src; });
      return imgs[src];
    }
    function layer(src) {
      if (!layers[src]) layers[src] = img(src).then(function (i) {
        var c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight;
        var x = c.getContext('2d'); x.drawImage(i, 0, 0);
        return x.getImageData(0, 0, c.width, c.height);
      });
      return layers[src];
    }
    var ticket = 0;
    function draw() {
      var t = ++ticket;
      var p = pieces[state.piece], v = p.views[state.view] || p.views.front;
      var trimSrc = state.trim && v[state.trim];
      var fixSrc = state.trim && v['fix-' + state.trim];
      var m = mats[state.mat];
      var pal = (p.darker === state.mat && m.dark) ? m.dark : m.pal;
      Promise.all([img(v.base), trimSrc ? layer(trimSrc) : null, fixSrc ? img(fixSrc) : null]).then(function (r) {
        if (t !== ticket) return;
        var base = r[0], L = r[1];
        canvas.width = base.naturalWidth; canvas.height = base.naturalHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(base, 0, 0);
        if (r[2]) ctx.drawImage(r[2], 0, 0); // parts of the trim painted in fixed colours
        if (L) {
          var out = new ImageData(L.width, L.height), s = L.data, o = out.data;
          for (var i = 0; i < s.length; i += 4) {
            if (s[i + 3] < 8) continue;
            var pos = s[i] / 32, a = Math.floor(pos), b = Math.min(7, a + 1), f = pos - a, sh = s[i + 1] / 255;
            var A0 = pal[a], B0 = pal[b];
            o[i] = (A0[0] + (B0[0] - A0[0]) * f) * sh; o[i + 1] = (A0[1] + (B0[1] - A0[1]) * f) * sh; o[i + 2] = (A0[2] + (B0[2] - A0[2]) * f) * sh; o[i + 3] = s[i + 3];
          }
          var c = document.createElement('canvas'); c.width = L.width; c.height = L.height; c.getContext('2d').putImageData(out, 0, 0);
          ctx.drawImage(c, 0, 0);
        }
      });
      var cap = p.name + (state.trim ? ' · ' + state.trim.charAt(0).toUpperCase() + state.trim.slice(1) + ' trim · ' + m.name : ' · no trim');
      document.querySelector('.arm-caption').textContent = cap;
      canvas.setAttribute('aria-label', cap);
      sync();
    }
    function sync() {
      document.querySelectorAll('.arm-pieces button').forEach(function (b) { b.classList.toggle('on', b.dataset.piece === state.piece); b.setAttribute('aria-pressed', b.dataset.piece === state.piece); });
      document.querySelectorAll('.arm-trims button').forEach(function (b) { b.classList.toggle('on', b.dataset.trim === state.trim); b.setAttribute('aria-pressed', b.dataset.trim === state.trim); });
      document.querySelectorAll('.arm-mats button').forEach(function (b) { b.classList.toggle('on', b.dataset.mat === state.mat); b.setAttribute('aria-pressed', b.dataset.mat === state.mat); });
      document.querySelectorAll('.arm-views button').forEach(function (b) { b.classList.toggle('on', b.dataset.view === state.view); });
      document.querySelector('.arm-mats').setAttribute('aria-disabled', !state.trim);
    }
    var bind = function (sel, key) {
      document.querySelectorAll(sel).forEach(function (b) { b.addEventListener('click', function () { state[key] = b.dataset[key]; draw(); }); });
    };
    bind('.arm-pieces button', 'piece'); bind('.arm-trims button', 'trim'); bind('.arm-mats button', 'mat'); bind('.arm-views button', 'view');
    // drag sideways on the preview to turn the statue around
    var x0 = null;
    canvas.addEventListener('pointerdown', function (e) { x0 = e.clientX; });
    addEventListener('pointerup', function () { x0 = null; });
    canvas.addEventListener('pointermove', function (e) {
      if (x0 === null || Math.abs(e.clientX - x0) < 40) return;
      x0 = e.clientX; state.view = state.view === 'front' ? 'back' : 'front'; draw();
    });
    // only start loading once the section comes near the screen
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); draw(); } }, { rootMargin: '400px 0px' });
      io.observe(canvas);
    } else draw();
  })();

  // gallery lightbox
  var lb = document.querySelector('.lightbox');
  var lbImg = lb.querySelector('img');
  var shots = Array.prototype.slice.call(document.querySelectorAll('.gallery a'));
  var cur = 0;
  function show(i) { cur = (i + shots.length) % shots.length; lbImg.src = shots[cur].href; lbImg.alt = shots[cur].querySelector('img').alt; lb.hidden = false; }
  shots.forEach(function (a, i) { a.addEventListener('click', function (e) { e.preventDefault(); show(i); }); });
  lb.querySelector('.lb-close').addEventListener('click', function () { lb.hidden = true; });
  lb.querySelector('.lb-prev').addEventListener('click', function () { show(cur - 1); });
  lb.querySelector('.lb-next').addEventListener('click', function () { show(cur + 1); });
  lb.addEventListener('click', function (e) { if (e.target === lb) lb.hidden = true; });
  addEventListener('keydown', function (e) {
    if (lb.hidden) return;
    if (e.key === 'Escape') lb.hidden = true;
    if (e.key === 'ArrowLeft') show(cur - 1);
    if (e.key === 'ArrowRight') show(cur + 1);
  });
})();
