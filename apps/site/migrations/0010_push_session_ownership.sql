-- A browser opt-in belongs to the session that last confirmed it. Signing
-- out removes this device's opt-in while leaving other phones subscribed.
-- Existing opt-ins have no session until the browser confirms ownership.
ALTER TABLE push_subscriptions ADD COLUMN session_hash TEXT
  REFERENCES sessions (token_hash) ON DELETE CASCADE;
CREATE INDEX push_subscriptions_by_session ON push_subscriptions (session_hash);
