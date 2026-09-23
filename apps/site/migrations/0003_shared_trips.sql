-- An entry is a shared trip: each logged trip now carries the post that
-- shares it, as a link to a public post or a screenshot of the post from a
-- private account (stored in R2 at screenshot_key), and whether LVBT may
-- share it. The separate optional photo is gone; the screenshot replaces it.
ALTER TABLE checkins ADD COLUMN post_url TEXT;
ALTER TABLE checkins ADD COLUMN screenshot_key TEXT;
ALTER TABLE checkins ADD COLUMN share INTEGER NOT NULL DEFAULT 0;
DROP TABLE photos;
