import { MAX_NOTE_LENGTH, readModes } from '../api/week';
import type { Contact } from '../validate';
import { checkDetails, cleanHandle, isHandle, parseContact } from '../validate';
import { type AdminContext, dayDate, dayField, field } from './common';
import { type LoggedEntry, saveLogged } from './entries';
import { seeOther } from './html';
import { refused } from './respond';

/**
 * Entries that don't come through My week, logged by a volunteer: an
 * Instagram post that tags @lasvegasfortransit, and the free way to enter,
 * a handwritten card or letter sent by mail. Both follow the same rules as
 * every entry: one per entrant per day, October 1 to 8. Logging closes
 * once the winner has been drawn.
 */

// Mailed cards must arrive by October 13, 2026.
const LAST_RECEIVED = '2026-10-13';

export const LOG_PROBLEMS = {
  handle: 'Enter the Instagram handle: letters, numbers, periods and underscores, up to 30.',
  day: 'Pick a day from October 1 to 8.',
  tagLink: 'Paste the link to the post on instagram.com.',
  contact: 'Enter the phone number or email from the card, like 702-555-0123 or name@example.com.',
  received:
    'A card counts when it arrives on or after its postmark date and by October 13, 2026. Check the date received.',
  modes: 'Tick at least one way they got around.',
  note: `Keep the note to ${MAX_NOTE_LENGTH} characters.`,
  newDetails:
    'That phone number or email hasn’t signed up, so enter their first name and a Southern Nevada ZIP code.',
  already: 'They already have an entry for that day, so nothing was added.',
  closed: 'The winner has been drawn, so no more entries can be logged.',
} as const;

function isInstagramLink(text: string): boolean {
  try {
    const url = new URL(text);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === 'https:' &&
      text.length <= 500 &&
      (host === 'instagram.com' || host.endsWith('.instagram.com'))
    );
  } catch {
    return false;
  }
}

function tagProblem(handle: string, day: number | null, link: string): string | null {
  if (!isHandle(handle)) return LOG_PROBLEMS.handle;
  if (!day) return LOG_PROBLEMS.day;
  if (!isInstagramLink(link)) return LOG_PROBLEMS.tagLink;
  return null;
}

/**
 * POST /admin/tags: the handle as typed, the day, and the post. It becomes
 * that day's entry for the person who saved the handle, or a handle-only
 * entry when nobody did.
 */
export async function logTag(c: AdminContext, form: FormData): Promise<Response> {
  const handle = cleanHandle(field(form, 'handle'));
  const day = dayField(form, 'day');
  const link = field(form, 'link');
  const problem = tagProblem(handle, day, link);
  if (problem || !day)
    return refused(c, { form: 'tag', values: form }, problem ?? LOG_PROBLEMS.day);

  const found = await c.env.DB.prepare(
    `SELECT (SELECT count(*) FROM draws) AS draws,
       (SELECT id FROM participants WHERE instagram = ?1 ORDER BY created_at, id LIMIT 1) AS owner`,
  )
    .bind(handle)
    .first<{ draws: number; owner: string | null }>();
  if (found?.draws) return refused(c, { form: 'tag', values: form }, LOG_PROBLEMS.closed, 409);
  const owner = found?.owner ?? null;
  const entry: LoggedEntry = {
    participantId: owner,
    handle: owner ? null : handle,
    day,
    source: 'tag',
    postUrl: link,
    modes: '',
    hard: null,
    receivedOn: null,
  };
  if (!(await saveLogged(c, entry)))
    return refused(c, { form: 'tag', values: form }, LOG_PROBLEMS.already, 409);
  return seeOther(`/admin?notice=${owner ? 'tag-entered' : 'tag-handle'}#tag`);
}

interface MailInput {
  contact: Contact;
  day: number;
  received: string;
  modes: string;
  note: string | null;
}

function readMail(form: FormData): MailInput | string {
  const contact = parseContact(field(form, 'contact'));
  if (!contact) return LOG_PROBLEMS.contact;
  const day = dayField(form, 'day');
  if (!day) return LOG_PROBLEMS.day;
  const received = field(form, 'received');
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(received);
  if (!validDate || received < dayDate(day) || received > LAST_RECEIVED) {
    return LOG_PROBLEMS.received;
  }
  const modes = readModes(form);
  if (!modes) return LOG_PROBLEMS.modes;
  const note = field(form, 'note');
  if (note.length > MAX_NOTE_LENGTH) return LOG_PROBLEMS.note;
  return { contact, day, received, modes, note: note || null };
}

/**
 * A sign-up for someone who mailed a card without signing up: the same
 * checks as the sign-up form, and no session, link or message. Returns
 * their id, or null when the details don't pass.
 */
async function signUpByMail(c: AdminContext, form: FormData, contact: Contact) {
  const checked = checkDetails({
    firstName: field(form, 'firstName'),
    zip: field(form, 'zip'),
    instagram: '',
    age: field(form, 'age') === 'teen' ? 'teen' : 'adult',
    newsletter: false,
  });
  if ('errors' in checked) return null;
  const { details } = checked;
  const stamp = c.now.toISOString();
  // If someone signs up with this contact at the same moment, theirs stands.
  await c.env.DB.prepare(
    `INSERT INTO participants
       (id, first_name, contact, contact_type, zip, instagram, age, newsletter, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6, 0, ?7, ?7)
     ON CONFLICT (contact) DO NOTHING`,
  )
    .bind(
      crypto.randomUUID(),
      details.firstName,
      contact.value,
      contact.type,
      details.zip,
      details.age,
      stamp,
    )
    .run();
  const row = await c.env.DB.prepare('SELECT id FROM participants WHERE contact = ?1')
    .bind(contact.value)
    .first<{ id: string }>();
  return row?.id ?? null;
}

/**
 * POST /admin/mail: a mailed card or letter. It counts for the sign-up
 * with the card's phone number or email, and one is made when there is
 * none. It must be postmarked October 1 to 8 and arrive by October 13.
 */
export async function logMail(c: AdminContext, form: FormData): Promise<Response> {
  const mail = readMail(form);
  if (typeof mail === 'string') return refused(c, { form: 'mail', values: form }, mail);
  const found = await c.env.DB.prepare(
    `SELECT (SELECT count(*) FROM draws) AS draws,
       (SELECT id FROM participants WHERE contact = ?1) AS owner`,
  )
    .bind(mail.contact.value)
    .first<{ draws: number; owner: string | null }>();
  if (found?.draws) return refused(c, { form: 'mail', values: form }, LOG_PROBLEMS.closed, 409);
  const owner = found?.owner ?? (await signUpByMail(c, form, mail.contact));
  if (!owner) return refused(c, { form: 'mail', values: form }, LOG_PROBLEMS.newDetails);
  const saved = await saveLogged(c, {
    participantId: owner,
    handle: null,
    day: mail.day,
    source: 'mail',
    postUrl: null,
    modes: mail.modes,
    hard: mail.note,
    receivedOn: mail.received,
  });
  if (!saved) return refused(c, { form: 'mail', values: form }, LOG_PROBLEMS.already, 409);
  return seeOther(`/admin?notice=${found?.owner ? 'mail-entered' : 'mail-new'}#mail`);
}
