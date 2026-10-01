import { type AdminContext, field } from './common';
import { seeOther } from './html';
import { ELIGIBLE_SQL, PENDING_REVIEW_SQL, drawOpen, randomIndex, replyPeriodEnded } from './pick';

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
  return seeOther(`/admin?notice=${notice}#admin-notice`);
}

type DrawGate = { round: number } | { problem: string };

async function drawGate(c: AdminContext, form: FormData): Promise<DrawGate> {
  if (field(form, 'confirm') !== 'yes') return { problem: 'draw-confirm' };
  if (!drawOpen(c.env, c.now)) return { problem: 'draw-not-open' };
  const round = Number(field(form, 'round'));
  if (!Number.isSafeInteger(round) || round < 1) return { problem: 'draw-stale' };
  if (round > 1) {
    const latest = await c.env.DB.prepare(
      'SELECT round, drawn_at FROM draws ORDER BY round DESC LIMIT 1',
    ).first<{ round: number; drawn_at: string }>();
    if (latest?.round !== round - 1) return { problem: 'draw-stale' };
    if (!replyPeriodEnded(latest.drawn_at, c.now)) return { problem: 'draw-wait' };
  }
  return { round };
}

export async function drawWinner(c: AdminContext, form: FormData): Promise<Response> {
  const gate = await drawGate(c, form);
  if ('problem' in gate) return back(gate.problem);
  const { round } = gate;
  const db = c.env.DB;
  const [waiting, eligible] = await db.batch<Record<string, unknown>>([
    db.prepare(PENDING_REVIEW_SQL),
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
