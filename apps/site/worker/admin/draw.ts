import { type AdminContext, field } from './common';
import { seeOther } from './html';
import { ELIGIBLE_SQL, drawOpen, randomIndex } from './pick';

/**
 * POST /admin/draw: draws the winner, or draws again when a winner doesn't
 * reply within 7 days or can't take the prize. It runs only from October
 * 14, 2026 (or any time on the preview with PREVIEW_DRAW_ANYTIME), only
 * once every entry is checked or removed, and picks uniformly at random
 * among the entries in the draw (see pick.ts). Every draw is recorded with
 * the winning entry, when, and by whom.
 *
 * The form carries the round the volunteer is drawing. The round is saved
 * only if it is the next one, so two volunteers drawing at the same moment
 * make one draw, not two.
 */

function back(notice: string): Response {
  return seeOther(`/admin?notice=${notice}#draw`);
}

export async function drawWinner(c: AdminContext, form: FormData): Promise<Response> {
  if (field(form, 'confirm') !== 'yes') return back('draw-confirm');
  if (!drawOpen(c.env, c.now)) return back('draw-not-open');
  const round = Number(field(form, 'round'));
  if (!Number.isSafeInteger(round) || round < 1) return back('draw-stale');

  const db = c.env.DB;
  const [waiting, eligible] = await db.batch<Record<string, unknown>>([
    db.prepare(
      'SELECT count(*) AS n FROM checkins WHERE removed_at IS NULL AND checked_at IS NULL',
    ),
    db.prepare(ELIGIBLE_SQL),
  ]);
  if (Number(waiting?.results[0]?.n ?? 0) > 0) return back('draw-unchecked');
  const entries = (eligible?.results ?? []) as unknown as { id: number; entrant: string }[];
  const winner = entries.length > 0 ? entries[randomIndex(entries.length)] : undefined;
  if (!winner) return back('draw-no-entries');

  const saved = await db
    .prepare(
      `INSERT INTO draws (round, entry_id, entrant, eligible_count, drawn_at, drawn_by)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE (SELECT count(*) FROM draws) = ?1 - 1
       ON CONFLICT (round) DO NOTHING`,
    )
    .bind(round, winner.id, winner.entrant, entries.length, c.now.toISOString(), c.volunteer)
    .run();
  return back(saved.meta.changes > 0 ? 'drawn' : 'draw-stale');
}
