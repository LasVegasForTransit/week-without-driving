import type { ApiContext, Participant } from '../env';
import { MESSAGES, json, problem, readJsonObject } from '../http';
import { importBrowserKey } from '../push/encrypt';
import { fromBase64url } from '../push/bytes';
import { isPushEndpoint } from '../push/send';
import { loadVapid } from '../push/vapid';
import { signupClosed } from '../reminders/schedule';

/**
 * Turning browser notifications on and off from My week:
 *
 * - GET /api/push/key: the public key a browser subscribes with.
 * - POST /api/push/subscribe (signed in): saves this browser's
 *   subscription for the person signed in. The same browser again only
 *   moves it to whoever is signed in now.
 * - POST /api/push/unsubscribe: deletes a subscription by its endpoint. It
 *   needs no sign-in, because only the browser that holds the endpoint
 *   knows it, and stopping reminders must work even after signing out.
 */

export const PUSH_REPLIES = {
  notSetUp: 'Notifications aren’t set up yet. Try again later.',
  badSubscription: 'This browser sent a notification address we can’t use.',
  closed: 'Daily reminders have ended. Thanks for taking part!',
} as const;

// Push services' addresses are a few hundred characters; this leaves room.
const MAX_ENDPOINT_LENGTH = 2048;

interface Subscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** The subscription as the browser sent it, or null when it can't be used. */
async function readSubscription(body: Record<string, unknown>): Promise<Subscription | null> {
  const { endpoint, keys } = body;
  if (typeof endpoint !== 'string' || endpoint.length > MAX_ENDPOINT_LENGTH) return null;
  if (!isPushEndpoint(endpoint) || keys === null || typeof keys !== 'object') return null;
  const { p256dh, auth } = keys as Record<string, unknown>;
  if (typeof p256dh !== 'string' || typeof auth !== 'string') return null;
  if (fromBase64url(auth)?.length !== 16 || !(await importBrowserKey(p256dh))) return null;
  return { endpoint, p256dh, auth };
}

export async function pushKey(c: ApiContext): Promise<Response> {
  const vapid = await loadVapid(c.env);
  if (!vapid) return problem(503, PUSH_REPLIES.notSetUp);
  return json({ publicKey: vapid.publicKey });
}

export async function subscribe(c: ApiContext, me: Participant): Promise<Response> {
  if (signupClosed(c.now)) return problem(410, PUSH_REPLIES.closed);
  const body = await readJsonObject(c.request);
  if (!body) return problem(400, MESSAGES.badRequest);
  const subscription = await readSubscription(body);
  if (!subscription) return problem(400, PUSH_REPLIES.badSubscription);
  const id = crypto.randomUUID();
  const saved = await c.env.DB.prepare(
    `INSERT INTO push_subscriptions (id, participant_id, endpoint, p256dh, auth, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT (endpoint) DO UPDATE SET participant_id = excluded.participant_id
     RETURNING id`,
  )
    .bind(
      id,
      me.id,
      subscription.endpoint,
      subscription.p256dh,
      subscription.auth,
      c.now.toISOString(),
    )
    .first<{ id: string }>();
  return json({ ok: true }, saved?.id === id ? 201 : 200);
}

export async function unsubscribe(c: ApiContext): Promise<Response> {
  const body = await readJsonObject(c.request);
  const endpoint = body?.endpoint;
  if (typeof endpoint !== 'string' || !endpoint) return problem(400, MESSAGES.badRequest);
  await c.env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?1').bind(endpoint).run();
  return json({ ok: true });
}
