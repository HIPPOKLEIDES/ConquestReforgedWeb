# Community contests: one-time setup

The contest pages (`/contests`, `/contests/<id>`, `/contests/staff`) need a Worker script, a D1 database, an
R2 bucket and three secrets on Cloudflare, plus a redirect in the Discord Developer Portal. Steps 1–4 come
**before the `contests` branch is merged into `main`**: `main` deploys automatically, and that deploy fails
while `wrangler.jsonc` still has the placeholder database ID.

Run the commands in a checkout of the **`contests` branch** (it has `wrangler.jsonc` with the D1/R2 config and
the `migrations/` folder; a checkout of `main` doesn't yet). `npx wrangler login` first if wrangler isn't
signed in to the Cloudflare account that hosts conquestreforged.com.

When `d1 create` or `r2 bucket create` asks whether wrangler should add the binding to `wrangler.jsonc` for you,
answer **No**: the file already has both bindings under the names the Worker uses (`DB` and `IMAGES`), so
letting wrangler add one only leaves a duplicate under another name. Only the database ID needs pasting (step 1).

> **Redirect URI:** the brief named `https://conquestreforged.com/auth/discord/callback`, but
> `conquestreforged.com` redirects to `https://www.conquestreforged.com` before the Worker runs. The Worker
> builds the redirect URI from the address the visitor is on, so the live site sends
> `https://www.conquestreforged.com/auth/discord/callback`, and that is the one Discord must know (step 4).

## 1. Create the database

```powershell
npx wrangler d1 create conquest-contests
```

It prints a `database_id` (a UUID). Put it in `wrangler.jsonc` in place of `00000000-0000-0000-0000-000000000000`:

```jsonc
"d1_databases": [{ "binding": "DB", "database_name": "conquest-contests", "database_id": "<the id it printed>", "migrations_dir": "migrations" }]
```

## 2. Create the picture bucket

```powershell
npx wrangler r2 bucket create conquest-contest-images
```

If wrangler says R2 isn't enabled on the account, open the Cloudflare dashboard → R2 once and enable it
(Cloudflare may ask for a payment method; usage inside the free tier costs nothing). The bucket stays private:
pictures are served through the Worker, which hides them until voting opens and when staff hide an entry.

## 3. Create the tables

```powershell
npx wrangler d1 migrations apply conquest-contests --remote
```

If it says `The database 00000000-0000-0000-0000-000000000000 could not be found [code: 7404]`, step 1 hasn't
been done (or its ID isn't in `wrangler.jsonc` yet).

Later schema changes come as new files in `migrations/` (e.g. `0002_submissions.sql`, `0003_anonymous.sql`). Run the
same command from a checkout that has them **before** pushing them to `main`: the new code expects the new columns.
New migrations only add columns, so the site that is live at that moment keeps working.

## 4. Discord application

Use the community bot's application (ID `763152106970284063`) at https://discord.com/developers/applications:

1. **OAuth2 → Client Secret → Reset Secret**, and copy it (it is shown once; keep it for step 6). The bot logs
   in with its bot token, not with this secret, so the bot isn't affected. If anything else already uses a
   client secret of this app, resetting replaces it there too. **Never put the bot token in the website.**
2. **OAuth2 → Redirects → Add Redirect**: `https://www.conquestreforged.com/auth/discord/callback`
   (adding `https://conquestreforged.com/auth/discord/callback` too does no harm). For signing in with the
   real Discord on your PC, also add `http://localhost:8787/auth/discord/callback`. Save.

The site only asks for the `identify` scope (user ID, name and avatar), not email or servers.

## 5. Merge and deploy

Commit the database ID from step 1 on the `contests` branch, merge the branch into `main` and push; the
Cloudflare build then runs `node build.mjs` and `npx wrangler deploy` as before, and the deploy now includes the
Worker (`worker/`) with the D1 and R2 bindings. In the checkout of the `contests` branch:

```powershell
git commit -am "Contests: D1 database id"
```

Then in the checkout of `main` (`conquest-site`):

```powershell
git merge contests
```

```powershell
git push
```

(Or push the branch and merge it as a pull request on GitHub.) To deploy from your PC instead, in an up-to-date
checkout of `main`: `node build.mjs`, then `npx wrangler deploy`.

Until step 6 is done, "Sign in with Discord" shows a "Sign-in isn't set up yet" page; the rest of the site is
unaffected. If the Cloudflare build fails with a permissions error about D1 or R2, deploy once from your PC
with the commands above, or give the build's API token D1 and R2 edit rights (Workers & Pages → the project →
Settings → Builds).

## 6. Secrets

Each command asks for the value and applies it to the live Worker straight away:

```powershell
npx wrangler secret put DISCORD_CLIENT_ID
```
Paste `763152106970284063`.

```powershell
npx wrangler secret put DISCORD_CLIENT_SECRET
```
Paste the secret from step 4.

```powershell
npx wrangler secret put STAFF_IDS
```
Paste the Discord user IDs that may use `/contests/staff`, separated by commas (in Discord: Settings → Advanced →
Developer Mode, then right-click a user → Copy User ID). To change the staff list later, run this command again.

Secrets live on Cloudflare only and survive every deploy; never commit them. (If someone signs in on
`/contests/staff` without being on the list, the page shows them their ID so they can send it to you.)

## 7. Check it

1. https://www.conquestreforged.com/contests shows "No contests yet".
2. https://www.conquestreforged.com/contests/staff → Sign in with Discord → the contest desk opens.
3. Create a test contest as a draft (leave "Visible on the site" off), add two or three pictures, open the page
   from the desk. Delete the entries again or keep the draft for later.
4. Link the contests from the site: the header and footer come from Webstudio, so add a `/contests` link there
   (or anywhere else you like).

## 8. Entries by `/submit` on Discord (one-time, after 1–7)

Entrants can send their own entry with the community bot: `/submit` with a picture and a title, in the channel or
thread staff pick for the contest. The website gets their Discord name and ID with it. The bot talks to the
website with a key of its own (`CONTEST_BOT_KEY`), **not** with its bot token. Do these in this order:

1. **New database columns**, before the code that uses them goes live (safe for the current site: they're only
   added, nothing changes for it). In an up-to-date checkout of the branch that has
   `migrations/0002_submissions.sql`, with a clean `wrangler.jsonc`:

   ```powershell
   npx wrangler d1 migrations apply conquest-contests --remote
   ```

   It must list `0002_submissions.sql` and apply it. **If it says "No migrations to apply" the first time, stop:**
   that checkout doesn't have the new file, and deploying now would break creating and editing contests.

2. **Deploy**: merge the branch into `main` and push, as in step 5. Afterwards
   `https://www.conquestreforged.com/api/bot/lookup` (a POST without a key) answers 503 "not set up" until step
   3, then 401: either means the new Worker is live.

3. **A key for the bot**. Make a long random one:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   Give it to the website (paste it when asked):

   ```powershell
   npx wrangler secret put CONTEST_BOT_KEY
   ```

4. **The bot** (the `Community Discord Bot` folder, wherever the bot runs): `npm install` there (it adds
   `sharp`, which the bot uses to turn pictures into WebP and drop their metadata), then put the same key in
   `index.js` between the quotes of `const CONTEST_BOT_KEY = process.env.CONTEST_BOT_KEY || ""` (or set a
   `CONTEST_BOT_KEY` environment variable), and restart the bot. It logs
   `Contest entries (/submit, /withdraw) go to https://www.conquestreforged.com` and registers the two new
   commands (they can take a minute to show up in Discord).

5. **Check it**: create a contest on the desk with "Entries open" a minute ago, "Entries close" later, the link of
   a staff-only channel, and "Visible on the site" on (drafts take no entries). Use `/submit` in that channel; the
   entry appears on the desk marked "via /submit". Afterwards switch the test contest back to a draft.

If `/submit` answers "aren't set up properly", the key in the bot and the `CONTEST_BOT_KEY` secret differ.

---

## Running a contest

- **Create** it on `/contests/staff`: title, theme, description, voting opens/closes (your local time),
  minimum Discord account age (0 = any account; e.g. 30 keeps fresh alt accounts out), and **Anonymous**
  (off by default: voters see each entry's title and artists; on: entries show as "Entry 7" and the artists are
  revealed with the results. Set it before voting opens).
- **Entries by the entrants** (`/submit` on Discord, see step 8): give the contest "Entries open" / "Entries
  close" times (closing at the latest when voting opens) and paste the link of the Discord channel or thread
  (right-click it, Copy Link; a channel also covers the threads in it). In that window, `/submit` there with a
  picture and a title adds the person's entry, or replaces it if they send again (one entry each); `/withdraw`
  takes it out. Their Discord name becomes the artist name and their ID is filled in, so they can't rank their
  own entry. The bot's replies are visible only to them (in an anonymous contest, nobody else learns who sent
  what). Entries go
  straight in, marked "via /submit" on the desk: check them before voting opens, and hide or delete any that
  break the rules (hiding sticks if they send again). The contest page shows how to enter and a countdown.
- **Entries by staff**: drop the pictures on the desk, fill in the artist name(s) and, ideally, their Discord IDs
  (then they can't rank their own entry). Pictures are re-saved in your browser (strips hidden metadata such as an
  artist name in the file) and a small WebP preview is made for the gallery. File names are not uploaded. Both
  ways can be mixed in one contest.
- **Voting**: from the opening time anyone with a Discord account (old enough) ranks a top 3, 3/2/1 points,
  one ballot per account, changeable until the close. Entries appear in a shuffled order per voter, with their
  title and artists (or as "Entry 7" in an anonymous contest); no scores are shown anywhere until voting closes.
  Nobody can rank their own entry either way.
- **Hide** an entry to take it out of the vote and the results (votes for it then count for nothing; the
  voter's other picks still count, and they are asked to pick a replacement if voting is still open).
  Entries without votes can also be deleted.
- **Close voting now** ends it early. **Export ballots (CSV)** lists every ballot with the voter's Discord ID,
  name and account creation date, for checking suspicious voting.
- **Results** appear automatically at the close: points, ties decided by the number of 1st places, then 2nd
  places; entries still level share the place. Artists are revealed with the results.

## Free tier

Everything stays inside Cloudflare's free plan:

- Workers: 100,000 requests a day. Only `/api/*`, `/auth/*` and `/contests/<id>` run the Worker; the rest of
  the site is static and doesn't count. Each entry picture shown is one request (browsers cache them for a
  year), so a contest with 20 entries viewed by 2,000 people uses about 40,000 requests.
- D1: 5 million rows read and 100,000 written a day. Results are worked out once when voting closes and cached.
- R2: 10 GB stored, free downloads. A contest of 20 entries is roughly 20–60 MB.

## Local development

```powershell
copy .dev.vars.example .dev.vars
```

```powershell
npm run contests:fake-discord
```

```powershell
npm run contests:dev
```

`contests:dev` builds the site, applies the migrations to a local database (`.wrangler/`) and starts
`wrangler dev` on http://localhost:8787 (wrangler prints 127.0.0.1; both work). Sign-in then goes through a fake Discord page on port 8788 where you
pick a test account ("Hippo (staff)" is on the staff list). After changing anything in `src/`, run
`node build.mjs` and restart `wrangler dev` (the build recreates `dist/`, which `wrangler dev` stops watching).

- `npm test`: Worker tests in Node (needs Node 22.13+, no installs): ballot validation, 3/2/1 tally and
  tie-breaks, staff-only access, hidden tallies and anonymity, CSV, images, Discord sign-in with Discord mocked,
  and the bot API (key, entry window and channel, one entry each, replace/withdraw, own-entry rule).
- The bot's `/submit` locally: don't start a second copy of the live bot for this (it would also run the trap
  channel and re-register the commands). Call `contest-entries.js` directly instead: `configure({ site:
  'http://localhost:8787', key: <CONTEST_BOT_KEY from .dev.vars> })`, then `handleInteraction()` with a fake
  interaction object.
- `npm run contests:e2e` (with `contests:dev` running): the same flows against the real local runtime
  (workerd, local D1 and R2), through the real sign-in callback. `node contest-tools/e2e-local.mjs --demo`
  also leaves two sample contests (one open, one with results) to click through.

## How it fits together

| Path | What |
| --- | --- |
| `wrangler.jsonc` | Worker `main`, `assets.run_worker_first` for `/api/*`, `/auth/*`, `/contests/*`, D1 and R2 bindings |
| `worker/` | the Worker: `auth.js` (Discord OAuth, sessions), `contests.js` (public API, pictures, `/contests/<id>`), `staff.js` (staff API), `bot.js` (API for the bot's `/submit`), `voting.js` (rules, tally) |
| `Community Discord Bot/contest-entries.js` | (other folder) the bot's `/submit` and `/withdraw`: re-encodes the picture with sharp, sends it with the key |
| `migrations/` | D1 schema |
| `src/contests/` | page styles and scripts; `build.mjs` → `buildContests()` writes the page shells |
| `test/` | `node --test` tests with D1/R2 stand-ins |
| `contest-tools/` | fake Discord and the end-to-end script for local testing |

Sessions: the cookie holds a random token (HttpOnly, Secure, SameSite=Lax, 30 days); D1 stores only its SHA-256.
Sign-in uses a `state` cookie against CSRF, and every change (ballots, staff actions, sign-out) must come from
the site itself (Origin check). The Discord access token is used once and never stored.
