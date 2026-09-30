import type { ApiContext, Participant } from '../env';
import { MESSAGES, json, problem, readJsonObject } from '../http';
import { lasVegasDate } from '../time';

/** Private outing plans. Saving a plan does not enter the giveaway. */

const MODES = ['bus', 'walk', 'bike', 'scooter', 'ride'] as const;
const MAX_PLANS = 16;
const MAX_NAME = 120;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const START = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const FIELDS = new Set([
  'id',
  'day',
  'destination',
  'eventName',
  'startsAt',
  'availableModes',
  'willingModes',
  'reminderMinutesBefore',
]);

export const PLAN_REPLIES = {
  badDetails: 'Check the plan details and try again.',
  missing: 'That plan isn’t in your My week.',
  tooMany: `You can save up to ${MAX_PLANS} plans. Delete one before adding another.`,
  linkedDay: 'This plan is linked to a logged trip. Keep it on that day.',
} as const;

interface PlanInput {
  day: number;
  destination: string;
  eventName: string | null;
  startsAt: string | null;
  availableModes: string[];
  willingModes: string[];
  reminderMinutesBefore: number | null;
}

interface PlanRow {
  id: string;
  participant_id: string;
  day: number;
  destination: string;
  event_name: string | null;
  starts_at: string | null;
  available_modes: string;
  willing_modes: string;
  reminder_minutes_before: number | null;
  reminder_at: string | null;
  logged_entry_id: number | null;
  created_at: string;
  updated_at: string;
}

const SELECT = `SELECT p.id, p.participant_id, p.day, p.destination, p.event_name, p.starts_at,
  p.available_modes, p.willing_modes, p.reminder_minutes_before, p.reminder_at,
  p.created_at, p.updated_at,
  c.id AS logged_entry_id
  FROM trip_plans p LEFT JOIN checkins c ON c.plan_id = p.id AND c.removed_at IS NULL`;

function plan(row: PlanRow) {
  return {
    id: row.id,
    day: row.day,
    destination: row.destination,
    eventName: row.event_name,
    startsAt: row.starts_at,
    availableModes: row.available_modes ? row.available_modes.split(',') : [],
    willingModes: row.willing_modes ? row.willing_modes.split(',') : [],
    reminderMinutesBefore: row.reminder_minutes_before,
    reminderAt: row.reminder_at,
    loggedEntryId: row.logged_entry_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listPlans(c: ApiContext, me: Participant) {
  const rows = await c.env.DB.prepare(
    `${SELECT} WHERE p.participant_id = ?1 ORDER BY p.day, p.created_at, p.id`,
  )
    .bind(me.id)
    .all<PlanRow>();
  return rows.results.map(plan);
}

async function ownedPlan(c: ApiContext, me: Participant, id: string): Promise<PlanRow | null> {
  return c.env.DB.prepare(`${SELECT} WHERE p.id = ?1 AND p.participant_id = ?2`)
    .bind(id, me.id)
    .first<PlanRow>();
}

function modes(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MODES.length) return null;
  if (
    value.some(
      (mode) => typeof mode !== 'string' || !MODES.includes(mode as (typeof MODES)[number]),
    )
  )
    return null;
  if (new Set(value).size !== value.length) return null;
  return MODES.filter((mode) => value.includes(mode));
}

function chosen(body: Record<string, unknown>, name: string, previous: unknown): unknown {
  return body[name] === undefined ? previous : body[name];
}

function dayNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 8;
}

function placeName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_NAME ? trimmed : null;
}

function optionalName(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string' || value.trim().length > MAX_NAME) return undefined;
  return value.trim() || null;
}

function startTime(value: unknown, day: number): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string' || !START.test(value)) return undefined;
  const start = new Date(value);
  if (Number.isNaN(start.getTime()) || lasVegasDate(start) !== `2026-10-0${day}`) return undefined;
  return start.toISOString();
}

function knownFields(body: Record<string, unknown>): boolean {
  return Object.keys(body).every((name) => FIELDS.has(name));
}

function modeChoices(
  body: Record<string, unknown>,
  previous?: PlanRow,
): Pick<PlanInput, 'availableModes' | 'willingModes'> | null {
  const availableModes = modes(
    chosen(body, 'availableModes', previous?.available_modes.split(',').filter(Boolean)),
  );
  const willingModes = modes(
    chosen(body, 'willingModes', previous?.willing_modes.split(',').filter(Boolean)),
  );
  return availableModes && willingModes ? { availableModes, willingModes } : null;
}

function reminderChoice(
  body: Record<string, unknown>,
  startsAt: string | null,
  previous?: PlanRow,
): number | null | undefined {
  const value = chosen(body, 'reminderMinutesBefore', previous?.reminder_minutes_before ?? null);
  if (value === null) return null;
  if (![30, 60, 120, 1440].includes(value as number) || !startsAt) return undefined;
  return value as number;
}

function details(body: Record<string, unknown>, previous?: PlanRow): PlanInput | null {
  if (!knownFields(body)) return null;
  const day = chosen(body, 'day', previous?.day);
  if (!dayNumber(day)) return null;
  const destination = placeName(chosen(body, 'destination', previous?.destination));
  const eventName = optionalName(chosen(body, 'eventName', previous?.event_name ?? null));
  const startsAt = startTime(chosen(body, 'startsAt', previous?.starts_at ?? null), day);
  if (startsAt === undefined) return null;
  const reminderMinutesBefore = reminderChoice(body, startsAt, previous);
  const choices = modeChoices(body, previous);
  if (!destination || eventName === undefined || reminderMinutesBefore === undefined) return null;
  if (!choices) return null;
  return { day, destination, eventName, startsAt, reminderMinutesBefore, ...choices };
}

function reminderAt(input: PlanInput): string | null {
  if (!input.startsAt || !input.reminderMinutesBefore) return null;
  return new Date(Date.parse(input.startsAt) - input.reminderMinutesBefore * 60_000).toISOString();
}

function reminderAllowed(c: ApiContext, body: Record<string, unknown>): boolean {
  return !Object.hasOwn(body, 'reminderMinutesBefore') || c.env.EVENT_REMINDERS_ENABLED === 'true';
}

export async function getPlans(c: ApiContext, me: Participant): Promise<Response> {
  return json({ plans: await listPlans(c, me) });
}

export async function createPlan(c: ApiContext, me: Participant): Promise<Response> {
  const body = await readJsonObject(c.request);
  if (!body) return problem(400, MESSAGES.badRequest);
  if (!reminderAllowed(c, body)) return problem(400, PLAN_REPLIES.badDetails);
  const input = details(body);
  if (!input) return problem(400, PLAN_REPLIES.badDetails);
  const count = await c.env.DB.prepare(
    'SELECT count(*) AS n FROM trip_plans WHERE participant_id = ?1',
  )
    .bind(me.id)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_PLANS) return problem(409, PLAN_REPLIES.tooMany);
  const id = crypto.randomUUID();
  const now = c.now.toISOString();
  await c.env.DB.prepare(
    `INSERT INTO trip_plans
      (id, participant_id, day, destination, event_name, starts_at,
       available_modes, willing_modes, reminder_minutes_before, reminder_at, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)`,
  )
    .bind(
      id,
      me.id,
      input.day,
      input.destination,
      input.eventName,
      input.startsAt,
      input.availableModes.join(','),
      input.willingModes.join(','),
      input.reminderMinutesBefore,
      reminderAt(input),
      now,
    )
    .run();
  const saved = await ownedPlan(c, me, id);
  if (!saved) throw new Error('Created plan was not found.');
  return json({ plan: plan(saved) }, 201);
}

export async function updatePlan(c: ApiContext, me: Participant): Promise<Response> {
  const body = await readJsonObject(c.request);
  if (!body || typeof body.id !== 'string' || !ID.test(body.id))
    return problem(400, MESSAGES.badRequest);
  if (!reminderAllowed(c, body)) return problem(400, PLAN_REPLIES.badDetails);
  const previous = await ownedPlan(c, me, body.id);
  if (!previous) return problem(404, PLAN_REPLIES.missing);
  const input = details(body, previous);
  if (!input) return problem(400, PLAN_REPLIES.badDetails);
  if (previous.logged_entry_id && input.day !== previous.day)
    return problem(409, PLAN_REPLIES.linkedDay);
  const nextReminderAt = reminderAt(input);
  const update = c.env.DB.prepare(
    `UPDATE trip_plans SET day = ?1, destination = ?2, event_name = ?3, starts_at = ?4,
       available_modes = ?5, willing_modes = ?6, reminder_minutes_before = ?7,
       reminder_at = ?8, updated_at = ?9
     WHERE id = ?10 AND participant_id = ?11`,
  ).bind(
    input.day,
    input.destination,
    input.eventName,
    input.startsAt,
    input.availableModes.join(','),
    input.willingModes.join(','),
    input.reminderMinutesBefore,
    nextReminderAt,
    c.now.toISOString(),
    body.id,
    me.id,
  );
  const scheduleChanged =
    previous.reminder_at !== nextReminderAt || previous.starts_at !== input.startsAt;
  if (scheduleChanged) {
    await c.env.DB.batch([
      update,
      c.env.DB.prepare('DELETE FROM trip_plan_pushes WHERE plan_id = ?1').bind(body.id),
    ]);
  } else await update.run();
  const saved = await ownedPlan(c, me, body.id);
  if (!saved) throw new Error('Updated plan was not found.');
  return json({ plan: plan(saved) });
}

export async function deletePlan(c: ApiContext, me: Participant): Promise<Response> {
  const body = await readJsonObject(c.request);
  if (!body || typeof body.id !== 'string' || !ID.test(body.id))
    return problem(400, MESSAGES.badRequest);
  if (!(await ownedPlan(c, me, body.id))) return problem(404, PLAN_REPLIES.missing);
  await c.env.DB.batch([
    c.env.DB.prepare(
      'UPDATE checkins SET plan_id = NULL WHERE plan_id = ?1 AND participant_id = ?2',
    ).bind(body.id, me.id),
    c.env.DB.prepare('DELETE FROM trip_plans WHERE id = ?1 AND participant_id = ?2').bind(
      body.id,
      me.id,
    ),
  ]);
  return json({ deleted: true });
}
