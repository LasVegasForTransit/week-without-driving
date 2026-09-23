import type { AdminContext } from './common';

/**
 * Saving an entry a volunteer logged. The unique indexes on checkins keep
 * one entry per entrant per day, and day is 1 to 8, so nobody holds more
 * than 8. A volunteer saw the tag or card, so it is checked as it is
 * saved.
 */

export interface LoggedEntry {
  /** The sign-up it belongs to, or null for a handle-only tag. */
  participantId: string | null;
  /** A handle-only tag's handle; null when there is a participant. */
  handle: string | null;
  day: number;
  source: 'tag' | 'mail';
  postUrl: string | null;
  modes: string;
  hard: string | null;
  receivedOn: string | null;
}

interface Existing {
  id: number;
  removed_at: string | null;
  screenshot_key: string | null;
}

function existingEntry(c: AdminContext, entry: LoggedEntry): Promise<Existing | null> {
  const owner = entry.participantId
    ? 'participant_id = ?1'
    : 'participant_id IS NULL AND instagram = ?1';
  return c.env.DB.prepare(
    `SELECT id, removed_at, screenshot_key FROM checkins WHERE ${owner} AND day = ?2`,
  )
    .bind(entry.participantId ?? entry.handle, entry.day)
    .first<Existing>();
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE');
}

/**
 * Saves the entry unless the entrant already has one that counts that day,
 * and says whether it did. An entry removed that day is replaced, since it
 * no longer counts.
 */
export async function saveLogged(c: AdminContext, entry: LoggedEntry): Promise<boolean> {
  const existing = await existingEntry(c, entry);
  if (existing?.removed_at === null) return false;
  const values = [
    entry.source,
    c.now.toISOString(),
    entry.modes,
    entry.hard,
    entry.postUrl,
    entry.receivedOn,
    c.volunteer,
  ];
  if (existing) {
    const replaced = await c.env.DB.prepare(
      `UPDATE checkins SET source = ?2, created_at = ?3, modes = ?4, hard = ?5, post_url = ?6,
         screenshot_key = NULL, share = 0, received_on = ?7, logged_by = ?8,
         checked_at = ?3, checked_by = ?8, removed_at = NULL, removed_by = NULL, removal_reason = NULL
       WHERE id = ?1 AND removed_at IS NOT NULL`,
    )
      .bind(existing.id, ...values)
      .run();
    if (replaced.meta.changes === 0) return false;
    if (existing.screenshot_key) await c.env.PHOTOS?.delete(existing.screenshot_key);
    return true;
  }
  try {
    await c.env.DB.prepare(
      `INSERT INTO checkins (participant_id, instagram, day, source, created_at, modes, hard,
         post_url, received_on, logged_by, checked_at, checked_by)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?5, ?10)`,
    )
      .bind(entry.participantId, entry.handle, entry.day, ...values)
      .run();
    return true;
  } catch (error) {
    // Another entry for that day was saved a moment ago.
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}
