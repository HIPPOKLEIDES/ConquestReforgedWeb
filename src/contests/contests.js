// Community contests: the list page (/contests) and a contest page (/contests/<id>), drawn from the Worker's
// /api (worker/). Also the shared bits the staff desk uses (window.CT, see staff.js).
// Everything that comes from the API is put on the page as text (never as HTML).
(() => {
  'use strict';
  const body = document.body;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
    return el;
  }
  // icons are constant markup from this file
  const svg = (markup) => { const t = document.createElement('template'); t.innerHTML = markup.trim(); return t.content.firstChild; };
  const ICON = {
    discord: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.86-.61 1.25a18.3 18.3 0 0 0-5.49 0 12.6 12.6 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.7 19.7 0 0 0-4.88 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .09-.03c.46-.63.87-1.3 1.22-1.99a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.89.08.08 0 0 1-.01-.13c.13-.09.25-.19.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08.01c.12.1.25.2.37.29a.08.08 0 0 1-.01.13c-.6.35-1.22.64-1.87.89a.08.08 0 0 0-.04.11c.36.7.77 1.36 1.22 1.99a.08.08 0 0 0 .09.03 19.8 19.8 0 0 0 6-3.03.08.08 0 0 0 .03-.06c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03zM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42s.96-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.33-.96 2.42-2.16 2.42zm7.97 0c-1.18 0-2.16-1.09-2.16-2.42s.96-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42z"/></svg>',
    open: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    entries: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>',
    voters: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    zoom: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3M11 8v6M8 11h6"/></svg>',
  };

  async function api(path, opts = {}) {
    const init = { method: opts.method || 'GET', credentials: 'same-origin', headers: { accept: 'application/json', ...(opts.headers || {}) } };
    if (opts.json !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(opts.json); }
    else if (opts.body !== undefined) init.body = opts.body;
    let res;
    try { res = await fetch(path, init); } catch { throw Object.assign(new Error('Could not reach the server. Check your connection and try again.'), { status: 0 }); }
    let data = null;
    try { data = await res.json(); } catch { /* not JSON */ }
    if (!res.ok) throw Object.assign(new Error((data && data.error) || `Something went wrong (${res.status}).`), { status: res.status, code: data && data.code });
    return data;
  }

  // ---------- time ----------
  let skew = 0; // server clock minus this device's clock
  const now = () => Date.now() + skew;
  const fmtWhen = (ms) => new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(ms));
  const fmtDay = (ms) => new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ms));
  const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
  const timers = new Set();
  function countdown(target, label, onDone) {
    const box = h('div', { class: 'ct-count', role: 'timer', 'aria-label': label });
    const cells = ['days', 'hrs', 'min', 'sec'].map((u) => { const b = h('b', null, '00'); box.append(h('span', null, b, h('small', null, u))); return b; });
    let id = 0;
    const tick = () => {
      if (!box.isConnected && id) { clearInterval(id); timers.delete(id); return; }
      let s = Math.max(0, Math.round((target - now()) / 1000));
      const v = [Math.floor(s / 86400), Math.floor((s %= 86400) / 3600), Math.floor((s %= 3600) / 60), s % 60];
      v.forEach((n, i) => { cells[i].textContent = String(n).padStart(2, '0'); });
      if (target - now() <= 0 && id) { clearInterval(id); timers.delete(id); if (onDone) setTimeout(onDone, 1200); }
    };
    tick();
    id = setInterval(tick, 1000);
    timers.add(id);
    return box;
  }
  const PHASE = { voting: 'Voting open', upcoming: 'Opens soon', closed: 'Results are in', draft: 'Draft · staff only' };
  const pill = (phase, text) => h('span', { class: 'ct-pill', 'data-phase': phase }, h('i'), text || PHASE[phase] || phase);

  // ---------- who is signed in ----------
  let me = { user: null, signInReady: true };
  const signInHref = () => '/auth/discord/login?return=' + encodeURIComponent(location.pathname + location.search);
  const signInButton = (text = 'Sign in with Discord') => h('a', { class: 'ct-signin', href: signInHref() }, svg(ICON.discord), text);
  const avatarUrl = (u) => (u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.webp?size=64` : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(u.id) >> 22n) % 6n)}.png`);
  function renderUser() {
    const box = $('[data-user]');
    if (!box) return;
    box.replaceChildren();
    if (!me.user) { if (me.signInReady !== false) box.append(signInButton()); return; }
    const u = me.user;
    box.append(h('div', { class: 'ct-me' }, h('img', { src: avatarUrl(u), alt: '', width: 32, height: 32 }), h('b', { title: u.username }, u.name),
      u.staff && !body.classList.contains('ct-staff') ? h('a', { href: '/contests/staff' }, 'Staff') : null,
      h('button', { type: 'button', onclick: signOut }, 'Sign out')));
  }
  async function signOut() {
    try { await api('/auth/logout', { method: 'POST', json: {} }); } catch { /* reload anyway */ }
    location.reload();
  }

  // ---------- hero backgrounds ----------
  const cssUrl = (u) => `url("${String(u).replace(/["\\\n]/g, '')}")`;
  function heroImage(src, cls = '') {
    const bg = $('.ct-hero-bg');
    if (!bg || !src) return;
    bg.className = 'ct-hero-bg' + (cls ? ' ' + cls : '');
    bg.replaceChildren();
    const img = new Image();
    img.onload = () => { bg.style.backgroundImage = cssUrl(src); bg.classList.add('on'); };
    img.src = src;
  }
  const heroDefault = () => heroImage(body.dataset.hero);
  function heroMosaic(srcs) {
    const bg = $('.ct-hero-bg');
    if (!bg) return;
    if (srcs.length < 3) { heroImage(srcs[0] || body.dataset.hero, srcs[0] ? 'winner' : ''); return; }
    const cols = 6, n = cols * 5, list = shuffle(srcs);
    bg.className = 'ct-hero-bg mosaic';
    bg.style.backgroundImage = '';
    bg.style.setProperty('--cols', cols);
    bg.replaceChildren(...Array.from({ length: n }, (_, i) => { const t = h('i'); t.style.backgroundImage = cssUrl(list[i % list.length]); return t; }));
    requestAnimationFrame(() => bg.classList.add('on'));
  }
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // text with links, as nodes
  function linkify(text) {
    return String(text).split(/(https?:\/\/[^\s<>"]+)/g).map((part, i) => (i % 2 ? h('a', { href: part, target: '_blank', rel: 'noopener nofollow' }, part.replace(/^https?:\/\//, '')) : part));
  }
  const paragraphs = (text) => String(text || '').trim().split(/\n\s*\n/).filter(Boolean).map((p) => h('p', null, linkify(p)));
  const errorBox = (msg) => h('section', { class: 'bx-sec ct-narrow' }, h('div', { class: 'ct-error', role: 'alert' }, msg));
  const section = (title, lead, ...kids) => h('section', { class: 'bx-sec' }, title ? h('h2', null, title) : null, lead ? h('p', { class: 'bx-lead' }, lead) : null, ...kids);
  const medal = (place) => h('span', { class: `ct-medal ${place <= 3 ? 'm' + place : 'mx'}`, 'aria-hidden': 'true' }, place);
  const byLine = (artists) => (artists && artists.length ? 'by ' + (artists.length > 1 ? artists.slice(0, -1).join(', ') + ' & ' + artists[artists.length - 1] : artists[0]) : '');
  const entryLabel = (e) => `Entry ${e.number}`;
  const entryName = (e) => e.title || entryLabel(e);

  // =====================================================================================
  // list page
  // =====================================================================================
  async function listPage(app) {
    const data = await api('/api/contests');
    skew = data.now - Date.now();
    const cs = data.contests;
    const voting = cs.filter((c) => c.phase === 'voting').sort((a, b) => a.closesAt - b.closesAt);
    const upcoming = cs.filter((c) => c.phase === 'upcoming').sort((a, b) => a.opensAt - b.opensAt);
    const closed = cs.filter((c) => c.phase === 'closed');
    const pics = [...closed.map((c) => c.cover && c.cover.preview), ...voting.flatMap((c) => (c.collage || []).map((x) => x.preview))].filter(Boolean);
    if (pics.length >= 3) heroMosaic(pics); else heroDefault();

    const out = [];
    if (voting.length) out.push(section('Voting now', voting.length > 1 ? 'Pick your top 3 in each one.' : 'Pick your top 3 before the clock runs out.', voting.map(featureCard)));
    if (upcoming.length) out.push(section('Coming up', null, upcoming.map(featureCard)));
    if (closed.length) out.push(section('Past contests', 'The winners, as voted by the community.', h('ul', { class: 'ct-past' }, closed.map(pastCard))));
    if (!cs.length) {
      const discord = body.dataset.discord;
      out.push(h('section', { class: 'bx-sec ct-narrow ct-empty' }, h('div', { class: 'ct-card' }, h('h3', null, 'No contests yet'),
        h('p', null, 'The first community contest is on its way. Contests are announced on our Discord, so join to catch the next one.'),
        discord ? h('a', { class: 'bx-btn', href: discord, target: '_blank', rel: 'noopener' }, 'Join the Discord') : null)));
    }
    app.replaceChildren(...out);
  }

  function art(c) {
    if (c.phase === 'closed' && c.cover) return h('div', { class: 'ct-art' }, h('img', { src: c.cover.preview, alt: '', loading: 'lazy' }), pill('closed', 'Results'));
    if (c.phase === 'voting' && c.collage && c.collage.length) {
      const box = h('div', { class: 'ct-art collage' }, pill('voting'));
      for (const x of c.collage.slice(0, 4)) { const t = h('i'); t.style.backgroundImage = cssUrl(x.preview); box.append(t); }
      return box;
    }
    return h('div', { class: 'ct-art blank' }, pill(c.phase));
  }
  function featureCard(c) {
    const voting = c.phase === 'voting';
    return h('a', { class: 'ct-card ct-feature', href: `/contests/${encodeURIComponent(c.id)}` }, art(c),
      h('div', { class: 'ct-feature-t' },
        h('h3', null, c.title), c.theme ? h('span', { class: 'ct-theme-s' }, c.theme) : null,
        h('span', { class: 'ct-when' }, voting ? `${plural(c.entryCount, 'entry', 'entries')} · voting closes ${fmtWhen(c.closesAt)}` : `Voting opens ${fmtWhen(c.opensAt)}`),
        countdown(voting ? c.closesAt : c.opensAt, voting ? 'Time left to vote' : 'Time until voting opens', () => location.reload()),
        h('span', null, h('span', { class: 'bx-btn' }, voting ? 'See the entries & vote' : 'See the contest'))));
  }
  function pastCard(c) {
    const w = c.cover && c.cover.winners || [];
    const names = w.map((x) => byLine(x.artists).replace(/^by /, '')).filter(Boolean).join(' and ');
    return h('li', null, h('a', { class: 'ct-card', href: `/contests/${encodeURIComponent(c.id)}` }, art(c),
      h('div', { class: 'ct-past-t' }, h('h3', null, c.title), c.theme ? h('span', { class: 'ct-theme-s' }, c.theme) : null,
        names ? h('p', null, medal(1), `Won by ${names}`) : null,
        h('p', null, `${plural(c.entryCount, 'entry', 'entries')}${c.ballots != null ? ` · ${plural(c.ballots, 'voter')}` : ''} · ended ${fmtDay(c.closesAt)}`))));
  }

  // =====================================================================================
  // contest page
  // =====================================================================================
  const RANKS = ['1st', '2nd', '3rd'], POINTS = [3, 2, 1];
  const S = { id: '', data: null, list: [], byId: new Map(), picks: [null, null, null], saved: null, busy: false, msg: null, notice: '', dock: null };
  const draftKey = () => `ct-picks:${S.id}`;
  const store = {
    get() { try { return JSON.parse(sessionStorage.getItem(draftKey()) || 'null'); } catch { return null; } },
    set(v) { try { sessionStorage.setItem(draftKey(), JSON.stringify(v)); } catch { /* private mode */ } },
    clear() { try { sessionStorage.removeItem(draftKey()); } catch { /* ignore */ } },
  };

  async function contestPage(app) {
    S.id = body.dataset.contest;
    let data;
    try { data = await api(`/api/contests/${encodeURIComponent(S.id)}`); } catch (e) { app.replaceChildren(errorBox(e.message)); return; }
    for (const t of timers) clearInterval(t);
    timers.clear();
    skew = data.now - Date.now();
    const c = data.contest;
    S.data = data;
    S.list = data.entries;
    S.byId = new Map(data.entries.map((e) => [e.id, e]));
    S.msg = null; S.notice = '';
    $('.ct-title').textContent = c.title;
    $('.ct-theme').textContent = c.theme || '';
    document.title = `${c.title} | Conquest Reforged contests`;
    renderStatus(c);

    if (c.phase === 'closed' && S.list.length) heroImage(S.list[0].preview, 'winner');
    else if (c.phase === 'voting' && S.list.length >= 3) heroMosaic(S.list.map((e) => e.preview));
    else heroDefault();

    const out = [infoSection(c, data)];
    if (c.phase === 'voting') out.push(votingSection(c, data));
    else if (c.phase === 'closed') out.push(...resultsSections(c, data));
    else out.push(upcomingSection(c, data));
    app.replaceChildren(...out);
    if (c.phase === 'voting') { syncPicks(); }
    openFromHash();
  }
  // links like /contests/<id>#entry-7 open that entry
  function openFromHash() {
    const m = /^#entry-(\d+)$/.exec(location.hash);
    if (!m || LB.open) return;
    const i = S.list.findIndex((e) => e.number === Number(m[1]));
    if (i >= 0) openLightbox(i, false);
  }
  addEventListener('hashchange', () => { if (S.data) openFromHash(); });

  function renderStatus(c) {
    const box = $('[data-status]');
    if (!box) return;
    const reload = () => contestPage($('[data-app]'));
    box.replaceChildren(pill(c.phase));
    if (c.phase === 'voting') box.append(countdown(c.closesAt, 'Time left to vote', reload), h('span', { class: 'ct-count-label' }, `Voting closes ${fmtWhen(c.closesAt)}`));
    else if (c.phase === 'upcoming' || c.phase === 'draft') box.append(countdown(c.opensAt, 'Time until voting opens', reload), h('span', { class: 'ct-count-label' }, `Voting opens ${fmtWhen(c.opensAt)}`));
    else box.append(h('span', { class: 'ct-count-label' }, `Voting closed ${fmtDay(c.closesAt)}`));
  }

  function infoSection(c, data) {
    const fact = (icon, label, value) => h('div', null, svg(ICON[icon]), h('dt', null, label), h('dd', null, value));
    const who = c.minAccountAgeDays > 0 ? `Anyone with a Discord account at least ${plural(c.minAccountAgeDays, 'day')} old` : 'Anyone with a Discord account';
    const count = c.phase === 'closed' ? data.results.entries.length : data.entries.length;
    return h('section', { class: 'bx-sec ct-info' },
      h('div', { class: 'ct-card ct-desc' }, paragraphs(c.description)),
      h('div', { class: 'ct-card' }, h('dl', { class: 'ct-facts' },
        fact('open', 'Voting opens', fmtWhen(c.opensAt)),
        fact('close', c.phase === 'closed' ? 'Voting closed' : 'Voting closes', fmtWhen(c.closesAt)),
        c.phase !== 'upcoming' || data.preview ? fact('entries', 'Entries', String(count)) : null,
        fact('voters', 'Who can vote', who))));
  }

  // ---------- voting ----------
  function votingSection(c, data) {
    const n = S.list.length;
    // the voter's saved ballot, else a draft from before signing in
    const saved = data.ballot ? data.ballot.picks : null;
    S.saved = saved;
    const base = saved || (store.get() || []);
    S.picks = [0, 1, 2].map((i) => (S.byId.has(base[i]) && !S.byId.get(base[i]).own ? base[i] : null));
    if (saved && S.picks.some((p, i) => p !== saved[i])) S.notice = 'One of your picks was removed from the contest. Pick a replacement and save your ballot again.';
    if (n < 3) return section('The entries', 'Voting needs at least three entries. Check back soon.', gallery(S.list, 'vote'));
    S.dock = h('div', { class: 'ct-dock', role: 'region', 'aria-label': 'Your ballot' });
    const how = h('ol', { class: 'ct-how' },
      h('li', null, medal(1), h('div', null, h('b', null, 'Look closely'), h('span', null, 'Open any entry to see it full size. Use the arrow keys to flip through.'))),
      h('li', null, medal(2), h('div', null, h('b', null, 'Pick your top 3'), h('span', null, '1st gets 3 points, 2nd gets 2 and 3rd gets 1.'))),
      h('li', null, medal(3), h('div', null, h('b', null, 'Save your ballot'), h('span', null, 'Change it as often as you like until voting closes.'))));
    const sec = h('section', { class: 'bx-sec ct-vote' },
      h('h2', null, 'The entries'),
      h('p', { class: 'bx-lead' }, `${n} entries, in a shuffled order of your own. Artists stay anonymous until voting closes.`),
      how, h('div', { style: 'height:26px' }), gallery(S.list, 'vote'), S.dock);
    renderDock();
    return sec;
  }

  const canPick = () => S.data && S.data.contest.phase === 'voting' && S.data.canVote !== false;
  function rankButtons(e) {
    const box = h('div', { class: 'ct-picks', role: 'group', 'aria-label': `Rank ${entryLabel(e)}` });
    RANKS.forEach((r, i) => box.append(h('button', {
      type: 'button', class: 'ct-rank', 'data-r': i + 1, 'aria-pressed': 'false', disabled: e.own || !canPick(),
      title: e.own ? 'You can’t rank your own entry' : `${r} place (${POINTS[i]} points)`, 'aria-label': `${r} place`,
      onclick: (ev) => { ev.stopPropagation(); setPick(e.id, i); },
    }, String(i + 1), h('sup', null, r.slice(1)))));
    return box;
  }
  function setPick(id, rank) {
    const cur = S.picks.indexOf(id);
    if (cur === rank) S.picks[rank] = null;
    else { if (cur >= 0) S.picks[cur] = null; S.picks[rank] = id; }
    S.msg = null; S.notice = '';
    if (!me.user) store.set(S.picks);
    syncPicks(cur === rank ? -1 : rank);
  }
  function syncPicks(bumped = -1) {
    for (const t of $$('.ct-tile[data-id]')) {
      const r = S.picks.indexOf(Number(t.dataset.id));
      if (r >= 0) { t.dataset.rank = r + 1; const rib = t.querySelector('.ct-ribbon'); if (rib) rib.textContent = `${RANKS[r]} · ${POINTS[r]} pts`; } else delete t.dataset.rank;
      for (const b of t.querySelectorAll('.ct-rank')) b.setAttribute('aria-pressed', String(Number(b.dataset.r) - 1 === r));
    }
    renderDock(bumped);
    if (LB.el && LB.open) lbRender();
  }
  const same = (a, b) => !!a && !!b && a.every((x, i) => x === b[i]);
  function renderDock(bumped = -1) {
    if (!S.dock) return;
    const slots = h('ol', { class: 'ct-slots' }, [0, 1, 2].map((i) => {
      const e = S.byId.get(S.picks[i]);
      const li = h('li', { class: `ct-slot${e ? ' full' : ''}${i === bumped ? ' bump' : ''}` }, medal(i + 1),
        h('button', { type: 'button', class: 'ct-slot-img', 'aria-label': e ? `View ${entryLabel(e)}` : `${RANKS[i]} place: pick an entry`, onclick: () => (e ? openLightbox(S.list.indexOf(e)) : $('.ct-gallery').scrollIntoView({ behavior: 'smooth', block: 'start' })) },
          e ? h('img', { src: e.preview, alt: '' }) : h('span', { 'aria-hidden': 'true', style: 'color:#b9a383;font-size:1.4rem' }, '+')),
        h('span', { class: 'ct-slot-txt' }, h('b', null, `${RANKS[i]} place`), h('small', null, e ? entryLabel(e) : plural(POINTS[i], 'point'))),
        e ? h('button', { type: 'button', class: 'ct-slot-x', 'aria-label': `Remove ${entryLabel(e)} from ${RANKS[i]} place`, onclick: () => setPick(e.id, i) }, '×') : null);
      return li;
    }));
    const missing = S.picks.filter((p) => p == null).length;
    const changed = !same(S.picks, S.saved);
    let msg, cls = '', action = null;
    if (!me.user) {
      msg = missing ? 'Pick your top 3, then sign in to save them.' : 'Sign in to save your ballot. Your picks are kept.';
      action = signInButton('Sign in to vote');
    } else if (S.data.canVote === false) {
      msg = S.data.cannotVoteReason || 'You can’t vote in this contest.'; cls = 'err';
    } else {
      if (S.busy) msg = 'Saving…';
      else if (S.msg) { msg = S.msg.text; cls = S.msg.ok ? 'ok' : 'err'; }
      else if (S.notice) { msg = S.notice; cls = 'err'; }
      else if (missing) msg = `Pick ${missing} more ${missing === 1 ? 'entry' : 'entries'}.`;
      else if (changed) msg = S.saved ? 'Save to update your ballot.' : 'Ready! Save your ballot.';
      else { msg = 'Your ballot is saved. You can change it until voting closes.'; cls = 'ok'; }
      action = h('button', { type: 'button', class: 'bx-btn', disabled: S.busy || missing > 0 || !changed, onclick: saveBallot }, S.saved ? 'Update ballot' : 'Save ballot');
    }
    S.dock.replaceChildren(h('div', { class: 'ct-dock-in' }, slots, h('div', { class: 'ct-dock-act' }, h('p', { class: `ct-dock-msg ${cls}`, role: 'status', 'aria-live': 'polite' }, msg), action)));
  }
  async function saveBallot() {
    S.busy = true; S.msg = null; renderDock();
    try {
      const r = await api(`/api/contests/${encodeURIComponent(S.id)}/ballot`, { method: 'PUT', json: { picks: S.picks } });
      S.saved = r.ballot.picks.slice();
      S.notice = '';
      S.msg = { ok: true, text: 'Ballot saved! You can change it until voting closes.' };
      store.clear();
    } catch (e) {
      S.msg = { ok: false, text: e.message };
      if (e.status === 401) { me.user = null; renderUser(); store.set(S.picks); }
    }
    S.busy = false;
    renderDock();
  }

  // ---------- gallery ----------
  function gallery(list, mode) {
    return h('ul', { class: 'ct-gallery' }, list.map((e, i) => tile(e, i, mode)));
  }
  function shot(e, i, label, eager) {
    const img = h('img', { src: e.preview, alt: '', loading: eager ? 'eager' : 'lazy', decoding: 'async', width: e.w || 1600, height: e.h || 900 });
    const b = h('button', { type: 'button', class: 'ct-shot', 'aria-label': `${label}: view full size`, onclick: () => openLightbox(i) }, img);
    const done = () => b.parentElement && b.parentElement.classList.add('ld');
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
    requestAnimationFrame(() => { if (img.complete && img.naturalWidth) done(); });
    return b;
  }
  function tile(e, i, mode) {
    const ar = e.w && e.h ? e.w / e.h : 16 / 9;
    const li = h('li', { class: 'ct-tile', style: `--ar:${Math.min(Math.max(ar, .4), 4).toFixed(4)}`, 'data-id': e.id });
    li.append(shot(e, i, mode === 'results' ? entryName(e) : entryLabel(e), i < 6));
    if (mode === 'results') {
      li.append(h('div', { class: 'ct-cap' }, medal(e.place), h('div', { class: 'ct-cap-t' }, h('b', null, entryName(e)), h('span', null, byLine(e.artists))), h('div', { class: 'ct-pts' }, String(e.points), h('small', null, e.points === 1 ? 'point' : 'points'))));
    } else {
      li.append(h('span', { class: 'ct-num' }, entryLabel(e)));
      if (e.own) li.append(h('span', { class: 'ct-own' }, 'Your entry'));
      if (mode === 'vote') li.append(rankButtons(e), h('span', { class: 'ct-ribbon', 'aria-hidden': 'true' }));
    }
    return li;
  }

  // ---------- results ----------
  function resultsSections(c, data) {
    const es = S.list, r = data.results;
    const out = [];
    if (!es.length) return [section('No entries', 'This contest ended without any entries.')];
    const stats = h('p', { class: 'ct-stats' }, h('span', null, h('b', null, String(es.length)), ' entries'), h('span', null, h('b', null, String(r.ballots)), r.ballots === 1 ? ' voter' : ' voters'), h('span', null, h('b', null, String(r.ballots * 6)), ' points handed out'));
    if (r.ballots > 0) {
      const top = es.filter((e) => e.place <= 3).slice(0, 3);
      const podium = h('div', { class: 'ct-podium' }, top.map((e) => {
        const i = es.indexOf(e);
        return h('article', { class: 'ct-win', 'data-place': e.place }, shot(e, i, `${ordinal(e.place)} place, ${entryName(e)}`, true),
          h('div', { class: 'ct-win-cap' }, medal(e.place),
            h('div', { class: 'ct-win-t' }, h('span', { class: 'ct-win-place' }, `${ordinal(e.place)} place`), h('h3', null, entryName(e)), e.artists.length ? h('p', null, byLine(e.artists)) : null),
            h('div', { class: 'ct-win-pts' }, h('b', null, String(e.points)), h('small', null, 'points'), h('em', null, plural(e.firsts, 'first-place vote')))));
      }));
      out.push(h('section', { class: 'bx-sec ct-winners' }, h('h2', null, 'The winners'), stats, podium, myBallot()));
    } else {
      out.push(h('section', { class: 'bx-sec' }, h('h2', null, 'Voting has closed'), h('p', { class: 'bx-lead' }, 'No votes were cast in this contest.')));
    }
    out.push(section('All entries', r.ballots > 0 ? 'Ranked by points. Ties are decided by the number of 1st places, then 2nd places.' : null, gallery(es, 'results')));
    return out;
  }
  function myBallot() {
    const b = S.data.ballot;
    if (!b) return null;
    return h('div', { class: 'ct-mine' }, h('span', null, 'Your ballot'), h('ol', null, b.picks.map((id, i) => {
      const e = S.byId.get(id);
      return h('li', null, medal(i + 1), e ? `${entryName(e)} (${ordinal(e.place)})` : 'Removed entry');
    })));
  }

  // ---------- before voting opens ----------
  function upcomingSection(c, data) {
    const discord = body.dataset.discord;
    const card = h('section', { class: 'bx-sec ct-narrow' }, h('div', { class: 'ct-card', style: 'text-align:center' },
      h('h3', null, 'The entries are on their way'),
      h('p', null, `Voting opens ${fmtWhen(c.opensAt)}. Then every entry appears here, anonymous, and you can pick your top 3 with your Discord account.`),
      discord ? h('a', { class: 'bx-btn', href: discord, target: '_blank', rel: 'noopener' }, 'Get notified on Discord') : null));
    if (!data.preview) return card;
    return h('div', null, card, h('section', { class: 'bx-sec', style: 'margin-top:64px' }, h('h2', null, 'Staff preview'),
      h('p', { class: 'bx-lead' }, `Only staff can see these ${data.entries.length} entries until voting opens. Voters will see them in a shuffled order.`), gallery(S.list, 'preview')));
  }

  // =====================================================================================
  // lightbox
  // =====================================================================================
  const LB = { el: null, open: false, i: 0, pushed: false, last: null };
  function lbBuild() {
    const btn = (cls, label, icon, fn) => h('button', { type: 'button', class: `ct-lb-btn ${cls}`, 'aria-label': label, onclick: fn }, svg(ICON[icon]));
    const low = h('img', { class: 'low', alt: '' }), hi = h('img', { class: 'hi', alt: '' });
    const stage = h('div', { class: 'ct-lb-stage' }, low, hi);
    const el = h('div', { class: 'ct-lb', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Entry viewer', hidden: true },
      stage, h('div', { class: 'ct-lb-bar' }, h('div', { class: 'ct-lb-cap' }, h('b'), h('span')), h('div', { class: 'ct-lb-extra' }), h('span', { class: 'ct-lb-n' })),
      btn('ct-lb-prev', 'Previous entry', 'prev', () => lbGo(-1)), btn('ct-lb-next', 'Next entry', 'next', () => lbGo(1)),
      btn('ct-lb-zoom', 'Actual size', 'zoom', lbZoom), btn('ct-lb-close', 'Close', 'x', closeLightbox));
    hi.addEventListener('load', () => hi.classList.add('on'));
    hi.addEventListener('click', lbZoom);
    stage.addEventListener('click', (e) => { if (e.target === stage) closeLightbox(); });
    let sx = null, sy = 0;
    stage.addEventListener('pointerdown', (e) => { if (!el.classList.contains('zoom')) { sx = e.clientX; sy = e.clientY; } });
    stage.addEventListener('pointerup', (e) => {
      if (sx == null) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      sx = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) lbGo(dx < 0 ? 1 : -1);
    });
    document.addEventListener('keydown', (e) => {
      if (!LB.open) return;
      if (e.key === 'Escape') { e.preventDefault(); if (el.classList.contains('zoom')) lbZoom(); else closeLightbox(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); lbGo(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); lbGo(-1); }
      else if (/^[123]$/.test(e.key) && S.data.contest.phase === 'voting' && canPick()) { const x = S.list[LB.i]; if (x && !x.own) setPick(x.id, Number(e.key) - 1); }
      else if (e.key === 'Tab') { // keep focus inside the viewer
        const f = $$('button:not([disabled]), a[href]', el).filter((b) => b.offsetParent);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    addEventListener('popstate', () => { if (LB.open) { LB.pushed = false; closeLightbox(); } });
    document.body.append(el);
    LB.el = el;
  }
  function openLightbox(i, push = true) {
    if (i < 0 || !S.list[i]) return;
    if (!LB.el) lbBuild();
    LB.last = document.activeElement;
    LB.i = i;
    LB.open = true;
    LB.el.hidden = false;
    LB.el.classList.remove('zoom');
    body.classList.add('ct-lock');
    for (const x of [$('.ct-hero'), $('.div-block-234')]) if (x) x.inert = true;
    requestAnimationFrame(() => LB.el.classList.add('open'));
    const hash = `#entry-${S.list[i].number}`;
    if (push && !LB.pushed) { history.pushState({ ctlb: 1 }, '', hash); LB.pushed = true; } else history.replaceState(history.state, '', hash);
    lbRender();
    $('.ct-lb-close', LB.el).focus();
  }
  function closeLightbox() {
    if (!LB.open) return;
    LB.open = false;
    LB.el.classList.remove('open', 'zoom');
    body.classList.remove('ct-lock');
    for (const x of [$('.ct-hero'), $('.div-block-234')]) if (x) x.inert = false;
    setTimeout(() => { if (!LB.open) LB.el.hidden = true; }, 250);
    if (LB.pushed) { LB.pushed = false; history.back(); } else history.replaceState(history.state, '', location.pathname + location.search);
    if (LB.last && LB.last.focus) LB.last.focus();
  }
  function lbGo(d) {
    if (!S.list.length) return;
    LB.i = (LB.i + d + S.list.length) % S.list.length;
    LB.el.classList.remove('zoom');
    history.replaceState(history.state, '', `#entry-${S.list[LB.i].number}`);
    lbRender();
  }
  function lbZoom() {
    const z = LB.el.classList.toggle('zoom');
    const stage = $('.ct-lb-stage', LB.el), hi = $('img.hi', LB.el);
    if (z) requestAnimationFrame(() => { stage.scrollLeft = (hi.scrollWidth - stage.clientWidth) / 2; stage.scrollTop = (hi.scrollHeight - stage.clientHeight) / 2; });
  }
  function lbRender() {
    const e = S.list[LB.i], el = LB.el;
    const low = $('img.low', el), hi = $('img.hi', el);
    if (hi.dataset.src !== e.full) {
      hi.classList.remove('on');
      low.src = e.preview;
      hi.dataset.src = e.full;
      hi.src = e.full;
      if (hi.complete && hi.naturalWidth) hi.classList.add('on');
      for (const d of [1, -1]) { const n = S.list[(LB.i + d + S.list.length) % S.list.length]; if (n) new Image().src = n.full; }
    }
    const phase = S.data.contest.phase;
    hi.alt = phase === 'closed' ? `${entryName(e)} ${byLine(e.artists)}` : entryLabel(e);
    $('.ct-lb-cap b', el).textContent = phase === 'closed' ? entryName(e) : entryLabel(e);
    $('.ct-lb-cap span', el).textContent = phase === 'closed' ? byLine(e.artists) : e.own ? 'Your entry' : e.w ? `${e.w} × ${e.h}` : '';
    $('.ct-lb-n', el).textContent = `${LB.i + 1} / ${S.list.length}`;
    const extra = $('.ct-lb-extra', el);
    extra.replaceChildren();
    if (phase === 'voting' && S.list.length >= 3) {
      extra.className = 'ct-lb-extra ct-lb-vote';
      const r = S.picks.indexOf(e.id);
      const pk = rankButtons(e);
      for (const b of pk.querySelectorAll('.ct-rank')) b.setAttribute('aria-pressed', String(Number(b.dataset.r) - 1 === r));
      extra.append(h('span', null, e.own ? 'Your entry' : 'Rank it'), ...pk.childNodes);
    } else if (phase === 'closed') {
      extra.className = 'ct-lb-extra ct-lb-pts';
      extra.append(medal(e.place), `${ordinal(e.place)} · ${plural(e.points, 'point')}`);
    } else extra.className = 'ct-lb-extra';
  }

  // =====================================================================================
  async function init() {
    try { me = await api('/api/me'); } catch { me = { user: null, signInReady: true }; }
    renderUser();
    const app = $('[data-app]');
    try {
      if (body.classList.contains('ct-list')) await listPage(app);
      else if (body.classList.contains('ct-view')) await contestPage(app);
    } catch (e) {
      if (app) app.replaceChildren(errorBox(e.message));
    }
    return me;
  }
  window.CT = { h, svg, ICON, api, fmtWhen, fmtDay, pill, plural, signInButton, avatarUrl, heroDefault, errorBox, medal, me: () => me, ready: null };
  window.CT.ready = init();
})();
