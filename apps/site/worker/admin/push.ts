import { type StoredSubscription, authorizer, pushHost, sendPush } from '../push/send';
import { loadVapid } from '../push/vapid';
import { testMessage } from '../reminders/schedule';
import { type AdminContext, counted, field, timeLabel } from './common';
import { type Html, html, seeOther } from './html';

/**
 * Browser reminders on /admin: how many browsers have them on, the newest
 * ones, and a "Send test reminder" button for each, so a volunteer can
 * check a phone before October 1. A test shows today's message (day 1's
 * before the week) straight away, whatever the date, and never counts as
 * that day's reminder. Nothing here shows a notification address or who
 * turned reminders on.
 */

export interface PushRow {
  id: string;
  created_at: string;
  last_sent_on: string | null;
}

/** How many of the newest subscriptions the page lists. */
export const PUSH_ROWS = 20;

export const PUSH_LIST_SQL = `SELECT id, created_at, last_sent_on FROM push_subscriptions
  ORDER BY created_at DESC, id DESC LIMIT ${PUSH_ROWS}`;

export const PUSH_COUNT_SQL = 'SELECT count(*) AS n FROM push_subscriptions';

export function pushSection(pushes: { rows: PushRow[]; total: number } | null): Html {
  if (!pushes) {
    return html`<section id="reminders">
      <h2>Browser reminders</h2>
      <p class="notice problem">
        The database doesn’t have the reminders table yet. A maintainer runs
        <code>pnpm bootstrap --production</code>, which adds it.
      </p>
    </section>`;
  }
  const { rows, total } = pushes;
  const items = rows.map(
    (row) =>
      html`<li class="entry">
        <p>
          Turned on ${timeLabel(row.created_at)} ·
          ${row.last_sent_on ? `last reminder ${row.last_sent_on}` : 'no reminder sent yet'}
        </p>
        <form method="post" action="/admin/push/test" class="actions">
          <input type="hidden" name="id" value="${row.id}" />
          <button type="submit">Send test reminder</button>
        </form>
      </li>`,
  );
  return html`<section id="reminders">
    <h2>Browser reminders</h2>
    <p>
      ${counted(total, 'browser has', 'browsers have')} daily reminders on. To test a phone, turn
      reminders on in My week on that phone, then press "Send test reminder" on the newest one
      below. It should show within a minute.
    </p>
    ${
      items.length > 0
        ? html`<ul class="plain">
            ${items}
          </ul>`
        : html`<p class="muted">Nobody has turned reminders on yet.</p>`
    }
  </section>`;
}

function back(notice: string): Response {
  return seeOther(`/admin?notice=${notice}#reminders`);
}

/** POST /admin/push/test: one reminder to one browser, now. */
export async function sendTestReminder(c: AdminContext, form: FormData): Promise<Response> {
  const vapid = await loadVapid(c.env);
  if (!vapid) return back('push-off');
  const subscription = await c.env.DB.prepare(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE id = ?1',
  )
    .bind(field(form, 'id'))
    .first<StoredSubscription>();
  if (!subscription) return back('push-missing');
  const { title, body } = testMessage(c.env, c.now);
  const result = await sendPush(subscription, { title, body }, authorizer(vapid, c.now));
  if (result.outcome === 'sent') return back('push-sent');
  if (result.outcome === 'gone') {
    await c.env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?1')
      .bind(subscription.id)
      .run();
    return back('push-gone');
  }
  console.warn(
    'A push service refused a test reminder',
    pushHost(subscription.endpoint),
    result.status,
  );
  return back('push-failed');
}
