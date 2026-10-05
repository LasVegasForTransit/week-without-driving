-- Explicit SMS consent, confirmed with Twilio Verify. Campaign cleanup removes
-- both subscriptions and outstanding confirmations on November 30, 2026.
CREATE TABLE sms_verifications (
  participant_id TEXT PRIMARY KEY REFERENCES participants (id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  verification_sid TEXT,
  consented_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE sms_subscriptions (
  participant_id TEXT PRIMARY KEY REFERENCES participants (id) ON DELETE CASCADE,
  phone TEXT NOT NULL UNIQUE,
  consented_at TEXT NOT NULL,
  confirmed_at TEXT NOT NULL,
  last_sent_on TEXT,
  claim TEXT,
  claimed_at TEXT
);
CREATE INDEX sms_subscriptions_due ON sms_subscriptions (confirmed_at, last_sent_on);
