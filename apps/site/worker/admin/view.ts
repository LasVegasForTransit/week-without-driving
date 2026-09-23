import {
  type AdminContext,
  type Filters,
  type View,
  VIEWS,
  counted,
  dayLabel,
  filterQuery,
} from './common';
import { entryCard } from './entry-card';
import { type Prefill, drawSection, mailForm, tagForm } from './forms';
import { type Html, html, page } from './html';
import type { DayStats, PageData } from './queries';

/**
 * The /admin page: counts, the review queue, the two logging forms, the
 * draw, the CSV export, and the volunteers who can't win.
 */

export interface Notice {
  text: string;
  problem: boolean;
}

const VIEW_LABELS: Record<View, string> = {
  check: 'To check',
  checked: 'Checked',
  removed: 'Removed',
};

const MODES = ['bus', 'walk', 'bike', 'ride'] as const;

function sum(rows: DayStats[], column: keyof DayStats): number {
  return rows.reduce((total, row) => total + row[column], 0);
}

function counts(data: PageData): Html {
  const { totals, stats } = data;
  const byDay = new Map(stats.map((row) => [row.day, row]));
  const rows = [1, 2, 3, 4, 5, 6, 7, 8].map((day) => {
    const row = byDay.get(day);
    return html`<tr>
      <td>${dayLabel(day)}</td>
      <td>${row?.entries ?? 0}</td>
      <td>${row?.checked ?? 0}</td>
      ${MODES.map((mode) => html`<td>${row?.[mode] ?? 0}</td>`)}
    </tr>`;
  });
  return html`<section id="counts">
    <h2>Counts</h2>
    <p>
      ${counted(totals.participants, 'sign-up', 'sign-ups')} ·
      ${counted(totals.entrants, 'entrant', 'entrants')} with an entry ·
      ${counted(totals.to_check, 'entry', 'entries')} to check · ${totals.checked} checked ·
      ${totals.removed} removed
    </p>
    <table>
      <caption class="muted">
        Entries that count, by day and by how people got around (a trip can use more than one)
      </caption>
      <tr>
        <th>Day</th>
        <th>Entries</th>
        <th>Checked</th>
        <th>Bus</th>
        <th>Walk</th>
        <th>Bike</th>
        <th>Ride</th>
      </tr>
      ${rows}
      <tr>
        <th>All days</th>
        <th>${sum(stats, 'entries')}</th>
        <th>${sum(stats, 'checked')}</th>
        ${MODES.map((mode) => html`<th>${sum(stats, mode)}</th>`)}
      </tr>
    </table>
  </section>`;
}

function tabs(filters: Filters, data: PageData): Html {
  const counted: Record<View, number> = {
    check: data.totals.to_check,
    checked: data.totals.checked,
    removed: data.totals.removed,
  };
  const views = VIEWS.map((view) => {
    const href = `/admin${filterQuery({ view, day: filters.day, page: 0 })}#queue`;
    const current = view === filters.view ? html` aria-current="page"` : '';
    return html`<a href="${href}" ${current}>${VIEW_LABELS[view]} (${counted[view]})</a>`;
  });
  const days = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((day) => {
    const href = `/admin${filterQuery({ view: filters.view, day, page: 0 })}#queue`;
    const current = day === filters.day ? html` aria-current="page"` : '';
    return html`<a href="${href}" ${current}>${day ? dayLabel(day) : 'All days'}</a>`;
  });
  return html`<p class="tabs">${views}</p>
    <p class="tabs">${days}</p>`;
}

function pager(filters: Filters, more: boolean): Html {
  const newer = filters.page
    ? html`<a href="/admin${filterQuery({ ...filters, page: filters.page - 1 })}#queue">Newer</a>`
    : '';
  const older = more
    ? html`<a href="/admin${filterQuery({ ...filters, page: filters.page + 1 })}#queue">Older</a>`
    : '';
  return html`<p class="tabs">${newer} ${older}</p>`;
}

function queue(filters: Filters, data: PageData): Html {
  const back = filterQuery(filters).replace(/^\?/, '');
  const cards = data.entries.map((entry) => entryCard(entry, back));
  return html`<section id="queue">
    <h2>Check entries</h2>
    <p>
      Keep an entry when it shows or describes a trip without driving that day. A post needs the
      person’s own photo or video of the trip; our share picture alone doesn’t count.
    </p>
    ${tabs(filters, data)} ${cards.length > 0 ? cards : html`<p class="muted">No entries here.</p>`}
    ${pager(filters, data.more)}
  </section>`;
}

function volunteers(list: string[]): Html {
  return html`<section id="volunteers">
    <h2>Volunteers who can’t win</h2>
    <p>
      Everyone who has opened these pages. A sign-up with one of these emails is left out of the
      draw.
    </p>
    <ul>
      ${list.map((email) => html`<li>${email}</li>`)}
    </ul>
  </section>`;
}

export function adminPage(
  c: AdminContext,
  filters: Filters,
  data: PageData,
  options: { notice?: Notice | undefined; prefill?: Prefill; status?: number } = {},
): Response {
  const { notice, prefill, status } = options;
  const body = html`<h1>Week Without Driving volunteers</h1>
    <p class="muted">Signed in as ${c.volunteer}</p>
    ${notice ? html`<p class="notice ${notice.problem ? 'problem' : ''}" role="status">${notice.text}</p>` : ''}
    <p class="tabs">
      <a href="#queue">Check entries</a><a href="#tag">Log a tag</a
      ><a href="#mail">Log a mailed entry</a><a href="#draw">Draw</a><a href="#counts">Counts</a
      ><a href="/api/admin/entries.csv">Download entries (CSV)</a>
    </p>
    ${queue(filters, data)} ${tagForm(prefill)} ${mailForm(prefill)} ${drawSection(c, data)}
    ${counts(data)} ${volunteers(data.volunteers)}`;
  return page('Admin', body, status);
}
