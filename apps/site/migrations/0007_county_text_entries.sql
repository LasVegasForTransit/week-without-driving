-- Existing participants have no verified county. They may add one in My week;
-- only participants with an eligible county may enter the draw.
ALTER TABLE participants ADD COLUMN county TEXT
  CHECK (county IN ('Clark', 'Esmeralda', 'Lincoln', 'Nye'));

-- A person's trip description is required for new My week entries. Nullable
-- here so existing entries remain readable during an additive deployment.
ALTER TABLE checkins ADD COLUMN description TEXT;
