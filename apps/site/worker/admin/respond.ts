import { type AdminContext, readFilters } from './common';
import type { Prefill } from './forms';
import { loadPage } from './queries';
import { type Notice, adminPage } from './view';

/**
 * The /admin page, with a line saying how the last action went. After a
 * form that worked, the page is loaded again with ?notice=<code>; a form
 * that was refused is shown again straight away, with what was typed.
 */

const done = (text: string): Notice => ({ text, problem: false });
const problem = (text: string): Notice => ({ text, problem: true });

export const NOTICES: Record<string, Notice> = {
  checked: done('Marked checked. It is in the draw.'),
  removed: done('Entry removed. It no longer counts; you can restore it under Removed.'),
  restored: done('Entry restored.'),
  stale: problem(
    'That entry changed after you loaded the page, or another volunteer already dealt with it. Look at it again.',
  ),
  'no-reason': problem('Pick why you are removing the entry.'),
  'tag-entered': done('Tag logged as that day’s entry for the person who saved the handle.'),
  'tag-handle': done('Nobody saved that handle at sign-up, so the tag is a handle-only entry.'),
  'mail-entered': done('Mailed entry logged for their sign-up.'),
  'mail-new': done(
    'Mailed entry logged. They hadn’t signed up, so they now have a sign-up with no account.',
  ),
  drawn: done('Winner drawn. Their details are under Draw the winner.'),
  'draw-confirm': problem('Tick the box to confirm, then draw.'),
  'draw-not-open': problem('The draw opens October 14, 2026.'),
  'draw-unchecked': problem('Some entries still need a check. Check or remove them, then draw.'),
  'draw-no-entries': problem('There are no checked entries to draw from.'),
  'draw-stale': problem('Another volunteer drew at the same moment. Their draw is shown below.'),
};

/** GET /admin. */
export async function showAdmin(c: AdminContext): Promise<Response> {
  const filters = readFilters(c.url.searchParams);
  const data = await loadPage(c, filters);
  const code = c.url.searchParams.get('notice') ?? '';
  const notice = Object.hasOwn(NOTICES, code) ? NOTICES[code] : undefined;
  return adminPage(c, filters, data, { notice });
}

/** The page again, with the form as it was sent and what's wrong with it. */
export async function refused(
  c: AdminContext,
  prefill: Prefill,
  text: string,
  status = 400,
): Promise<Response> {
  const filters = readFilters(new URLSearchParams());
  const data = await loadPage(c, filters);
  return adminPage(c, filters, data, { notice: problem(text), prefill, status });
}
