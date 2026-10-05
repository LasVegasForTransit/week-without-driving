import type { Env } from '../env';
import { eachLimited, PUSHES_AT_ONCE, PUSHES_PER_RUN } from './batch';
import { TTL_SECONDS, type StoredSubscription, authorizer, pushHost, sendPush } from './send';
import { loadVapid } from './vapid';

/** One five-minute clock, limited in code to the campaign's reminder window. */
export const PLAN_PUSH_CRONS = ['2-59/5 * * * *'] as const;

const CAMPAIGN_REMINDERS_START = Date.parse('2026-09-30T00:00:00.000Z');
const CAMPAIGN_REMINDERS_END = Date.parse('2026-10-09T07:00:00.000Z');

interface DuePlan extends StoredSubscription {
  plan_id: string;
  destination: string;
  event_name: string | null;
  starts_at: string;
}

interface SentPair {
  plan: string;
  subscription: string;
}

// A failed Worker run can leave a claim behind. A new run may take it after
// three minutes; 40 pushes at six at a time with ten-second timeouts finish
// within 70 seconds. A successful send replaces the claim with its sent time.
const CLAIM_LEASE_MS = 3 * 60_000;

const CLAIM_SQL = `
  INSERT INTO trip_plan_pushes (plan_id, subscription_id, sent_at)
  SELECT p.id, s.id, ?3
  FROM trip_plans p
  JOIN push_subscriptions s ON s.participant_id = p.participant_id
  LEFT JOIN trip_plan_pushes sent ON sent.plan_id = p.id AND sent.subscription_id = s.id
  WHERE p.reminder_at IS NOT NULL AND p.reminder_at <= ?1
    AND p.starts_at > ?1
    AND (sent.plan_id IS NULL OR
      (sent.sent_at LIKE 'pending:%' AND substr(sent.sent_at, 9, 24) <= ?2))
  ORDER BY p.reminder_at, p.id, s.created_at, s.id
  LIMIT ?4
  ON CONFLICT(plan_id, subscription_id) DO UPDATE SET sent_at = excluded.sent_at
  WHERE trip_plan_pushes.sent_at LIKE 'pending:%'
    AND substr(trip_plan_pushes.sent_at, 9, 24) <= ?2`;

const CLAIMED_SQL = `
  SELECT p.id AS plan_id, p.destination, p.event_name, p.starts_at,
         s.id, s.endpoint, s.p256dh, s.auth
  FROM trip_plan_pushes claim
  JOIN trip_plans p ON p.id = claim.plan_id
  JOIN push_subscriptions s ON s.id = claim.subscription_id
  WHERE claim.sent_at = ?1 AND p.reminder_at <= ?2 AND p.starts_at > ?2
  ORDER BY p.reminder_at, p.id, s.created_at, s.id`;

const PAIR_MATCH = `EXISTS (
  SELECT 1 FROM json_each(?3) pairs
  WHERE json_extract(pairs.value, '$.plan') = trip_plan_pushes.plan_id
    AND json_extract(pairs.value, '$.subscription') = trip_plan_pushes.subscription_id
)`;

function notice(plan: DuePlan): { title: string; body: string; tag: string } {
  const event = plan.event_name ?? plan.destination;
  return {
    title: `Coming up: ${event.slice(0, 70)}`,
    body: `Your plan to ${plan.destination} is coming up. Open My week for your trip.`,
    tag: `wwd-plan-${plan.plan_id}`,
  };
}

function timeToEvent(plan: DuePlan, now: Date): number {
  const seconds = Math.floor((Date.parse(plan.starts_at) - now.getTime()) / 1000);
  return Math.max(1, Math.min(TTL_SECONDS, seconds));
}

function currentTime(runStarted: Date): Date {
  return new Date(Math.max(runStarted.getTime(), Date.now()));
}

/** Sends only explicitly requested plan notifications after the release switch is enabled. */
export async function sendPlanReminders(env: Env, now: Date): Promise<number> {
  if (env.EVENT_REMINDERS_ENABLED !== 'true' || !env.DB) return 0;
  if (now.getTime() < CAMPAIGN_REMINDERS_START || now.getTime() >= CAMPAIGN_REMINDERS_END) return 0;
  const vapid = await loadVapid(env);
  if (!vapid) return 0;
  const db = env.DB;
  const nowIso = now.toISOString();
  const staleBefore = new Date(now.getTime() - CLAIM_LEASE_MS).toISOString();
  const claim = `pending:${nowIso}:${crypto.randomUUID()}`;
  await db.prepare(CLAIM_SQL).bind(nowIso, staleBefore, claim, PUSHES_PER_RUN).run();
  const due = await db.prepare(CLAIMED_SQL).bind(claim, nowIso).all<DuePlan>();
  if (due.results.length === 0) return 0;

  const authorize = authorizer(vapid, now);
  const sent: SentPair[] = [];
  const retry: SentPair[] = [];
  const gone: string[] = [];
  await eachLimited(due.results, PUSHES_AT_ONCE, async (plan) => {
    const pair = { plan: plan.plan_id, subscription: plan.id };
    const beforeSend = currentTime(now);
    if (Date.parse(plan.starts_at) <= beforeSend.getTime()) {
      retry.push(pair);
      return;
    }
    const result = await sendPush(plan, notice(plan), authorize, timeToEvent(plan, beforeSend));
    if (result.outcome === 'sent') sent.push(pair);
    else if (result.outcome === 'gone') gone.push(plan.id);
    else {
      retry.push(pair);
      console.warn(
        'A push service refused an event reminder',
        pushHost(plan.endpoint),
        result.status,
      );
    }
  });

  const writes: D1PreparedStatement[] = [];
  if (sent.length > 0) {
    writes.push(
      db
        .prepare(
          `UPDATE trip_plan_pushes SET sent_at = ?1
           WHERE sent_at = ?2 AND ${PAIR_MATCH}`,
        )
        .bind(nowIso, claim, JSON.stringify(sent)),
    );
  }
  if (retry.length > 0) {
    writes.push(
      db
        .prepare(`DELETE FROM trip_plan_pushes WHERE sent_at = ?1 AND ${PAIR_MATCH}`)
        .bind(claim, null, JSON.stringify(retry)),
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
    `Event reminders: ${sent.length} sent, ${gone.length} expired, ${retry.length} to retry.`,
  );
  // Reserve the attempted batch, including failures, before sharing this run's
  // remaining subrequest budget with daily reminders.
  return due.results.length;
}
