import { maskContact } from '../validate';
import {
  REMOVAL_REASONS,
  SOURCE_LABELS,
  dayLabel,
  isRemovalReason,
  modesLabel,
  timeLabel,
} from './common';
import { type Html, html } from './html';
import type { EntryRow } from './queries';

/**
 * One entry in the review queue: who sent it (first name, masked contact,
 * ZIP), the day, how they got around, their note, the post itself, and the
 * buttons to check, remove or restore it.
 */

export function hidden(name: string, value: string | number): Html {
  return html`<input type="hidden" name="${name}" value="${String(value)}" />`;
}

/** The admin address of a stored screenshot. */
export function screenshotPath(key: string): string {
  return `/api/admin/screenshot/${key}`;
}

function who(entry: EntryRow): Html {
  if (entry.handle) return html`<strong>@${entry.handle}</strong> · no sign-up (handle-only)`;
  const contact =
    entry.contact && entry.contact_type ? maskContact(entry.contact, entry.contact_type) : '';
  return html`<strong>${entry.first_name ?? ''}</strong> · ${contact} · ZIP
    ${entry.zip ?? ''}${entry.instagram ? ` · @${entry.instagram}` : ''}`;
}

/** A link that opens outside the admin views, telling the other site nothing. */
export function outsideLink(url: string): Html {
  if (!url.startsWith('https://')) return html`${url}`;
  return html`<a href="${url}" target="_blank" rel="noopener noreferrer"
    >${url.replace(/^https:\/\/(www\.)?/, '')}</a
  >`;
}

function post(entry: EntryRow): Html {
  const parts: Html[] = [];
  if (entry.post_url) parts.push(html`<p>Post: ${outsideLink(entry.post_url)}</p>`);
  if (entry.screenshot_key) {
    const path = screenshotPath(entry.screenshot_key);
    parts.push(
      html`<p>
          Screenshot:
          <a href="${path}" target="_blank" rel="noopener noreferrer">open full size</a>
          <span class="muted">(an iPhone HEIC file may download instead of showing)</span>
        </p>
        <img src="${path}" alt="Screenshot of the post" loading="lazy" />`,
    );
  }
  if (entry.received_on) {
    parts.push(html`<p>Postmarked ${dayLabel(entry.day)}, received ${entry.received_on}</p>`);
  }
  return html`${parts}`;
}

function state(entry: EntryRow): Html {
  if (entry.removed_at) {
    const reason = entry.removal_reason ?? '';
    const label = isRemovalReason(reason) ? REMOVAL_REASONS[reason] : reason;
    return html`<p>
      <strong>Removed</strong> by ${entry.removed_by ?? ''}, ${timeLabel(entry.removed_at)}:
      ${label}
    </p>`;
  }
  if (entry.checked_at) {
    return html`<p>
      <strong>Checked</strong> by ${entry.checked_by ?? ''}, ${timeLabel(entry.checked_at)}
    </p>`;
  }
  return html`<p><strong>Waiting for a check</strong></p>`;
}

function removeForm(entry: EntryRow, back: string): Html {
  const reasons = Object.entries(REMOVAL_REASONS).map(
    ([value, label]) => html`<option value="${value}">${label}</option>`,
  );
  return html`<form method="post" action="/admin/entries/remove" class="actions">
    ${hidden('id', entry.id)} ${hidden('seen', entry.created_at)} ${hidden('back', back)}
    <label
      >Why remove it?
      <select name="reason" required>
        <option value="">Pick a reason</option>
        ${reasons}
      </select></label
    >
    <button type="submit" class="quiet">Remove entry</button>
  </form>`;
}

function actions(entry: EntryRow, back: string): Html {
  if (entry.removed_at) {
    return html`<form method="post" action="/admin/entries/restore" class="actions">
      ${hidden('id', entry.id)} ${hidden('back', back)}
      <button type="submit" class="quiet">Restore entry</button>
    </form>`;
  }
  const check = entry.checked_at
    ? ''
    : html`<form method="post" action="/admin/entries/check" class="actions">
        ${hidden('id', entry.id)} ${hidden('seen', entry.created_at)} ${hidden('back', back)}
        <button type="submit">Mark checked</button>
      </form>`;
  return html`${check}${removeForm(entry, back)}`;
}

export function entryCard(entry: EntryRow, back: string): Html {
  const logged = entry.logged_by ? ` · logged by ${entry.logged_by}` : '';
  return html`<article class="entry" id="entry-${entry.id}">
    <h3>${dayLabel(entry.day)} · ${who(entry)}</h3>
    <p class="muted">
      ${SOURCE_LABELS[entry.source]}${logged} · sent ${timeLabel(entry.created_at)}
    </p>
    ${entry.modes ? html`<p>Got around: ${modesLabel(entry.modes)}</p>` : ''}
    ${entry.hard ? html`<p>What was hard: ${entry.hard}</p>` : ''} ${post(entry)}
    ${entry.source === 'post' ? html`<p>May LVBT share it: ${entry.share ? 'Yes' : 'No'}</p>` : ''}
    ${state(entry)} ${actions(entry, back)}
  </article>`;
}
