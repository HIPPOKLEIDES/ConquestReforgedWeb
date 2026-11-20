-- Community contests (worker/). Times are Unix milliseconds. Discord IDs are stored as text (they exceed 2^53).
--   local:  npx wrangler d1 migrations apply conquest-contests --local
--   live:   npx wrangler d1 migrations apply conquest-contests --remote

CREATE TABLE contests (
  id                   TEXT PRIMARY KEY,           -- URL slug: /contests/<id>
  title                TEXT NOT NULL,
  theme                TEXT NOT NULL DEFAULT '',
  description          TEXT NOT NULL DEFAULT '',
  vote_opens_at        INTEGER NOT NULL,
  vote_closes_at       INTEGER NOT NULL,
  min_account_age_days INTEGER NOT NULL DEFAULT 0,   -- 0 = any Discord account may vote
  published            INTEGER NOT NULL DEFAULT 0,   -- 0 = draft, only staff can see it
  results_cache        TEXT,                         -- JSON tally, filled once voting has closed
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);

CREATE TABLE entries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  contest_id    TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  number        INTEGER NOT NULL,                    -- shown as "Entry 7" while voting is open
  title         TEXT NOT NULL DEFAULT '',            -- shown with the results only
  artist_names  TEXT NOT NULL DEFAULT '[]',          -- JSON array of display names
  artist_ids    TEXT NOT NULL DEFAULT '[]',          -- JSON array of Discord user IDs (strings); they can't rank this entry
  image_key     TEXT,                                -- R2 key of the full image (random, says nothing about the artist)
  image_type    TEXT,
  width         INTEGER,
  height        INTEGER,
  preview_key   TEXT,                                -- R2 key of the WebP preview made in the browser
  preview_type  TEXT,
  hidden        INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX entries_by_contest ON entries(contest_id, number);

-- One ballot per Discord account per contest; changeable until voting closes.
CREATE TABLE ballots (
  contest_id    TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  voter_id      TEXT NOT NULL,
  voter_name    TEXT NOT NULL DEFAULT '',            -- Discord username when the ballot was last saved
  first_entry   INTEGER NOT NULL,                    -- 3 points
  second_entry  INTEGER NOT NULL,                    -- 2 points
  third_entry   INTEGER NOT NULL,                    -- 1 point
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (contest_id, voter_id)
);

-- Signed-in visitors. id is the SHA-256 of the random token in the cr_session cookie, so a copy of
-- the database can't be used to sign in. The Discord access token is never stored.
CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  username     TEXT NOT NULL DEFAULT '',
  global_name  TEXT,
  avatar       TEXT,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);
CREATE INDEX sessions_by_expiry ON sessions(expires_at);
