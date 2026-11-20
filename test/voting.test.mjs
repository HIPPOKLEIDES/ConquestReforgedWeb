// Voting rules on their own: ballot checks, the 3/2/1 tally and its tie-breaks, account age, shuffling.
import test from 'node:test';
import assert from 'node:assert/strict';
import { accountTooNew, checkBallot, contestPhase, discordCreatedAt, parsePicks, shuffled, tally } from '../worker/voting.js';
import { snowflakeFor } from './support.mjs';

const entries = [1, 2, 3, 4, 5].map((id) => ({ id, number: id, hidden: false, artistIds: id === 4 ? ['777777777777777777'] : [] }));
const ballot = (a, b, c) => ({ first_entry: a, second_entry: b, third_entry: c });

test('a ballot is exactly three different entries', () => {
  assert.deepEqual(parsePicks([3, 1, 2]), [3, 1, 2]);
  assert.deepEqual(parsePicks(['3', '1', '2']), [3, 1, 2]);
  for (const bad of [[1, 2], [1, 2, 3, 4], [1, 1, 2], [1, 2, 0], [1, 2, -3], [1, 2, 2.5], [1, 2, 'x'], null, 'abc', { 0: 1, 1: 2, 2: 3 }]) {
    assert.equal(parsePicks(bad), null, JSON.stringify(bad));
  }
});

test('ballot picks must be visible entries of the contest, and not your own', () => {
  assert.equal(checkBallot([1, 2, 3], entries, '123456789012345678'), null);
  assert.equal(checkBallot([1, 2, 99], entries, '123456789012345678').code, 'unknown-entry');
  const withHidden = entries.map((e) => (e.id === 2 ? { ...e, hidden: true } : e));
  assert.equal(checkBallot([1, 2, 3], withHidden, '123456789012345678').code, 'unknown-entry');
  assert.equal(checkBallot([1, 4, 3], entries, '777777777777777777').code, 'own-entry');
  assert.equal(checkBallot([1, 4, 3], entries, '123456789012345678'), null);
  assert.equal(checkBallot([1, 1, 3], entries, '123456789012345678').code, 'bad-ballot');
});

test('3 / 2 / 1 points', () => {
  const r = tally(entries, [ballot(1, 2, 3), ballot(1, 3, 2), ballot(2, 1, 5)]);
  const pts = Object.fromEntries(r.map((e) => [e.id, e.points]));
  assert.deepEqual(pts, { 1: 3 + 3 + 2, 2: 2 + 1 + 3, 3: 1 + 2, 4: 0, 5: 1 });
  assert.deepEqual(r.map((e) => e.id), [1, 2, 3, 5, 4]);
  assert.deepEqual(r.map((e) => e.place), [1, 2, 3, 4, 5]);
  const one = r[0];
  assert.deepEqual([one.firsts, one.seconds, one.thirds], [2, 1, 0]);
});

test('ties: most 1st places wins, then most 2nd places, else the place is shared', () => {
  // entry 1: 3 + 1 + 1 = 5 (one 1st); entry 2: 2 + 2 + 1 = 5 (no 1st) -> entry 1 is ahead
  let r = tally(entries, [ballot(1, 2, 3), ballot(3, 2, 1), ballot(4, 5, 1), ballot(5, 4, 2)]);
  const e1 = r.find((e) => e.id === 1), e2 = r.find((e) => e.id === 2);
  assert.equal(e1.points, 5); assert.equal(e2.points, 5);
  assert.equal(e1.firsts, 1); assert.equal(e2.firsts, 0);
  assert.ok(e1.place < e2.place, '1st places break the tie');

  // equal points and 1st places, entry 2 has more 2nd places
  // entry 1: 3 + 1 + 1 = 5 (1st x1, 3rd x2); entry 2: 3 + 2 = 5 (1st x1, 2nd x1)
  r = tally(entries, [ballot(1, 4, 5), ballot(5, 4, 1), ballot(4, 5, 1), ballot(2, 3, 4), ballot(4, 2, 5)]);
  const a = r.find((e) => e.id === 1), b = r.find((e) => e.id === 2);
  assert.equal(a.points, 5); assert.equal(b.points, 5);
  assert.equal(a.firsts, b.firsts);
  assert.ok(b.place < a.place, '2nd places break the tie');

  // completely level: same place, and the next entry skips a place (1, 1, 3)
  r = tally(entries.slice(0, 3), [ballot(1, 2, 3), ballot(2, 1, 3)]);
  assert.deepEqual(r.map((e) => [e.id, e.place]), [[1, 1], [2, 1], [3, 3]]);
});

test('votes for hidden entries count for nothing, the rest of the ballot still counts', () => {
  const visible = entries.filter((e) => e.id !== 1);
  const r = tally(visible, [ballot(1, 2, 3)]);
  assert.equal(r.find((e) => e.id === 2).points, 2);
  assert.equal(r.find((e) => e.id === 3).points, 1);
  assert.equal(r.some((e) => e.id === 1), false);
});

test('account age comes from the Discord ID', () => {
  const now = Date.UTC(2026, 10, 20);
  assert.equal(new Date(discordCreatedAt('80351110224678912')).toISOString().slice(0, 7), '2015-08');
  assert.equal(discordCreatedAt(snowflakeFor(Date.UTC(2024, 1, 29, 12))), Date.UTC(2024, 1, 29, 12));
  const twoDaysOld = snowflakeFor(now - 2 * 86400000);
  assert.equal(accountTooNew(twoDaysOld, 0, now), null);
  assert.equal(accountTooNew(twoDaysOld, 1, now), null);
  assert.equal(accountTooNew(twoDaysOld, 7, now), 5);
  assert.equal(accountTooNew('80351110224678912', 365, now), null);
  assert.equal(accountTooNew('not-an-id', 7, now), 7);
});

test('phases', () => {
  const c = { published: 1, vote_opens_at: 100, vote_closes_at: 200 };
  assert.equal(contestPhase(c, 50), 'upcoming');
  assert.equal(contestPhase(c, 100), 'voting');
  assert.equal(contestPhase(c, 199), 'voting');
  assert.equal(contestPhase(c, 200), 'closed');
  assert.equal(contestPhase({ ...c, published: 0 }, 150), 'draft');
});

test('shuffle is stable per voter and differs between voters', () => {
  const list = Array.from({ length: 20 }, (_, i) => i);
  assert.deepEqual(shuffled(list, 'a:castles'), shuffled(list, 'a:castles'));
  assert.notDeepEqual(shuffled(list, 'a:castles'), shuffled(list, 'b:castles'));
  assert.deepEqual([...shuffled(list, 'a:castles')].sort((x, y) => x - y), list);
});
