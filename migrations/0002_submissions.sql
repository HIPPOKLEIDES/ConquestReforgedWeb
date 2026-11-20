-- Entries sent in by the entrants themselves with the Discord bot's /submit command (worker/bot.js).
-- All new columns are nullable, so this can be applied before the Worker that reads them is deployed.

-- When /submit works for a contest, and where: a Discord channel, thread or forum. NULL = staff add the entries.
ALTER TABLE contests ADD COLUMN submit_opens_at  INTEGER;
ALTER TABLE contests ADD COLUMN submit_closes_at INTEGER;
ALTER TABLE contests ADD COLUMN submit_channel_id TEXT;
ALTER TABLE contests ADD COLUMN submit_guild_id   TEXT;   -- only for the "open the channel" link on the page

-- Discord user ID of whoever sent the entry with /submit (NULL = added by staff). One entry each per contest.
ALTER TABLE entries ADD COLUMN submitted_by TEXT;
CREATE UNIQUE INDEX entries_one_per_submitter ON entries(contest_id, submitted_by) WHERE submitted_by IS NOT NULL;
CREATE INDEX contests_by_submit_channel ON contests(submit_channel_id) WHERE submit_channel_id IS NOT NULL;
