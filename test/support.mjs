// Test doubles for the contest Worker, so `node --test` can run it without dependencies:
// D1 on Node's built-in SQLite (with the real migrations), an in-memory R2 bucket, a stub ASSETS binding.
// These model the parts of the Cloudflare APIs the Worker uses; scripts/e2e-local.mjs runs the same flows
// against the real runtime (wrangler dev) as well.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/index.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ORIGIN = 'https://www.example.test';
export const STAFF_ID = '80351110224678912';      // a 2015 account
export const VOTER_IDS = ['111111111111111111', '222222222222222222', '333333333333333333', '444444444444444444', '555555555555555555'];
export const ARTIST_ID = '666666666666666666';
export const BOT_KEY = 'test-bot-key-that-is-long-enough';
export const snowflakeFor = (ms) => ((BigInt(ms) - 1420070400000n) << 22n).toString();

class Stmt {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) {
    for (const a of args) if (a === undefined) throw new Error('D1_TYPE_ERROR: undefined bound in ' + this.sql);
    return new Stmt(this.db, this.sql, args);
  }
  get returnsRows() { return /^\s*(SELECT|WITH|PRAGMA)\b/i.test(this.sql) || /\bRETURNING\b/i.test(this.sql); }
  _all() { return this.db.prepare(this.sql).all(...this.args).map((r) => ({ ...r })); }
  _run() { const r = this.db.prepare(this.sql).run(...this.args); return { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) }; }
  _exec() {
    if (this.returnsRows) { const results = this._all(); return { success: true, results, meta: { changes: /^\s*SELECT/i.test(this.sql) ? 0 : results.length } }; }
    return { success: true, results: [], meta: this._run() };
  }
  async first(col) { const r = this._all()[0]; return r ? (col ? r[col] : r) : null; }
  async all() { return this._exec(); }
  async run() { return this._exec(); }
}
export function makeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const f of fs.readdirSync(path.join(ROOT, 'migrations')).sort()) db.exec(fs.readFileSync(path.join(ROOT, 'migrations', f), 'utf8'));
  return {
    raw: db,
    prepare: (sql) => new Stmt(db, sql),
    async batch(stmts) { // D1 runs a batch as one transaction
      db.exec('BEGIN');
      try { const out = stmts.map((s) => s._exec()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    async exec(sql) { db.exec(sql); },
  };
}

export function makeR2() {
  const store = new Map();
  return {
    store,
    async put(key, body, opts = {}) {
      const bytes = new Uint8Array(await new Response(body).arrayBuffer());
      store.set(key, { bytes, httpMetadata: opts.httpMetadata || {} });
      return { key };
    },
    async get(key) {
      const o = store.get(key);
      if (!o) return null;
      return { body: new Response(o.bytes).body, httpMetadata: o.httpMetadata, arrayBuffer: async () => o.bytes.buffer, text: async () => new TextDecoder().decode(o.bytes) };
    },
    async delete(key) { store.delete(key); },
  };
}

// A cut-down copy of what build.mjs writes to dist/contests/view/index.html (placeholders filled by the Worker)
export const VIEW_SHELL = `<!doctype html><html><head><title>%%CT_TITLE%%</title><meta name="description" content="%%CT_DESC%%"><meta property="og:url" content="%%CT_URL%%"><meta property="og:image" content="https://www.example.test/default.png"></head><body data-contest="%%CT_ID%%"><h1>%%CT_HEADING%%</h1><p>%%CT_THEME%%</p></body></html>`;
export function makeAssets() {
  return {
    async fetch(req) {
      const u = new URL(req.url);
      if (u.pathname === '/contests/view') return new Response(VIEW_SHELL, { headers: { 'content-type': 'text/html' } });
      if (u.pathname === '/contests' || u.pathname === '/contests/staff') return new Response(`static ${u.pathname}`, { headers: { 'content-type': 'text/html' } });
      return new Response('404 page', { status: 404, headers: { 'content-type': 'text/html' } });
    },
  };
}

export function makeEnv(extra = {}) {
  return { DB: makeD1(), IMAGES: makeR2(), ASSETS: makeAssets(), DISCORD_CLIENT_ID: 'test-client', DISCORD_CLIENT_SECRET: 'test-secret', STAFF_IDS: `${STAFF_ID}, 999`, CONTEST_BOT_KEY: BOT_KEY, ...extra };
}

// Calls the Worker like a browser on our own site would (same-origin requests carry Origin).
export function client(env) {
  const call = async (method, p, { body, token, origin = ORIGIN, headers = {}, raw } = {}) => {
    const h = new Headers(headers);
    if (token) h.set('cookie', `cr_session=${token}`);
    if (origin && method !== 'GET' && method !== 'HEAD') h.set('origin', origin);
    let payload = raw;
    if (body !== undefined) { h.set('content-type', 'application/json'); payload = JSON.stringify(body); }
    const res = await worker.fetch(new Request(ORIGIN + p, { method, headers: h, body: payload, redirect: 'manual' }), env);
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : null;
    return { res, status: res.status, data };
  };
  return { call, get: (p, o) => call('GET', p, o), post: (p, body, o) => call('POST', p, { ...o, body }), put: (p, body, o) => call('PUT', p, { ...o, body }), patch: (p, body, o) => call('PATCH', p, { ...o, body }), del: (p, o) => call('DELETE', p, o) };
}

// A signed-in session without going through Discord (the OAuth flow itself has its own test).
export async function sessionFor(env, userId, username = `user${userId.slice(-3)}`) {
  const token = (userId + 'x'.repeat(43)).slice(0, 43).replace(/\d/g, (d) => 'abcdefghij'[d]);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  const id = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
  env.DB.raw.prepare('INSERT OR IGNORE INTO sessions (id, user_id, username, global_name, avatar, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, userId, username, null, null, Date.now(), Date.now() + 86400000);
  return token;
}

const HOUR = 3600000;
// A contest with `n` entries (pictures already uploaded) through the staff API.
export async function seedContest(env, { id = 'castles', n = 5, phase = 'voting', minAccountAgeDays = 0, artistOf = {} } = {}) {
  const api = client(env);
  const staff = await sessionFor(env, STAFF_ID, 'staffer');
  const now = Date.now();
  const times = { upcoming: [now + HOUR, now + 48 * HOUR], voting: [now - HOUR, now + 48 * HOUR], closed: [now - 48 * HOUR, now - HOUR] }[phase];
  const created = await api.post('/api/staff/contests', { id, title: `Contest ${id}`, theme: 'Castles', description: 'Build a castle.', opensAt: times[0], closesAt: times[1], minAccountAgeDays, published: true }, { token: staff });
  if (created.status !== 201) throw new Error(`seed: ${created.status} ${JSON.stringify(created.data)}`);
  const entries = [];
  for (let i = 1; i <= n; i++) {
    const r = await api.post(`/api/staff/contests/${id}/entries`, { title: `Title ${i}`, artistNames: [`Artist ${i}`], artistIds: artistOf[i] ? [artistOf[i]] : [] }, { token: staff });
    const e = r.data.entry;
    for (const [kind, q] of [['full', '&w=1920&h=1080'], ['preview', '']]) {
      const up = await api.call('PUT', `/api/staff/entries/${e.id}/image?kind=${kind}${q}`, { token: staff, raw: new Uint8Array([82, 73, 70, 70, i]), headers: { 'content-type': 'image/webp', 'content-length': '5' } });
      if (up.status !== 200) throw new Error(`seed upload: ${up.status} ${JSON.stringify(up.data)}`);
    }
    entries.push(e);
  }
  return { staff, entries, api };
}

// Moves a contest's voting window (tests can't wait for real time to pass).
export function setWindow(env, id, opensAt, closesAt) {
  env.DB.raw.prepare('UPDATE contests SET vote_opens_at = ?, vote_closes_at = ?, results_cache = NULL, updated_at = updated_at + 1 WHERE id = ?').run(opensAt, closesAt, id);
}
