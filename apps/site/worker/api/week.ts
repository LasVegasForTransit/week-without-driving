import type { ApiContext, Participant } from '../env';
import { MESSAGES, json, problem, readJsonObject } from '../http';
import { todayNumber } from '../time';
import { MAX_SCREENSHOT_BYTES, SCREENSHOT_REPLIES, storeScreenshot } from './photo';

/**
 * What a signed-in person does during the week: share a trip they took
 * without driving (their giveaway entry) and keep their bingo card.
 */

const MAX_BINGO_BYTES = 4096;

/** The ways to get around without driving that count as a trip. */
export const TRIP_MODES = ['bus', 'walk', 'bike', 'scooter', 'ride'] as const;

// Public posts can come from these apps. Anything else is refused, so a
// volunteer only ever opens links to known social media sites.
const POST_HOSTS = [
  'instagram.com',
  'facebook.com',
  'fb.com',
  'tiktok.com',
  'threads.net',
  'threads.com',
  'x.com',
  'twitter.com',
  'bsky.app',
];

export function isPostLink(text: string): boolean {
  try {
    const url = new URL(text);
    const host = url.hostname.replace(/^www\./, '');
    return (
      url.protocol === 'https:' &&
      POST_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
    );
  } catch {
    return false;
  }
}
export const MAX_NOTE_LENGTH = 280;
export const MAX_DESCRIPTION_LENGTH = 500;

export const WEEK_REPLIES = {
  notYet: 'Logging trips opens October 1.',
  over: 'Logging trips is closed. The week is over.',
  noModes: 'Pick how you got around, in step 1.',
  noDescription: 'Describe the trip you took without driving.',
  descriptionTooLong: `Keep the trip description under ${MAX_DESCRIPTION_LENGTH} characters.`,
  county: 'Add your county in your details before entering.',
  email: 'Online entries need an email sign-up. Contact wwd@lasvegasfortransit.org for help.',
  noteTooLong: `Keep the note under ${MAX_NOTE_LENGTH} characters.`,
  alreadyChecked: 'A volunteer already checked today’s entry, so it can’t be changed.',
  badLink: 'Paste the link to a post on Instagram, Facebook, TikTok, Threads, X or Bluesky.',
  badPlan: 'Choose one of your plans for today, or log this trip without a plan.',
  bingoTooBig: 'That bingo card is too big to save.',
  bingoOwnerChanged: 'This phone’s sign-in changed. Reload Bingo before saving.',
} as const;

interface TripInput {
  modes: string;
  description: string;
  hard: string | null;
  link: string | null;
  screenshot: File | null;
  share: boolean;
  planId: string | null;
}

/** A text field from the form, trimmed; a file or a missing field reads as empty. */
function textField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * How someone got around, from a form's "mode" fields, as the stored
 * comma-separated list in the order of TRIP_MODES; or null when there is
 * none, or any item is unknown or listed twice.
 */
export function readModes(form: FormData): string | null {
  const raw = form.getAll('mode').map(String);
  const modes = TRIP_MODES.filter((mode) => raw.includes(mode));
  return modes.length === 0 || modes.length !== raw.length ? null : modes.join(',');
}

/** Reads a shared trip from the entry form, or returns the problem with it. */
function readTrip(form: FormData): TripInput | string {
  const modes = readModes(form);
  if (!modes) return WEEK_REPLIES.noModes;
  const description = textField(form, 'description');
  if (!description) return WEEK_REPLIES.noDescription;
  if (description.length > MAX_DESCRIPTION_LENGTH) return WEEK_REPLIES.descriptionTooLong;
  const hard = textField(form, 'hard');
  if (hard.length > MAX_NOTE_LENGTH) return WEEK_REPLIES.noteTooLong;
  const link = textField(form, 'link');
  const file = form.get('screenshot');
  const screenshot = file instanceof File && file.size > 0 ? file : null;
  const planId = textField(form, 'planId');
  if (link && !isPostLink(link)) return WEEK_REPLIES.badLink;
  if (planId && !/^[0-9a-f-]{36}$/.test(planId)) return WEEK_REPLIES.badPlan;
  return {
    modes,
    description,
    hard: hard || null,
    link: link || null,
    screenshot,
    share: form.get('share') === '1',
    planId: planId || null,
  };
}

async function readForm(request: Request): Promise<FormData | null> {
  // Refuse an oversized upload before reading it; the form adds a little on top of the file.
  if (Number(request.headers.get('Content-Length') ?? '0') > MAX_SCREENSHOT_BYTES + 64 * 1024) {
    return null;
  }
  try {
    return await request.formData();
  } catch {
    return null;
  }
}

/**
 * The person's entries that count, oldest first, as { day, modes }. An
 * entry a volunteer removed doesn't count, and the person can submit
 * another trip that day.
 */
export async function listTrips(
  c: ApiContext,
  me: Participant,
): Promise<Array<{ day: number; modes: string[] }>> {
  const rows = await c.env.DB.prepare(
    'SELECT day, modes FROM checkins WHERE participant_id = ?1 AND removed_at IS NULL ORDER BY day',
  )
    .bind(me.id)
    .all<{ day: number; modes: string }>();
  return rows.results.map((row) => ({
    day: row.day,
    modes: row.modes ? row.modes.split(',') : [],
  }));
}

interface TodayEntry {
  screenshot_key: string | null;
  /** 1 when a volunteer checked the entry and it still counts. */
  locked: number;
}

function todaysEntry(c: ApiContext, me: Participant, day: number): Promise<TodayEntry | null> {
  return c.env.DB.prepare(
    `SELECT screenshot_key, (checked_at IS NOT NULL AND removed_at IS NULL) AS locked
     FROM checkins WHERE participant_id = ?1 AND day = ?2`,
  )
    .bind(me.id, day)
    .first<TodayEntry>();
}

/**
 * Saves the trip as the day's entry. Sending again replaces an entry no
 * volunteer has checked yet, or one a volunteer removed, and it waits for a
 * check again. A checked entry stays as it is, and this answers false.
 */
async function saveTrip(
  c: ApiContext,
  me: Participant,
  day: number,
  trip: TripInput & { key: string | null },
): Promise<boolean> {
  const saved = await c.env.DB.prepare(
    `INSERT INTO checkins
       (participant_id, day, source, created_at, modes, description, hard, post_url, screenshot_key, share, plan_id)
     VALUES (?1, ?2, 'post', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
     ON CONFLICT (participant_id, day) DO UPDATE SET
       source = 'post', created_at = ?3, modes = ?4, description = ?5, hard = ?6, post_url = ?7,
       screenshot_key = ?8, share = ?9, plan_id = ?10, received_on = NULL, logged_by = NULL,
       checked_at = NULL, checked_by = NULL,
       removed_at = NULL, removed_by = NULL, removal_reason = NULL
     WHERE checkins.checked_at IS NULL OR checkins.removed_at IS NOT NULL
     RETURNING id`,
  )
    .bind(
      me.id,
      day,
      c.now.toISOString(),
      trip.modes,
      trip.description,
      trip.hard,
      trip.link,
      trip.key,
      trip.share ? 1 : 0,
      trip.planId,
    )
    .first<{ id: number }>();
  return saved !== null;
}

/** Today's day of the week (1 to 8), or the reply when trips can't be sent today. */
function dayOpenForTrips(c: ApiContext): number | Response {
  const today = todayNumber(c.env.CHECKIN_PREVIEW_DAY, c.now);
  if (today >= 1 && today <= 8) return today;
  return problem(409, today === 0 ? WEEK_REPLIES.notYet : WEEK_REPLIES.over);
}

function entryEligibility(me: Participant): string | null {
  if (!me.county) return WEEK_REPLIES.county;
  if (me.contactType !== 'email') return WEEK_REPLIES.email;
  return null;
}

async function planMatchesToday(
  c: ApiContext,
  me: Participant,
  day: number,
  planId: string | null,
): Promise<boolean> {
  if (!planId) return true;
  const match = await c.env.DB.prepare(
    'SELECT id FROM trip_plans WHERE id = ?1 AND participant_id = ?2 AND day = ?3',
  )
    .bind(planId, me.id, day)
    .first<{ id: string }>();
  return match !== null;
}

async function checkedTrip(
  c: ApiContext,
  me: Participant,
  day: number,
  form: FormData,
): Promise<TripInput | Response> {
  const trip = readTrip(form);
  if (typeof trip === 'string') return problem(400, trip);
  if (!(await planMatchesToday(c, me, day, trip.planId))) return problem(400, WEEK_REPLIES.badPlan);
  return trip;
}

/**
 * Enters today's shared trip, where "today" is the server's Las Vegas date,
 * never the phone's. It needs how the person got around and a description
 * of the trip. A link or screenshot is optional. Entering again the same
 * day replaces the trip until a volunteer checks it; it is still one
 * entry for that day. Volunteers check entries before the draw.
 */
export async function checkIn(c: ApiContext, me: Participant): Promise<Response> {
  const eligibilityProblem = entryEligibility(me);
  if (eligibilityProblem) return problem(403, eligibilityProblem);
  const today = dayOpenForTrips(c);
  if (today instanceof Response) return today;
  const form = await readForm(c.request);
  if (!form) return problem(413, SCREENSHOT_REPLIES.tooBig);
  const trip = await checkedTrip(c, me, today, form);
  if (trip instanceof Response) return trip;
  const previous = await todaysEntry(c, me, today);
  if (previous?.locked) return problem(409, WEEK_REPLIES.alreadyChecked);

  const key = trip.screenshot ? await storeScreenshot(c, me, today, trip.screenshot) : null;
  if (key instanceof Response) return key;
  if (!(await saveTrip(c, me, today, { ...trip, key }))) {
    // A volunteer checked the entry a moment ago.
    if (key) await c.env.PHOTOS?.delete(key);
    return problem(409, WEEK_REPLIES.alreadyChecked);
  }
  // A replaced screenshot is no longer needed.
  if (previous?.screenshot_key) await c.env.PHOTOS?.delete(previous.screenshot_key);

  const trips = await listTrips(c, me);
  return json({ count: trips.length, days: trips.map((t) => t.day), trips });
}

export async function getBingo(c: ApiContext, me: Participant): Promise<Response> {
  const row = await c.env.DB.prepare('SELECT state FROM bingo WHERE participant_id = ?1')
    .bind(me.id)
    .first<{ state: string }>();
  return json({ participantId: me.id, state: row ? (JSON.parse(row.state) as unknown) : null });
}

/** Keeps a reconciled participant's card, refusing stale tabs after account recovery. */
export async function putBingo(c: ApiContext, me: Participant): Promise<Response> {
  const body = await readJsonObject(c.request);
  if (!body || !('state' in body) || typeof body.participantId !== 'string' || !body.participantId)
    return problem(400, MESSAGES.badRequest);
  if (body.participantId !== me.id) return problem(409, WEEK_REPLIES.bingoOwnerChanged);
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
