-- Volunteers check every entry before the draw, log the entries that
-- don't come through My week (Instagram tags and mailed cards), and draw
-- the winner. Everything here is deleted on November 30, 2026, with the
-- rest (worker/cleanup.ts).
--
-- The check-in table is rebuilt so it can hold every kind of entry:
--
-- * id names an entry in the admin forms and in a draw.
-- * source is post (a shared trip sent on My week), tag (an Instagram
--   post tagging @lasvegasfortransit, logged by a volunteer) or mail (a
--   handwritten card or letter, logged by a volunteer).
-- * A tag from a handle nobody saved at sign-up is a handle-only entry:
--   participant_id is null and instagram holds the handle. Every other
--   entry has a participant and no instagram. This is the simplest shape
--   that keeps one entry per entrant per day in unique indexes, without
--   rebuilding the participants table that sessions and links point at.
-- * One entry per entrant per day: the unique index on (participant_id,
--   day) for people who signed up, and the one on (instagram, day) for
--   handle-only entries. day is 1 to 8, so nobody can hold more than 8.
-- * created_at is when the entry was last sent: sending again that day
--   replaces the post, and a volunteer's check names the version they saw.
-- * checked_at and checked_by: a volunteer saw the post, screenshot or card
--   and it shows or describes a trip without driving. Only checked entries
--   go into the draw. Tags and cards are checked as they are logged.
-- * removed_at, removed_by and removal_reason: a volunteer took the entry
--   out of the draw. The row stays, so the removal can be undone.
-- * received_on is the date a mailed card arrived (YYYY-MM-DD).
-- * logged_by, checked_by and removed_by are volunteers' email addresses.
CREATE TABLE checkins_next (
  id INTEGER PRIMARY KEY,
  participant_id TEXT REFERENCES participants (id) ON DELETE CASCADE,
  instagram TEXT,
  day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 8),
  source TEXT NOT NULL DEFAULT 'post' CHECK (source IN ('post', 'tag', 'mail')),
  created_at TEXT NOT NULL,
  modes TEXT NOT NULL DEFAULT '',
  hard TEXT,
  post_url TEXT,
  screenshot_key TEXT,
  share INTEGER NOT NULL DEFAULT 0 CHECK (share IN (0, 1)),
  received_on TEXT,
  logged_by TEXT,
  checked_at TEXT,
  checked_by TEXT,
  removed_at TEXT,
  removed_by TEXT,
  removal_reason TEXT,
  CHECK ((participant_id IS NULL) <> (instagram IS NULL))
);
INSERT INTO checkins_next
  (participant_id, day, source, created_at, modes, hard, post_url, screenshot_key, share)
SELECT participant_id, day, 'post', created_at, modes, hard, post_url, screenshot_key, share
FROM checkins;
DROP TABLE checkins;
ALTER TABLE checkins_next RENAME TO checkins;
CREATE UNIQUE INDEX checkins_one_per_day ON checkins (participant_id, day);
CREATE UNIQUE INDEX checkins_handle_one_per_day ON checkins (instagram, day)
  WHERE participant_id IS NULL;
CREATE INDEX checkins_by_day ON checkins (day, created_at);

-- Everyone who has opened the admin views, by their Cloudflare Access
-- email. A participant whose email is here cannot win.
CREATE TABLE volunteers (
  email TEXT PRIMARY KEY,
  first_seen_at TEXT NOT NULL
) WITHOUT ROWID;

-- Each draw of the winner. round 1 is the first draw; a new round is drawn
-- when a winner doesn't reply within 7 days. entrant is the winner's
-- participant id, or "ig:" and the handle for a handle-only entrant, so a
-- later round can leave earlier winners out. eligible_count is how many
-- entries were in that draw.
CREATE TABLE draws (
  round INTEGER PRIMARY KEY,
  entry_id INTEGER NOT NULL,
  entrant TEXT NOT NULL,
  eligible_count INTEGER NOT NULL,
  drawn_at TEXT NOT NULL,
  drawn_by TEXT NOT NULL
);
