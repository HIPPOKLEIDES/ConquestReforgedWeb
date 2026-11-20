// Entries sent by the entrants themselves with the Discord bot's /submit (worker/bot.js): the bot key, the
// contest's entry window and channel, one entry per person, replacing and withdrawing, and that entrants still
// stay anonymous and can't rank their own entry.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { BOT_KEY, ORIGIN, STAFF_ID, VOTER_IDS, client, makeEnv, sessionFor } from './support.mjs';

const HOUR = 3600000;
const [V1, V2, V3] = VOTER_IDS;
const GUILD = '700000000000000001', CHANNEL = '700000000000000002', THREAD = '700000000000000003', OTHER = '700000000000000004';
const ENTRANT = '777777777777777777', ENTRANT2 = '888888888888888888';

const webp = (n) => new Uint8Array([82, 73, 70, 70, n, 0, 0, 0, 87, 69, 66, 80, n]); // "RIFF" … "WEBP"

async function bot(env, path, { body, form, key = BOT_KEY, method = 'POST' } = {}) {
  const headers = new Headers();
  if (key) headers.set('authorization', `Bearer ${key}`);
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers.set('content-type', 'application/json'); payload = JSON.stringify(body); }
  const res = await worker.fetch(new Request(ORIGIN + '/api/bot/' + path, { method, headers, body: payload }), env);
  return { status: res.status, data: (res.headers.get('content-type') || '').includes('json') ? await res.json() : null };
}
function entryForm({ channelId = CHANNEL, parentId, user = { id: ENTRANT, name: 'Ser Builder' }, title = 'My keep', full = webp(1), preview = webp(2), type = 'image/webp', width = 3840, height = 2160 } = {}) {
  const f = new FormData();
  f.set('meta', JSON.stringify({ channelId, parentId, user, title, width, height }));
  if (full) f.set('full', new Blob([full], { type }), 'full.webp');
  if (preview) f.set('preview', new Blob([preview], { type }), 'preview.webp');
  return f;
}

// a published contest taking entries in CHANNEL now; voting opens after entries close
async function entryContest(env, { id = 'keeps', published = true, submitOpensAt, submitClosesAt, opensAt, channel = `https://discord.com/channels/${GUILD}/${CHANNEL}` } = {}) {
  const api = client(env);
  const staff = await sessionFor(env, STAFF_ID, 'staffer');
  const now = Date.now();
  const so = submitOpensAt ?? now - HOUR, sc = submitClosesAt ?? now + 24 * HOUR, vo = opensAt ?? sc + HOUR;
  const r = await api.post('/api/staff/contests', { id, title: `Contest ${id}`, theme: 'Keeps', opensAt: vo, closesAt: vo + 48 * HOUR, published, submitOpensAt: so, submitClosesAt: sc, submitChannel: channel }, { token: staff });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { api, staff, contest: r.data.contest };
}
const moveTimes = (env, id, cols) => {
  const keys = Object.keys(cols);
  env.DB.raw.prepare(`UPDATE contests SET ${keys.map((k) => `${k} = ?`).join(', ')}, results_cache = NULL WHERE id = ?`).run(...keys.map((k) => cols[k]), id);
};

test('the bot API needs the bot key, and is off when the site has none', async () => {
  const env = makeEnv();
  await entryContest(env);
  const look = { channelId: CHANNEL, userId: ENTRANT };
  assert.equal((await bot(env, 'lookup', { body: look, key: null })).status, 401, 'no key');
  assert.equal((await bot(env, 'lookup', { body: look, key: 'test-bot-key-that-is-long-enougH' })).status, 401, 'wrong key');
  assert.equal((await bot(env, 'lookup', { body: look, key: 'x' })).status, 401, 'short key');
  assert.equal((await bot(env, 'submit', { form: entryForm(), key: 'nope' })).status, 401);
  // a staff session cookie is no substitute
  const staff = await sessionFor(env, STAFF_ID);
  const res = await worker.fetch(new Request(ORIGIN + '/api/bot/lookup', { method: 'POST', headers: { cookie: `cr_session=${staff}`, origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify(look) }), env);
  assert.equal(res.status, 401);
  assert.equal((await bot(env, 'lookup', { body: look })).status, 200);
  assert.equal((await bot(env, 'lookup', { body: look, method: 'PUT' })).status, 404);

  for (const missing of [undefined, '', 'short']) {
    const off = makeEnv({ CONTEST_BOT_KEY: missing });
    const r = await bot(off, 'lookup', { body: look, key: missing || 'anything' });
    assert.equal(r.status, 503, `key ${JSON.stringify(missing)}`);
    assert.equal(r.data.code, 'not-configured');
  }
});

test('staff set the entry window and channel; the times must make sense', async () => {
  const env = makeEnv();
  const { api, staff, contest } = await entryContest(env);
  assert.equal(contest.submitChannel, `https://discord.com/channels/${GUILD}/${CHANNEL}`);
  assert.equal(contest.submitChannelId, CHANNEL);
  assert.equal(contest.submissions, 'open');

  const now = Date.now();
  const base = { id: 'b', title: 'B', opensAt: now + 10 * HOUR, closesAt: now + 20 * HOUR, published: true };
  const bad = async (extra, why) => {
    const r = await api.post('/api/staff/contests', { ...base, ...extra }, { token: staff });
    assert.equal(r.status, 400, `${why}: ${JSON.stringify(r.data)}`);
  };
  await bad({ submitOpensAt: now, submitChannel: CHANNEL }, 'only one time');
  await bad({ submitOpensAt: now + 2 * HOUR, submitClosesAt: now + HOUR, submitChannel: CHANNEL }, 'closes before it opens');
  await bad({ submitOpensAt: now, submitClosesAt: now + 11 * HOUR, submitChannel: CHANNEL }, 'still taking entries when voting opens');
  await bad({ submitOpensAt: now, submitClosesAt: now + HOUR }, 'no channel');
  await bad({ submitOpensAt: now, submitClosesAt: now + HOUR, submitChannel: '#contest-entries' }, 'not a channel');
  await bad({ submitOpensAt: now, submitClosesAt: now + HOUR, submitChannel: 'https://evil.example/channels/1/2' }, 'not a Discord link');
  // a bare ID works too, and so does a link to a message in the channel
  const ok = await api.post('/api/staff/contests', { ...base, submitOpensAt: now, submitClosesAt: now + HOUR, submitChannel: ` ${THREAD} ` }, { token: staff });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.contest.submitChannel, THREAD);
  const msg = await api.patch('/api/staff/contests/b', { submitChannel: `https://discord.com/channels/${GUILD}/${OTHER}/700000000000000099` }, { token: staff });
  assert.equal(msg.data.contest.submitChannel, `https://discord.com/channels/${GUILD}/${OTHER}`);
  // changing only the voting time is checked against the entry window it already has
  assert.equal((await api.patch('/api/staff/contests/b', { opensAt: now + HOUR / 2 }, { token: staff })).status, 400);
  // and the window can be removed again (staff add the entries themselves)
  const off = await api.patch('/api/staff/contests/b', { submitOpensAt: null, submitClosesAt: null, submitChannel: '' }, { token: staff });
  assert.equal(off.status, 200);
  assert.equal(off.data.contest.submissions, null);
});

test('lookup finds the contest in its channel and in that channel’s threads, and says where else to go', async () => {
  const env = makeEnv();
  const now = Date.now();
  await entryContest(env);
  await entryContest(env, { id: 'later', channel: OTHER, submitOpensAt: now + 5 * HOUR, submitClosesAt: now + 9 * HOUR });
  await entryContest(env, { id: 'hidden-draft', published: false, channel: THREAD });

  let r = await bot(env, 'lookup', { body: { channelId: CHANNEL, userId: ENTRANT } });
  assert.equal(r.data.contest.id, 'keeps');
  assert.equal(r.data.contest.url, `${ORIGIN}/contests/keeps`);
  assert.equal(r.data.entry, null);
  r = await bot(env, 'lookup', { body: { channelId: THREAD, parentId: CHANNEL, userId: ENTRANT } });
  assert.equal(r.data.contest.id, 'keeps', 'a thread in the contest channel');

  r = await bot(env, 'lookup', { body: { channelId: OTHER, userId: ENTRANT } });
  assert.equal(r.data.contest, null, 'not open yet');
  const here = r.data.others.find((o) => o.here);
  assert.equal(here.title, 'Contest later');
  assert.equal(here.state, 'soon');
  const open = r.data.others.find((o) => o.state === 'open');
  assert.equal(open.channelId, CHANNEL);
  assert.ok(!r.data.others.some((o) => o.title === 'Contest hidden-draft'), 'drafts stay secret');

  r = await bot(env, 'lookup', { body: { channelId: THREAD, userId: ENTRANT } });
  assert.equal(r.data.contest, null, 'a draft takes no entries');
  assert.equal((await bot(env, 'lookup', { body: { channelId: 'general', userId: ENTRANT } })).status, 400);
  assert.equal((await bot(env, 'lookup', { body: { channelId: CHANNEL, userId: '12' } })).status, 400);
});

test('/submit: one entry per person, sent again replaces it, /withdraw removes it', async () => {
  const env = makeEnv();
  const { api, staff } = await entryContest(env);

  const first = await bot(env, 'submit', { form: entryForm() });
  assert.equal(first.status, 201, JSON.stringify(first.data));
  assert.deepEqual(first.data.entry, { number: 1, title: 'My keep', hidden: false });
  assert.equal(first.data.replaced, false);
  assert.equal(env.IMAGES.store.size, 2);

  let d = (await api.get('/api/staff/contests/keeps', { token: staff })).data;
  assert.equal(d.entries.length, 1);
  const e1 = d.entries[0];
  assert.deepEqual([e1.artistNames, e1.artistIds, e1.submittedBy, e1.w, e1.h, e1.complete], [['Ser Builder'], [ENTRANT], ENTRANT, 3840, 2160, true]);
  assert.equal((await bot(env, 'lookup', { body: { channelId: CHANNEL, userId: ENTRANT } })).data.entry.title, 'My keep');

  // a second entrant, through a thread of the channel
  const other = await bot(env, 'submit', { form: entryForm({ channelId: THREAD, parentId: CHANNEL, user: { id: ENTRANT2, name: 'Mason' }, title: 'Walls' }) });
  assert.equal(other.data.entry.number, 2);

  // staff hide entry 1 and add a co-artist; the entrant then sends a new picture and title
  await api.patch(`/api/staff/entries/${e1.id}`, { hidden: true, artistNames: ['Ser Builder', 'Friend'] }, { token: staff });
  const oldKeys = [...env.IMAGES.store.keys()];
  const again = await bot(env, 'submit', { form: entryForm({ title: '  My keep, finished  ', full: webp(3), preview: webp(4), width: 1920, height: 1080 }) });
  assert.equal(again.status, 200);
  assert.equal(again.data.replaced, true);
  assert.deepEqual(again.data.entry, { number: 1, title: 'My keep, finished', hidden: true });
  d = (await api.get('/api/staff/contests/keeps', { token: staff })).data;
  const e1b = d.entries.find((e) => e.id === e1.id);
  assert.equal(d.entries.length, 2, 'still one entry each');
  assert.deepEqual([e1b.hidden, e1b.artistNames, e1b.w, e1b.h], [true, ['Ser Builder', 'Friend'], 1920, 1080], 'staff changes stay');
  assert.notEqual(e1b.full, e1.full, 'new picture, new URL');
  assert.equal(env.IMAGES.store.size, 4, 'the old pictures are deleted');
  assert.ok(oldKeys.filter((k) => !env.IMAGES.store.has(k)).length === 2);

  const w = await bot(env, 'withdraw', { body: { channelId: CHANNEL, userId: ENTRANT } });
  assert.equal(w.status, 200);
  assert.equal(w.data.withdrawn.number, 1);
  assert.equal(env.IMAGES.store.size, 2);
  assert.equal((await bot(env, 'withdraw', { body: { channelId: CHANNEL, userId: ENTRANT } })).data.code, 'no-entry');
  d = (await api.get('/api/staff/contests/keeps', { token: staff })).data;
  assert.deepEqual(d.entries.map((e) => e.title), ['Walls']);
  // sending again after withdrawing makes a new entry
  assert.equal((await bot(env, 'submit', { form: entryForm() })).data.entry.number, 3);
});

test('/submit checks the pictures and the details', async () => {
  const env = makeEnv();
  await entryContest(env);
  const expect = async (form, status, why) => {
    const r = await bot(env, 'submit', { form });
    assert.equal(r.status, status, `${why}: ${JSON.stringify(r.data)}`);
  };
  await expect(entryForm({ full: new TextEncoder().encode('<svg onload=alert(1)>') }), 415, 'not really a WebP');
  await expect(entryForm({ type: 'image/svg+xml' }), 415, 'SVG');
  await expect(entryForm({ preview: null }), 400, 'no preview');
  await expect(entryForm({ title: '   ' }), 400, 'no title');
  await expect(entryForm({ title: 'x'.repeat(121) }), 400, 'title too long');
  await expect(entryForm({ width: 0 }), 400, 'no size');
  await expect(entryForm({ user: { id: 'me', name: 'x' } }), 400, 'not a Discord ID');
  await expect(entryForm({ channelId: OTHER }), 404, 'no contest here');
  const png = new Uint8Array([0x89, 80, 78, 71, 13, 10, 26, 10]);
  await expect(entryForm({ full: png, preview: webp(1), type: 'image/png' }), 415, 'preview is not a PNG');
  const json = await worker.fetch(new Request(ORIGIN + '/api/bot/submit', { method: 'POST', headers: { authorization: `Bearer ${BOT_KEY}`, 'content-type': 'application/json' }, body: '{}' }), env);
  assert.equal(json.status, 415);
  assert.equal(env.IMAGES.store.size, 0, 'nothing stored by any of these');
});

test('nothing goes in outside the entry window or in an unpublished contest', async () => {
  const env = makeEnv();
  const now = Date.now();
  await entryContest(env);
  moveTimes(env, 'keeps', { submit_opens_at: now + HOUR, submit_closes_at: now + 2 * HOUR, vote_opens_at: now + 3 * HOUR });
  assert.equal((await bot(env, 'submit', { form: entryForm() })).data.code, 'no-contest', 'not open yet');
  moveTimes(env, 'keeps', { submit_opens_at: now - 2 * HOUR, submit_closes_at: now - HOUR });
  assert.equal((await bot(env, 'submit', { form: entryForm() })).data.code, 'no-contest', 'closed');
  moveTimes(env, 'keeps', { submit_opens_at: now - HOUR, submit_closes_at: now + HOUR, published: 0 });
  assert.equal((await bot(env, 'submit', { form: entryForm() })).data.code, 'no-contest', 'draft');
  assert.equal(env.IMAGES.store.size, 0);
});

test('the bot key can’t touch entries staff added, even for the same person', async () => {
  const env = makeEnv();
  const { api, staff } = await entryContest(env);
  const added = await api.post('/api/staff/contests/keeps/entries', { title: 'Staff-added', artistNames: ['Ser Builder'], artistIds: [ENTRANT] }, { token: staff });
  assert.equal((await bot(env, 'withdraw', { body: { channelId: CHANNEL, userId: ENTRANT } })).data.code, 'no-entry');
  assert.equal((await bot(env, 'lookup', { body: { channelId: CHANNEL, userId: ENTRANT } })).data.entry, null);
  const sent = await bot(env, 'submit', { form: entryForm() });
  assert.equal(sent.data.entry.number, 2, 'their own /submit entry is a separate one');
  const d = (await api.get('/api/staff/contests/keeps', { token: staff })).data;
  assert.equal(d.entries.find((e) => e.id === added.data.entry.id).title, 'Staff-added');
});

test('entrants stay anonymous, and can’t rank their own entry even if staff edit its artists', async () => {
  const env = makeEnv();
  const { api, staff } = await entryContest(env);
  const names = ['Ser Builder', 'Mason', 'Quarry'], ids = [ENTRANT, ENTRANT2, V3];
  for (let i = 0; i < 3; i++) await bot(env, 'submit', { form: entryForm({ user: { id: ids[i], name: names[i] }, title: `Secret title ${i}` }) });
  await bot(env, 'submit', { form: entryForm({ user: { id: V2, name: 'Fourth' }, title: 'Secret title 3' }) });

  // while entries come in: a count, nothing else
  const during = await api.get('/api/contests/keeps');
  assert.equal(during.data.contest.submissions.state, 'open');
  assert.equal(during.data.contest.submissions.channelUrl, `https://discord.com/channels/${GUILD}/${CHANNEL}`);
  assert.equal(during.data.entryCount, 4);
  assert.deepEqual(during.data.entries, []);
  const listed = (await api.get('/api/contests')).data.contests[0];
  assert.equal(listed.entryCount, 4);

  // voting opens
  const now = Date.now();
  moveTimes(env, 'keeps', { submit_opens_at: now - 3 * HOUR, submit_closes_at: now - 2 * HOUR, vote_opens_at: now - HOUR, vote_closes_at: now + HOUR });
  const secrets = [...names, ...ids, 'Fourth', 'Secret title', 'submitted', 'artist'];
  for (const token of [undefined, await sessionFor(env, V1)]) {
    const text = JSON.stringify({ ...(await api.get('/api/contests/keeps', { token })).data, viewer: null }) + JSON.stringify((await api.get('/api/contests')).data);
    for (const s of secrets) assert.ok(!text.includes(s), `public API leaks ${s}`);
  }
  const page = await (await worker.fetch(new Request(ORIGIN + '/contests/keeps'), env)).text();
  for (const s of secrets) assert.ok(!page.includes(s), `page leaks ${s}`);

  // staff take the entrant off the artist IDs: they still can't rank their own entry
  const d = (await api.get('/api/staff/contests/keeps', { token: staff })).data;
  const mine = d.entries.find((e) => e.submittedBy === ENTRANT);
  await api.patch(`/api/staff/entries/${mine.id}`, { artistIds: [] }, { token: staff });
  const entrant = await sessionFor(env, ENTRANT);
  const view = (await api.get('/api/contests/keeps', { token: entrant })).data;
  assert.deepEqual(view.entries.filter((e) => e.own).map((e) => e.id), [mine.id]);
  const others = view.entries.filter((e) => !e.own).map((e) => e.id);
  const own = await api.put('/api/contests/keeps/ballot', { picks: [mine.id, others[0], others[1]] }, { token: entrant });
  assert.equal(own.status, 403);
  assert.equal(own.data.code, 'own-entry');
  assert.equal((await api.put('/api/contests/keeps/ballot', { picks: others }, { token: entrant })).status, 200);
  // and /submit is closed now that voting has started
  assert.equal((await bot(env, 'submit', { form: entryForm() })).data.code, 'no-contest');
});
