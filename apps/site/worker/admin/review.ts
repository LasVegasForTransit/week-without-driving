import {
  type AdminContext,
  field,
  filterQuery,
  idField,
  isRemovalReason,
  readFilters,
} from './common';
import { seeOther } from './html';

/**
 * Checking entries: "Mark checked" puts an entry in the draw, "Remove
 * entry" takes it out with a reason, and "Restore entry" undoes a
 * removal. Removal is soft: the row stays with who removed it, when and
 * why, and a removed entry doesn't count.
 *
 * Checking and removing name the version of the entry the volunteer saw
 * (its created_at). A participant who sends a new post for the day
 * replaces the entry, and the volunteer is asked to look again rather
 * than checking a post they haven't seen.
 */

function back(form: FormData, notice: string): Response {
  const filters = readFilters(new URLSearchParams(field(form, 'back')));
  return seeOther(`/admin${filterQuery(filters, notice)}#queue`);
}

async function changed(statement: D1PreparedStatement): Promise<boolean> {
  const result = await statement.run();
  return result.meta.changes > 0;
}

export async function markChecked(c: AdminContext, form: FormData): Promise<Response> {
  const id = idField(form);
  if (!id) return back(form, 'stale');
  const done = await changed(
    c.env.DB.prepare(
      `UPDATE checkins SET checked_at = ?3, checked_by = ?4
       WHERE id = ?1 AND created_at = ?2 AND checked_at IS NULL AND removed_at IS NULL`,
    ).bind(id, field(form, 'seen'), c.now.toISOString(), c.volunteer),
  );
  return back(form, done ? 'checked' : 'stale');
}

export async function removeEntry(c: AdminContext, form: FormData): Promise<Response> {
  const id = idField(form);
  const reason = field(form, 'reason');
  if (!isRemovalReason(reason)) return back(form, 'no-reason');
  if (!id) return back(form, 'stale');
  const done = await changed(
    c.env.DB.prepare(
      `UPDATE checkins SET removed_at = ?3, removed_by = ?4, removal_reason = ?5
       WHERE id = ?1 AND created_at = ?2 AND removed_at IS NULL`,
    ).bind(id, field(form, 'seen'), c.now.toISOString(), c.volunteer, reason),
  );
  return back(form, done ? 'removed' : 'stale');
}

export async function restoreEntry(c: AdminContext, form: FormData): Promise<Response> {
  const id = idField(form);
  if (!id) return back(form, 'stale');
  const done = await changed(
    c.env.DB.prepare(
      `UPDATE checkins SET removed_at = NULL, removed_by = NULL, removal_reason = NULL
       WHERE id = ?1 AND removed_at IS NOT NULL`,
    ).bind(id),
  );
  return back(form, done ? 'restored' : 'stale');
}
