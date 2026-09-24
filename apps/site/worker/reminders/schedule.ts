import { REMINDERS, type ReminderMessage, messageForDay } from '../../src/lib/reminders';
import type { Env } from '../env';
import { lasVegasDate, todayNumber } from '../time';

/**
 * The morning schedule every reminder channel follows. Reminders go out
 * from 8:00 am Las Vegas time (15:00 UTC) on October 1 to 8, 2026, each
 * channel on its own Cron Trigger, a batch per run, until everyone who
 * turned that channel on has that day's message. The day's message comes
 * from src/data/reminders.json by the Las Vegas date, so a run on any
 * other date sends nothing.
 *
 * Only people who turned reminders on before 8:00 am that day get that
 * day's message; anyone later gets the next day's. Nobody gets a day's
 * message twice on one channel.
 */

export interface ReminderRun {
  day: number;
  /** The Las Vegas date of the message, as YYYY-MM-DD. */
  date: string;
  message: ReminderMessage;
  /** Only sign-ups saved before this moment (ISO 8601) count for this run. */
  dueBefore: string;
}

/** When sending starts each morning: 8:00 am Las Vegas time, in UTC. */
export const SEND_START_UTC = 'T15:00:00.000Z';

/** From here on nobody can turn reminders on. */
export const SIGNUP_CLOSES = new Date(REMINDERS.signupClosesAt);

export function signupClosed(now: Date): boolean {
  return now >= SIGNUP_CLOSES;
}

/**
 * What a run at this moment sends, or null when it sends nothing. The
 * preview Worker pins the day with CHECKIN_PREVIEW_DAY; there, everyone
 * who turned reminders on before the run gets that day's message once.
 */
export function reminderRun(env: Env, now: Date): ReminderRun | null {
  const preview = env.CHECKIN_PREVIEW_DAY;
  if (preview && /^[0-9]$/.test(preview)) {
    const message = messageForDay(todayNumber(preview, now));
    return message
      ? { day: message.day, date: message.date, message, dueBefore: now.toISOString() }
      : null;
  }
  const date = lasVegasDate(now);
  const message = REMINDERS.messages.find((candidate) => candidate.date === date);
  return message
    ? { day: message.day, date, message, dueBefore: `${date}${SEND_START_UTC}` }
    : null;
}

/**
 * The message a volunteer's test reminder shows: today's, day 1's before
 * the week, and day 8's after it.
 */
export function testMessage(env: Env, now: Date): ReminderMessage {
  const day = Math.min(Math.max(todayNumber(env.CHECKIN_PREVIEW_DAY, now), 1), 8);
  const message = messageForDay(day) ?? REMINDERS.messages[0];
  if (!message) throw new Error('src/data/reminders.json has no messages');
  return message;
}
