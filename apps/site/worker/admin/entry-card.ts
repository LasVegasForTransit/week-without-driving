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
  const contact =
    entry.contact && entry.contact_type
      ? maskContact(entry.contact, entry.contact_type)
      : 'No registered contact';
  return html`<dl class="entry-details">
    <div>
      <dt>Contact</dt>
      <dd>${contact}</dd>
    </div>
    <div>
      <dt>County</dt>
      <dd>${entry.county ?? 'Not provided'}</dd>
    </div>
    <div>
      <dt>ZIP code</dt>
      <dd>${entry.zip ?? 'Not provided'}</dd>
    </div>
    ${
      entry.instagram || entry.handle
        ? html`<div>
            <dt>Instagram</dt>
            <dd>@${entry.instagram ?? entry.handle}</dd>
          </div>`
        : ''
    }
    ${
      entry.modes
        ? html`<div>
            <dt>Travel</dt>
            <dd>${modesLabel(entry.modes)}</dd>
          </div>`
        : ''
    }
  </dl>`;
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
  if (entry.post_url)
    parts.push(
      html`<p class="entry-note"><strong>Social post</strong>${outsideLink(entry.post_url)}</p>`,
    );
  if (entry.screenshot_key) {
    const path = screenshotPath(entry.screenshot_key);
    parts.push(
      html`<p>
          Screenshot:
          <a href="${path}" target="_blank" rel="noopener noreferrer">open full size</a>
          <span class="muted">(some image formats download)</span>
        </p>
        <img src="${path}" alt="Screenshot of the post" loading="lazy" />`,
    );
  }
  return html`${parts}`;
}

function state(entry: EntryRow): Html {
  if (entry.removed_at) {
    const reason = entry.removal_reason ?? '';
    const label = isRemovalReason(reason) ? REMOVAL_REASONS[reason] : reason;
    return html`<p class="entry-status">
      <strong>Removed</strong> by ${entry.removed_by ?? ''}, ${timeLabel(entry.removed_at)}:
      ${label}
    </p>`;
  }
  if (entry.checked_at) {
    return html`<p class="entry-status">
      <strong>Approved</strong> by ${entry.checked_by ?? ''}, ${timeLabel(entry.checked_at)}
    </p>`;
  }
  return html``;
}

function removeForm(entry: EntryRow, back: string): Html {
  const reasons = Object.entries(REMOVAL_REASONS).map(
    ([value, label]) => html`<option value="${value}">${label}</option>`,
  );
  return html`<details class="remove">
    <summary>Remove entry</summary>
    <p>Removed entries do not count. They can be restored from the Removed view.</p>
    <form method="post" action="/admin/entries/remove" class="actions">
      ${hidden('id', entry.id)} ${hidden('seen', entry.created_at)} ${hidden('back', back)}
      <label
        >Reason for removal
        <select name="reason" required>
          <option value="">Pick a reason</option>
          ${reasons}
        </select></label
      >
      <button type="submit" class="quiet">Remove entry</button>
    </form>
  </details>`;
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
        <button type="submit">Approve entry</button>
      </form>`;
  return html`${check}${removeForm(entry, back)}`;
}

export function entryCard(entry: EntryRow, back: string): Html {
  const logged = entry.logged_by ? ` · logged by ${entry.logged_by}` : '';
  const name = entry.first_name?.trim()
    ? entry.first_name
    : entry.handle
      ? `@${entry.handle}`
      : 'Participant';
  const status = entry.removed_at ? 'Removed' : entry.checked_at ? 'Approved' : 'Awaiting review';
  const statusClass = entry.removed_at ? 'removed' : entry.checked_at ? 'approved' : '';
  return html`<article
    class="entry"
    id="entry-${entry.id}"
    aria-labelledby="entry-title-${entry.id}"
  >
    <div class="entry-header">
      <div>
        <h2 id="entry-title-${entry.id}">${name}</h2>
        <p class="muted">${dayLabel(entry.day)} · ${SOURCE_LABELS[entry.source]}</p>
      </div>
      <span class="badge ${statusClass}">${status}</span>
    </div>
    ${who(entry)}
    ${entry.description ? html`<p class="trip-description">${entry.description}</p>` : ''}
    ${entry.hard ? html`<p class="entry-note"><strong>Trip difficulties</strong>${entry.hard}</p>` : ''}
    ${post(entry)}
    ${entry.source === 'post' ? html`<p class="entry-status">Permission to share: ${entry.share ? 'Yes' : 'No'}</p>` : ''}
    <p class="entry-status">Submitted ${timeLabel(entry.created_at)}${logged}</p>
    ${state(entry)} ${actions(entry, back)}
  </article>`;
}
