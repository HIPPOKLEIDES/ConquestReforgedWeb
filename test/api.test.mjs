// The Worker end to end (in Node, with D1/R2 test doubles): staff-only access, ballots, hidden tallies,
// anonymity while voting, results, CSV export, images and the Discord sign-in (Discord mocked).
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { ARTIST_ID, ORIGIN, STAFF_ID, VOTER_IDS, client, makeEnv, seedContest, sessionFor, setWindow, snowflakeFor } from './support.mjs';

const HOUR = 3600000;
const [V1, V2, V3, V4, V5] = VOTER_IDS;

// every word that would give away an artist or a score while voting is open
const SECRET_WORDS = ['Artist ', 'Title ', ARTIST_ID, '"points"', '"firsts"', '"seconds"', '"thirds"', '"place"', '"ballots"', 'artist', 'image_key', 'preview_key'];
const assertNoSecrets = (text, where) => {
  for (const w of SECRET_WORDS) assert.ok(!text.includes(w), `${where} leaks ${w}: ${text.slice(0, 400)}`);
};

test('staff routes need a staff Discord ID', async () => {
  const env = makeEnv();
  const api = client(env);
  const voter = await sessionFor(env, V1);
  const staff = await sessionFor(env, STAFF_ID);
  const body = { id: 'x1', title: 'X', opensAt: Date.now(), closesAt: Date.now() + HOUR };

  assert.equal((await api.get('/api/staff/contests')).status, 401);
  assert.equal((await api.get('/api/staff/contests', { token: voter })).status, 403);
  assert.equal((await api.post('/api/staff/contests', body, { token: voter })).status, 403);
  assert.equal((await api.get('/api/staff/contests/x1/ballots.csv', { token: voter })).status, 403);
  assert.equal((await api.call('PUT', '/api/staff/entries/1/image?kind=full&w=1&h=1', { token: voter, raw: 'x', headers: { 'content-type': 'image/webp' } })).status, 403);
  assert.equal((await api.get('/api/staff/contests', { token: 'A'.repeat(43) })).status, 401, 'made-up token');

  assert.equal((await api.get('/api/staff/contests', { token: staff })).status, 200);
  assert.equal((await api.post('/api/staff/contests', body, { token: staff, origin: 'https://evil.example' })).status, 403, 'cross-site request');
  assert.equal((await api.post('/api/staff/contests', body, { token: staff, origin: null })).status, 403, 'no Origin');
  const ok = await api.post('/api/staff/contests', body, { token: staff });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.contest.published, false);
  assert.equal((await api.post('/api/staff/contests', body, { token: staff })).status, 409, 'duplicate id');
  assert.equal((await api.post('/api/staff/contests', { ...body, id: 'staff' }, { token: staff })).status, 400, 'reserved id');
  assert.equal((await api.post('/api/staff/contests', { ...body, id: 'y', closesAt: body.opensAt - 1 }, { token: staff })).status, 400, 'closes before it opens');

  // a draft is invisible to everyone but staff
  assert.equal((await api.get('/api/contests/x1')).status, 404);
  assert.equal((await api.get('/api/contests/x1', { token: voter })).status, 404);
  assert.equal((await api.get('/api/contests/x1', { token: staff })).status, 200);
  assert.equal((await api.get('/api/contests')).data.contests.length, 0);
  assert.equal((await api.get('/contests/x1')).status, 404);
});

test('while voting is open: anonymous entries, shuffled per voter, no tallies anywhere', async () => {
  const env = makeEnv();
  const { api } = await seedContest(env, { n: 8, artistOf: { 3: ARTIST_ID } });
  const t1 = await sessionFor(env, V1), t2 = await sessionFor(env, V2), artist = await sessionFor(env, ARTIST_ID);
  // some votes are in
  const first = (await api.get('/api/contests/castles', { token: t1 })).data;
  const ids = first.entries.map((e) => e.id);
  assert.equal((await api.put('/api/contests/castles/ballot', { picks: ids.slice(0, 3) }, { token: t1 })).status, 200);

  for (const [who, token] of [['public', undefined], ['voter', t1], ['other voter', t2], ['artist', artist]]) {
    const r = await api.get('/api/contests/castles', { token });
    assert.equal(r.status, 200);
    assert.equal(r.data.contest.phase, 'voting');
    assert.equal(r.data.entries.length, 8);
    for (const e of r.data.entries) assert.deepEqual(Object.keys(e).filter((k) => k !== 'own').sort(), ['full', 'h', 'id', 'number', 'preview', 'w']);
    assert.equal(r.data.results, undefined);
    // (the viewer block is the signed-in person's own account, so the artist sees their own ID there)
    assertNoSecrets(JSON.stringify({ ...r.data, viewer: null }), `GET /api/contests/castles (${who})`);
  }
  assertNoSecrets(JSON.stringify((await api.get('/api/contests')).data), 'GET /api/contests');
  const page = await (await worker.fetch(new Request(ORIGIN + '/contests/castles'), env)).text();
  assertNoSecrets(page, '/contests/castles page');
  assert.match(page, /og:image" content="https:\/\/www\.example\.test\/default\.png"/, 'no entry in the link preview while voting');

  // stable order for the same voter, a different one for another voter
  const again = (await api.get('/api/contests/castles', { token: t1 })).data.entries.map((e) => e.id);
  const other = (await api.get('/api/contests/castles', { token: t2 })).data.entries.map((e) => e.id);
  assert.deepEqual(again, ids);
  assert.notDeepEqual(other, ids);
  // the artist sees which entry is theirs (and nobody else does)
  const mine = (await api.get('/api/contests/castles', { token: artist })).data.entries.filter((e) => e.own);
  assert.equal(mine.length, 1);
  assert.equal((await api.get('/api/contests/castles', { token: t1 })).data.entries.filter((e) => e.own).length, 0);
});

test('ballots: validated on the server, one per account, changeable until voting closes', async () => {
  const env = makeEnv();
  const { api, entries, staff } = await seedContest(env, { n: 5, artistOf: { 2: ARTIST_ID } });
  await seedContest(env, { id: 'other', n: 3 });
  const otherIds = (await api.get('/api/contests/other')).data.entries.map((e) => e.id);
  const t1 = await sessionFor(env, V1), artist = await sessionFor(env, ARTIST_ID);
  const [e1, e2, e3, e4, e5] = entries.map((e) => e.id);
  const put = (picks, token = t1, o) => api.put('/api/contests/castles/ballot', { picks }, { token, ...o });

  assert.equal((await put([e1, e3, e4], null)).status, 401, 'signed out');
  assert.equal((await put([e1, e3, e4], t1, { origin: 'https://evil.example' })).status, 403, 'cross-site');
  assert.equal((await put([e1, e1, e4])).status, 400, 'duplicate');
  assert.equal((await put([e1, e3])).status, 400, 'only two');
  assert.equal((await put([e1, e3, e4, e5])).status, 400, 'four');
  assert.equal((await put([e1, e3, otherIds[0]])).status, 400, 'entry from another contest');
  assert.equal((await put([e1, e3, 99999])).status, 400, 'no such entry');
  const own = await put([e1, e2, e3], artist);
  assert.equal(own.status, 403); assert.equal(own.data.code, 'own-entry');
  assert.equal((await put([e1, e3, e4], artist)).status, 200, 'the artist can still vote for others');

  assert.equal((await put([e1, e3, e4])).status, 200);
  const changed = await put([e5, e4, e3]);
  assert.equal(changed.status, 200);
  assert.deepEqual((await api.get('/api/contests/castles', { token: t1 })).data.ballot.picks, [e5, e4, e3]);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM ballots WHERE voter_id = ?').get(V1).n, 1);

  // hidden entries can't be picked
  assert.equal((await api.patch(`/api/staff/entries/${e1}`, { hidden: true }, { token: staff })).status, 200);
  assert.equal((await put([e1, e3, e4])).data.code, 'unknown-entry');
  assert.equal((await api.get('/api/contests/castles')).data.entries.length, 4);

  // not before voting opens or after it closes
  setWindow(env, 'castles', Date.now() + HOUR, Date.now() + 2 * HOUR);
  assert.equal((await put([e5, e3, e4])).status, 409);
  setWindow(env, 'castles', Date.now() - 2 * HOUR, Date.now() - 1);
  assert.equal((await put([e5, e3, e4])).status, 409);
  assert.deepEqual((await api.get('/api/contests/castles', { token: t1 })).data.ballot.picks, [e5, e4, e3], 'last ballot before close kept');
});

test('minimum account age is enforced', async () => {
  const env = makeEnv();
  const { api, entries } = await seedContest(env, { minAccountAgeDays: 30 });
  const fresh = await sessionFor(env, snowflakeFor(Date.now() - 3 * 86400000));
  const old = await sessionFor(env, V1); // 111111111111111111 is from 2015
  const picks = entries.slice(0, 3).map((e) => e.id);
  const view = (await api.get('/api/contests/castles', { token: fresh })).data;
  assert.equal(view.canVote, false);
  assert.match(view.cannotVoteReason, /30 days/);
  const r = await api.put('/api/contests/castles/ballot', { picks }, { token: fresh });
  assert.equal(r.status, 403); assert.equal(r.data.code, 'account-too-new');
  assert.equal((await api.put('/api/contests/castles/ballot', { picks }, { token: old })).status, 200);
});

test('results: hidden until voting closes, then 3/2/1 with tie-breaks and artists revealed', async () => {
  const env = makeEnv();
  const { api, entries, staff } = await seedContest(env, { n: 4 });
  const [a, b, c, d] = entries.map((e) => e.id);
  const tokens = await Promise.all(VOTER_IDS.map((id) => sessionFor(env, id)));
  const ballots = [[a, b, c], [a, c, d], [b, d, a], [c, b, d]];
  for (let i = 0; i < ballots.length; i++) assert.equal((await api.put('/api/contests/castles/ballot', { picks: ballots[i] }, { token: tokens[i] })).status, 200);
  // a = 3+3+1 = 7, b = 2+3+2 = 7, c = 1+2+3 = 6, d = 1+2+1 = 4

  const during = await api.get('/api/contests/castles');
  assertNoSecrets(JSON.stringify(during.data), 'contest during voting');
  const staffView = await api.get('/api/staff/contests/castles', { token: staff });
  assert.equal(staffView.data.contest.ballotCount, 4);

  // staff close voting early; ballots are refused from then on
  assert.equal((await api.post('/api/staff/contests/castles/close', {}, { token: staff })).status, 200);
  assert.equal((await api.put('/api/contests/castles/ballot', { picks: [d, c, b] }, { token: tokens[4] })).status, 409);
  assert.equal((await api.post('/api/staff/contests/castles/close', {}, { token: staff })).status, 409, 'already closed');

  const after = (await api.get('/api/contests/castles', { token: tokens[0] })).data;
  assert.equal(after.contest.phase, 'closed');
  assert.equal(after.results.ballots, 4);
  const byId = Object.fromEntries(after.entries.map((e) => [e.id, e]));
  assert.deepEqual([a, b, c, d].map((id) => byId[id].points), [7, 7, 6, 4]);
  assert.deepEqual(after.entries.map((e) => e.id), [a, b, c, d], 'a beats b on 1st places');
  assert.deepEqual(after.entries.map((e) => e.place), [1, 2, 3, 4]);
  assert.equal(byId[a].firsts, 2);
  assert.deepEqual(byId[a].artists, ['Artist 1']);
  assert.equal(byId[a].title, 'Title 1');
  assert.deepEqual(after.ballot.picks, [a, b, c], 'voters see their own ballot');
  assert.ok(!JSON.stringify(after).includes(ARTIST_ID));

  // the link preview now shows the winner
  const page = await (await worker.fetch(new Request(ORIGIN + '/contests/castles'), env)).text();
  assert.match(page, new RegExp(`og:image" content="${ORIGIN.replace(/\./g, '\\.')}/api/img/${a}/preview\\?v=`));

  // hiding an entry after the fact takes it (and its points) out of the results
  assert.equal((await api.patch(`/api/staff/entries/${a}`, { hidden: true }, { token: staff })).status, 200);
  const rehidden = (await api.get('/api/contests/castles')).data;
  assert.deepEqual(rehidden.entries.map((e) => e.id), [b, c, d]);
  assert.equal(rehidden.entries[0].place, 1);

  // the list shows the winner as the cover
  const list = (await api.get('/api/contests')).data.contests;
  assert.equal(list[0].cover.winners[0].artists[0], 'Artist 2');
});

test('a contest nobody voted in has no winner', async () => {
  const env = makeEnv();
  await seedContest(env, { n: 3 });
  setWindow(env, 'castles', Date.now() - 2 * HOUR, Date.now() - HOUR);
  const api = client(env);
  const d = (await api.get('/api/contests/castles')).data;
  assert.equal(d.results.ballots, 0);
  const card = (await api.get('/api/contests')).data.contests[0];
  assert.equal(card.cover, null, 'no "won by" on the list');
  assert.equal(card.collage.length, 3);
  const page = await (await worker.fetch(new Request(ORIGIN + '/contests/castles'), env)).text();
  assert.match(page, /og:image" content="https:\/\/www\.example\.test\/default\.png"/, 'no winner in the link preview');
});

test('ballot CSV export for staff', async () => {
  const env = makeEnv();
  const { api, entries, staff } = await seedContest(env, { n: 3 });
  const tok = await sessionFor(env, V1, '=HYPERLINK("http://x")');
  await api.put('/api/contests/castles/ballot', { picks: entries.map((e) => e.id).reverse() }, { token: tok });
  const r = await api.get('/api/staff/contests/castles/ballots.csv', { token: staff });
  assert.equal(r.status, 200);
  assert.match(r.res.headers.get('content-type'), /text\/csv/);
  assert.match(r.res.headers.get('content-disposition'), /castles-ballots\.csv/);
  const csv = await r.res.text();
  const [head, row] = csv.replace(/^\ufeff/, '').trim().split('\r\n');
  assert.match(head, /^"voter_id","voter_name","account_created","first_entry","second_entry","third_entry"/);
  assert.match(row, new RegExp(`^"${V1}","'=HYPERLINK\\(""http://x""\\)","2015-`), 'formula neutralised');
  assert.match(row, /,"3","2","1",/, 'entry numbers, best first');
});

test('entry images: allowed types only, private until voting opens, gone when hidden', async () => {
  const env = makeEnv();
  const { api, entries, staff } = await seedContest(env, { n: 3, phase: 'upcoming' });
  const detail = (await api.get('/api/staff/contests/castles', { token: staff })).data;
  const e = detail.entries[0];
  assert.ok(e.complete && e.preview && e.full);
  assert.ok(![...env.IMAGES.store.keys()].some((k) => /artist|title/i.test(k)), 'R2 keys are random');

  assert.equal((await api.get(e.preview)).status, 404, 'not public before voting opens');
  const asStaff = await api.get(e.preview, { token: staff });
  assert.equal(asStaff.status, 200);
  assert.equal(asStaff.res.headers.get('cache-control'), 'private, no-store');
  assert.equal((await api.get('/api/contests/castles')).data.entries.length, 0, 'gallery stays empty for the public');

  setWindow(env, 'castles', Date.now() - HOUR, Date.now() + HOUR);
  const pub = await api.get(e.preview);
  assert.equal(pub.status, 200);
  assert.equal(pub.res.headers.get('content-type'), 'image/webp');
  assert.equal(pub.res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(pub.res.headers.get('cache-control'), /immutable/);
  assert.equal((await api.get(e.preview.replace(/v=[^&]+/, 'v=nope'))).status, 404, 'wrong version');

  const svg = await api.call('PUT', `/api/staff/entries/${e.id}/image?kind=preview`, { token: staff, raw: '<svg/>', headers: { 'content-type': 'image/svg+xml' } });
  assert.equal(svg.status, 415);
  const big = await api.call('PUT', `/api/staff/entries/${e.id}/image?kind=preview`, { token: staff, raw: 'x', headers: { 'content-type': 'image/webp', 'content-length': String(50 * 1024 * 1024) } });
  assert.equal(big.status, 413);

  // replacing a picture changes its URL and removes the old object
  const before = env.IMAGES.store.size;
  const rep = await api.call('PUT', `/api/staff/entries/${e.id}/image?kind=preview`, { token: staff, raw: new Uint8Array([1, 2, 3]), headers: { 'content-type': 'image/png', 'content-length': '3' } });
  assert.equal(rep.status, 200);
  assert.notEqual(rep.data.entry.preview, e.preview);
  assert.equal(env.IMAGES.store.size, before);

  await api.patch(`/api/staff/entries/${e.id}`, { hidden: true }, { token: staff });
  assert.equal((await api.get(rep.data.entry.preview)).status, 404, 'hidden');
  assert.deepEqual((await api.get('/api/contests/castles')).data.entries.map((x) => x.id).sort(), entries.slice(1).map((x) => x.id).sort());
});

test('deleting entries: only while nobody has voted for them', async () => {
  const env = makeEnv();
  const { api, entries, staff } = await seedContest(env, { n: 4 });
  const t = await sessionFor(env, V1);
  const [a, b, c, d] = entries.map((e) => e.id);
  await api.put('/api/contests/castles/ballot', { picks: [a, b, c] }, { token: t });
  assert.equal((await api.del(`/api/staff/entries/${a}`, { token: staff })).status, 409);
  const keys = env.IMAGES.store.size;
  assert.equal((await api.del(`/api/staff/entries/${d}`, { token: staff })).status, 200);
  assert.equal(env.IMAGES.store.size, keys - 2);
});

test('Discord sign-in: state checked, code exchanged, session cookie set (Discord mocked)', async (t) => {
  const env = makeEnv();
  const api = client(env);
  const calls = [];
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === 'https://discord.com/api/v10/oauth2/token') {
      const p = new URLSearchParams(init.body);
      if (p.get('code') !== 'good-code') return Response.json({ error: 'invalid_grant' }, { status: 400 });
      return Response.json({ access_token: 'discord-access', token_type: 'Bearer', scope: 'identify' });
    }
    if (url === 'https://discord.com/api/v10/users/@me') {
      assert.equal(init.headers.authorization, 'Bearer discord-access');
      return Response.json({ id: V3, username: 'builder', global_name: 'The Builder', avatar: 'abc' });
    }
    throw new Error('unexpected fetch ' + url);
  };

  // 1. login: redirect to Discord with identify scope, state and our callback; state kept in a cookie
  const login = await api.get('/auth/discord/login?return=%2Fcontests%2Fcastles');
  assert.equal(login.status, 302);
  const to = new URL(login.res.headers.get('location'));
  assert.equal(to.origin + to.pathname, 'https://discord.com/oauth2/authorize');
  assert.equal(to.searchParams.get('response_type'), 'code');
  assert.equal(to.searchParams.get('scope'), 'identify');
  assert.equal(to.searchParams.get('client_id'), 'test-client');
  assert.equal(to.searchParams.get('redirect_uri'), `${ORIGIN}/auth/discord/callback`);
  const state = to.searchParams.get('state');
  assert.ok(state.length >= 32);
  const stateCookie = login.res.headers.get('set-cookie');
  assert.match(stateCookie, /^cr_oauth=[^;]+; Path=\/auth\/discord; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/);
  const cookieVal = stateCookie.split(';')[0];

  // 2. callback with a forged state (CSRF) or no state cookie: refused, Discord never asked
  const cb = (qs, cookie) => worker.fetch(new Request(`${ORIGIN}/auth/discord/callback?${qs}`, { headers: cookie ? { cookie } : {}, redirect: 'manual' }), env);
  assert.equal((await cb(`code=good-code&state=forged`, cookieVal)).status, 400);
  assert.equal((await cb(`code=good-code&state=${state}`)).status, 400);
  assert.equal(calls.length, 0);

  // 3. Discord refuses the code
  assert.equal((await cb(`code=bad-code&state=${state}`, cookieVal)).status, 502);

  // 4. the real thing
  const ok = await cb(`code=good-code&state=${encodeURIComponent(state)}`, cookieVal);
  assert.equal(ok.status, 302);
  assert.equal(ok.headers.get('location'), '/contests/castles');
  const setCookies = ok.headers.getSetCookie();
  const session = setCookies.find((c) => c.startsWith('cr_session='));
  assert.match(session, /^cr_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000$/);
  assert.ok(setCookies.some((c) => /^cr_oauth=;.*Max-Age=0/.test(c)), 'state cookie cleared');
  const tokenCall = calls.find((c) => c.url.endsWith('/oauth2/token'));
  const sent = new URLSearchParams(tokenCall.init.body);
  assert.equal(sent.get('redirect_uri'), to.searchParams.get('redirect_uri'), 'same redirect_uri in both steps');
  assert.equal(sent.get('client_secret'), 'test-secret');
  assert.equal(sent.get('grant_type'), 'authorization_code');

  const token = session.split(';')[0].split('=')[1];
  const me = await api.get('/api/me', { token });
  assert.deepEqual(me.data.user, { id: V3, name: 'The Builder', username: 'builder', avatar: 'abc', staff: false });
  const stored = env.DB.raw.prepare('SELECT * FROM sessions WHERE user_id = ?').get(V3);
  assert.notEqual(stored.id, token, 'only a hash of the token is stored');
  assert.ok(!JSON.stringify(stored).includes('discord-access'), 'Discord access token not stored');

  // 5. sign out
  assert.equal((await api.post('/auth/logout', {}, { token, origin: 'https://evil.example' })).status, 403);
  const out = await api.post('/auth/logout', {}, { token });
  assert.match(out.res.headers.get('set-cookie'), /^cr_session=; .*Max-Age=0/);
  assert.equal((await api.get('/api/me', { token })).data.user, null);
});

test('sign-in only returns to paths on this site, and says so when not configured', async () => {
  const api = client(makeEnv());
  for (const evil of ['https://evil.example/x', '//evil.example', '/\\evil.example']) {
    const r = await api.get('/auth/discord/login?return=' + encodeURIComponent(evil));
    const val = r.res.headers.get('set-cookie').split(';')[0].split('=')[1].split('.')[1];
    const ret = new TextDecoder().decode(Uint8Array.from(atob(val.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));
    assert.equal(ret, '/contests', evil);
  }
  const bare = client(makeEnv({ DISCORD_CLIENT_ID: '', DISCORD_CLIENT_SECRET: '' }));
  assert.equal((await bare.get('/auth/discord/login')).status, 503);
  assert.equal((await bare.get('/api/me')).data.signInReady, false);
});

test('contest page: title and preview filled in and escaped; unknown and reserved ids are 404', async () => {
  const env = makeEnv();
  const { api, staff } = await seedContest(env, { n: 3 });
  await api.patch('/api/staff/contests/castles', { title: 'Towers <script>alert(1)</script> & "Keeps"', theme: 'Stone' }, { token: staff });
  const html = await (await worker.fetch(new Request(ORIGIN + '/contests/castles'), env)).text();
  assert.ok(!html.includes('<script>alert(1)'));
  assert.ok(html.includes('Towers &lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Keeps&quot;'));
  assert.ok(!html.includes('%%CT_'));
  assert.match(html, /data-contest="castles"/);
  for (const p of ['/contests/nope', '/contests/view', '/contests/../api', '/contests/castles/extra']) {
    assert.equal((await worker.fetch(new Request(ORIGIN + p), env)).status, 404, p);
  }
  assert.equal((await worker.fetch(new Request(ORIGIN + '/contests/staff'), env)).status, 200);
});
