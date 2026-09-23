-- A check-in is now a logged trip: each day someone gets around without
-- driving, they say how (any of bus, walk, bike, ride, stored as a
-- comma-separated list) and, if they like, what was hard. The day is still
-- the entry; modes and the note are what LVBT learns from it.
ALTER TABLE checkins ADD COLUMN modes TEXT NOT NULL DEFAULT '';
ALTER TABLE checkins ADD COLUMN hard TEXT;
