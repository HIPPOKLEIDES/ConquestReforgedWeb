// Staff API (Discord IDs in the STAFF_IDS secret only).
//   GET    /api/staff/contests                     every contest, drafts too, with entry and ballot counts
//   POST   /api/staff/contests                     create (optional /submit window: submitOpensAt, submitClosesAt, submitChannel)
//   GET    /api/staff/contests/<id>                contest + all entries with artists
//   PATCH  /api/staff/contests/<id>                edit
//   POST   /api/staff/contests/<id>/close          close voting now
//   POST   /api/staff/contests/<id>/entries        new entry { title, artistNames, artistIds }
//   GET    /api/staff/contests/<id>/ballots.csv    every ballot
//   PATCH  /api/staff/entries/<id>                 { title, artistNames, artistIds, hidden }
//   DELETE /api/staff/entries/<id>                 only while nobody has voted for it
//   PUT    /api/staff/entries/<id>/image?kind=full|preview&w=&h=   raw image body (made in the browser)
import { requireStaff } from './auth.js';
import { contestPhase, discordCreatedAt, submissionState } from './voting.js';
import { ID_RE, IMAGE_TYPES, RESERVED_IDS, channelUrl, imageUrl, loadContest } from './contests.js';
import { fail, json, randomToken, readJson, requireSameOrigin } from './http.js';

const MAX_BYTES = { full: 25 * 1024 * 1024, preview: 4 * 1024 * 1024 };

// ---------- validation ----------
function text(v, name, max, { required = false } = {}) {
  if (v == null) v = '';
  if (typeof v !== 'string') fail(400, `${name} must be text.`, 'invalid');
  v = v.replace(/\r\n?/g, '\n').trim();
  if (required && !v) fail(400, `${name} is required.`, 'invalid');
  if (v.length > max) fail(400, `${name} is too long (at most ${max} characters).`, 'invalid');
  return v;
}
function time(v, name) {
  if (!Number.isSafeInteger(v) || v < Date.UTC(2020, 0, 1) || v > Date.UTC(2100, 0, 1)) fail(400, `${name} must be a date.`, 'invalid');
  return v;
}
function names(v) {
  if (!Array.isArray(v)) fail(400, 'Artist names must be a list.', 'invalid');
  const out = v.map((n) => text(n, 'Artist name', 64)).filter(Boolean);
  if (!out.length) fail(400, 'Add at least one artist name.', 'invalid');
  if (out.length > 8) fail(400, 'At most 8 artists per entry.', 'invalid');
  return out;
}
function discordIds(v) {
  if (v == null) return [];
  if (!Array.isArray(v)) fail(400, 'Artist Discord IDs must be a list.', 'invalid');
  const out = [...new Set(v.map((s) => String(s).trim()).filter(Boolean))];
  for (const id of out) if (!/^\d{15,21}$/.test(id)) fail(400, `“${id.slice(0, 30)}” is not a Discord user ID (a long number: right-click the user in Discord, Copy User ID).`, 'invalid');
  if (out.length > 8) fail(400, 'At most 8 artist IDs per entry.', 'invalid');
  return out;
}

const optTime = (v, name) => (v == null || v === '' ? null : time(v, name));

// Where /submit works: a pasted channel/thread link (right-click, Copy Link) or a bare channel ID.
// The link also gives the server ID, which the contest page needs to link to the channel.
function channelRef(v, existing) {
  if (v == null) v = '';
  if (typeof v !== 'string') fail(400, 'Discord channel must be text.', 'invalid');
  v = v.trim();
  if (!v) return { channel: null, guild: null };
  const link = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/channels\/(\d{15,21})\/(\d{15,21})(?:\/\d{15,21})?\/?$/.exec(v);
  if (link) return { guild: link[1], channel: link[2] };
  if (/^\d{15,21}$/.test(v)) return { channel: v, guild: existing?.submit_channel_id === v ? existing.submit_guild_id : null };
  fail(400, 'Discord channel: paste the channel’s or thread’s link (right-click it in Discord, Copy Link), or its ID.', 'invalid');
}

function contestFields(body, existing) {
  const f = {};
  if (!existing || 'title' in body) f.title = text(body.title, 'Title', 120, { required: true });
  if (!existing || 'theme' in body) f.theme = text(body.theme, 'Theme', 120);
  if (!existing || 'description' in body) f.description = text(body.description, 'Description', 6000);
  if (!existing || 'opensAt' in body) f.vote_opens_at = time(body.opensAt, 'Voting opens');
  if (!existing || 'closesAt' in body) f.vote_closes_at = time(body.closesAt, 'Voting closes');
  if (!existing || 'minAccountAgeDays' in body) {
    const d = body.minAccountAgeDays ?? 0;
    if (!Number.isInteger(d) || d < 0 || d > 3650) fail(400, 'Minimum account age must be a whole number of days (0 for none).', 'invalid');
    f.min_account_age_days = d;
  }
  if (!existing || 'published' in body) f.published = body.published ? 1 : 0;
  if (!existing || 'submitOpensAt' in body) f.submit_opens_at = optTime(body.submitOpensAt, 'Entries open');
  if (!existing || 'submitClosesAt' in body) f.submit_closes_at = optTime(body.submitClosesAt, 'Entries close');
  if (!existing || 'submitChannel' in body) {
    const r = channelRef(body.submitChannel, existing);
    f.submit_channel_id = r.channel;
    f.submit_guild_id = r.guild;
  }
  // checked on the values the contest ends up with, so changing only one of them can't break the order
  const val = (k) => (k in f ? f[k] : existing?.[k] ?? null);
  const opens = val('vote_opens_at'), closes = val('vote_closes_at');
  if (!(opens < closes)) fail(400, 'Voting must close after it opens.', 'invalid');
  const so = val('submit_opens_at'), sc = val('submit_closes_at');
  if ((so == null) !== (sc == null)) fail(400, 'Entries by /submit need both times (when they open and close), or neither.', 'invalid');
  if (so != null) {
    if (!(so < sc)) fail(400, 'Entries must close after they open.', 'invalid');
    if (sc > opens) fail(400, 'Entries must close before voting opens (or at the same moment).', 'invalid');
    if (!val('submit_channel_id')) fail(400, 'Add the Discord channel or thread where people use /submit.', 'invalid');
  }
  return f;
}

const staffContest = (c, now) => ({
  id: c.id, title: c.title, theme: c.theme, description: c.description, opensAt: c.vote_opens_at, closesAt: c.vote_closes_at,
  minAccountAgeDays: c.min_account_age_days, published: !!c.published, phase: contestPhase(c, now), updatedAt: c.updated_at,
  entryCount: c.entry_count, ballotCount: c.ballot_count,
  submitOpensAt: c.submit_opens_at, submitClosesAt: c.submit_closes_at, submissions: submissionState(c, now),
  submitChannel: channelUrl(c) || c.submit_channel_id || '', submitChannelId: c.submit_channel_id,
});
const parseList = (s) => { try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } };
const staffEntry = (e) => ({
  id: e.id, number: e.number, title: e.title, artistNames: parseList(e.artist_names), artistIds: parseList(e.artist_ids),
  hidden: !!e.hidden, w: e.width, h: e.height, preview: imageUrl(e, 'preview'), full: imageUrl(e, 'full'), complete: !!(e.image_key && e.preview_key),
  submittedBy: e.submitted_by || null, createdAt: e.created_at, updatedAt: e.updated_at,
});

const COUNTS = `(SELECT COUNT(*) FROM entries e WHERE e.contest_id = c.id) AS entry_count, (SELECT COUNT(*) FROM ballots b WHERE b.contest_id = c.id) AS ballot_count`;
// any change to a contest or its entries: new version, drop cached results
const touch = (env, id, now) => env.DB.prepare('UPDATE contests SET updated_at = ?, results_cache = NULL WHERE id = ?').bind(now, id);

async function contestDetail(env, id) {
  const now = Date.now();
  const c = await env.DB.prepare(`SELECT c.*, ${COUNTS} FROM contests c WHERE c.id = ?`).bind(id).first();
  if (!c) fail(404, 'No such contest.', 'not-found');
  const { results } = await env.DB.prepare('SELECT * FROM entries WHERE contest_id = ? ORDER BY number').bind(id).all();
  return { now, contest: staffContest(c, now), entries: results.map(staffEntry) };
}

async function loadEntry(env, id) {
  const e = /^\d{1,12}$/.test(id) ? await env.DB.prepare('SELECT * FROM entries WHERE id = ?').bind(Number(id)).first() : null;
  if (!e) fail(404, 'No such entry.', 'not-found');
  return e;
}

// CSV for spreadsheets: every cell quoted; cells that a spreadsheet would run as a formula get a leading '
export const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};
const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : '');

async function ballotsCsv(env, id) {
  const c = await loadContest(env, id);
  if (!c) fail(404, 'No such contest.', 'not-found');
  const { results } = await env.DB.prepare(
    `SELECT b.*, e1.number AS n1, e2.number AS n2, e3.number AS n3 FROM ballots b
     LEFT JOIN entries e1 ON e1.id = b.first_entry LEFT JOIN entries e2 ON e2.id = b.second_entry LEFT JOIN entries e3 ON e3.id = b.third_entry
     WHERE b.contest_id = ? ORDER BY b.created_at`).bind(id).all();
  const head = ['voter_id', 'voter_name', 'account_created', 'first_entry', 'second_entry', 'third_entry', 'first_entry_id', 'second_entry_id', 'third_entry_id', 'first_saved', 'last_changed'];
  const rows = results.map((b) => [b.voter_id, b.voter_name, iso(discordCreatedAt(b.voter_id)), b.n1, b.n2, b.n3, b.first_entry, b.second_entry, b.third_entry, iso(b.created_at), iso(b.updated_at)]);
  const body = '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  return new Response(body, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${c.id}-ballots.csv"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
}

async function putImage(request, env, url, e) {
  const kind = url.searchParams.get('kind');
  if (kind !== 'full' && kind !== 'preview') fail(400, 'kind must be full or preview.', 'invalid');
  const type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!IMAGE_TYPES[type]) fail(415, 'Images must be WebP, PNG or JPEG.', 'bad-type');
  const len = Number(request.headers.get('content-length'));
  if (!Number.isSafeInteger(len) || len <= 0) fail(411, 'Content-Length required.', 'no-length');
  if (len > MAX_BYTES[kind]) fail(413, `Image too large (max ${MAX_BYTES[kind] / 1048576} MB).`, 'too-large');
  let w = null, h = null;
  if (kind === 'full') {
    w = Number(url.searchParams.get('w')); h = Number(url.searchParams.get('h'));
    if (![w, h].every((n) => Number.isInteger(n) && n > 0 && n <= 20000)) fail(400, 'Image width and height required.', 'invalid');
  }
  const key = `c/${e.contest_id}/${kind}/${randomToken(18)}.${IMAGE_TYPES[type]}`;
  // streamed straight into R2 (known length), never buffered or parsed here
  await env.IMAGES.put(key, request.body, { httpMetadata: { contentType: type } });
  const now = Date.now();
  const sql = kind === 'full'
    ? env.DB.prepare('UPDATE entries SET image_key = ?, image_type = ?, width = ?, height = ?, updated_at = ? WHERE id = ?').bind(key, type, w, h, now, e.id)
    : env.DB.prepare('UPDATE entries SET preview_key = ?, preview_type = ?, updated_at = ? WHERE id = ?').bind(key, type, now, e.id);
  await env.DB.batch([sql, touch(env, e.contest_id, now)]);
  const old = kind === 'full' ? e.image_key : e.preview_key;
  if (old) await env.IMAGES.delete(old);
  return json({ entry: staffEntry(await loadEntry(env, String(e.id))) });
}

export async function handleStaffApi(request, env, url, parts) {
  await requireStaff(request, env);
  const m = request.method;
  if (m !== 'GET' && m !== 'HEAD') requireSameOrigin(request, url);
  const now = Date.now();

  if (parts[0] === 'contests') {
    if (parts.length === 1 && m === 'GET') {
      const { results } = await env.DB.prepare(`SELECT c.*, ${COUNTS} FROM contests c ORDER BY c.vote_opens_at DESC`).all();
      return json({ now, contests: results.map((c) => staffContest(c, now)) });
    }
    if (parts.length === 1 && m === 'POST') {
      const body = await readJson(request);
      const id = String(body.id || '').trim().toLowerCase();
      if (!ID_RE.test(id) || RESERVED_IDS.has(id)) fail(400, 'The contest ID becomes its web address: lowercase letters, numbers and dashes (e.g. castles-2027).', 'invalid');
      const f = contestFields(body, null);
      const res = await env.DB.prepare(
        `INSERT INTO contests (id, title, theme, description, vote_opens_at, vote_closes_at, min_account_age_days, published,
           submit_opens_at, submit_closes_at, submit_channel_id, submit_guild_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`)
        .bind(id, f.title, f.theme, f.description, f.vote_opens_at, f.vote_closes_at, f.min_account_age_days, f.published,
          f.submit_opens_at, f.submit_closes_at, f.submit_channel_id, f.submit_guild_id, now, now).run();
      if (!res.meta.changes) fail(409, `A contest with the ID “${id}” already exists.`, 'exists');
      return json(await contestDetail(env, id), 201);
    }
    const id = parts[1];
    if (parts.length === 2 && m === 'GET') return json(await contestDetail(env, id));
    if (parts.length === 2 && m === 'PATCH') {
      const c = await loadContest(env, id);
      if (!c) fail(404, 'No such contest.', 'not-found');
      const f = contestFields(await readJson(request), c);
      const cols = Object.keys(f);
      if (cols.length) {
        await env.DB.prepare(`UPDATE contests SET ${cols.map((k) => `${k} = ?`).join(', ')}, updated_at = ?, results_cache = NULL WHERE id = ?`)
          .bind(...cols.map((k) => f[k]), now, id).run();
      }
      return json(await contestDetail(env, id));
    }
    if (parts.length === 3 && parts[2] === 'close' && m === 'POST') {
      const res = await env.DB.prepare('UPDATE contests SET vote_closes_at = ?1, updated_at = ?1, results_cache = NULL WHERE id = ?2 AND vote_opens_at <= ?1 AND vote_closes_at > ?1')
        .bind(now, id).run();
      if (!res.meta.changes) fail(409, 'Voting isn’t open, so there is nothing to close.', 'not-voting');
      return json(await contestDetail(env, id));
    }
    if (parts.length === 3 && parts[2] === 'entries' && m === 'POST') {
      const c = await loadContest(env, id);
      if (!c) fail(404, 'No such contest.', 'not-found');
      const body = await readJson(request);
      const title = text(body.title, 'Title', 120);
      const artistNames = names(body.artistNames), artistIds = discordIds(body.artistIds);
      const [ins] = await env.DB.batch([
        env.DB.prepare(`INSERT INTO entries (contest_id, number, title, artist_names, artist_ids, created_at, updated_at)
          SELECT ?1, COALESCE(MAX(number), 0) + 1, ?2, ?3, ?4, ?5, ?5 FROM entries WHERE contest_id = ?1 RETURNING *`)
          .bind(id, title, JSON.stringify(artistNames), JSON.stringify(artistIds), now),
        touch(env, id, now),
      ]);
      return json({ entry: staffEntry(ins.results[0]) }, 201);
    }
    if (parts.length === 3 && parts[2] === 'ballots.csv' && m === 'GET') return ballotsCsv(env, id);
  }

  if (parts[0] === 'entries' && parts.length >= 2) {
    const e = await loadEntry(env, parts[1]);
    if (parts.length === 2 && m === 'PATCH') {
      const body = await readJson(request);
      const f = {};
      if ('title' in body) f.title = text(body.title, 'Title', 120);
      if ('artistNames' in body) f.artist_names = JSON.stringify(names(body.artistNames));
      if ('artistIds' in body) f.artist_ids = JSON.stringify(discordIds(body.artistIds));
      if ('hidden' in body) f.hidden = body.hidden ? 1 : 0;
      const cols = Object.keys(f);
      if (cols.length) {
        await env.DB.batch([
          env.DB.prepare(`UPDATE entries SET ${cols.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).bind(...cols.map((k) => f[k]), now, e.id),
          touch(env, e.contest_id, now),
        ]);
      }
      return json({ entry: staffEntry(await loadEntry(env, parts[1])) });
    }
    if (parts.length === 2 && m === 'DELETE') {
      const used = await env.DB.prepare('SELECT COUNT(*) AS n FROM ballots WHERE contest_id = ?1 AND (first_entry = ?2 OR second_entry = ?2 OR third_entry = ?2)')
        .bind(e.contest_id, e.id).first();
      if (used.n > 0) fail(409, 'People have already voted for this entry. Hide it instead.', 'has-votes');
      await env.DB.batch([env.DB.prepare('DELETE FROM entries WHERE id = ?').bind(e.id), touch(env, e.contest_id, now)]);
      await Promise.all([e.image_key, e.preview_key].filter(Boolean).map((k) => env.IMAGES.delete(k)));
      return json({ ok: true });
    }
    if (parts.length === 3 && parts[2] === 'image' && m === 'PUT') return putImage(request, env, url, e);
  }
  return null;
}
