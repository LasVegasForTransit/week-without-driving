import type { ApiContext, Participant } from '../env';
import { MESSAGES, json, problem, readJsonObject } from '../http';
import { todayNumber } from '../time';

/**
 * What a signed-in person does during the week: log a trip they took
 * without driving, choose reminders, and keep their bingo card.
 */

const MAX_BINGO_BYTES = 4096;

/** The ways to get around without driving that count as a trip. */
export const TRIP_MODES = ['bus', 'walk', 'bike', 'ride'] as const;
const MAX_NOTE_LENGTH = 280;

export const WEEK_REPLIES = {
  notYet: 'Logging trips opens October 1.',
  over: 'Logging trips is closed. The week is over.',
  noModes: 'Pick how you got around. Pick more than one if you like.',
  noteTooLong: `Keep the note under ${MAX_NOTE_LENGTH} characters.`,
  bingoTooBig: 'That bingo card is too big to save.',
  remindersNotTrueFalse: 'Reminders can only be turned on or off.',
} as const;

interface TripInput {
  modes: string;
  hard: string | null;
}

/** Reads { modes: string[], hard?: string } from a trip log, or returns a problem. */
function readTrip(body: Record<string, unknown>): TripInput | string {
  const raw = Array.isArray(body.modes) ? body.modes : [];
  const modes = TRIP_MODES.filter((mode) => raw.includes(mode));
  // Every item must be a known mode, listed once.
  if (modes.length === 0 || modes.length !== raw.length) return WEEK_REPLIES.noModes;
  const hard = typeof body.hard === 'string' ? body.hard.trim() : '';
  if (hard.length > MAX_NOTE_LENGTH) return WEEK_REPLIES.noteTooLong;
  return { modes: modes.join(','), hard: hard || null };
}

/** The person's logged trips, oldest first, as { day, modes }. */
export async function listTrips(
  c: ApiContext,
  me: Participant,
): Promise<Array<{ day: number; modes: string[] }>> {
  const rows = await c.env.DB.prepare(
    'SELECT day, modes FROM checkins WHERE participant_id = ?1 ORDER BY day',
  )
    .bind(me.id)
    .all<{ day: number; modes: string }>();
  return rows.results.map((row) => ({
    day: row.day,
    modes: row.modes ? row.modes.split(',') : [],
  }));
}

/**
 * Logs a trip without driving for today, where "today" is the server's Las
 * Vegas date, never the phone's. Logging again on the same day replaces how
 * they got around and the note; it is still one entry for that day.
 */
export async function checkIn(c: ApiContext, me: Participant): Promise<Response> {
  const today = todayNumber(c.env.CHECKIN_PREVIEW_DAY, c.now);
  if (today < 1 || today > 8) {
    return problem(409, today === 0 ? WEEK_REPLIES.notYet : WEEK_REPLIES.over);
  }
  const body = await readJsonObject(c.request);
  if (!body) return problem(400, MESSAGES.badRequest);
  const trip = readTrip(body);
  if (typeof trip === 'string') return problem(400, trip);
  await c.env.DB.prepare(
    `INSERT INTO checkins (participant_id, day, created_at, modes, hard) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT (participant_id, day) DO UPDATE SET modes = ?4, hard = ?5`,
  )
    .bind(me.id, today, c.now.toISOString(), trip.modes, trip.hard)
    .run();
  const trips = await listTrips(c, me);
  return json({ count: trips.length, days: trips.map((t) => t.day), trips });
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
