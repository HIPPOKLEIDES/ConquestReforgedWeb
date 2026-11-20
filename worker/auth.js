// "Sign in with Discord": OAuth2 authorization-code flow, scope `identify` only.
//   GET  /auth/discord/login?return=/contests/x  -> Discord's consent page (state cookie against CSRF)
//   GET  /auth/discord/callback                  -> checks state, swaps the code for the user's ID, starts a session
//   POST /auth/logout
// The session is a random token in an HttpOnly cookie; D1 keeps only its SHA-256. The Discord access
// token is used once to read the user's ID and name, then dropped.
import { cookie, decodeText, encodeText, fail, json, messagePage, parseCookies, randomToken, requireSameOrigin, sha256hex, timingSafeEqual } from './http.js';

export const SESSION_COOKIE = 'cr_session';
const STATE_COOKIE = 'cr_oauth';
const STATE_PATH = '/auth/discord';
const SESSION_DAYS = 30;

const authorizeUrl = (env) => env.DISCORD_AUTHORIZE_URL || 'https://discord.com/oauth2/authorize';
const apiBase = (env) => (env.DISCORD_API_BASE || 'https://discord.com/api/v10').replace(/\/$/, '');
// The one place the redirect URI is built, so the authorize request and the token exchange always match.
// conquestreforged.com redirects to www before the Worker runs, so in production this is
// https://www.conquestreforged.com/auth/discord/callback.
export const redirectUri = (url) => `${url.origin}/auth/discord/callback`;

export const staffIds = (env) => String(env.STAFF_IDS || '').split(/[\s,]+/).filter((s) => /^\d{15,21}$/.test(s));
export const isStaff = (env, userId) => !!userId && staffIds(env).includes(String(userId));

// Same-site paths only, so the sign-in can't be used to bounce people to another site.
export function safeReturn(p) {
  if (typeof p !== 'string' || !p.startsWith('/') || p.startsWith('//') || p.startsWith('/\\') || p.length > 300 || /[\u0000-\u001f\\]/.test(p)) return '/contests';
  return p;
}

export async function getViewer(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const row = await env.DB.prepare('SELECT user_id, username, global_name, avatar FROM sessions WHERE id = ? AND expires_at > ?')
    .bind(await sha256hex(token), Date.now()).first();
  if (!row) return null;
  return { id: row.user_id, username: row.username, name: row.global_name || row.username, avatar: row.avatar, staff: isStaff(env, row.user_id) };
}

export async function requireViewer(request, env) {
  const v = await getViewer(request, env);
  if (!v) fail(401, 'Sign in with Discord first.', 'signed-out');
  return v;
}
export async function requireStaff(request, env) {
  const v = await requireViewer(request, env);
  if (!v.staff) fail(403, 'Staff only.', 'not-staff');
  return v;
}

const configured = (env) => !!(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET);

export async function handleAuth(request, env, url) {
  const path = url.pathname;

  if (path === '/auth/discord/login' && request.method === 'GET') {
    if (!configured(env)) return messagePage(503, 'Sign-in isn’t set up yet', 'Discord sign-in has not been configured on this site yet. Please try again later.');
    const state = randomToken(24);
    const ret = safeReturn(url.searchParams.get('return'));
    const to = new URL(authorizeUrl(env));
    to.search = new URLSearchParams({ response_type: 'code', client_id: env.DISCORD_CLIENT_ID, scope: 'identify', state, redirect_uri: redirectUri(url), prompt: 'none' }).toString();
    return new Response(null, {
      status: 302,
      headers: { location: to.toString(), 'set-cookie': cookie(STATE_COOKIE, `${state}.${encodeText(ret)}`, { maxAge: 600, path: STATE_PATH }), 'cache-control': 'no-store' },
    });
  }

  if (path === '/auth/discord/callback' && request.method === 'GET') {
    if (!configured(env)) return messagePage(503, 'Sign-in isn’t set up yet', 'Discord sign-in has not been configured on this site yet.');
    const [state, retEnc] = (parseCookies(request)[STATE_COOKIE] || '').split('.');
    const ret = safeReturn(decodeText(retEnc || ''));
    const clearState = cookie(STATE_COOKIE, '', { maxAge: 0, path: STATE_PATH });
    const q = url.searchParams;
    if (!state || !timingSafeEqual(state, q.get('state') || '')) {
      const r = messagePage(400, 'Sign-in expired', 'That sign-in link expired or was opened in another browser. Please sign in again.');
      r.headers.append('set-cookie', clearState);
      return r;
    }
    if (q.get('error') || !q.get('code')) { // e.g. the visitor pressed Cancel on Discord's page
      return new Response(null, { status: 302, headers: { location: ret, 'set-cookie': clearState, 'cache-control': 'no-store' } });
    }

    let user;
    try {
      const tokenRes = await fetch(`${apiBase(env)}/oauth2/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code: q.get('code'), redirect_uri: redirectUri(url), client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET }),
      });
      const tok = tokenRes.ok ? await tokenRes.json() : null;
      if (!tok || !tok.access_token) throw new Error(`token exchange failed (${tokenRes.status})`);
      const meRes = await fetch(`${apiBase(env)}/users/@me`, { headers: { authorization: `Bearer ${tok.access_token}`, accept: 'application/json' } });
      user = meRes.ok ? await meRes.json() : null;
      if (!user || !/^\d{15,21}$/.test(String(user.id))) throw new Error(`users/@me failed (${meRes.status})`);
    } catch (e) {
      console.error('discord sign-in', e.message);
      const r = messagePage(502, 'Sign-in failed', 'Discord didn’t confirm the sign-in. Please try again in a moment.');
      r.headers.append('set-cookie', clearState);
      return r;
    }

    const token = randomToken(32);
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
      env.DB.prepare('INSERT INTO sessions (id, user_id, username, global_name, avatar, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(await sha256hex(token), String(user.id), String(user.username || '').slice(0, 64), user.global_name ? String(user.global_name).slice(0, 64) : null, user.avatar ? String(user.avatar).slice(0, 80) : null, now, now + SESSION_DAYS * 86400000),
    ]);
    const headers = new Headers({ location: ret, 'cache-control': 'no-store' });
    headers.append('set-cookie', cookie(SESSION_COOKIE, token, { maxAge: SESSION_DAYS * 86400 }));
    headers.append('set-cookie', clearState);
    return new Response(null, { status: 302, headers });
  }

  if (path === '/auth/logout' && request.method === 'POST') {
    requireSameOrigin(request, url);
    const token = parseCookies(request)[SESSION_COOKIE];
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256hex(token)).run();
    return json({ ok: true }, 200, { 'set-cookie': cookie(SESSION_COOKIE, '', { maxAge: 0 }) });
  }

  return json({ error: 'Not found' }, 404);
}
