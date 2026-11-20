// API for the community Discord bot's /submit and /withdraw commands (Community Discord Bot/contest-entries.js).
// Entrants send their own entry in the contest's Discord channel or thread; the bot passes on who they are
// (Discord tells the bot, so that can't be faked by the entrant), the title and the picture.
//
// Every call carries the CONTEST_BOT_KEY secret (Authorization: Bearer <key>), a key made for this alone,
// never the bot's Discord token. With it, a caller can only add, change or remove the entry that a user sent
// with /submit, in a published contest whose entry window is open right now (checked again inside each write).
// It can't touch entries staff added, other contests, ballots or anything else.
// Everything is POST with the IDs in the body, so no Discord IDs end up in request logs.
//   POST /api/bot/lookup    { channelId, parentId?, userId }   the contest taking entries here, and the user's entry
//   POST /api/bot/submit    multipart/form-data: meta = JSON { channelId, parentId?, user: { id, name }, title, width, height },
//                           full + preview = the pictures (the bot re-encodes them, which drops any metadata)
//   POST /api/bot/withdraw  { channelId, parentId?, userId }
import { IMAGE_TYPES } from './contests.js';
import { fail, json, randomToken, readJson, sha256hex, timingSafeEqual } from './http.js';

const MAX_BYTES = { full: 25 * 1024 * 1024, preview: 4 * 1024 * 1024 };
const DAY = 86400000;
const SNOWFLAKE = /^\d{15,21}$/;
const OPEN = 'published = 1 AND submit_opens_at <= ?3 AND submit_closes_at > ?3';

async function requireBot(request, env) {
  const key = env.CONTEST_BOT_KEY;
  if (typeof key !== 'string' || key.length < 16) fail(503, 'Entries by Discord aren’t set up on the website yet (the CONTEST_BOT_KEY secret is missing).', 'not-configured');
  const m = /^Bearer (\S+)$/.exec(request.headers.get('authorization') || '');
  // compare digests: same length, and the time taken says nothing about the key
  if (!m || !timingSafeEqual(await sha256hex(m[1]), await sha256hex(key))) fail(401, 'Wrong bot key.', 'bad-key');
}

const snowflake = (v, name) => {
  const s = v == null ? '' : String(v);
  if (!SNOWFLAKE.test(s)) fail(400, `${name} must be a Discord ID.`, 'invalid');
  return s;
};
const optSnowflake = (v) => (v == null || v === '' ? null : snowflake(v, 'Parent channel'));
function text(v, name, max, required) {
  if (v == null) v = '';
  if (typeof v !== 'string') fail(400, `${name} must be text.`, 'invalid');
  v = v.replace(/[\r\n\t]+/g, ' ').trim();
  if (required && !v) fail(400, `${name} is required.`, 'invalid');
  if (v.length > max) fail(400, `${name} is too long (at most ${max} characters).`, 'invalid');
  return v;
}

// The contest taking entries in this channel right now. A thread also counts for its parent channel or forum.
const findContest = (env, channelId, parentId, now) =>
  env.DB.prepare(`SELECT * FROM contests WHERE submit_channel_id IN (?1, ?2) AND ${OPEN} ORDER BY submit_closes_at LIMIT 1`)
    .bind(channelId, parentId || channelId, now).first();

const botContest = (c, url) => ({
  id: c.id, title: c.title, theme: c.theme, url: `${url.origin}/contests/${c.id}`,
  submitOpensAt: c.submit_opens_at, submitClosesAt: c.submit_closes_at, voteOpensAt: c.vote_opens_at,
});
const botEntry = (e) => ({ number: e.number, title: e.title, hidden: !!e.hidden });

async function lookup(request, env, url) {
  const b = await readJson(request);
  const channelId = snowflake(b.channelId, 'Channel'), parentId = optSnowflake(b.parentId), userId = snowflake(b.userId, 'User');
  const now = Date.now();
  const c = await findContest(env, channelId, parentId, now);
  if (c) {
    const e = await env.DB.prepare('SELECT number, title, hidden FROM entries WHERE contest_id = ? AND submitted_by = ?').bind(c.id, userId).first();
    return json({ contest: botContest(c, url), entry: e ? botEntry(e) : null });
  }
  // Nothing open here: what the bot can point the user to instead (soon or recently closed here, open elsewhere)
  const { results } = await env.DB.prepare(
    `SELECT id, title, submit_channel_id, submit_opens_at, submit_closes_at FROM contests
     WHERE published = 1 AND submit_channel_id IS NOT NULL AND submit_closes_at > ?1 ORDER BY submit_opens_at LIMIT 10`).bind(now - 30 * DAY).all();
  const others = results.map((x) => ({
    title: x.title, url: `${url.origin}/contests/${x.id}`, channelId: x.submit_channel_id,
    here: x.submit_channel_id === channelId || x.submit_channel_id === parentId,
    state: now < x.submit_opens_at ? 'soon' : now < x.submit_closes_at ? 'open' : 'closed',
    submitOpensAt: x.submit_opens_at, submitClosesAt: x.submit_closes_at,
  }));
  return json({ contest: null, entry: null, others });
}

const noContest = () => fail(404, 'No contest is taking entries in this channel right now.', 'no-contest');

// Picture checks: declared type allowed, size within limits, and the bytes really are that kind of image.
async function picture(file, kind) {
  if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') fail(400, `The ${kind} picture is missing.`, 'invalid');
  const type = String(file.type || '').split(';')[0].trim().toLowerCase();
  if (!IMAGE_TYPES[type]) fail(415, 'Pictures must be WebP, PNG or JPEG.', 'bad-type');
  if (!(file.size > 0)) fail(400, `The ${kind} picture is empty.`, 'invalid');
  if (file.size > MAX_BYTES[kind]) fail(413, `The ${kind} picture is too large (max ${MAX_BYTES[kind] / 1048576} MB).`, 'too-large');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ascii = (a, b) => String.fromCharCode(...bytes.subarray(a, b));
  const ok = type === 'image/webp' ? ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP'
    : type === 'image/png' ? bytes[0] === 0x89 && ascii(1, 4) === 'PNG'
      : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!ok) fail(415, `The ${kind} picture isn’t a ${IMAGE_TYPES[type].toUpperCase()} file.`, 'bad-type');
  return { bytes, type };
}

async function submit(request, env, url) {
  if (!/^multipart\/form-data/i.test(request.headers.get('content-type') || '')) fail(415, 'Expected a multipart upload.', 'bad-content-type');
  const len = Number(request.headers.get('content-length'));
  if (Number.isFinite(len) && len > MAX_BYTES.full + MAX_BYTES.preview + 64 * 1024) fail(413, 'Upload too large.', 'too-large');
  let form, meta;
  try { form = await request.formData(); } catch { fail(400, 'Could not read the upload.', 'bad-form'); }
  try { meta = JSON.parse(String(form.get('meta'))); } catch { /* checked below */ }
  if (!meta || typeof meta !== 'object') fail(400, 'meta must be JSON.', 'invalid');
  const channelId = snowflake(meta.channelId, 'Channel'), parentId = optSnowflake(meta.parentId);
  const userId = snowflake(meta.user && meta.user.id, 'User');
  const name = text(meta.user && meta.user.name, 'Name', 64, true);
  const title = text(meta.title, 'Title', 120, true);
  const w = Number(meta.width), h = Number(meta.height);
  if (![w, h].every((n) => Number.isInteger(n) && n > 0 && n <= 20000)) fail(400, 'Picture width and height required.', 'invalid');
  const full = await picture(form.get('full'), 'full'), preview = await picture(form.get('preview'), 'preview');

  const now = Date.now();
  const c = await findContest(env, channelId, parentId, now);
  if (!c) noContest();
  const old = await env.DB.prepare('SELECT * FROM entries WHERE contest_id = ? AND submitted_by = ?').bind(c.id, userId).first();

  const keys = {
    full: `c/${c.id}/full/${randomToken(18)}.${IMAGE_TYPES[full.type]}`,
    preview: `c/${c.id}/preview/${randomToken(18)}.${IMAGE_TYPES[preview.type]}`,
  };
  await env.IMAGES.put(keys.full, full.bytes, { httpMetadata: { contentType: full.type } });
  await env.IMAGES.put(keys.preview, preview.bytes, { httpMetadata: { contentType: preview.type } });
  const touch = env.DB.prepare('UPDATE contests SET updated_at = ?1, results_cache = NULL WHERE id = ?2').bind(now, c.id);
  let entry;
  try {
    if (old) {
      // a new picture and title for their entry; staff edits to artists and "hidden" stay as they are
      const [up] = await env.DB.batch([
        env.DB.prepare(`UPDATE entries SET title = ?4, image_key = ?5, image_type = ?6, width = ?7, height = ?8, preview_key = ?9, preview_type = ?10, updated_at = ?3
          WHERE id = ?11 AND submitted_by = ?2 AND EXISTS (SELECT 1 FROM contests WHERE id = ?1 AND ${OPEN}) RETURNING *`)
          .bind(c.id, userId, now, title, keys.full, full.type, w, h, keys.preview, preview.type, old.id),
        touch,
      ]);
      entry = up.results[0];
    } else {
      // the guard sits outside the MAX() so that no row at all is written when entries have closed
      const [ins] = await env.DB.batch([
        env.DB.prepare(`INSERT INTO entries (contest_id, number, title, artist_names, artist_ids, image_key, image_type, width, height, preview_key, preview_type, submitted_by, created_at, updated_at)
          SELECT ?1, n, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?2, ?3, ?3
          FROM (SELECT COALESCE(MAX(number), 0) + 1 AS n FROM entries WHERE contest_id = ?1)
          WHERE EXISTS (SELECT 1 FROM contests WHERE id = ?1 AND ${OPEN}) RETURNING *`)
          .bind(c.id, userId, now, title, JSON.stringify([name]), JSON.stringify([userId]), keys.full, full.type, w, h, keys.preview, preview.type),
        touch,
      ]);
      entry = ins.results[0];
    }
  } catch (e) {
    await Promise.all(Object.values(keys).map((k) => env.IMAGES.delete(k)));
    if (/UNIQUE/i.test(String(e && e.message))) fail(409, 'Your entry was just saved by another /submit. Try again in a moment.', 'busy');
    throw e;
  }
  if (!entry) {
    await Promise.all(Object.values(keys).map((k) => env.IMAGES.delete(k)));
    fail(409, 'Entries for this contest closed just now.', 'closed');
  }
  if (old) await Promise.all([old.image_key, old.preview_key].filter(Boolean).map((k) => env.IMAGES.delete(k)));
  return json({ contest: botContest(c, url), entry: botEntry(entry), replaced: !!old }, old ? 200 : 201);
}

async function withdraw(request, env, url) {
  const b = await readJson(request);
  const channelId = snowflake(b.channelId, 'Channel'), parentId = optSnowflake(b.parentId), userId = snowflake(b.userId, 'User');
  const now = Date.now();
  const c = await findContest(env, channelId, parentId, now);
  if (!c) noContest();
  // An entry staff hid stays (hidden): withdrawing and sending it again must not bring it back.
  const [del] = await env.DB.batch([
    env.DB.prepare(`DELETE FROM entries WHERE contest_id = ?1 AND submitted_by = ?2 AND hidden = 0 AND EXISTS (SELECT 1 FROM contests WHERE id = ?1 AND ${OPEN}) RETURNING *`)
      .bind(c.id, userId, now),
    env.DB.prepare('UPDATE contests SET updated_at = ?1, results_cache = NULL WHERE id = ?2').bind(now, c.id),
  ]);
  const e = del.results[0];
  if (!e) {
    const kept = await env.DB.prepare('SELECT hidden FROM entries WHERE contest_id = ? AND submitted_by = ?').bind(c.id, userId).first();
    if (kept && kept.hidden) fail(409, 'Staff have taken your entry out of this contest, so it can’t be withdrawn. Ask them if you think that’s a mistake.', 'hidden-by-staff');
    fail(404, `You haven’t sent an entry to ${c.title}.`, 'no-entry');
  }
  await Promise.all([e.image_key, e.preview_key].filter(Boolean).map((k) => env.IMAGES.delete(k)));
  return json({ contest: botContest(c, url), withdrawn: botEntry(e) });
}

export async function handleBotApi(request, env, url, parts) {
  await requireBot(request, env);
  if (request.method !== 'POST' || parts.length !== 1) return null;
  if (parts[0] === 'lookup') return lookup(request, env, url);
  if (parts[0] === 'submit') return submit(request, env, url);
  if (parts[0] === 'withdraw') return withdraw(request, env, url);
  return null;
}
