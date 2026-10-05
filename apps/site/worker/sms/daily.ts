import type { ApiEnv, Env } from '../env';
import { reminderRun, type ReminderRun } from '../reminders/schedule';
import { SIGNED_IN_UNTIL } from '../time';
import { newShortToken, sha256 } from '../tokens';
import { smsConfigured, twilioRequest } from './twilio';

interface Subscriber {
  participant_id: string;
  phone: string;
}

async function claimed(c: ApiEnv, person: Subscriber, claim: string): Promise<boolean> {
  return Boolean(
    await c.DB.prepare(
      'SELECT 1 FROM sms_subscriptions WHERE participant_id = ?1 AND phone = ?2 AND claim = ?3',
    )
      .bind(person.participant_id, person.phone, claim)
      .first(),
  );
}

interface Delivery {
  participant: string;
  hash: string;
  sent: boolean;
  blocked: boolean;
}

async function recordDeliveries(
  env: ApiEnv,
  deliveries: Delivery[],
  claim: string,
  date: string,
): Promise<void> {
  const data = JSON.stringify(deliveries);
  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM sms_subscriptions WHERE claim = ?1 AND participant_id IN
      (SELECT json_extract(value, '$.participant') FROM json_each(?2) WHERE json_extract(value, '$.blocked') = 1)`,
    ).bind(claim, data),
    env.DB.prepare(
      `UPDATE sms_subscriptions SET last_sent_on = CASE WHEN participant_id IN
      (SELECT json_extract(value, '$.participant') FROM json_each(?2) WHERE json_extract(value, '$.sent') = 1)
      THEN ?3 ELSE last_sent_on END, claim = NULL, claimed_at = NULL
      WHERE claim = ?1 AND participant_id IN (SELECT json_extract(value, '$.participant') FROM json_each(?2))`,
    ).bind(claim, data, date),
    env.DB.prepare(
      `UPDATE link_tokens SET delivery = CASE WHEN token_hash IN
      (SELECT json_extract(value, '$.hash') FROM json_each(?1) WHERE json_extract(value, '$.sent') = 1)
      THEN 'sent' ELSE 'failed' END
      WHERE token_hash IN (SELECT json_extract(value, '$.hash') FROM json_each(?1))`,
    ).bind(data),
  ]);
}

async function sendDue(env: ApiEnv, run: ReminderRun, now: Date, budget = 40): Promise<void> {
  if (!smsConfigured(env)) return;
  // Each recipient needs an ownership check and an outbound request. Reserve
  // ten subrequests for the event sender and this job's setup/batch writes.
  const limit = Math.min(20, Math.floor(budget / 2));
  if (limit <= 0) return;
  const claim = crypto.randomUUID();
  const stale = new Date(now.getTime() - 3 * 60_000).toISOString();
  const due = await env.DB.prepare(
    `UPDATE sms_subscriptions SET claim = ?1, claimed_at = ?2
    WHERE participant_id IN (SELECT participant_id FROM sms_subscriptions
      WHERE confirmed_at < ?3 AND (last_sent_on IS NULL OR last_sent_on <> ?4)
      AND (claim IS NULL OR claimed_at <= ?5) ORDER BY confirmed_at, participant_id LIMIT ?6)
    RETURNING participant_id, phone`,
  )
    .bind(claim, now.toISOString(), run.dueBefore, run.date, stale, limit)
    .all<Subscriber>();
  if (due.results.length === 0) return;
  const origin = env.SMS_ORIGIN;
  const messages = await Promise.all(
    due.results.map(async (person) => {
      const token = newShortToken();
      return { person, token, hash: await sha256(token) };
    }),
  );
  await env.DB.prepare(
    `INSERT INTO link_tokens
    (token_hash, participant_id, channel, delivery, created_at, expires_at)
    SELECT json_extract(value, '$.hash'), json_extract(value, '$.person.participant_id'),
      'phone', 'pending', ?2, ?3 FROM json_each(?1)`,
  )
    .bind(
      JSON.stringify(messages.map(({ person, hash }) => ({ person, hash }))),
      now.toISOString(),
      SIGNED_IN_UNTIL.toISOString(),
    )
    .run();
  const deliveries: Delivery[] = [];
  for (const { person, token, hash } of messages) {
    // A cancellation or a new confirmation after the batch was claimed wins.
    if (!(await claimed(env, person, claim))) continue;
    const reply = await twilioRequest(env, 'Messages', {
      MessagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID ?? '',
      To: person.phone,
      Body: run.message.text.replace('{link}', `${origin}/open#${token}`),
      StatusCallback: `${origin}/api/sms/webhook`,
    });
    deliveries.push({
      participant: person.participant_id,
      hash,
      sent:
        reply.ok &&
        typeof reply.data.sid === 'string' &&
        ['queued', 'accepted', 'sending', 'sent', 'delivered'].includes(String(reply.data.status)),
      blocked: reply.data.code === 21610,
    });
  }
  if (deliveries.length > 0) await recordDeliveries(env, deliveries, claim, run.date);
}

/** The existing five-minute trigger dispatches this explicitly consented channel. */
export async function sendSmsReminders(env: Env, now: Date, budget: number): Promise<void> {
  if (!env.DB || budget <= 0 || !smsConfigured(env)) return;
  const run = reminderRun(env, now);
  if (run) await sendDue({ ...env, DB: env.DB }, run, now, budget);
}
