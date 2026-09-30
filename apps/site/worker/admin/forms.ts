import { maskContact } from '../validate';
import {
  type AdminContext,
  SOURCE_LABELS,
  counted,
  dayLabel,
  displayContact,
  field,
  timeLabel,
} from './common';
import { hidden, outsideLink, screenshotPath } from './entry-card';
import { type Html, html } from './html';
import { drawOpen } from './pick';
import type { DrawRow, PageData } from './queries';

/**
 * The forms volunteers fill in: log a registered Instagram tag and draw.
 * A form that was refused comes back with
 * what the volunteer typed, so nothing has to be typed twice.
 */

export interface Prefill {
  form: 'tag';
  values: FormData;
}

function valueOf(prefill: Prefill | undefined, form: Prefill['form'], name: string): string {
  return prefill?.form === form ? field(prefill.values, name) : '';
}

function dayOptions(selected: string): Html[] {
  return [1, 2, 3, 4, 5, 6, 7, 8].map(
    (day) =>
      html`<option value="${day}" ${String(day) === selected ? html`selected` : ''}>
        ${dayLabel(day)}
      </option>`,
  );
}

export function tagForm(prefill?: Prefill): Html {
  const value = (name: string) => valueOf(prefill, 'tag', name);
  return html`<section id="tag">
    <h2>Log an Instagram tag</h2>
    <p>
      For an Instagram post or story that tags @lasvegasfortransit. It counts as that day’s entry
      for the eligible person who saved the handle when they signed up. Reject unmatched handles.
    </p>
    <form method="post" action="/admin/tags" class="stack">
      <label
        >Instagram handle, as it appears
        <input name="handle" required maxlength="100" autocomplete="off" value="${value('handle')}"
      /></label>
      <label
        >Day it was posted
        <select name="day" required>
          ${dayOptions(value('day'))}
        </select></label
      >
      <label
        >Link to the post (if available)
        <input
          name="link"
          type="url"
          placeholder="https://www.instagram.com/p/…"
          value="${value('link')}"
      /></label>
      <button type="submit">Log the tag</button>
    </form>
  </section>`;
}

function winnerContact(draw: DrawRow): Html {
  if (draw.contact) {
    const kind = draw.contact_type === 'phone' ? 'Text' : 'Email';
    return html`<p class="winner">
      <strong>${draw.first_name ?? ''}</strong>, ZIP ${draw.zip ?? ''}. ${kind}:
      <strong>${displayContact(draw.contact)}</strong>
    </p>`;
  }
  return html`<p class="winner">
    No registered email for this entry. Check eligibility before fulfillment.
  </p>`;
}

function winningEntry(draw: DrawRow): Html {
  if (draw.win_day === null || draw.win_source === null) return html``;
  const proof = [
    draw.win_post ? outsideLink(draw.win_post) : '',
    draw.win_screenshot
      ? html`<a href="${screenshotPath(draw.win_screenshot)}" target="_blank">screenshot</a>`
      : '',
    draw.win_received ? `received ${draw.win_received}` : '',
  ]
    .filter((part) => part !== '')
    .map((part, index) => (index === 0 ? part : html`, ${part}`));
  return html`<p>
    Won with: ${dayLabel(draw.win_day)}, ${SOURCE_LABELS[draw.win_source]}
    ${proof.length > 0 ? html`(${proof})` : ''}. ${counted(draw.entries, 'entry', 'entries')} in
    all.
  </p>`;
}

function drawRecord(draw: DrawRow, latest: boolean): Html {
  const summary = html`Round ${draw.round}: drawn ${timeLabel(draw.drawn_at)} by ${draw.drawn_by},
  from ${counted(draw.eligible_count, 'entry', 'entries')}.`;
  if (!latest) {
    const who =
      draw.contact && draw.contact_type
        ? maskContact(draw.contact, draw.contact_type)
        : `@${draw.instagram ?? ''}`;
    return html`<li>${summary} Winner: ${draw.first_name ?? ''} ${who}</li>`;
  }
  return html`<h3>Winner, round ${draw.round}</h3>
    ${winnerContact(draw)} ${winningEntry(draw)}
    <p class="muted">${summary}</p>`;
}

function drawForm(data: PageData): Html {
  const again = data.draws.length > 0;
  const confirm = again
    ? 'The last winner didn’t reply within 7 days, or can’t take the prize.'
    : 'Every entry has been checked, and I’m ready to draw.';
  return html`<form method="post" action="/admin/draw" class="stack">
    ${hidden('round', data.draws.length + 1)}
    <label><input type="checkbox" name="confirm" value="yes" required /> ${confirm}</label>
    <button type="submit">${again ? 'Draw again' : 'Draw the winner'}</button>
  </form>`;
}

export function drawSection(c: AdminContext, data: PageData): Html {
  const { totals, draws } = data;
  const [latest, ...earlier] = draws;
  const open = drawOpen(c.env, c.now);
  let action: Html;
  if (!open) action = html`<p>The draw opens October 14, 2026.</p>`;
  else if (totals.to_check > 0) {
    action = html`<p>
      Check or remove the ${counted(totals.to_check, 'entry', 'entries')} still waiting before the
      draw.
    </p>`;
  } else action = drawForm(data);
  return html`<section id="draw">
    <h2>Draw the winner</h2>
    <p>
      In the draw now: ${counted(totals.eligible_entries, 'checked entry', 'checked entries')} from
      ${counted(totals.eligible_entrants, 'entrant', 'entrants')}. Each entry is one equal chance.
      Volunteers and earlier winners are left out.
    </p>
    ${latest ? drawRecord(latest, true) : ''}
    ${
      earlier.length > 0
        ? html`<ul>
            ${earlier.map((draw) => drawRecord(draw, false))}
          </ul>`
        : ''
    }
    ${action}
  </section>`;
}
