-- The participant database for lvwwd.org: people who signed up to win,
-- how their phones stay signed in, and what they did during the week.
-- Everything here is deleted on November 30, 2026 (worker/cleanup.ts).
-- Times are ISO 8601 UTC strings, so they sort and compare as text.

-- One row per sign-up. The phone number (E.164) or email (lowercased) is
-- the identity, so it is unique.
CREATE TABLE participants (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  contact TEXT NOT NULL UNIQUE,
  contact_type TEXT NOT NULL CHECK (contact_type IN ('phone', 'email')),
  zip TEXT NOT NULL,
  instagram TEXT,
  age TEXT NOT NULL CHECK (age IN ('adult', 'teen')),
  newsletter INTEGER NOT NULL DEFAULT 0 CHECK (newsletter IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- A signed-in phone. Only the SHA-256 of the cookie's token is stored.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_by_participant ON sessions (participant_id);

-- An "Open my week" link. Only the SHA-256 of its token is stored.
-- delivery is sent, failed, unconfigured (no email key), or pending (a
-- phone, until there is a text provider; it then issues a fresh link).
CREATE TABLE link_tokens (
  token_hash TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants (id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('phone', 'email')),
  delivery TEXT NOT NULL CHECK (delivery IN ('sent', 'pending', 'failed', 'unconfigured')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX link_tokens_by_participant ON link_tokens (participant_id);
CREATE INDEX link_tokens_pending ON link_tokens (delivery) WHERE delivery = 'pending';

-- One check-in per person per day of the week. Each is one giveaway entry.
CREATE TABLE checkins (
  participant_id TEXT NOT NULL REFERENCES participants (id) ON DELETE CASCADE,
  day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 8),
  created_at TEXT NOT NULL,
  PRIMARY KEY (participant_id, day)
) WITHOUT ROWID;

-- Optional photos. The file is in R2 at object_key; share records whether
-- LVBT may post it. day is 0 before the week and 9 after it.
CREATE TABLE photos (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants (id) ON DELETE CASCADE,
  day INTEGER NOT NULL CHECK (day BETWEEN 0 AND 9),
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  share INTEGER NOT NULL DEFAULT 0 CHECK (share IN (0, 1)),
  created_at TEXT NOT NULL
);
CREATE INDEX photos_by_participant ON photos (participant_id);

-- Reminder choices. Nothing sends them yet.
CREATE TABLE reminders (
  participant_id TEXT PRIMARY KEY REFERENCES participants (id) ON DELETE CASCADE,
  push INTEGER NOT NULL DEFAULT 0 CHECK (push IN (0, 1)),
  text INTEGER NOT NULL DEFAULT 0 CHECK (text IN (0, 1)),
  email INTEGER NOT NULL DEFAULT 0 CHECK (email IN (0, 1)),
  updated_at TEXT NOT NULL
);

-- The bingo card, as the page's own JSON (at most 4 KB).
CREATE TABLE bingo (
  participant_id TEXT PRIMARY KEY REFERENCES participants (id) ON DELETE CASCADE,
  state TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Fixed-window request counters. key is the SHA-256 of the limit's name and
-- the IP address or contact; window_start is the minute (counted from 1970)
-- the window began (worker/rate-limit.ts).
CREATE TABLE rate_limits (
  key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (key, window_start)
) WITHOUT ROWID;
CREATE INDEX rate_limits_by_window ON rate_limits (window_start);
