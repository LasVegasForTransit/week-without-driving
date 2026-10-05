import type { ApiContext, Participant } from '../env';
import { clientIp, json, problem, readJsonObject } from '../http';
import { LIMITS, overLimit } from '../rate-limit';
import { signupClosed } from '../reminders/schedule';
import { smsConfigured, twilioRequest } from '../sms/twilio';
import { checkTurnstile } from '../turnstile';
import { maskContact, parseContact } from '../validate';

interface Confirmation {
  phone: string;
  attempt_id: string;
  verification_sid: string | null;
}

function unavailable(): Response {
  return problem(503, 'Text reminders are unavailable. Please try again later.');
}
function closed(): Response {
  return problem(410, 'Text reminders have ended. Thanks for taking part!');
}
function limited(): Response {
  return problem(429, 'Too many tries. Wait an hour before trying again.');
}

async function requestGuard(
  c: ApiContext,
  me: Participant,
  phone: string,
  token: unknown,
): Promise<Response | null> {
  if (await overLimit(c.env.DB, LIMITS.smsPerIp, clientIp(c.request), c.now)) return limited();
  const bot = await checkTurnstile(c.env, token, clientIp(c.request));
  if (bot !== 'pass') return problem(bot === 'fail' ? 403 : 503, 'Please retry the bot check.');
  for (const [limit, subject] of [
    [LIMITS.smsPerParticipant, me.id],
    [LIMITS.smsPerPhone, phone],
    [LIMITS.smsPerDay, 'all'],
  ] as const) {
    if (await overLimit(c.env.DB, limit, subject, c.now)) return limited();
  }
  return null;
}

export async function smsStatus(c: ApiContext, me: Participant): Promise<Response> {
  const available = smsConfigured(c.env);
  if (!available) return json({ available: false, subscribed: false, pending: false });
  const subscription = await c.env.DB.prepare(
    'SELECT phone FROM sms_subscriptions WHERE participant_id = ?1',
  )
    .bind(me.id)
    .first<{ phone: string }>();
  const pending = await c.env.DB.prepare(
    'SELECT phone FROM sms_verifications WHERE participant_id = ?1 AND expires_at > ?2 AND verification_sid IS NOT NULL',
  )
    .bind(me.id, c.now.toISOString())
    .first<{ phone: string }>();
  const phone = subscription?.phone ?? pending?.phone;
  return json({
    available: !signupClosed(c.now),
    subscribed: Boolean(subscription),
    pending: Boolean(pending),
    phoneMasked: phone ? maskContact(phone, 'phone') : null,
  });
}

export async function requestSms(c: ApiContext, me: Participant): Promise<Response> {
  if (!smsConfigured(c.env)) return unavailable();
  if (signupClosed(c.now)) return closed();
  const body = await readJsonObject(c.request);
  const phone = typeof body?.phone === 'string' ? parseContact(body.phone) : null;
  if (body?.consent !== true || phone?.type !== 'phone')
    return problem(400, 'Enter your own US mobile number and choose text reminders.');
  const rejected = await requestGuard(c, me, phone.value, body.turnstileToken);
  if (rejected) return rejected;
  const attempt = crypto.randomUUID();
  const expires = new Date(c.now.getTime() + 10 * 60_000).toISOString();
  await c.env.DB.prepare(
    `INSERT INTO sms_verifications
    (participant_id, phone, attempt_id, consented_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)
    ON CONFLICT(participant_id) DO UPDATE SET phone = excluded.phone, attempt_id = excluded.attempt_id,
    verification_sid = NULL, consented_at = excluded.consented_at, expires_at = excluded.expires_at`,
  )
    .bind(me.id, phone.value, attempt, c.now.toISOString(), expires)
    .run();
  const reply = await twilioRequest(c.env, 'Verifications', { To: phone.value, Channel: 'sms' });
  if (
    !reply.ok ||
    reply.data.status !== 'pending' ||
    typeof reply.data.sid !== 'string' ||
    reply.data.to !== phone.value
  )
    return unavailable();
  const saved = await c.env.DB.prepare(
    'UPDATE sms_verifications SET verification_sid = ?1 WHERE participant_id = ?2 AND attempt_id = ?3',
  )
    .bind(reply.data.sid, me.id, attempt)
    .run();
  return saved.meta.changes === 1
    ? json({ pending: true })
    : problem(409, 'That request was canceled. Try again.');
}

async function saveSubscription(
  c: ApiContext,
  me: Participant,
  pending: Confirmation,
): Promise<Response> {
  const results = await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO sms_subscriptions (participant_id, phone, consented_at, confirmed_at)
      SELECT participant_id, phone, consented_at, ?3 FROM sms_verifications
      WHERE participant_id = ?1 AND attempt_id = ?2 AND expires_at > ?3 AND verification_sid = ?4
      ON CONFLICT(participant_id) DO UPDATE SET phone = excluded.phone, consented_at = excluded.consented_at,
      confirmed_at = excluded.confirmed_at, last_sent_on = NULL, claim = NULL, claimed_at = NULL`,
    ).bind(me.id, pending.attempt_id, c.now.toISOString(), pending.verification_sid),
    c.env.DB.prepare(
      'DELETE FROM sms_verifications WHERE participant_id = ?1 AND attempt_id = ?2',
    ).bind(me.id, pending.attempt_id),
  ]);
  return results[0]?.meta.changes === 1
    ? json({ subscribed: true })
    : problem(409, 'That request was canceled. Try again.');
}

export async function confirmSms(c: ApiContext, me: Participant): Promise<Response> {
  if (!smsConfigured(c.env)) return unavailable();
  if (signupClosed(c.now)) return closed();
  const body = await readJsonObject(c.request);
  if (typeof body?.code !== 'string' || !/^\d{6}$/.test(body.code))
    return problem(400, 'Enter the six-digit code from the text.');
  if (await overLimit(c.env.DB, LIMITS.smsCodeChecks, me.id, c.now)) return limited();
  const pending = await c.env.DB.prepare(
    'SELECT phone, attempt_id, verification_sid FROM sms_verifications WHERE participant_id = ?1 AND expires_at > ?2',
  )
    .bind(me.id, c.now.toISOString())
    .first<Confirmation>();
  if (!pending?.verification_sid) return problem(400, 'Request a new confirmation code.');
  const other = await c.env.DB.prepare(
    'SELECT participant_id FROM sms_subscriptions WHERE phone = ?1 AND participant_id <> ?2',
  )
    .bind(pending.phone, me.id)
    .first();
  if (other)
    return problem(
      409,
      'This number already has reminders. Reply STOP to end them before joining again.',
    );
  const reply = await twilioRequest(c.env, 'VerificationCheck', {
    VerificationSid: pending.verification_sid,
    Code: body.code,
  });
  if (!reply.ok && reply.status !== 404) return unavailable();
  if (
    reply.data.status !== 'approved' ||
    reply.data.sid !== pending.verification_sid ||
    reply.data.to !== pending.phone
  )
    return problem(400, 'That code did not match or expired. Try again.');
  return saveSubscription(c, me, pending);
}

export async function stopSms(c: ApiContext, me: Participant): Promise<Response> {
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM sms_subscriptions WHERE participant_id = ?1').bind(me.id),
    c.env.DB.prepare('DELETE FROM sms_verifications WHERE participant_id = ?1').bind(me.id),
  ]);
  return json({ subscribed: false, pending: false });
}
