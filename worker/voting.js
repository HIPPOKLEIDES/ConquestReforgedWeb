// Voting rules, kept free of I/O so the tests can check them directly.

export const POINTS = [3, 2, 1]; // 1st, 2nd, 3rd
const DAY = 86400000;
const DISCORD_EPOCH = 1420070400000n;

export const contestPhase = (c, now) =>
  !c.published ? 'draft' : now < c.vote_opens_at ? 'upcoming' : now < c.vote_closes_at ? 'voting' : 'closed';

// Entries sent with the Discord bot's /submit: null when the contest has no entry window (staff add the entries)
export const submissionState = (c, now) =>
  c.submit_opens_at == null || c.submit_closes_at == null ? null
    : now < c.submit_opens_at ? 'soon' : now < c.submit_closes_at ? 'open' : 'closed';

// When a Discord account was created, from its ID (a "snowflake": the top bits are ms since 2015).
export function discordCreatedAt(id) {
  if (!/^\d{15,21}$/.test(String(id))) return NaN;
  return Number((BigInt(id) >> 22n) + DISCORD_EPOCH);
}

// null when old enough, else the number of days the account still has to wait
export function accountTooNew(userId, minDays, now) {
  if (!minDays) return null;
  const created = discordCreatedAt(userId);
  if (!Number.isFinite(created)) return minDays;
  const waitMs = created + minDays * DAY - now;
  return waitMs > 0 ? Math.ceil(waitMs / DAY) : null;
}

// A ballot is exactly three different entry IDs, best first. Returns them as numbers or null.
export function parsePicks(picks) {
  if (!Array.isArray(picks) || picks.length !== 3) return null;
  const ids = picks.map((p) => (typeof p === 'string' && /^\d{1,12}$/.test(p) ? Number(p) : p));
  if (!ids.every((n) => Number.isSafeInteger(n) && n > 0)) return null;
  if (new Set(ids).size !== 3) return null;
  return ids;
}

// Checks a ballot against the contest's entries. `entries` are the contest's entries ({ id, hidden,
// artistIds }); returns null when valid, else { code, message }.
export function checkBallot(picks, entries, voterId) {
  const ids = parsePicks(picks);
  if (!ids) return { code: 'bad-ballot', message: 'Pick three different entries.' };
  const byId = new Map(entries.map((e) => [e.id, e]));
  for (const id of ids) {
    const e = byId.get(id);
    if (!e || e.hidden) return { code: 'unknown-entry', message: 'One of your picks is no longer part of this contest. Reload the page and pick again.' };
    if ((e.artistIds || []).includes(String(voterId))) return { code: 'own-entry', message: 'You can’t rank your own entry.' };
  }
  return null;
}

// 3/2/1 points. Ties are broken by the number of 1st places, then 2nd places; entries still level after
// that share the place (1, 2, 2, 4). Ballot picks that aren't in `entries` (hidden ones) score nothing.
export function tally(entries, ballots) {
  const rows = new Map(entries.map((e) => [e.id, { ...e, points: 0, firsts: 0, seconds: 0, thirds: 0 }]));
  const keys = ['firsts', 'seconds', 'thirds'];
  for (const b of ballots) {
    [b.first_entry, b.second_entry, b.third_entry].forEach((id, i) => {
      const r = rows.get(id);
      if (!r) return;
      r.points += POINTS[i];
      r[keys[i]]++;
    });
  }
  const sorted = [...rows.values()].sort((a, b) => b.points - a.points || b.firsts - a.firsts || b.seconds - a.seconds || (a.number || 0) - (b.number || 0));
  sorted.forEach((r, i) => {
    const p = sorted[i - 1];
    r.place = p && p.points === r.points && p.firsts === r.firsts && p.seconds === r.seconds ? p.place : i + 1;
  });
  return sorted;
}

// Per-voter shuffled order: the same voter always sees the same order in a contest, voters differ.
function hash32(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffled(list, seed) {
  const rnd = mulberry32(typeof seed === 'string' ? hash32(seed) : seed >>> 0);
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
