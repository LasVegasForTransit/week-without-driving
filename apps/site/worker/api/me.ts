import { signOutCookies } from '../cookies';
import type { ApiContext, Participant } from '../env';
import { MESSAGES, json, problem, readJsonObject } from '../http';
import { sessionHash } from '../session';
import { todayNumber } from '../time';
import { checkDetails, maskContact } from '../validate';
import { REPLIES } from './sign-up';
import { listPlans } from './plans';
import { listTrips } from './week';

/**
 * My week's own data: GET and PATCH /api/me, and POST /api/signout. The
 * phone number or email is never sent back in full, only masked.
 */

const CONTACT_IS_FIXED =
  'You can’t change your sign-up contact here. Email wwd@lasvegasfortransit.org for help.';

export async function getMe(c: ApiContext, me: Participant): Promise<Response> {
  const trips = await listTrips(c, me);
  const plans = await listPlans(c, me);
  return json({
    firstName: me.firstName,
    contactMasked: maskContact(me.contact, me.contactType),
    contactType: me.contactType,
    zip: me.zip,
    county: me.county,
    instagram: me.instagram,
    age: me.age,
    days: trips.map((trip) => trip.day),
    trips,
    plans,
    today: todayNumber(c.env.CHECKIN_PREVIEW_DAY, c.now),
    eventRemindersEnabled: c.env.EVENT_REMINDERS_ENABLED === 'true',
  });
}

/** Changes any of the details except the contact; missing fields keep their value. */
export async function updateMe(c: ApiContext, me: Participant): Promise<Response> {
  const body = await readJsonObject(c.request);
  if (!body) return problem(400, MESSAGES.badRequest);
  if ('contact' in body) return problem(400, CONTACT_IS_FIXED);
  const checked = checkDetails({
    firstName: me.firstName,
    zip: me.zip,
    county: me.county,
    instagram: me.instagram ?? '',
    age: me.age,
    ...body,
  });
  if ('errors' in checked) return problem(400, REPLIES.checkAnswers, { errors: checked.errors });
  const { details } = checked;
  await c.env.DB.prepare(
    `UPDATE participants
     SET first_name = ?1, zip = ?2, county = ?3, instagram = ?4, age = ?5, updated_at = ?6
     WHERE id = ?7`,
  )
    .bind(
      details.firstName,
      details.zip,
      details.county,
      details.instagram,
      details.age,
      c.now.toISOString(),
      me.id,
    )
    .run();
  return json(details);
}

/** Signs this phone out: its session is deleted, other phones stay signed in. */
export async function signOut(c: ApiContext): Promise<Response> {
  const hash = await sessionHash(c.request);
  if (hash) {
    const body = await readJsonObject(c.request);
    const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : null;
    await c.env.DB.batch([
      c.env.DB.prepare(
        `DELETE FROM push_subscriptions
         WHERE session_hash = ?1 OR (session_hash IS NULL AND endpoint = ?2
           AND participant_id = (SELECT participant_id FROM sessions WHERE token_hash = ?1))`,
      ).bind(hash, endpoint),
      c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(hash),
    ]);
  }
  return json({ signedOut: true }, 200, signOutCookies());
}
