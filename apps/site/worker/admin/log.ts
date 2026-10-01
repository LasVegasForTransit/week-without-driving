import { cleanHandle, isHandle } from '../validate';
import { type AdminContext, dayField, field } from './common';
import { saveLogged } from './entries';
import { seeOther } from './html';
import { refused } from './respond';

/** Volunteers can log a tag only for someone who registered that handle. */
export const LOG_PROBLEMS = {
  handle: 'Enter the Instagram handle: letters, numbers, periods and underscores, up to 30.',
  day: 'Pick a day from October 1 to 8.',
  tagLink: 'If you add a link, use a post on instagram.com.',
  tripConfirmed:
    'Check the registered handle, LVBT tag, posted day, trip and giveaway disclosure before logging.',
  unregistered:
    'That handle is not registered by an eligible participant. Ask them to enter in My week.',
  ambiguous:
    'More than one eligible participant registered that handle. Ask them to enter in My week.',
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

/** POST /admin/tags: the tag counts for the participant who saved this handle. */
export async function logTag(c: AdminContext, form: FormData): Promise<Response> {
  const handle = cleanHandle(field(form, 'handle'));
  const day = dayField(form, 'day');
  const link = field(form, 'link');
  if (!isHandle(handle)) return refused(c, { form: 'tag', values: form }, LOG_PROBLEMS.handle);
  if (!day) return refused(c, { form: 'tag', values: form }, LOG_PROBLEMS.day);
  if (link && !isInstagramLink(link))
    return refused(c, { form: 'tag', values: form }, LOG_PROBLEMS.tagLink);
  if (field(form, 'trip-confirmed') !== 'yes')
    return refused(c, { form: 'tag', values: form }, LOG_PROBLEMS.tripConfirmed);

  const found = await c.env.DB.prepare(
    `SELECT (SELECT count(*) FROM draws) AS draws,
       (SELECT count(*) FROM participants
        WHERE instagram = ?1 AND county IN ('Clark', 'Esmeralda', 'Lincoln', 'Nye')
          AND contact_type = 'email' AND age IN ('adult', 'teen')) AS owners,
       (SELECT id FROM participants
        WHERE instagram = ?1 AND county IN ('Clark', 'Esmeralda', 'Lincoln', 'Nye')
          AND contact_type = 'email' AND age IN ('adult', 'teen')
        ORDER BY created_at, id LIMIT 1) AS owner`,
  )
    .bind(handle)
    .first<{ draws: number; owners: number; owner: string | null }>();
  if (found?.draws) return refused(c, { form: 'tag', values: form }, LOG_PROBLEMS.closed, 409);
  if (!found?.owner) return refused(c, { form: 'tag', values: form }, LOG_PROBLEMS.unregistered);
  if (found.owners !== 1) return refused(c, { form: 'tag', values: form }, LOG_PROBLEMS.ambiguous);
  if (
    !(await saveLogged(c, {
      participantId: found.owner,
      day,
      source: 'tag',
      postUrl: link || null,
      modes: '',
      hard: null,
      receivedOn: null,
    }))
  )
    return refused(c, { form: 'tag', values: form }, LOG_PROBLEMS.already, 409);
  return seeOther('/admin?notice=tag-entered#admin-notice');
}
