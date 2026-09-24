import type { ApiEnv, Env } from '../env';
import { pushChannel } from '../push/daily';
import { type ReminderRun, reminderRun } from './schedule';

/**
 * The ways a daily reminder reaches someone. Each channel keeps its own
 * list of people who turned it on, runs on its own Cron Trigger, and
 * sends the day's message from src/data/reminders.json (reminderRun picks
 * it), so channels never wait for each other.
 *
 * Browser notifications are the only channel today. Text messages are the
 * next: a text channel adds its own table of confirmed numbers and a
 * ReminderChannel here whose Cron Trigger fires on the even minutes of the
 * same hour (added to wrangler.jsonc), and sends each day's `text` with the
 * person's own link in place of {link}.
 */

export interface ReminderChannel {
  /** For logs. */
  name: string;
  /** The Cron Triggers that run this channel's morning send. */
  crons: readonly string[];
  /** Sends the run's message to the next batch of people who are due it. */
  sendDue(env: ApiEnv, run: ReminderRun, now: Date): Promise<void>;
}

export const CHANNELS: readonly ReminderChannel[] = [pushChannel];

/** The channel a Cron Trigger belongs to, if any. */
export function channelFor(cron: string): ReminderChannel | undefined {
  return CHANNELS.find((channel) => channel.crons.includes(cron));
}

/** One channel's run for a Cron Trigger at this moment. Nothing happens off schedule. */
export async function sendReminders(channel: ReminderChannel, env: Env, now: Date): Promise<void> {
  const db = env.DB;
  if (!db) return;
  const run = reminderRun(env, now);
  if (!run) return;
  await channel.sendDue({ ...env, DB: db }, run, now);
}
