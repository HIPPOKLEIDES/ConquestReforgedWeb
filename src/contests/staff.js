// Contest desk (/contests/staff): create and edit contests, add entries, hide them, close voting early,
// export the ballots. Uses the shared helpers from contests.js (window.CT). Every call is checked again by
// the Worker (STAFF_IDS); this page only decides what to show.
// Pictures are prepared in the browser: each upload is re-drawn on a canvas, which drops hidden metadata
// (e.g. an "Artist" EXIF tag that would give the entrant away) and makes a small WebP preview for the gallery.
(async () => {
  'use strict';
  const CT = window.CT;
  const { h, api, pill, plural, fmtWhen, errorBox, cmd } = CT;
  const app = document.querySelector('[data-staff]');
  CT.heroDefault();
  const me = await CT.ready;
  if (!me.user) {
    app.replaceChildren(h('section', { class: 'bx-sec ct-narrow' }, h('div', { class: 'ct-card', style: 'text-align:center' },
      h('h3', null, 'Staff sign-in'), h('p', null, 'Sign in with the Discord account that is on the staff list.'), CT.signInButton())));
    return;
  }
  if (!me.user.staff) {
    app.replaceChildren(h('section', { class: 'bx-sec ct-narrow' }, h('div', { class: 'ct-card' },
      h('h3', null, 'Staff only'),
      h('p', null, `You’re signed in as ${me.user.name}, which isn’t on the contest staff list.`),
      h('p', null, 'Your Discord user ID is ', h('b', { style: 'color:#fff7e8;user-select:all' }, me.user.id), '. To be added, send it to whoever manages the site; they add it to the STAFF_IDS secret.'))));
    return;
  }

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const toInput = (ms) => (Number.isFinite(ms) ? new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
  const fromInput = (s) => (s ? new Date(s).getTime() : NaN);
  const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
  const ids = (s) => String(s || '').split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
  const mb = (n) => `${(n / 1048576).toFixed(n < 1048576 ? 2 : 1)} MB`;
  const msg = (el, text, kind = '') => { el.textContent = text; el.className = `st-msg ${kind}`; };

  let contests = [];
  let current = null; // id of the open contest, or '' for a new one

  const nav = h('ul', { class: 'st-list' });
  const pane = h('div', { class: 'st-pane' });
  app.replaceChildren(h('section', { class: 'bx-sec' }, h('div', { class: 'st-grid' }, h('aside', null, nav), pane)));

  async function loadList() {
    contests = (await api('/api/staff/contests')).contests;
    nav.replaceChildren(
      h('li', { class: 'st-new' }, h('button', { type: 'button', class: current === '' ? 'on' : '', onclick: () => open('') }, '+ New contest')),
      ...contests.map((c) => h('li', null, h('button', { type: 'button', class: c.id === current ? 'on' : '', onclick: () => open(c.id) },
        h('b', null, c.title), h('small', null, `${!c.published ? 'Draft' : c.phase === 'upcoming' && c.submissions === 'open' ? 'Taking entries' : { voting: 'Voting open', upcoming: 'Upcoming', closed: 'Closed' }[c.phase]} · ${plural(c.entryCount, 'entry', 'entries')}`)))));
  }

  async function open(id) {
    current = id;
    loadList().catch(() => {});
    if (id === '') { pane.replaceChildren(contestForm(null)); return; }
    pane.replaceChildren(h('div', { class: 'ct-loading' }, h('span'), h('span'), h('span')));
    try {
      const d = await api(`/api/staff/contests/${encodeURIComponent(id)}`);
      renderContest(d);
    } catch (e) { pane.replaceChildren(errorBox(e.message)); }
  }

  function renderContest(d) {
    const c = d.contest;
    pane.replaceChildren(overview(c), contestForm(c), entriesCard(c, d.entries));
  }

  // ---------- overview + actions ----------
  function overview(c) {
    const out = h('p', { class: 'st-msg' });
    const close = async () => {
      if (!confirm(`Close voting for “${c.title}” now? The results become public straight away.`)) return;
      try { renderContest(await api(`/api/staff/contests/${encodeURIComponent(c.id)}/close`, { method: 'POST', json: {} })); loadList(); } catch (e) { msg(out, e.message, 'err'); }
    };
    const taking = c.phase === 'upcoming' && c.submissions === 'open';
    const where = c.submitChannel ? (/^https:/.test(c.submitChannel) ? h('a', { href: c.submitChannel, target: '_blank', rel: 'noopener' }, 'the contest channel') : `channel ${c.submitChannel}`) : null;
    return h('div', { class: 'ct-card' },
      h('div', { class: 'st-badges' }, pill(!c.published ? 'draft' : taking ? 'submitting' : c.phase), h('span', { class: 'ct-pill' }, plural(c.entryCount, 'entry', 'entries')), h('span', { class: 'ct-pill' }, plural(c.ballotCount, 'ballot')),
        c.anonymous ? h('span', { class: 'ct-pill', title: 'Titles and artists stay hidden until voting closes' }, 'Anonymous') : null),
      h('h3', null, c.title),
      h('p', null, c.phase === 'voting' ? `Voting closes ${fmtWhen(c.closesAt)}.` : c.phase === 'closed' ? `Voting closed ${fmtWhen(c.closesAt)}. Results are public.` : `Voting opens ${fmtWhen(c.opensAt)}.`,
        c.published ? '' : ' This contest is a draft: only staff can see it.'),
      c.submissions && c.phase !== 'closed' ? h('p', null,
        c.submissions === 'open' ? ['Entries by ', cmd('/submit'), ' are open in ', where, ` until ${fmtWhen(c.submitClosesAt)}.`]
          : c.submissions === 'soon' ? ['Entries by ', cmd('/submit'), ' open in ', where, ` on ${fmtWhen(c.submitOpensAt)}.`]
            : ['Entries by ', cmd('/submit'), ` closed ${fmtWhen(c.submitClosesAt)}. Check them below before voting opens.`],
        c.published || c.submissions === 'closed' ? '' : ' (Only once the contest is visible on the site.)') : null,
      h('div', { class: 'st-row' },
        h('a', { class: 'bx-btn bx-btn-sm', href: `/contests/${encodeURIComponent(c.id)}`, target: '_blank', rel: 'noopener' }, 'Open the page'),
        h('a', { class: 'bx-btn bx-btn-sm bx-btn-ghost', href: `/api/staff/contests/${encodeURIComponent(c.id)}/ballots.csv`, download: `${c.id}-ballots.csv` }, 'Export ballots (CSV)'),
        c.phase === 'voting' && c.published ? h('button', { type: 'button', class: 'bx-btn bx-btn-sm st-danger', onclick: close }, 'Close voting now') : null),
      out);
  }

  // ---------- create / edit ----------
  function contestForm(c) {
    const isNew = !c;
    const f = (name, label, input, hint, wide) => h('label', { class: wide ? 'wide' : '' }, label, input, hint ? h('small', null, hint) : null);
    const inp = (name, attrs = {}) => h('input', { name, ...attrs });
    const day = 86400000, soon = Math.ceil(Date.now() / 3600000) * 3600000 + day;
    const status = h('p', { class: 'st-msg' });
    const form = h('form', { class: 'st-form', novalidate: true },
      isNew ? f('id', 'Contest ID', inp('id', { required: true, placeholder: 'castles-2027', pattern: '[a-z0-9-]+', maxlength: 60, autocomplete: 'off' }), 'Becomes the web address: /contests/castles-2027. Lowercase letters, numbers and dashes; can’t be changed later.', true) : null,
      f('title', 'Title', inp('title', { required: true, maxlength: 120, value: c ? c.title : '', placeholder: 'Build Contest #1' })),
      f('theme', 'Theme', inp('theme', { maxlength: 120, value: c ? c.theme : '', placeholder: 'Castles' }), 'Shown big in the page header.'),
      f('description', 'Description', h('textarea', { name: 'description', maxlength: 6000, placeholder: 'What to build, rules, prizes… (blank line = new paragraph; links work)' }, c ? c.description : ''), null, true),
      f('opensAt', 'Voting opens', inp('opensAt', { type: 'datetime-local', required: true, value: toInput(c ? c.opensAt : soon) }), `Your time zone (${tz}).`),
      f('closesAt', 'Voting closes', inp('closesAt', { type: 'datetime-local', required: true, value: toInput(c ? c.closesAt : soon + 7 * day) })),
      f('minAccountAgeDays', 'Minimum Discord account age (days)', inp('minAccountAgeDays', { type: 'number', min: 0, max: 3650, step: 1, value: c ? c.minAccountAgeDays : 0 }), 'Keeps brand-new alt accounts out. 0 = any account. Worked out from the Discord ID.'),
      h('div', { class: 'st-opt' },
        h('label', { class: 'st-check' }, inp('anonymous', { type: 'checkbox', checked: c ? c.anonymous : false }), 'Anonymous'),
        h('small', null, 'Off: voters see each entry’s title and artists. On: entries show as “Entry 1, Entry 2…” and the artists are revealed with the results. Set it before voting opens.')),
      h('div', { class: 'st-group' },
        h('h4', null, 'Entries by ', cmd('/submit'), ' on Discord'),
        h('p', null, 'Between these times, entrants send their own entry with the bot: /submit in the channel below, with their picture and a title. Their Discord name and ID are filled in for them, so they can’t rank their own entry. Leave the times empty to add every entry yourself.'),
        f('submitOpensAt', 'Entries open', inp('submitOpensAt', { type: 'datetime-local', value: toInput(c ? c.submitOpensAt : NaN) }), `Your time zone (${tz}).`),
        f('submitClosesAt', 'Entries close', inp('submitClosesAt', { type: 'datetime-local', value: toInput(c ? c.submitClosesAt : NaN) }), 'At the latest when voting opens.'),
        f('submitChannel', 'Discord channel or thread', inp('submitChannel', { value: c ? c.submitChannel : '', placeholder: 'https://discord.com/channels/…', autocomplete: 'off', maxlength: 200 }), 'Right-click the channel or thread in Discord, Copy Link, and paste it here. A channel also covers the threads in it.', true)),
      h('label', { class: 'st-check' }, inp('published', { type: 'checkbox', checked: c ? c.published : false }), 'Visible on the site (otherwise a draft only staff can see)'),
      h('div', { class: 'st-row wide' }, h('button', { type: 'submit', class: 'bx-btn' }, isNew ? 'Create contest' : 'Save changes'), status));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const v = (n) => form.elements[n].value;
      const body = {
        title: v('title'), theme: v('theme'), description: v('description'),
        opensAt: fromInput(v('opensAt')), closesAt: fromInput(v('closesAt')),
        minAccountAgeDays: Number(v('minAccountAgeDays') || 0), published: form.elements.published.checked,
        anonymous: form.elements.anonymous.checked,
        submitOpensAt: v('submitOpensAt') ? fromInput(v('submitOpensAt')) : null,
        submitClosesAt: v('submitClosesAt') ? fromInput(v('submitClosesAt')) : null,
        submitChannel: v('submitChannel').trim(),
      };
      if (isNew) body.id = v('id').trim().toLowerCase();
      msg(status, 'Saving…');
      try {
        const d = isNew
          ? await api('/api/staff/contests', { method: 'POST', json: body })
          : await api(`/api/staff/contests/${encodeURIComponent(c.id)}`, { method: 'PATCH', json: body });
        current = d.contest.id;
        renderContest(d);
        await loadList();
        msg(pane.querySelector('form .st-msg'), isNew ? 'Contest created. Now add the entries below.' : 'Saved.', 'ok');
      } catch (e) { msg(status, e.message, 'err'); }
    });
    return h('div', { class: 'ct-card' }, h('h3', null, isNew ? 'New contest' : 'Contest details'), form);
  }

  // ---------- pictures ----------
  async function encode(bmp, max, quality) {
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * s)), ht = Math.max(1, Math.round(bmp.height * s));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = ht;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, w, ht);
    let blob = await new Promise((r) => cv.toBlob(r, 'image/webp', quality));
    if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', quality)); // browsers that can't write WebP
    if (!blob) throw new Error('This browser could not convert the picture.');
    return { blob, w, h: ht };
  }
  // full picture (at most 4096 px on its long side) for the lightbox, preview (1600 px) for the gallery
  async function preparePicture(file) {
    if (!/^image\//.test(file.type)) throw new Error(`${file.name} is not a picture.`);
    const bmp = await createImageBitmap(file);
    try {
      const full = await encode(bmp, 4096, 0.94);
      const preview = await encode(bmp, 1600, 0.84);
      return { full, preview, srcW: bmp.width, srcH: bmp.height };
    } finally { bmp.close && bmp.close(); }
  }
  async function uploadPictures(entryId, pic, onStep) {
    const put = (kind, p, q = '') => api(`/api/staff/entries/${entryId}/image?kind=${kind}${q}`, { method: 'PUT', body: p.blob, headers: { 'content-type': p.blob.type } });
    onStep && onStep(1);
    await put('full', pic.full, `&w=${pic.full.w}&h=${pic.full.h}`);
    onStep && onStep(2);
    return (await put('preview', pic.preview)).entry;
  }

  // ---------- entries ----------
  function entriesCard(c, entries) {
    const pending = h('ul', { class: 'st-entries' });
    const existing = h('ul', { class: 'st-entries' }, entries.map((e) => entryRow(c, e)));
    const fileInput = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', multiple: true, hidden: true });
    const drop = h('div', { class: 'st-drop', role: 'button', tabindex: 0 }, h('b', null, 'Drop entry pictures here'), h('span', null, 'or click to choose files · PNG, JPEG or WebP · one picture per entry'));
    const allBtn = h('button', { type: 'button', class: 'bx-btn', hidden: true, onclick: async () => { for (const li of [...pending.children]) if (li._upload) await li._upload(); } }, 'Upload all');
    const add = (files) => {
      for (const file of files) pending.append(pendingRow(c, file, () => { allBtn.hidden = !pending.children.length; }, (entry) => { existing.append(entryRow(c, entry)); loadList(); }));
      allBtn.hidden = !pending.children.length;
    };
    drop.addEventListener('click', () => fileInput.click());
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
    fileInput.addEventListener('change', () => { add([...fileInput.files]); fileInput.value = ''; });
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); add([...e.dataTransfer.files].filter((f) => /^image\//.test(f.type))); });
    return h('div', { class: 'ct-card' },
      h('h3', null, 'Entries'),
      h('p', null, c.phase === 'voting' ? 'Voting is open: new entries show up for voters straight away. Hide an entry to take it out of the vote and the results.'
        : c.anonymous ? 'Entries become public when voting opens, anonymous and shuffled. Artists are shown with the results.'
          : 'Entries become public when voting opens, shuffled, with their titles and artists.'),
      c.submissions ? h('p', null, 'Entries sent with ', cmd('/submit'), ' appear here by themselves, marked “via /submit”. Hide or delete any that break the rules before voting opens.') : null,
      drop, fileInput,
      h('p', { class: 'st-note' }, 'Pictures are re-saved in your browser before upload: that removes hidden metadata (camera, location, or an artist name that would give an anonymous entry away), and makes the gallery preview. The file name is never uploaded. Add the artists’ Discord IDs (right-click them in Discord, Copy User ID) so they can’t rank their own entry.'),
      pending, h('div', { class: 'st-row', style: 'margin-top:12px' }, allBtn),
      h('div', { style: 'height:16px' }),
      entries.length ? null : h('p', { class: 'st-hint' }, 'No entries yet.'),
      existing);
  }

  function fields(e) {
    const field = (label, input) => h('label', { class: 'st-field' }, label, input);
    const names = h('input', { class: 'st-in', value: e ? e.artistNames.join(', ') : '', placeholder: 'Name (comma between names)', maxlength: 600, title: 'Shown with the results. Several artists: separate with commas.' });
    const discord = h('input', { class: 'st-in', value: e ? e.artistIds.join(', ') : '', placeholder: 'optional', inputmode: 'numeric', title: 'Optional. Discord user IDs of the artists (right-click the user in Discord, Copy User ID). They can’t rank their own entry.' });
    const title = h('input', { class: 'st-in', value: e ? e.title : '', placeholder: 'optional', maxlength: 120 });
    return {
      el: [field('Artists', names), field('Their Discord IDs', discord), h('label', { class: 'st-field', style: 'grid-column:1/-1' }, 'Title (shown with the results)', title)],
      value: () => ({ artistNames: list(names.value), artistIds: ids(discord.value), title: title.value }),
    };
  }

  function pendingRow(c, file, onGone, onDone) {
    const f = fields(null);
    const status = h('p', { class: 'st-msg' }, 'Preparing…');
    const bar = h('i');
    const thumb = h('div', { class: 'st-thumb' });
    const upBtn = h('button', { type: 'button', class: 'bx-btn', disabled: true }, 'Upload');
    const rmBtn = h('button', { type: 'button', class: 'bx-btn bx-btn-ghost' }, 'Remove');
    const li = h('li', { class: 'st-entry' }, thumb,
      h('div', { class: 'st-entry-f' }, h('div', { class: 'st-entry-h' }, 'New entry', h('small', null, file.name)), ...f.el, h('div', { style: 'grid-column:1/-1' }, h('div', { class: 'st-prog' }, bar), status)),
      h('div', { class: 'st-entry-a' }, upBtn, rmBtn));
    let pic = null, entry = null, url = null, busy = false;
    const gone = () => { if (url) URL.revokeObjectURL(url); li.remove(); onGone(); };
    rmBtn.onclick = gone;
    preparePicture(file).then((p) => {
      pic = p;
      url = URL.createObjectURL(p.preview.blob);
      thumb.append(h('img', { src: url, alt: '' }));
      msg(status, `${p.srcW}×${p.srcH} → ${p.full.w}×${p.full.h} (${mb(p.full.blob.size)}), preview ${mb(p.preview.blob.size)}${p.full.blob.type === 'image/webp' ? '' : ' (JPEG: this browser can’t write WebP)'}`);
      upBtn.disabled = false;
    }).catch((e) => msg(status, e.message || 'Could not read this picture.', 'err'));
    li._upload = async () => {
      if (!pic || busy) return;
      const v = f.value();
      if (!v.artistNames.length) { msg(status, 'Add the artist name first.', 'err'); return; }
      busy = true; upBtn.disabled = true; rmBtn.disabled = true;
      try {
        if (!entry) {
          msg(status, 'Creating the entry…'); bar.style.width = '10%';
          entry = (await api(`/api/staff/contests/${encodeURIComponent(c.id)}/entries`, { method: 'POST', json: v })).entry;
        }
        const done = await uploadPictures(entry.id, pic, (step) => { bar.style.width = step === 1 ? '40%' : '80%'; msg(status, step === 1 ? 'Uploading the picture…' : 'Uploading the preview…'); });
        bar.style.width = '100%';
        onDone(done);
        gone();
      } catch (e) {
        msg(status, `${e.message}${entry ? ' The entry was created; press Upload to try the pictures again.' : ''}`, 'err');
        busy = false; upBtn.disabled = false; rmBtn.disabled = !!entry;
      }
    };
    upBtn.onclick = () => li._upload();
    return li;
  }

  function entryRow(c, e) {
    const f = fields(e);
    const status = h('p', { class: 'st-msg' }, e.complete ? '' : 'Pictures missing: use Replace picture.');
    if (!e.complete) status.className = 'st-msg err';
    const thumb = h('div', { class: 'st-thumb' }, e.preview ? h('a', { href: e.full || e.preview, target: '_blank', rel: 'noopener' }, h('img', { src: e.preview, alt: '', loading: 'lazy' })) : null);
    const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true });
    const li = h('li', { class: `st-entry${e.hidden ? ' is-hidden' : ''}` }, thumb,
      h('div', { class: 'st-entry-f' }, h('div', { class: 'st-entry-h' }, `Entry ${e.number}`,
        e.submittedBy ? h('small', { class: 'st-by', title: `Sent with /submit by Discord user ${e.submittedBy}, last changed ${fmtWhen(e.updatedAt)}` }, 'via /submit') : null,
        h('small', null, e.w ? `${e.w}×${e.h}` : '')), ...f.el, h('div', { style: 'grid-column:1/-1' }, status)),
      h('div', { class: 'st-entry-a' },
        h('button', { type: 'button', class: 'bx-btn', onclick: () => save(f.value()) }, 'Save'),
        h('button', { type: 'button', class: 'bx-btn bx-btn-ghost', onclick: () => save({ hidden: !e.hidden }) }, e.hidden ? 'Unhide' : 'Hide'),
        h('button', { type: 'button', class: 'bx-btn bx-btn-ghost', onclick: () => file.click() }, 'Replace picture'),
        h('button', { type: 'button', class: 'bx-btn bx-btn-ghost', onclick: del }, 'Delete'),
        file));
    async function save(patch) {
      msg(status, 'Saving…');
      try { const r = await api(`/api/staff/entries/${e.id}`, { method: 'PATCH', json: patch }); li.replaceWith(entryRow(c, r.entry)); loadList(); } catch (err) { msg(status, err.message, 'err'); }
    }
    async function del() {
      if (!confirm(`Delete Entry ${e.number} and its pictures? This can’t be undone.`)) return;
      try { await api(`/api/staff/entries/${e.id}`, { method: 'DELETE' }); li.remove(); loadList(); } catch (err) { msg(status, err.message, 'err'); }
    }
    file.addEventListener('change', async () => {
      const fl = file.files[0];
      file.value = '';
      if (!fl) return;
      try {
        msg(status, 'Preparing…');
        const pic = await preparePicture(fl);
        const r = await uploadPictures(e.id, pic, (s) => msg(status, s === 1 ? 'Uploading the picture…' : 'Uploading the preview…'));
        li.replaceWith(entryRow(c, r));
      } catch (err) { msg(status, err.message, 'err'); }
    });
    return li;
  }

  try {
    await loadList();
    const want = new URLSearchParams(location.search).get('c');
    if (want && contests.some((x) => x.id === want)) open(want);
    else if (contests.length) open(contests[0].id);
    else open('');
  } catch (e) { app.replaceChildren(errorBox(e.message)); }
})();
