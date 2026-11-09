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
