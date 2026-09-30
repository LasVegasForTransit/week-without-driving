-- Participants can plan several outings on one day. A plan is private to its
-- owner and never creates a giveaway entry by itself. Reminders stay unset
-- until a production phone has received and opened a test notification.
CREATE TABLE trip_plans (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants (id) ON DELETE CASCADE,
  day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 8),
  destination TEXT NOT NULL,
  event_name TEXT,
  starts_at TEXT,
  available_modes TEXT NOT NULL DEFAULT '',
  willing_modes TEXT NOT NULL DEFAULT '',
  reminder_minutes_before INTEGER CHECK (reminder_minutes_before IN (30, 60, 120, 1440)),
  reminder_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX trip_plans_by_participant ON trip_plans (participant_id, day, created_at);
CREATE INDEX trip_plans_due ON trip_plans (reminder_at);

-- A completed outing may be linked to that day's one trip entry. Deleting a
-- plan keeps the entry and its prize eligibility.
ALTER TABLE checkins ADD COLUMN plan_id TEXT REFERENCES trip_plans (id) ON DELETE SET NULL;
CREATE UNIQUE INDEX checkins_one_plan ON checkins (plan_id) WHERE plan_id IS NOT NULL;

-- A future plan-specific notification is tracked per browser subscription,
-- so retrying one failed push cannot send another browser a duplicate.
CREATE TABLE trip_plan_pushes (
  plan_id TEXT NOT NULL REFERENCES trip_plans (id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL REFERENCES push_subscriptions (id) ON DELETE CASCADE,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (plan_id, subscription_id)
);
