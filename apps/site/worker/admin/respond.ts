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
  checked: done('Entry approved.'),
  removed: done('Entry removed. It no longer counts; you can restore it under Removed.'),
  restored: done('Entry restored.'),
  stale: problem(
    'That entry changed after you loaded the page, or another volunteer already dealt with it. Look at it again.',
  ),
  'no-reason': problem('Pick why you are removing the entry.'),
  'tag-entered': done('Tag logged as that day’s entry for the person who saved the handle.'),
  drawn: done('Winner drawn. Contact details are below.'),
  'draw-confirm': problem('Tick the box to confirm, then draw.'),
  'draw-not-open': problem('The draw opens October 14, 2026.'),
  'draw-wait': problem(
    'The previous winner still has time to reply. Wait seven days after their draw.',
  ),
  'draw-unchecked': problem(
    'Some entries still await review. Approve or remove them before drawing.',
  ),
  'draw-no-entries': problem('There are no approved entries to draw from.'),
  'draw-stale': problem('Another volunteer drew at the same moment. Their draw is shown below.'),
  'push-sent': done('Test reminder sent. Check the phone to confirm it arrived.'),
  'push-gone': problem(
    'That browser no longer takes notifications, so it was taken off the list. Turn reminders on again on that phone, then try again.',
  ),
  'push-failed': problem('The test reminder could not be sent. Try again in a minute.'),
  'push-missing': problem('That browser isn’t on the list anymore. Reload the page.'),
  'push-off': problem(
    'Reminders are unavailable. Contact the site administrator before testing again.',
  ),
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
