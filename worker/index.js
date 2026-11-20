// conquestreforged.com Worker: community contests with Discord sign-in voting.
// It only runs for /api/*, /auth/* and /contests/* (wrangler.jsonc assets.run_worker_first); everything
// else is served from dist/ without it. Bindings: DB (D1), IMAGES (R2), ASSETS (dist/).
// Secrets: DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, STAFF_IDS, CONTEST_BOT_KEY (for /api/bot). See CONTESTS-SETUP.md.
import { handleAuth } from './auth.js';
import { handleBotApi } from './bot.js';
import { contestPage, handlePublicApi } from './contests.js';
import { handleStaffApi } from './staff.js';
import { HttpError, json } from './http.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path.startsWith('/api/')) {
        let parts;
        try { parts = path.slice(5).split('/').map((p) => decodeURIComponent(p)); } catch { return json({ error: 'Not found' }, 404); }
        const res = parts[0] === 'staff' ? await handleStaffApi(request, env, url, parts.slice(1))
          : parts[0] === 'bot' ? await handleBotApi(request, env, url, parts.slice(1))
            : await handlePublicApi(request, env, url, parts);
        return res || json({ error: 'Not found' }, 404);
      }
      if (path.startsWith('/auth/')) return await handleAuth(request, env, url);
      if (path.startsWith('/contests/')) return await contestPage(request, env, url);
      return env.ASSETS.fetch(request);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status);
      console.error(path, (e && e.stack) || e);
      return json({ error: 'Something went wrong on our side. Please try again.' }, 500);
    }
  },
};
