-- Daily reminders by browser notification (web push). Each row is one
-- browser on one phone or computer that turned reminders on from My week.
-- Everything here is deleted on November 30, 2026, with the rest
-- (worker/cleanup.ts).
--
-- * participant_id is whoever last turned notifications on in that
--   browser. Signing out leaves the row; "Stop reminders" deletes it.
-- * endpoint is the address the browser's push service gave for it, and
--   p256dh and auth are the browser's keys that each notification is
--   encrypted with.
-- * last_sent_on is the Las Vegas date (YYYY-MM-DD) of the last reminder a
--   push service took, so nobody gets a day's reminder twice.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants (id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_sent_on TEXT
);
CREATE INDEX IF NOT EXISTS push_subscriptions_by_participant ON push_subscriptions (participant_id);
CREATE INDEX IF NOT EXISTS push_subscriptions_due ON push_subscriptions (created_at);

-- The earlier reminder choices (a yes or no for notifications, texts and
-- email) never sent anything and nobody had saved one. Browser
-- notifications now live above; texts get their own table when they come.
-- IF NOT EXISTS and IF EXISTS let this run safely on a database that
-- already has either change.
DROP TABLE IF EXISTS reminders;
