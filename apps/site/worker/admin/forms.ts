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
import { drawOpen, replyPeriodEnded } from './pick';
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
    <h1>Instagram tags</h1>
    <p class="intro">
      Log a trip post or story from an eligible participant’s registered Instagram handle.
    </p>
    <div class="panel">
      <h2>Entry requirements</h2>
      <ul class="requirements">
        <li>The post came from the registered handle and tagged @lasvegasfortransit.</li>
        <li>It appeared on the selected day and described a trip without driving.</li>
        <li>It stated that it was a giveaway entry.</li>
      </ul>
      <form method="post" action="/admin/tags" class="stack">
        <label
          >Instagram handle
          <input
            name="handle"
            required
            maxlength="100"
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
            value="${value('handle')}"
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
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
            placeholder="https://www.instagram.com/p/…"
            value="${value('link')}"
        /></label>
        <label class="check"
          ><input
            type="checkbox"
            name="trip-confirmed"
            value="yes"
            required
            ${value('trip-confirmed') === 'yes' ? html`checked` : ''}
          />
          <span>I verified that this post meets all three requirements.</span></label
        >
        <button type="submit">Log Instagram entry</button>
      </form>
    </div>
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
  return html`<h2>Winner, round ${draw.round}</h2>
    ${winnerContact(draw)} ${winningEntry(draw)}
    <p class="muted">${summary}</p>`;
}

function drawForm(data: PageData): Html {
  const again = data.draws.length > 0;
  const confirm = again
    ? 'The last winner didn’t reply within 7 days, or can’t take the prize.'
    : 'Every entry has been reviewed, and I am ready to draw.';
  return html`<form method="post" action="/admin/draw" class="stack">
    ${hidden('round', data.draws.length + 1)}
    <label class="check"
      ><input type="checkbox" name="confirm" value="yes" required /><span>${confirm}</span></label
    >
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
      Approve or remove the ${counted(totals.to_check, 'entry', 'entries')} still waiting before the
      draw.
    </p>`;
  } else if (latest && !replyPeriodEnded(latest.drawn_at, c.now)) {
    action = html`<p>
      The winner has seven days to reply. Come back after that period if another draw is needed.
    </p>`;
  } else if (totals.eligible_entries === 0)
    action = html`<p>No eligible entries are available for the draw.</p>`;
  else action = drawForm(data);
  return html`<section id="draw">
    <h1>Prize draw</h1>
    <p class="intro">
      Eligible for the draw:
      ${counted(totals.eligible_entries, 'approved entry', 'approved entries')} from
      ${counted(totals.eligible_entrants, 'entrant', 'entrants')}. Each entry is one equal chance.
      Volunteers and earlier winners are left out.
    </p>
    ${latest ? html`<div class="panel">${drawRecord(latest, true)}</div>` : ''}
    ${
      earlier.length > 0
        ? html`<ul>
            ${earlier.map((draw) => drawRecord(draw, false))}
          </ul>`
        : ''
    }
    <div class="panel">${action}</div>
  </section>`;
}
