// End-to-end check of the contests against the real local runtime (wrangler dev: workerd, local D1 and R2).
// It signs in through the fake Discord (real OAuth callback), creates a contest as staff, uploads pictures,
// votes as several accounts, closes voting early and checks results, CSV and pages.
//
//   1. cp .dev.vars.example .dev.vars
//   2. npm run contests:dev            (build, apply the D1 migrations locally, wrangler dev on :8787)
//   3. npm run contests:e2e            (starts the fake Discord on :8788 itself if it isn't running)
//
// `--demo` also leaves two good-looking contests behind for clicking around (pictures from the site's
// showcase screenshots): one open for voting and one with results.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCOUNTS, startFakeDiscord } from './fake-discord.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.BASE || 'http://localhost:8787').replace(/\/$/, '');
const DEMO = process.argv.includes('--demo');
const [STAFF, V1, V2, V3, V4, ARTIST, FRESH] = ACCOUNTS.map((a) => a.id);
let passed = 0;
const step = async (name, fn) => {
  try { await fn(); passed++; console.log(`  ok  ${name}`); } catch (e) { console.error(`  FAIL ${name}\n       ${e.message.split('\n').join('\n       ')}`); process.exitCode = 1; throw e; }
};

// ---------- a tiny browser: cookies + same-origin headers ----------
function browser() {
  const jar = new Map();
  const keep = (res) => { for (const c of res.headers.getSetCookie()) { const [kv, ...attrs] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i).trim(); const gone = attrs.some((a) => /max-age=0/i.test(a)); if (gone) jar.delete(k); else jar.set(k, kv.slice(i + 1)); } };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  async function req(method, p, { json, body, headers = {}, origin = BASE } = {}) {
    const h = { ...headers };
    if (jar.size) h.cookie = cookie();
    if (method !== 'GET' && method !== 'HEAD' && origin) h.origin = origin;
    if (json !== undefined) { h['content-type'] = 'application/json'; body = JSON.stringify(json); }
    const res = await fetch(p.startsWith('http') ? p : BASE + p, { method, headers: h, body, redirect: 'manual' });
    keep(res);
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : type.startsWith('text/') ? await res.text() : null;
    return { res, status: res.status, data };
  }
  async function signIn(id, back = '/contests') {
    const login = await req('GET', `/auth/discord/login?return=${encodeURIComponent(back)}`);
    assert.equal(login.status, 302, 'login redirects to Discord');
    const to = new URL(login.res.headers.get('location'));
    to.searchParams.set('login_as', id);
    const consent = await fetch(to, { redirect: 'manual' });
    assert.equal(consent.status, 302, 'fake Discord sends us back');
    const cb = await req('GET', consent.headers.get('location'));
    assert.equal(cb.status, 302, `callback signs in (got ${cb.status} ${typeof cb.data === 'string' ? cb.data.slice(0, 200) : ''})`);
    assert.equal(cb.res.headers.get('location'), back);
    return (await req('GET', '/api/me')).data.user;
  }
  return { req, signIn, get: (p, o) => req('GET', p, o), jar };
}

// WebP width/height without dependencies
function webpSize(buf) {
  const t = buf.toString('ascii', 12, 16);
  if (t === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  if (t === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  if (t === 'VP8L') { const b = buf.readUInt32LE(21); return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) }; }
  return { w: 1920, h: 1080 };
}
function showcasePictures(n) {
  const dir = path.join(ROOT, 'src', 'assets');
  const seen = new Set(), out = [];
  for (const f of fs.readdirSync(dir).filter((x) => /showcase_[a-z]+_\d+\.webp$/.test(x) && !/_text_/.test(x)).sort()) {
    const project = f.match(/showcase_([a-z]+)_/)[1];
    if (seen.has(project) && out.length < n / 2) continue;
    seen.add(project);
    const buf = fs.readFileSync(path.join(dir, f));
    if (buf.length > 2.5 * 1048576) continue;
    out.push({ buf, ...webpSize(buf), project });
    if (out.length >= n) break;
  }
  return out;
}

async function createContest(staff, id, { title, theme, description, minAccountAgeDays = 0, anonymous = false, pictures, artists }) {
  const now = Date.now();
  const r = await staff.req('POST', '/api/staff/contests', { json: { id, title, theme, description, opensAt: now - 60000, closesAt: now + 7 * 86400000, minAccountAgeDays, anonymous, published: true } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const entries = [];
  for (let i = 0; i < pictures.length; i++) {
    const a = artists[i];
    const e = (await staff.req('POST', `/api/staff/contests/${id}/entries`, { json: { title: a.title, artistNames: a.names, artistIds: a.ids || [] } })).data.entry;
    const pic = pictures[i];
    const full = await staff.req('PUT', `/api/staff/entries/${e.id}/image?kind=full&w=${pic.w}&h=${pic.h}`, { body: pic.buf, headers: { 'content-type': 'image/webp' } });
    assert.equal(full.status, 200, `full picture upload: ${JSON.stringify(full.data)}`);
    const prev = await staff.req('PUT', `/api/staff/entries/${e.id}/image?kind=preview`, { body: pic.buf, headers: { 'content-type': 'image/webp' } });
    assert.equal(prev.status, 200);
    entries.push(prev.data.entry);
  }
  return entries;
}

// ---------- run ----------
const up = await fetch(BASE + '/api/me').then((r) => r.ok).catch(() => false);
if (!up) { console.error(`Nothing answers on ${BASE}. Start it first: npm run contests:dev`); process.exit(1); }
let fake = null;
if (!(await fetch('http://127.0.0.1:8788/oauth2/authorize').then(() => true).catch(() => false))) fake = await startFakeDiscord(8788);

console.log(`Contests e2e against ${BASE}`);
const staff = browser(), anon = browser();
const voters = [V1, V2, V3, V4].map(() => browser());
const artist = browser(), fresh = browser(), outsider = browser();
const id = `e2e-${Date.now().toString(36)}`;
let entries = [];

try {
  await step('static pages are still served without the Worker', async () => {
    for (const p of ['/persona', '/contests']) assert.equal((await anon.get(p)).status, 200, p);
    assert.equal((await anon.get('/contests/staff')).status, 200);
    assert.equal((await anon.get(`/contests/${id}`)).status, 404);
  });
  await step('signed out by default', async () => assert.equal((await anon.get('/api/me')).data.user, null));
  await step('sign in with Discord (state checked, real callback)', async () => {
    const u = await staff.signIn(STAFF, '/contests/staff');
    assert.equal(u.id, STAFF); assert.equal(u.staff, true);
    const sess = staff.jar.get('cr_session');
    assert.match(sess, /^[A-Za-z0-9_-]{43}$/);
    // a forged state is refused
    const evil = browser();
    const l = await evil.get('/auth/discord/login');
    const to = new URL(l.res.headers.get('location'));
    const forged = await evil.get(`/auth/discord/callback?code=code-${STAFF}&state=${to.searchParams.get('state')}x`);
    assert.equal(forged.status, 400);
    assert.equal((await evil.get('/api/me')).data.user, null);
  });
  await step('staff API refuses non-staff', async () => {
    await outsider.signIn(V4);
    assert.equal((await outsider.get('/api/staff/contests')).status, 403);
    assert.equal((await anon.get('/api/staff/contests')).status, 401);
    assert.equal((await staff.req('POST', '/api/staff/contests', { json: { id: 'x' }, origin: 'https://evil.example' })).status, 403);
  });
  await step('staff create a contest and upload pictures (streamed into R2)', async () => {
    const pics = showcasePictures(4);
    entries = await createContest(staff, id, {
      title: 'E2E contest', theme: 'Testing', description: 'Created by contest-tools/e2e-local.mjs', minAccountAgeDays: 7, anonymous: true, pictures: pics,
      artists: pics.map((_, i) => ({ title: `E2E ${i + 1}`, names: [`E2E Artist ${i + 1}`], ids: i === 1 ? [ARTIST] : [] })),
    });
    assert.equal(entries.length, 4);
    const img = await anon.get(entries[0].preview);
    assert.equal(img.status, 200);
    assert.equal(img.res.headers.get('content-type'), 'image/webp');
    assert.equal(img.res.headers.get('x-content-type-options'), 'nosniff');
  });
  await step('the contest page is filled in by the Worker', async () => {
    const page = await anon.get(`/contests/${id}`);
    assert.equal(page.status, 200);
    assert.match(page.data, /<title>E2E contest \| Conquest Reforged contests<\/title>/);
    assert.match(page.data, new RegExp(`data-contest="${id}"`));
    assert.ok(!page.data.includes('%%CT_'));
  });
  await step('while voting: anonymous, no tallies', async () => {
    await staff.req('PUT', '/api/contests/' + id + '/ballot', { json: { picks: entries.slice(0, 3).map((e) => e.id) } });
    const d = (await anon.get(`/api/contests/${id}`)).data;
    const text = JSON.stringify(d);
    for (const w of ['E2E Artist', 'E2E 1', ARTIST, '"points"', '"place"', '"ballots"']) assert.ok(!text.includes(w), `leaks ${w}`);
    assert.equal(d.entries.length, 4);
  });
  await step('voting: validation, own entry, account age, change of mind', async () => {
    const [e1, e2, e3, e4] = entries.map((e) => e.id);
    for (const [i, v] of voters.entries()) if (i < 3) await v.signIn([V1, V2, V3][i]);
    const put = (who, picks, o) => who.req('PUT', `/api/contests/${id}/ballot`, { json: { picks }, ...o });
    assert.equal((await put(anon, [e1, e2, e3])).status, 401);
    assert.equal((await put(voters[0], [e1, e1, e3])).status, 400);
    assert.equal((await put(voters[0], [e1, e2, e3], { origin: 'https://evil.example' })).status, 403);
    await artist.signIn(ARTIST);
    assert.equal((await put(artist, [e2, e1, e3])).data.code, 'own-entry');
    await fresh.signIn(FRESH);
    assert.equal((await put(fresh, [e1, e3, e4])).data.code, 'account-too-new');
    assert.equal((await put(voters[0], [e1, e2, e3])).status, 200);
    assert.equal((await put(voters[0], [e2, e1, e3])).status, 200, 'changed');
    assert.equal((await put(voters[1], [e1, e2, e4])).status, 200);
    assert.equal((await put(voters[2], [e2, e4, e1])).status, 200);
    assert.equal((await put(artist, [e1, e3, e4])).status, 200);
    // e1 = 2+3+1+3 = 9 (2 firsts) ; e2 = 3+2+3 = 8 + staff ballot (e1,e2,e3 -> e1 +3, e2 +2, e3 +1)
  });
  await step('staff close voting early: ballots stop, results appear', async () => {
    const [e1, e2, e3, e4] = entries.map((e) => e.id);
    assert.equal((await staff.req('POST', `/api/staff/contests/${id}/close`, { json: {} })).status, 200);
    assert.equal((await voters[0].req('PUT', `/api/contests/${id}/ballot`, { json: { picks: [e4, e3, e2] } })).status, 409);
    const r = (await anon.get(`/api/contests/${id}`)).data;
    assert.equal(r.contest.phase, 'closed');
    assert.equal(r.results.ballots, 5);
    const pts = Object.fromEntries(r.entries.map((e) => [e.id, e.points]));
    // staff [e1,e2,e3], v1 [e2,e1,e3], v2 [e1,e2,e4], v3 [e2,e4,e1], artist [e1,e3,e4]
    assert.deepEqual([pts[e1], pts[e2], pts[e3], pts[e4]], [3 + 2 + 3 + 1 + 3, 2 + 3 + 2 + 3, 1 + 1 + 2, 1 + 2 + 1]);
    assert.equal(r.entries[0].id, e1);
    assert.deepEqual(r.entries[0].artists, ['E2E Artist 1']);
    const page = await anon.get(`/contests/${id}`);
    assert.match(page.data, new RegExp(`og:image" content="${BASE.replace(/[.:/]/g, '\\$&')}/api/img/${e1}/preview`));
  });
  await step('ballot CSV export', async () => {
    const r = await staff.get(`/api/staff/contests/${id}/ballots.csv`);
    assert.equal(r.status, 200);
    const lines = r.data.replace(/^\ufeff/, '').trim().split(/\r\n/);
    assert.equal(lines.length, 6);
    assert.equal((await outsider.get(`/api/staff/contests/${id}/ballots.csv`)).status, 403);
  });
  await step('sign out', async () => {
    assert.equal((await voters[0].req('POST', '/auth/logout', { json: {} })).status, 200);
    assert.equal((await voters[0].get('/api/me')).data.user, null);
  });

  if (DEMO) {
    await step('demo contests for clicking around', async () => {
      const pics = showcasePictures(12);
      const names = ['Medvsky', 'Toji', 'Minas', 'Arctic Crew', 'Baroque Bros', 'Railgunner', 'Wanda', 'Steve & Alex', 'Kingsbridge', 'Old Harbour', 'Moss', 'Ravenhold'];
      const t = Date.now().toString(36);
      await createContest(staff, `castles-${t}`, {
        title: 'Build Contest #3', theme: 'Castles & Keeps', minAccountAgeDays: 0, pictures: pics,
        description: 'Build a castle, a keep or a fortified manor in Conquest Reforged. Anything from a lonely watchtower to a royal palace counts.\n\nOne entry per person (teams of two are fine). The top 3 get a special Discord role and a spot in our next showcase. More: https://www.conquestreforged.com/showcases',
        artists: pics.map((_, i) => ({ title: ['The Old Keep', 'Ravenhold', 'Hill Fort', 'Winter Watch', 'The Abbey', 'Railway Bastion', 'Wanda’s Manor', 'Twin Towers', 'Kingsbridge', 'Harbour Gate', 'Mossy Ruins', 'Crow’s Nest'][i], names: [names[i]] })),
      });
      const done = await createContest(staff, `harbours-${t}`, {
        title: 'Build Contest #2', theme: 'Harbours', pictures: pics.slice(2, 9).reverse(),
        description: 'Ports, docks and fishing villages.',
        artists: pics.slice(2, 9).map((_, i) => ({ title: ['Saltmarsh', 'Grey Pier', 'Northport', 'Fisher’s Rest', 'Old Docks', 'Lighthouse Bay', 'Smugglers’ Cove'][i], names: [names[(i + 3) % names.length]] })),
      });
      const ids = done.map((e) => e.id);
      const ballots = [[0, 1, 2], [0, 2, 1], [1, 0, 3], [0, 3, 4], [2, 0, 1]];
      for (const [i, v] of [voters[0], voters[1], voters[2], artist, staff].entries()) {
        if (i === 0) await v.signIn(V1);
        const r = await v.req('PUT', `/api/contests/harbours-${t}/ballot`, { json: { picks: ballots[i].map((k) => ids[k]) } });
        assert.equal(r.status, 200, JSON.stringify(r.data));
      }
      assert.equal((await staff.req('POST', `/api/staff/contests/harbours-${t}/close`, { json: {} })).status, 200);
      console.log(`       ${BASE}/contests  ·  ${BASE}/contests/castles-${t} (voting)  ·  ${BASE}/contests/harbours-${t} (results)`);
    });
  }
} catch { /* reported above */ }
console.log(process.exitCode ? `\n${passed} passed, then a failure` : `\nAll ${passed} checks passed.`);
if (fake) fake.close();
