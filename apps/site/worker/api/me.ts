import { signOutCookies } from '../cookies';
import type { ApiContext, Participant } from '../env';
import { MESSAGES, json, problem, readJsonObject } from '../http';
import { sessionHash } from '../session';
import { todayNumber } from '../time';
import { checkDetails, maskContact } from '../validate';
import { REPLIES } from './sign-up';
import { listTrips } from './week';

/**
 * My week's own data: GET and PATCH /api/me, and POST /api/signout. The
 * phone number or email is never sent back in full, only masked.
 */

const CONTACT_IS_FIXED =
  'You can’t change your phone number or email here. Email wwd@lasvegasfortransit.org and we’ll change it for you.';

export async function getMe(c: ApiContext, me: Participant): Promise<Response> {
  const trips = await listTrips(c, me);
  return json({
    firstName: me.firstName,
    contactMasked: maskContact(me.contact, me.contactType),
    contactType: me.contactType,
    zip: me.zip,
    instagram: me.instagram,
    age: me.age,
    newsletter: me.newsletter,
    days: trips.map((trip) => trip.day),
    trips,
    today: todayNumber(c.env.CHECKIN_PREVIEW_DAY, c.now),
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
    instagram: me.instagram ?? '',
    age: me.age,
    newsletter: me.newsletter,
    ...body,
  });
  if ('errors' in checked) return problem(400, REPLIES.checkAnswers, { errors: checked.errors });
  const { details } = checked;
  await c.env.DB.prepare(
    `UPDATE participants
     SET first_name = ?1, zip = ?2, instagram = ?3, age = ?4, newsletter = ?5, updated_at = ?6
     WHERE id = ?7`,
  )
    .bind(
      details.firstName,
      details.zip,
      details.instagram,
      details.age,
      details.newsletter ? 1 : 0,
      c.now.toISOString(),
      me.id,
    )
    .run();
  return json(details);
}

/** Signs this phone out: its session is deleted, other phones stay signed in. */
export async function signOut(c: ApiContext): Promise<Response> {
  const hash = await sessionHash(c.request);
  if (hash) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(hash).run();
  return json({ signedOut: true }, 200, signOutCookies());
}
