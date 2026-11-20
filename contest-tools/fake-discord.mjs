// A stand-in for Discord's OAuth2 endpoints, for trying the contest sign-in locally without a Discord app:
//   node contest-tools/fake-discord.mjs            -> http://127.0.0.1:8788
// Point the Worker at it in .dev.vars (see .dev.vars.example):
//   DISCORD_AUTHORIZE_URL=http://127.0.0.1:8788/oauth2/authorize
//   DISCORD_API_BASE=http://127.0.0.1:8788/api
// The "authorize" page lets you pick one of the accounts below; scripts can skip it with &login_as=<id>.
// Only for local testing: it hands out a sign-in to whoever asks.
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const created = (ms) => ((BigInt(ms) - 1420070400000n) << 22n).toString();
export const ACCOUNTS = [
  { id: '80351110224678912', username: 'hippo_staff', global_name: 'Hippo (staff)', note: 'in STAFF_IDS of .dev.vars.example' },
  { id: '111111111111111111', username: 'voter_one', global_name: 'Voter One', note: 'old account' },
  { id: '222222222222222222', username: 'voter_two', global_name: 'Voter Two', note: 'old account' },
  { id: '333333333333333333', username: 'voter_three', global_name: 'Voter Three', note: 'old account' },
  { id: '444444444444444444', username: 'voter_four', global_name: 'Voter Four', note: 'old account' },
  { id: '666666666666666666', username: 'the_artist', global_name: 'The Artist', note: 'artist of entry 2 in the e2e contest' },
  { id: created(Date.now() - 2 * 86400000), username: 'fresh_alt', global_name: 'Fresh Alt', note: 'account made 2 days ago' },
];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function startFakeDiscord(port = 8788) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const send = (status, body, type = 'application/json') => { res.writeHead(status, { 'content-type': type }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
    if (url.pathname === '/oauth2/authorize') {
      const q = url.searchParams;
      if (q.get('response_type') !== 'code' || q.get('scope') !== 'identify' || !q.get('state') || !q.get('redirect_uri')) return send(400, { error: 'bad authorize request', got: Object.fromEntries(q) });
      const back = (id) => { const u = new URL(q.get('redirect_uri')); u.searchParams.set('code', `code-${id}`); u.searchParams.set('state', q.get('state')); return u.toString(); };
      if (q.get('login_as')) { res.writeHead(302, { location: back(q.get('login_as')) }); return res.end(); }
      const cancel = new URL(q.get('redirect_uri')); cancel.searchParams.set('error', 'access_denied'); cancel.searchParams.set('state', q.get('state'));
      return send(200, `<!doctype html><meta charset="utf-8"><title>Fake Discord</title><style>body{font:16px system-ui;background:#313338;color:#dbdee1;display:grid;place-items:center;min-height:100vh;margin:0}main{background:#2b2d31;padding:28px;border-radius:8px;width:380px}a{display:block;margin:8px 0;padding:10px 14px;border-radius:4px;background:#5865f2;color:#fff;text-decoration:none}a small{display:block;opacity:.75}a.c{background:#4e5058}</style><main><h2>Fake Discord (local testing)</h2><p>Sign in to the contest site as:</p>${ACCOUNTS.map((a) => `<a href="${esc(back(a.id))}">${esc(a.global_name)}<small>${esc(a.id)} · ${esc(a.note)}</small></a>`).join('')}<a class="c" href="${esc(cancel)}">Cancel</a></main>`, 'text/html; charset=utf-8');
    }
    if (url.pathname === '/api/oauth2/token' && req.method === 'POST') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const p = new URLSearchParams(raw);
      if (p.get('grant_type') !== 'authorization_code' || !p.get('client_id') || !p.get('client_secret') || !p.get('redirect_uri')) return send(400, { error: 'invalid_request' });
      const code = p.get('code') || '';
      if (!code.startsWith('code-')) return send(400, { error: 'invalid_grant' });
      return send(200, { access_token: `token-${code.slice(5)}`, token_type: 'Bearer', expires_in: 604800, scope: 'identify' });
    }
    if (url.pathname === '/api/users/@me') {
      const id = (req.headers.authorization || '').replace(/^Bearer token-/, '');
      if (!/^\d+$/.test(id)) return send(401, { message: '401: Unauthorized' });
      const a = ACCOUNTS.find((x) => x.id === id) || { id, username: `user_${id.slice(-4)}`, global_name: null };
      return send(200, { id: a.id, username: a.username, global_name: a.global_name, avatar: null, discriminator: '0' });
    }
    send(404, { message: '404: Not Found' });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT || 8788);
  await startFakeDiscord(port);
  console.log(`Fake Discord on http://127.0.0.1:${port} (local testing only)`);
}
