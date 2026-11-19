// Landing page: the Bedrock card cycles through our Bedrock content (backgrounds + logos) and, on hover
// (or a tap on touch screens), shows a menu with one entry per category. Data: site.json -> bedrockCard.
// The landing page is a Webstudio (React) export, so the card is rebuilt after the page has hydrated;
// the static markup stays untouched and build() simply runs again if React ever puts the old card back.
(function () {
  var cfg = window.BX_CARD;
  if (!cfg) return;
  var n = cfg.entries.length;

  function el(tag, cls, attrs) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    return e;
  }
  function img(src, cls, pos) {
    var i = el('img', cls, { src: src, alt: '', decoding: 'async' });
    if (pos) i.style.objectPosition = pos;
    return i;
  }

  function build() {
    var a = document.querySelector('a.cr-card[href="/conquest-bedrock"]');
    if (!a) return;
    // same classes and styles, but a <div>: the menu inside holds links of its own
    var card = el('div');
    for (var i = 0; i < a.attributes.length; i++) if (a.attributes[i].name !== 'href') card.setAttribute(a.attributes[i].name, a.attributes[i].value);
    card.classList.add('bx-card');
    while (a.firstChild) card.appendChild(a.firstChild);

    // backgrounds, cross-fading (class cr-bg keeps the card's parallax script happy)
    var clip = el('div', 'bx-clip'), slides = el('div', 'bx-slides cr-bg');
    cfg.entries.forEach(function (e, k) { slides.appendChild(img(e.bg, 'bx-slide' + (k ? '' : ' on'), e.pos)); });
    clip.appendChild(slides);
    var oldBg = card.querySelector('img.cr-bg');
    if (oldBg) oldBg.remove();
    var ov = card.querySelector('.cr-ov');
    card.insertBefore(clip, card.firstChild);
    if (ov) {
      clip.appendChild(ov);
      // logos: the original one stays in place (it sizes the box), the others sit on top of it
      var logo = ov.querySelector('img');
      var logos = el('div', 'bx-logos');
      if (logo) {
        ov.insertBefore(logos, logo);
        logos.appendChild(logo);
        logo.removeAttribute('srcset');
        logo.removeAttribute('sizes');
        logo.removeAttribute('loading');
      }
      cfg.entries.forEach(function (e, k) {
        var l = k === 0 && logo ? logo : e.logo ? img(e.logo) : el('span');
        l.classList.add('bx-logo');
        if (k) l.classList.add('bx-over');
        if (k === 0) { if (e.logo && logo) logo.src = e.logo; l.classList.add('on'); }
        if (l !== logo) logos.appendChild(l);
      });
      var texts = ov.children;
      if (texts[1]) texts[1].textContent = cfg.title;
      if (texts[2]) texts[2].textContent = cfg.subtitle;
      // the description stays (invisible): it keeps the title at the same height as on the other cards
    }

    // the menu
    var menu = el('nav', 'bx-menu', { 'aria-label': cfg.title });
    var head = el('div', 'bx-head');
    if (cfg.headLogo) head.style.setProperty('--bx-head-logo', 'url("' + cfg.headLogo + '")');
    head.appendChild(el('b')).textContent = cfg.title;
    head.appendChild(el('small')).textContent = cfg.subtitle;
    menu.appendChild(head);
    cfg.entries.forEach(function (e) {
      var item = e.href ? el('a', 'bx-entry', { href: e.href }) : el('div', 'bx-entry bx-soon', { 'aria-disabled': 'true', tabindex: '0' });
      var bg = el('span', 'bx-ebg');
      bg.appendChild(img(e.bg, '', e.pos));
      item.appendChild(bg);
      var txt = el('span', 'bx-etxt');
      txt.appendChild(el('b')).textContent = e.title;
      txt.appendChild(el('small')).textContent = e.subtitle;
      if (!e.href && e.soon) txt.appendChild(el('em')).textContent = e.soon;
      item.appendChild(txt);
      if (e.badge) item.appendChild(img(e.badge, 'bx-badge'));
      menu.appendChild(item);
    });
    card.appendChild(menu);
    a.parentNode.replaceChild(card, a);

    // touch screens have no hover: the first tap opens the menu, a tap elsewhere closes it
    var touch = false;
    card.addEventListener('pointerdown', function (e) { touch = e.pointerType !== 'mouse'; });
    card.addEventListener('click', function (e) {
      if (touch && !card.classList.contains('open')) { e.preventDefault(); card.classList.add('open'); }
    });
    document.addEventListener('click', function (e) { if (!card.contains(e.target)) card.classList.remove('open'); });

    // cycle while nobody is looking at the menu
    // A soft-edged shutter wipes the next picture in from bottom to top, slowly and without pause, so the
    // card is always changing; the logo switches when the shutter's edge passes it.
    var slideEls = slides.children, logoEls = logos ? logos.children : [];
    var cur = 0, p = 0, swapped = false, last = 0;
    var WIPE = cfg.interval || 6000, SOFT = 30; // ms per picture; height of the soft edge in % of the card
    var still = matchMedia('(prefers-reduced-motion: reduce)');
    function logoAt(k) { for (var j = 0; j < logoEls.length; j++) logoEls[j].classList.toggle('on', j === k); }
    function layers() {
      for (var k = 0; k < n; k++) {
        var s = slideEls[k];
        s.classList.toggle('on', k === cur || k === (cur + 1) % n);
        var isNext = k === (cur + 1) % n;
        s.style.zIndex = k === cur ? 1 : isNext ? 2 : 0;
        s.style.webkitMaskImage = s.style.maskImage = isNext ? 'linear-gradient(transparent, transparent)' : '';
      }
    }
    function paused() { return card.matches(':hover') || card.matches(':focus-within') || card.classList.contains('open'); }
    function frame(t) {
      if (!card.isConnected) return;
      var dt = last ? Math.min(t - last, 100) : 0;
      last = t;
      if (!paused()) p += dt / WIPE;
      var next = slideEls[(cur + 1) % n];
      if (still.matches) { // no wipe: a plain change every few seconds
        if (p >= 1) { cur = (cur + 1) % n; p = 0; layers(); next = slideEls[(cur + 1) % n]; logoAt(cur); }
        next.style.webkitMaskImage = next.style.maskImage = 'linear-gradient(transparent, transparent)';
        return requestAnimationFrame(frame);
      }
      // edge position: from below the card (0) to above it (1), soft band included
      var edge = -SOFT + p * (100 + SOFT); // % from the bottom where the next picture is fully shown
      var g = 'linear-gradient(to top, #000 ' + edge.toFixed(2) + '%, transparent ' + (edge + SOFT).toFixed(2) + '%)';
      next.style.webkitMaskImage = next.style.maskImage = g;
      if (!swapped && logos) {
        var cr = card.getBoundingClientRect(), lr = logos.getBoundingClientRect();
        var logoFromBottom = (cr.bottom - (lr.top + lr.height / 2)) / cr.height * 100;
        if (edge + SOFT / 2 >= logoFromBottom) { swapped = true; logoAt((cur + 1) % n); }
      }
      if (p >= 1) { cur = (cur + 1) % n; p = 0; swapped = false; layers(); }
      requestAnimationFrame(frame);
    }
    layers();
    requestAnimationFrame(frame);
  }

  // run once React has hydrated the page, and again in case it re-rendered the card
  function go() { [300, 1200, 2500, 4500].forEach(function (t) { setTimeout(build, t); }); }
  if (document.readyState === 'complete') go(); else addEventListener('load', go);
})();
