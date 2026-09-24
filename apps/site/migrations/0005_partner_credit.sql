-- Where a sign-up came from, for volunteers' counts. Deleted with the rest
-- of the participant on November 30, 2026 (worker/cleanup.ts).
--
-- * partner is the slug of the partner group whose ?ref= link brought the
--   person (src/lib/partners.ts), or null. It is set when the sign-up is
--   made and never changes.
-- * shared_device is 1 when a volunteer signed the person up on a shared
--   tablet or phone, after tapping "Sign up someone else" in that tab. LVBT's
--   newsletter sign-up records it as the source of the request.
--
-- The Worker writes both after the sign-up itself, so a database without
-- this migration still takes sign-ups, just without the credit.
ALTER TABLE participants ADD COLUMN partner TEXT;
ALTER TABLE participants ADD COLUMN shared_device INTEGER NOT NULL DEFAULT 0 CHECK (shared_device IN (0, 1));
