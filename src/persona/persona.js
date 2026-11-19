// /persona: turntables, slot filter, and the monthly "for sale" list going stale.
(function () {
  var root = document.querySelector('.pz');
  if (!root) return;
  var still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The list of items for sale is a snapshot (data-month, UTC "YYYY-MM"). Mojang changes it on the 1st, so once
  // the month is over the page stops claiming those items are on sale until the snapshot is refreshed.
  var month = root.getAttribute('data-month');
  var now = new Date().toISOString().slice(0, 7);
  if (month && now > month) {
    root.classList.add('pz-stale');
    var h = root.querySelector('[data-stale-title]');
    if (h) h.textContent = h.getAttribute('data-stale-title');
    var s = root.querySelector('[data-stale-sub]');
    if (s) s.innerHTML = s.getAttribute('data-stale-sub');
    root.querySelectorAll('.pz-grid .on-sale').forEach(function (c) {
      c.classList.remove('on-sale');
      var b = c.querySelector('.pz-badge');
      if (b) b.remove();
    });
  }

  // turntables: "this month" cards always turn; collection cards turn on hover, or on tap on touch screens
  function spin(card, on) {
    var img = card.querySelector('img[data-spin]');
    if (!img || still) return;
    img.src = on ? img.getAttribute('data-spin') : img.getAttribute('data-still');
  }
  root.querySelectorAll('.pz-sale .pz-card').forEach(function (c) { spin(c, true); });
  var touch = matchMedia('(hover: none)').matches;
  root.querySelectorAll('.pz-grid .pz-card').forEach(function (c) {
    if (touch) {
      c.addEventListener('click', function () {
        var on = !c.classList.contains('turning');
        root.querySelectorAll('.pz-grid .turning').forEach(function (o) { o.classList.remove('turning'); spin(o, false); });
        c.classList.toggle('turning', on);
        spin(c, on);
      });
    } else {
      c.addEventListener('mouseenter', function () { spin(c, true); });
      c.addEventListener('mouseleave', function () { spin(c, false); });
    }
  });

  // slot filter
  var tabs = root.querySelectorAll('.pz-tabs button');
  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      var slot = t.getAttribute('data-slot');
      tabs.forEach(function (o) { o.classList.toggle('on', o === t); o.setAttribute('aria-selected', o === t); });
      root.querySelectorAll('.pz-grid .pz-card').forEach(function (c) { c.hidden = !!slot && c.getAttribute('data-slot') !== slot; });
    });
  });
})();
