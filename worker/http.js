// Small HTTP helpers shared by the contest Worker. Web-standard APIs only (runs in workerd and in Node for tests).

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const fail = (status, message, code) => { throw new HttpError(status, message, code); };

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

export function parseCookies(request) {
  const out = {};
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

// Session and sign-in cookies: never readable from page scripts, only sent over HTTPS, not sent with
// cross-site POSTs. (Browsers accept Secure cookies on http://localhost, so wrangler dev works too.)
export const cookie = (name, value, { maxAge, path = '/' }) =>
  `${name}=${value}; Path=${path}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

// State-changing requests must come from our own pages (on top of SameSite=Lax): browsers always send
// Origin with POST/PUT/PATCH/DELETE, and another site can't fake it.
export function requireSameOrigin(request, url) {
  if (request.headers.get('origin') !== url.origin) fail(403, 'Request blocked: it did not come from this site.', 'bad-origin');
}

export async function readJson(request, maxBytes = 64 * 1024) {
  if (!/^application\/json\b/i.test(request.headers.get('content-type') || '')) fail(415, 'Expected JSON.', 'bad-content-type');
  const text = await request.text();
  if (text.length > maxBytes) fail(413, 'Request too large.', 'too-large');
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    return v;
  } catch {
    fail(400, 'Invalid JSON.', 'bad-json');
  }
}

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const randomToken = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));
export const encodeText = (s) => b64url(new TextEncoder().encode(s));
export function decodeText(s) {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return '';
  }
}

export async function sha256hex(s) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

export const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// A plain page for sign-in errors (the Worker has no access to the site's page shells here).
export const messagePage = (status, title, text, back = '/contests') =>
  new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(title)} | Conquest Reforged</title><meta name="robots" content="noindex"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#120d09;color:#f1e4cc;font:18px/1.5 Georgia,serif}main{max-width:460px;margin:24px;padding:30px 34px;border-radius:6px;background:linear-gradient(180deg,#3c2d20,#241b14 60%,#1a130e);box-shadow:inset 0 0 0 3px #1a130e,inset 0 0 0 4px rgba(199,116,27,.55),0 10px 26px rgba(0,0,0,.5)}h1{margin:0 0 10px;font-weight:400;font-size:1.6rem}p{margin:0 0 18px;color:#e3d3b6}a{display:inline-block;padding:10px 22px;color:#fff7e8;text-decoration:none;border-radius:4px;background:linear-gradient(180deg,#d98a2c,#c7741b 55%,#a85e12);border:1px solid #6e3d0b}</style></head><body><main><h1>${escHtml(title)}</h1><p>${escHtml(text)}</p><a href="${escHtml(back)}">Back to the contests</a></main></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
