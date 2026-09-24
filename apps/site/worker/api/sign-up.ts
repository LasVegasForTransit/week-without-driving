import { partnerForRef } from '../../src/lib/partners';
import { signInCookies } from '../cookies';
import type { ApiContext, ContactType } from '../env';
import { MESSAGES, clientIp, json, problem, readJsonObject } from '../http';
import { deliverLink } from '../links';
import { LIMITS, overLimit } from '../rate-limit';
import { newSession } from '../session';
import { type BotCheck, checkTurnstile } from '../turnstile';
import { FIELD_MESSAGES, checkSignUp, parseContact } from '../validate';

/**
 * The two forms anyone can send: "Sign up to win" (POST /api/signup) and
 * "Get my link" (POST /api/link). Both are behind Turnstile and per-IP
 * rate limits, because both can send a message to a stranger's inbox.
 */

export const REPLIES = {
  checkAnswers: 'Check the answers above, then try again.',
  alreadySignedUp: 'You’ve already signed up with that. We sent your link to it.',
  linkSent: 'If that matches a sign-up, we sent your link.',
  tooManySignUps: 'Too many tries. Wait a minute, then try again.',
  tooManyLinks: 'Too many requests from this connection. Try again in an hour.',
  botFailed: 'We couldn’t check that you’re a person. Reload the page and try again.',
  botUnavailable: 'We couldn’t check the form just now. Try again in a minute.',
} as const;

interface OwnerRow {
  id: string;
  first_name: string;
  contact: string;
  contact_type: ContactType;
}

function findByContact(c: ApiContext, contact: string): Promise<OwnerRow | null> {
  return c.env.DB.prepare(
    'SELECT id, first_name, contact, contact_type FROM participants WHERE contact = ?1',
  )
    .bind(contact)
    .first<OwnerRow>();
}

function owner(row: OwnerRow) {
  return {
    id: row.id,
    firstName: row.first_name,
    contact: row.contact,
    contactType: row.contact_type,
  };
}

/**
 * Where a new sign-up came from: the partner whose link brought the person
 * (the page sends the ?ref= it kept for this tab), and whether a volunteer
 * signed them up on a shared device. It is written after the sign-up and
 * never blocks it: a slug that names no partner is dropped, and a database
 * still waiting for migration 0005 takes the sign-up without the credit.
 */
async function recordWhereFrom(
  c: ApiContext,
  id: string,
  body: Record<string, unknown>,
): Promise<void> {
  const partner = partnerForRef(body.ref)?.slug ?? null;
  const sharedDevice = body.sharedDevice === true;
  if (!partner && !sharedDevice) return;
  try {
    await c.env.DB.prepare('UPDATE participants SET partner = ?1, shared_device = ?2 WHERE id = ?3')
      .bind(partner, sharedDevice ? 1 : 0, id)
      .run();
  } catch (error) {
    console.error('Recording where a sign-up came from failed', error);
  }
}

function botProblem(check: Exclude<BotCheck, 'pass'>): Response {
  return check === 'fail' ? problem(403, REPLIES.botFailed) : problem(503, REPLIES.botUnavailable);
}

/**
 * Signing up with a phone number or email that already has a sign-up does
 * not sign this phone in, or anyone could take over a sign-up by typing a
 * stranger's email. The link goes to the owner instead.
 */
async function alreadySignedUp(c: ApiContext, row: OwnerRow): Promise<Response> {
  const preview = await deliverLink(c, owner(row), true);
  return json({ status: 'existing', message: REPLIES.alreadySignedUp, ...preview });
}

export async function signUp(c: ApiContext): Promise<Response> {
  const body = await readJsonObject(c.request);
  if (!body) return problem(400, MESSAGES.badRequest);
  const checked = checkSignUp(body);
  if ('errors' in checked) return problem(400, REPLIES.checkAnswers, { errors: checked.errors });

  const ip = clientIp(c.request);
  if (await overLimit(c.env.DB, LIMITS.signupPerIp, ip, c.now)) {
    return problem(429, REPLIES.tooManySignUps);
  }
  const bot = await checkTurnstile(c.env, body.turnstileToken, ip);
  if (bot !== 'pass') return botProblem(bot);

  const { details, contact } = checked;
  const existing = await findByContact(c, contact.value);
  if (existing) return alreadySignedUp(c, existing);

  const id = crypto.randomUUID();
  const stamp = c.now.toISOString();
  const session = await newSession(c.env.DB, id, c.now);
  const insert = c.env.DB.prepare(
    `INSERT INTO participants
       (id, first_name, contact, contact_type, zip, instagram, age, newsletter, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)`,
  ).bind(
    id,
    details.firstName,
    contact.value,
    contact.type,
    details.zip,
    details.instagram,
    details.age,
    details.newsletter ? 1 : 0,
    stamp,
  );
  try {
    // One transaction: the person and their session exist together or not at all.
    await c.env.DB.batch([insert, session.insert]);
  } catch (error) {
    // Two sign-ups with the same contact at the same moment: the second
    // loses the UNIQUE check and is treated like any repeat sign-up.
    const winner = await findByContact(c, contact.value);
    if (winner) return alreadySignedUp(c, winner);
    throw error;
  }
  await recordWhereFrom(c, id, body);

  const preview = await deliverLink(
    c,
    { id, firstName: details.firstName, contact: contact.value, contactType: contact.type },
    false,
  );
  return json(
    { status: 'created', redirect: '/my-week?welcome=1', ...preview },
    201,
    signInCookies(session.token),
  );
}

/**
 * "Get my link". The answer is the same whether or not the contact matches
 * a sign-up, so the form can't be used to find out who signed up.
 */
export async function sendMyLink(c: ApiContext): Promise<Response> {
  const body = await readJsonObject(c.request);
  if (!body) return problem(400, MESSAGES.badRequest);
  const contact = parseContact(typeof body.contact === 'string' ? body.contact : '');
  if (!contact) {
    return problem(400, FIELD_MESSAGES.contact, { errors: { contact: FIELD_MESSAGES.contact } });
  }

  const ip = clientIp(c.request);
  if (await overLimit(c.env.DB, LIMITS.linkPerIp, ip, c.now)) {
    return problem(429, REPLIES.tooManyLinks);
  }
  const bot = await checkTurnstile(c.env, body.turnstileToken, ip);
  if (bot !== 'pass') return botProblem(bot);

  const row = await findByContact(c, contact.value);
  const preview = row ? await deliverLink(c, owner(row), true) : {};
  return json({ message: REPLIES.linkSent, ...preview }, 202);
}
