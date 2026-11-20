// Public contest API, entry images and the /contests/<id> page.
//   GET /api/me
//   GET /api/contests                 published contests for the list page
//   GET /api/contests/<id>            one contest; entries are anonymous and shuffled per voter while voting
//                                     is open, ranked with artists once it has closed; never any tallies before
//   PUT /api/contests/<id>/ballot     { picks: [1st, 2nd, 3rd] } (entry IDs)
//   GET /api/img/<entry>/<full|preview>?v=<key>
import { accountTooNew, checkBallot, contestPhase, parsePicks, shuffled, submissionState, tally } from './voting.js';
import { getViewer, requireViewer } from './auth.js';
import { escHtml, fail, json, readJson, requireSameOrigin } from './http.js';

export const ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;
export const RESERVED_IDS = new Set(['staff', 'view', 'new', 'api', 'auth']);
export const IMAGE_TYPES = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' };

const parseList = (s) => { try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } };
// R2 keys look like c/<contest>/<full|preview>/<random>.<ext>; the random part versions the URL
export const keyToken = (key) => (key ? key.slice(key.lastIndexOf('/') + 1).split('.')[0] : '');
export const imageUrl = (e, kind) => {
  const key = kind === 'full' ? e.image_key : e.preview_key;
  return key ? `/api/img/${e.id}/${kind}?v=${keyToken(key)}` : null;
};
// visible entries that have both pictures uploaded
const ready = 'hidden = 0 AND image_key IS NOT NULL AND preview_key IS NOT NULL';
const readyE = 'e.hidden = 0 AND e.image_key IS NOT NULL AND e.preview_key IS NOT NULL';

export const loadContest = (env, id) => (ID_RE.test(id) ? env.DB.prepare('SELECT * FROM contests WHERE id = ?').bind(id).first() : null);

export const channelUrl = (c) => (c.submit_guild_id && c.submit_channel_id ? `https://discord.com/channels/${c.submit_guild_id}/${c.submit_channel_id}` : null);

export const publicContest = (c, now) => {
  const state = submissionState(c, now);
  return {
    id: c.id,
    title: c.title,
    theme: c.theme,
    description: c.description,
    opensAt: c.vote_opens_at,
    closesAt: c.vote_closes_at,
    minAccountAgeDays: c.min_account_age_days,
    phase: contestPhase(c, now),
    // entries by /submit on Discord (null when staff add them)
    submissions: state ? { opensAt: c.submit_opens_at, closesAt: c.submit_closes_at, state, channelUrl: channelUrl(c) } : null,
  };
};

// Results are worked out once voting has closed and cached on the contest row. Staff changes to the
// contest or its entries bump updated_at and clear the cache; the guarded write never stores a stale tally.
export async function getResults(env, c, now = Date.now()) {
  if (c.results_cache) {
    try { return JSON.parse(c.results_cache); } catch { /* recompute */ }
  }
  const [entries, ballots] = await env.DB.batch([
    env.DB.prepare(`SELECT id, number, title, artist_names, width, height, image_key, preview_key FROM entries WHERE contest_id = ? AND ${ready} ORDER BY number`).bind(c.id),
    env.DB.prepare('SELECT first_entry, second_entry, third_entry FROM ballots WHERE contest_id = ?').bind(c.id),
  ]);
  const ranked = tally(entries.results, ballots.results);
  const out = {
    ballots: ballots.results.length,
    entries: ranked.map((e) => ({
      id: e.id, number: e.number, title: e.title, artists: parseList(e.artist_names), w: e.width, h: e.height,
      preview: imageUrl(e, 'preview'), full: imageUrl(e, 'full'),
      place: e.place, points: e.points, firsts: e.firsts, seconds: e.seconds, thirds: e.thirds,
    })),
  };
  if (contestPhase(c, now) === 'closed') {
    await env.DB.prepare('UPDATE contests SET results_cache = ? WHERE id = ? AND updated_at = ? AND vote_closes_at <= ?')
      .bind(JSON.stringify(out), c.id, c.updated_at, now).run();
  }
  return out;
}

const viewerInfo = (v) => (v ? { id: v.id, name: v.name, username: v.username, avatar: v.avatar, staff: v.staff } : null);

async function listContests(env) {
  const now = Date.now();
  const { results } = await env.DB.prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM entries e WHERE e.contest_id = c.id AND ${readyE}) AS entry_count
     FROM contests c WHERE c.published = 1 ORDER BY c.vote_closes_at DESC`).all();
  const contests = [];
  for (const c of results) {
    const item = { ...publicContest(c, now), entryCount: c.entry_count, cover: null };
    if (item.phase === 'closed') {
      const r = await getResults(env, c, now);
      // nobody voted: no winner (everyone would be "1st"), just a few of the entries
      const win = r.ballots > 0 ? r.entries.filter((e) => e.place === 1) : [];
      if (win[0]) item.cover = { winners: win.map((e) => ({ title: e.title, artists: e.artists })), preview: win[0].preview, w: win[0].w, h: win[0].h };
      else item.collage = r.entries.slice(0, 4).map((e) => ({ preview: e.preview, w: e.w, h: e.h }));
      item.ballots = r.ballots;
    } else if (item.phase === 'voting') {
      // a few random entries for the card's collage (anonymous, a different pick on every load)
      const { results: es } = await env.DB.prepare(`SELECT id, width, height, preview_key FROM entries WHERE contest_id = ? AND ${ready} ORDER BY RANDOM() LIMIT 4`).bind(c.id).all();
      item.collage = es.map((e) => ({ preview: imageUrl(e, 'preview'), w: e.width, h: e.height }));
    }
    contests.push(item);
  }
  return { now, contests };
}

async function getContest(request, env, id) {
  const now = Date.now();
  const c = await loadContest(env, id);
  const viewer = await getViewer(request, env);
  if (!c || (!c.published && !viewer?.staff)) fail(404, 'No such contest.', 'not-found');
  const contest = publicContest(c, now);
  const out = { now, contest, viewer: viewerInfo(viewer), entries: [], ballot: null };

  if (contest.phase === 'closed') {
    const r = await getResults(env, c, now);
    out.results = r;
    out.entries = r.entries;
    if (viewer) out.ballot = await myBallot(env, c.id, viewer.id);
    return json(out);
  }

  // voting (everyone) or a staff preview of a contest that hasn't opened yet
  if (contest.phase === 'voting' || viewer?.staff) {
    const reads = [env.DB.prepare(`SELECT id, number, width, height, image_key, preview_key FROM entries WHERE contest_id = ? AND ${ready}`).bind(c.id)];
    if (viewer) {
      reads.push(env.DB.prepare('SELECT e.id FROM entries e WHERE e.contest_id = ?1 AND (e.submitted_by = ?2 OR EXISTS (SELECT 1 FROM json_each(e.artist_ids) j WHERE j.value = ?2))').bind(c.id, viewer.id));
      reads.push(env.DB.prepare('SELECT first_entry, second_entry, third_entry, updated_at FROM ballots WHERE contest_id = ? AND voter_id = ?').bind(c.id, viewer.id));
    }
    const [entries, own, ballot] = await env.DB.batch(reads);
    const mine = new Set((own?.results || []).map((r) => r.id));
    // Nothing here says who made an entry or how it is doing: number, size and pictures only.
    const list = entries.results.map((e) => ({ id: e.id, number: e.number, w: e.width, h: e.height, preview: imageUrl(e, 'preview'), full: imageUrl(e, 'full'), ...(mine.has(e.id) ? { own: true } : {}) }));
    out.entries = shuffled(list, viewer ? `${viewer.id}:${c.id}` : crypto.getRandomValues(new Uint32Array(1))[0]);
    const b = ballot?.results?.[0];
    if (b) out.ballot = { picks: [b.first_entry, b.second_entry, b.third_entry], savedAt: b.updated_at };
    if (contest.phase !== 'voting') out.preview = true;
  } else if (contest.submissions) {
    // while entries come in by /submit: how many so far (nothing about who or what)
    out.entryCount = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM entries WHERE contest_id = ? AND ${ready}`).bind(c.id).first()).n;
  }
  if (viewer && contest.phase === 'voting') {
    const wait = accountTooNew(viewer.id, c.min_account_age_days, now);
    out.canVote = wait === null;
    if (wait !== null) out.cannotVoteReason = `Your Discord account needs to be at least ${c.min_account_age_days} days old to vote in this contest (${wait} more day${wait === 1 ? '' : 's'}).`;
  }
  return json(out);
}

async function myBallot(env, contestId, voterId) {
  const b = await env.DB.prepare('SELECT first_entry, second_entry, third_entry, updated_at FROM ballots WHERE contest_id = ? AND voter_id = ?').bind(contestId, voterId).first();
  return b ? { picks: [b.first_entry, b.second_entry, b.third_entry], savedAt: b.updated_at } : null;
}

async function putBallot(request, env, url, id) {
  requireSameOrigin(request, url);
  const viewer = await requireViewer(request, env);
  const body = await readJson(request);
  const picks = parsePicks(body.picks);
  if (!picks) fail(400, 'Pick three different entries.', 'bad-ballot');
  const now = Date.now();
  const c = await loadContest(env, id);
  if (!c || !c.published) fail(404, 'No such contest.', 'not-found');
  const phase = contestPhase(c, now);
  if (phase !== 'voting') fail(409, phase === 'closed' ? 'Voting has closed.' : 'Voting hasn’t opened yet.', 'not-voting');
  const wait = accountTooNew(viewer.id, c.min_account_age_days, now);
  if (wait !== null) fail(403, `Your Discord account needs to be at least ${c.min_account_age_days} days old to vote in this contest.`, 'account-too-new');

  const { results } = await env.DB.prepare(`SELECT id, hidden, image_key, preview_key, artist_ids, submitted_by FROM entries WHERE contest_id = ? AND id IN (?, ?, ?)`).bind(c.id, ...picks).all();
  const problem = checkBallot(picks, results.map((e) => ({ id: e.id, hidden: e.hidden || !e.image_key || !e.preview_key, artistIds: [...parseList(e.artist_ids), ...(e.submitted_by ? [e.submitted_by] : [])] })), viewer.id);
  if (problem) fail(problem.code === 'own-entry' ? 403 : 400, problem.message, problem.code);

  // The same rules again inside the write, so a ballot can't slip in after voting closes (e.g. a staff
  // member closing early) or after an entry is hidden between the check above and this statement.
  const res = await env.DB.prepare(
    `INSERT INTO ballots (contest_id, voter_id, voter_name, first_entry, second_entry, third_entry, created_at, updated_at)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7
     WHERE EXISTS (SELECT 1 FROM contests WHERE id = ?1 AND published = 1 AND vote_opens_at <= ?7 AND vote_closes_at > ?7)
       AND (SELECT COUNT(*) FROM entries WHERE contest_id = ?1 AND ${ready} AND id IN (?4, ?5, ?6)) = 3
       AND NOT EXISTS (SELECT 1 FROM entries e, json_each(e.artist_ids) j WHERE e.id IN (?4, ?5, ?6) AND j.value = ?2)
       AND NOT EXISTS (SELECT 1 FROM entries WHERE id IN (?4, ?5, ?6) AND submitted_by = ?2)
     ON CONFLICT (contest_id, voter_id) DO UPDATE SET voter_name = excluded.voter_name, first_entry = excluded.first_entry,
       second_entry = excluded.second_entry, third_entry = excluded.third_entry, updated_at = excluded.updated_at`)
    .bind(c.id, viewer.id, viewer.username || '', picks[0], picks[1], picks[2], now).run();
  if (!res.meta || !res.meta.changes) fail(409, 'Voting closed or an entry changed just now. Reload the page and try again.', 'changed');
  return json({ ok: true, ballot: { picks, savedAt: now } });
}

async function serveImage(request, env, url, entryId, kind) {
  if (kind !== 'full' && kind !== 'preview') fail(404, 'Not found');
  const e = /^\d{1,12}$/.test(entryId) ? await env.DB.prepare(
    'SELECT e.id, e.hidden, e.image_key, e.image_type, e.preview_key, e.preview_type, c.published, c.vote_opens_at FROM entries e JOIN contests c ON c.id = e.contest_id WHERE e.id = ?').bind(Number(entryId)).first() : null;
  const key = e && (kind === 'full' ? e.image_key : e.preview_key);
  if (!key || url.searchParams.get('v') !== keyToken(key)) fail(404, 'Not found');
  const isPublic = !e.hidden && e.published && Date.now() >= e.vote_opens_at;
  if (!isPublic && !(await getViewer(request, env))?.staff) fail(404, 'Not found');
  const obj = await env.IMAGES.get(key);
  if (!obj) fail(404, 'Not found');
  const type = kind === 'full' ? e.image_type : e.preview_type;
  return new Response(request.method === 'HEAD' ? null : obj.body, {
    headers: {
      'content-type': IMAGE_TYPES[type] ? type : 'application/octet-stream', // never SVG/HTML from this origin
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
      // keys are random and change when an image is replaced, so a URL's content never changes
      'cache-control': isPublic ? 'public, max-age=31536000, immutable' : 'private, no-store',
    },
  });
}

export async function handlePublicApi(request, env, url, parts) {
  const m = request.method;
  if (parts[0] === 'me' && parts.length === 1 && m === 'GET') {
    return json({ user: viewerInfo(await getViewer(request, env)), signInReady: !!(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET) });
  }
  if (parts[0] === 'contests') {
    if (parts.length === 1 && m === 'GET') return json(await listContests(env));
    if (parts.length === 2 && m === 'GET') return getContest(request, env, parts[1]);
    if (parts.length === 3 && parts[2] === 'ballot' && m === 'PUT') return putBallot(request, env, url, parts[1]);
  }
  if (parts[0] === 'img' && parts.length === 3 && (m === 'GET' || m === 'HEAD')) return serveImage(request, env, url, parts[1], parts[2]);
  return null;
}

// ---------- /contests/<id>: the static view shell from dist/ with this contest's title and link preview ----------
const notFoundPage = async (env, url) => {
  const r = await env.ASSETS.fetch(new Request(new URL('/contests/view/__missing__', url)));
  return new Response(r.body, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
};

export async function contestPage(request, env, url) {
  const rest = url.pathname.slice('/contests/'.length);
  if (rest === '' || rest === 'staff') return env.ASSETS.fetch(request);
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  if (rest.endsWith('/') && ID_RE.test(rest.slice(0, -1))) return Response.redirect(`${url.origin}/contests/${rest.slice(0, -1)}`, 301);
  const c = !RESERVED_IDS.has(rest) ? await loadContest(env, rest) : null;
  if (!c || (!c.published && !(await getViewer(request, env))?.staff)) return notFoundPage(env, url);

  const shell = await env.ASSETS.fetch(new Request(new URL('/contests/view', url)));
  if (!shell.ok) return shell;
  const now = Date.now();
  const phase = contestPhase(c, now);
  const when = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const sub = submissionState(c, now);
  const line = phase === 'voting' ? `Voting is open until ${when(c.vote_closes_at)}: pick your top 3 with your Discord account.`
    : phase === 'closed' ? 'Voting has closed. See the winners and every entry.'
      : sub === 'open' ? `Entries are open until ${when(c.submit_closes_at)}: send yours with /submit on our Discord.`
        : sub === 'soon' ? `Entries open on ${when(c.submit_opens_at)}.`
          : `Voting opens on ${when(c.vote_opens_at)}.`;
  let image = '';
  if (phase === 'closed') { // the winner makes the link preview once the results are public
    const r = await getResults(env, c, now);
    const win = r.ballots > 0 ? r.entries[0] : null;
    if (win?.preview) image = url.origin + win.preview;
  }
  const desc = `${c.theme ? `Theme: ${c.theme}. ` : ''}${line}`;
  const fill = {
    TITLE: escHtml(`${c.title} | Conquest Reforged contests`),
    HEADING: escHtml(c.title),
    THEME: escHtml(c.theme || ''),
    DESC: escHtml(desc),
    URL: escHtml(`${url.origin}/contests/${c.id}`),
    ID: escHtml(c.id),
  };
  let html = (await shell.text()).replace(/%%CT_(TITLE|HEADING|THEME|DESC|URL|ID)%%/g, (_, k) => fill[k]);
  if (image) html = html.replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${escHtml(image)}$2`);
  return new Response(request.method === 'HEAD' ? null : html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
}

