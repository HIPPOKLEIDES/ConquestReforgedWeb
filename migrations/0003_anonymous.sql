-- Anonymous contests: while voting is open, entries show as "Entry 7" with no title or artists (revealed with
-- the results). Most contests aren't anonymous: voters see each entry's title and artists. Off by default.
ALTER TABLE contests ADD COLUMN anonymous INTEGER NOT NULL DEFAULT 0;
