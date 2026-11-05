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
