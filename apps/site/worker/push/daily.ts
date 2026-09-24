import type { ApiEnv } from '../env';
import type { ReminderChannel } from '../reminders/channels';
import type { ReminderRun } from '../reminders/schedule';
import { type StoredSubscription, authorizer, pushHost, sendPush } from './send';
import { loadVapid } from './vapid';

/**
 * The browser notification channel's morning run. Its Cron Trigger fires
 * on the odd minutes from 8:01 to 8:59 am Las Vegas time, October 1 to 8.
 * Each run reads the next 40 subscriptions that are due, oldest first,
 * sends each one the day's notification, six at a time, and writes what
 * happened in one batch: that day's date on each one the push service
 * took, and the records of subscriptions the push service says are gone.
 * Anything else is logged and tried again on the next run. A run uses two
 * database round trips and at most 40 outgoing requests, well inside the
 * Workers Free plan's 50.
 */

export const PUSH_CRON = '1-59/2 15 1-8 10 *';

/**
 * The API preview only (wrangler.api-preview.jsonc): tries the send every
 * five minutes, with the preview's pinned day, so testers get a reminder
 * without waiting for October.
 */
export const PREVIEW_PUSH_CRON = '*/5 * * * *';

export const PUSHES_PER_RUN = 40;
export const PUSHES_AT_ONCE = 6;

/** Runs `work` over every item, never more than `limit` at a time. */
export async function eachLimited<T>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next] as T;
      next += 1;
      await work(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
}

const DUE_SQL = `
  SELECT id, endpoint, p256dh, auth FROM push_subscriptions
  WHERE created_at < ?1 AND (last_sent_on IS NULL OR last_sent_on <> ?2)
  ORDER BY created_at, id LIMIT ?3`;

async function sendDue(env: ApiEnv, run: ReminderRun, now: Date): Promise<void> {
  const vapid = await loadVapid(env);
  if (!vapid) {
    console.error('Browser reminders are off: the Worker has no usable VAPID_PRIVATE_KEY.');
    return;
  }
  const db = env.DB;
  const due = await db
    .prepare(DUE_SQL)
    .bind(run.dueBefore, run.date, PUSHES_PER_RUN)
    .all<StoredSubscription>();
  if (due.results.length === 0) return;

  const notice = { title: run.message.title, body: run.message.body };
  const authorize = authorizer(vapid, now);
  const sent: string[] = [];
  const gone: string[] = [];
  let failed = 0;
  await eachLimited(due.results, PUSHES_AT_ONCE, async (subscription) => {
    const result = await sendPush(subscription, notice, authorize);
    if (result.outcome === 'sent') sent.push(subscription.id);
    else if (result.outcome === 'gone') gone.push(subscription.id);
    else {
      failed += 1;
      console.warn(
        'A push service refused a reminder',
        pushHost(subscription.endpoint),
        result.status,
      );
    }
  });

  const writes: D1PreparedStatement[] = [];
  if (sent.length > 0) {
    writes.push(
      db
        .prepare(
          'UPDATE push_subscriptions SET last_sent_on = ?1 WHERE id IN (SELECT value FROM json_each(?2))',
        )
        .bind(run.date, JSON.stringify(sent)),
    );
  }
  if (gone.length > 0) {
    writes.push(
      db
        .prepare('DELETE FROM push_subscriptions WHERE id IN (SELECT value FROM json_each(?1))')
        .bind(JSON.stringify(gone)),
    );
  }
  if (writes.length > 0) await db.batch(writes);
  console.log(
    `Day ${run.day} reminders: ${sent.length} sent, ${gone.length} expired, ${failed} to try again.`,
  );
}

export const pushChannel: ReminderChannel = {
  name: 'browser notifications',
  crons: [PUSH_CRON, PREVIEW_PUSH_CRON],
  sendDue,
};
