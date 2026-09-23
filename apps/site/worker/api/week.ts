import type { ApiContext, Participant } from '../env';
import { MESSAGES, json, problem, readJsonObject } from '../http';
import { todayNumber } from '../time';

/**
 * What a signed-in person does during the week: check in, choose
 * reminders, and keep their bingo card.
 */

const MAX_BINGO_BYTES = 4096;

export const WEEK_REPLIES = {
  notYet: 'Check-ins open October 1.',
  over: 'Check-ins are closed. The week is over.',
  bingoTooBig: 'That bingo card is too big to save.',
  remindersNotTrueFalse: 'Reminders can only be turned on or off.',
} as const;

/**
 * Checks in for today, where "today" is the server's Las Vegas date, never
 * the phone's. A second check-in on the same day changes nothing.
 */
export async function checkIn(c: ApiContext, me: Participant): Promise<Response> {
  const today = todayNumber(c.env.CHECKIN_PREVIEW_DAY, c.now);
  if (today < 1 || today > 8) {
    return problem(409, today === 0 ? WEEK_REPLIES.notYet : WEEK_REPLIES.over);
  }
  const [, days] = await c.env.DB.batch<{ day: number }>([
    c.env.DB.prepare(
      'INSERT OR IGNORE INTO checkins (participant_id, day, created_at) VALUES (?1, ?2, ?3)',
    ).bind(me.id, today, c.now.toISOString()),
    c.env.DB.prepare('SELECT day FROM checkins WHERE participant_id = ?1 ORDER BY day').bind(me.id),
  ]);
  const checked = (days?.results ?? []).map((row) => row.day);
  return json({ count: checked.length, days: checked });
}

function onOff(value: unknown): number | null | undefined {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return undefined;
}

/**
 * Saves reminder choices; nothing is sent yet. Texts are offered only to
 * people who signed up with a phone number, and email only to people who
 * signed up with an email, so the other one is always off.
 */
export async function setReminders(c: ApiContext, me: Participant): Promise<Response> {
  const body = await readJsonObject(c.request);
  if (!body) return problem(400, MESSAGES.badRequest);
  const push = onOff(body.push);
  const text = me.contactType === 'phone' ? onOff(body.text) : 0;
  const email = me.contactType === 'email' ? onOff(body.email) : 0;
  if (push === undefined || text === undefined || email === undefined) {
    return problem(400, WEEK_REPLIES.remindersNotTrueFalse);
  }
  // A null leaves that choice as it was.
  const row = await c.env.DB.prepare(
    `INSERT INTO reminders (participant_id, push, text, email, updated_at)
     VALUES (?1, coalesce(?2, 0), coalesce(?3, 0), coalesce(?4, 0), ?5)
     ON CONFLICT (participant_id) DO UPDATE SET
       push = coalesce(?2, push), text = coalesce(?3, text), email = coalesce(?4, email),
       updated_at = ?5
     RETURNING push, text, email`,
  )
    .bind(me.id, push, text, email, c.now.toISOString())
    .first<{ push: number; text: number; email: number }>();
  return json({
    reminders: { push: row?.push === 1, text: row?.text === 1, email: row?.email === 1 },
  });
}

export async function getBingo(c: ApiContext, me: Participant): Promise<Response> {
  const row = await c.env.DB.prepare('SELECT state FROM bingo WHERE participant_id = ?1')
    .bind(me.id)
    .first<{ state: string }>();
  return json({ state: row ? (JSON.parse(row.state) as unknown) : null });
}

/** Keeps one bingo card per person, as the page's own JSON, up to 4 KB. */
export async function putBingo(c: ApiContext, me: Participant): Promise<Response> {
  const body = await readJsonObject(c.request);
  if (!body || !('state' in body)) return problem(400, MESSAGES.badRequest);
  const state = JSON.stringify(body.state);
  if (new TextEncoder().encode(state).length > MAX_BINGO_BYTES) {
    return problem(413, WEEK_REPLIES.bingoTooBig);
  }
  await c.env.DB.prepare(
    `INSERT INTO bingo (participant_id, state, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT (participant_id) DO UPDATE SET state = ?2, updated_at = ?3`,
  )
    .bind(me.id, state, c.now.toISOString())
    .run();
  return json({ saved: true });
}
