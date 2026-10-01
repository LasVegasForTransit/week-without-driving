import { type AdminContext, type Filters, type View, VIEWS, dayLabel, filterQuery } from './common';
import { entryCard } from './entry-card';
import { type Prefill, drawSection, tagForm } from './forms';
import { type Html, html, page } from './html';
import { pushSection } from './push';
import type { DayStats, PageData, PartnerCount } from './queries';

export interface Notice {
  text: string;
  problem: boolean;
}

const SECTIONS = {
  queue: 'Review entries',
  tag: 'Instagram tags',
  draw: 'Prize draw',
  counts: 'Activity',
  reminders: 'Reminders',
  volunteers: 'Volunteers',
} as const;
type Section = keyof typeof SECTIONS;
const VIEW_LABELS: Record<View, string> = {
  check: 'Awaiting review',
  checked: 'Approved',
  removed: 'Removed',
};
const MODES = ['bus', 'walk', 'bike', 'ride'] as const;

function selectedSection(c: AdminContext, prefill?: Prefill): Section {
  if (prefill) return prefill.form;
  const section = c.url.searchParams.get('section') ?? '';
  if (Object.hasOwn(SECTIONS, section)) return section as Section;
  const notice = c.url.searchParams.get('notice') ?? '';
  if (notice.startsWith('tag-')) return 'tag';
  if (notice.startsWith('push-')) return 'reminders';
  if (notice === 'drawn' || notice.startsWith('draw-')) return 'draw';
  return 'queue';
}

function sum(rows: DayStats[], column: keyof DayStats): number {
  return rows.reduce((total, row) => total + row[column], 0);
}

function partnerTable(rows: PartnerCount[] | null): Html {
  if (!rows)
    return html`<p class="notice problem">
      Partner signup counts are unavailable. Try again later.
    </p>`;
  if (rows.length === 0) return html`<p class="muted">No partner links have been added.</p>`;
  return html`<div class="table-scroll" role="region" aria-label="Signups by partner" tabindex="0">
    <table id="partners">
      <caption>
        Signups through each partner’s link
      </caption>
      <thead>
        <tr>
          <th scope="col">Partner</th>
          <th scope="col">Signups</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(
          (row) =>
            html`<tr>
              <td>${row.name}</td>
              <td>${row.signUps}</td>
            </tr>`,
        )}
      </tbody>
    </table>
  </div>`;
}

function counts(data: PageData): Html {
  const { totals, stats } = data;
  const byDay = new Map(stats.map((row) => [row.day, row]));
  const rows = [1, 2, 3, 4, 5, 6, 7, 8].map((day) => {
    const row = byDay.get(day);
    return html`<tr>
      <th scope="row">${dayLabel(day)}</th>
      <td>${row?.entries ?? 0}</td>
      <td>${row?.checked ?? 0}</td>
      ${MODES.map((mode) => html`<td>${row?.[mode] ?? 0}</td>`)}
    </tr>`;
  });
  return html`<section id="counts">
    <h1>Campaign activity</h1>
    <p class="intro">October 1–8, 2026</p>
    <dl class="summary-list">
      <div>
        <dt>Registered participants</dt>
        <dd>${totals.participants}</dd>
      </div>
      <div>
        <dt>Participants with entries</dt>
        <dd>${totals.entrants}</dd>
      </div>
      <div>
        <dt>Approved entries</dt>
        <dd>${totals.checked}</dd>
      </div>
    </dl>
    <div class="panel">
      <h2>Entries by day</h2>
      <p class="muted">Removed entries are excluded. A trip can use more than one travel mode.</p>
      <div
        class="table-scroll"
        role="region"
        aria-label="Entries by day and travel mode"
        tabindex="0"
      >
        <table>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Entries</th>
              <th scope="col">Approved</th>
              <th scope="col">Bus</th>
              <th scope="col">Walk</th>
              <th scope="col">Bike</th>
              <th scope="col">Ride</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td>${sum(stats, 'entries')}</td>
              <td>${sum(stats, 'checked')}</td>
              ${MODES.map((mode) => html`<td>${sum(stats, mode)}</td>`)}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
    <div class="panel">
      <h2>Partner signups</h2>
      ${partnerTable(data.partners)}
    </div>
    <p class="section-actions">
      <a class="button-link quiet" href="/api/admin/entries.csv">Download entries (CSV)</a>
    </p>
  </section>`;
}

function filtersForm(filters: Filters, data: PageData): Html {
  const totals: Record<View, number> = {
    check: data.totals.to_check,
    checked: data.totals.checked,
    removed: data.totals.removed,
  };
  const views = VIEWS.map((view) => {
    const href = `/admin${filterQuery({ view, day: filters.day, page: 0 })}#queue`;
    const current = view === filters.view ? html` aria-current="page"` : '';
    return html`<a href="${href}" ${current}
      >${VIEW_LABELS[view]}${filters.day ? '' : ` (${totals[view]})`}</a
    >`;
  });
  const days = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(
    (day) =>
      html`<option value="${day}" ${day === filters.day ? html` selected` : ''}>
        ${day ? dayLabel(day) : 'All days'}
      </option>`,
  );
  return html`<div class="filters">
    <nav class="tabs" aria-label="Entry status">${views}</nav>
    <form method="get" action="/admin#queue" class="day-filter">
      <input type="hidden" name="view" value="${filters.view}" />
      <label
        >Campaign day<select name="day">
          ${days}
        </select></label
      >
      <button type="submit" class="quiet">Apply filter</button>
    </form>
  </div>`;
}

function pager(filters: Filters, more: boolean): Html {
  if (!filters.page && !more) return html``;
  return html`<nav class="pager" aria-label="Entry pages">
    ${filters.page ? html`<a class="button-link quiet" href="/admin${filterQuery({ ...filters, page: filters.page - 1 })}#queue">Previous page</a>` : html`<span></span>`}
    ${more ? html`<a class="button-link quiet" href="/admin${filterQuery({ ...filters, page: filters.page + 1 })}#queue">Next page</a>` : ''}
  </nav>`;
}

function queue(filters: Filters, data: PageData): Html {
  const back = filterQuery(filters).replace(/^\?/, '');
  const cards = data.entries.map((entry) => entryCard(entry, back));
  const emptyTitle = {
    check: 'No entries awaiting review',
    checked: 'No approved entries',
    removed: 'No removed entries',
  }[filters.view];
  const emptyCopy = filters.day
    ? `${filters.view === 'check' ? 'No entries awaiting review' : `No ${VIEW_LABELS[filters.view].toLowerCase()} entries`} for ${dayLabel(filters.day)}. Choose another day or view all days.`
    : filters.view === 'check'
      ? 'New trip entries will appear here when participants submit them in My week.'
      : filters.view === 'checked'
        ? 'Entries appear here after a volunteer approves them.'
        : 'Removed entries appear here with the reason and an option to restore them.';
  return html`<section id="queue">
    <h1>Review entries</h1>
    <p class="intro">
      Approve entries that describe a trip without driving on the entry’s day. Posts are optional.
      If a post is included, check that it belongs to the participant.
    </p>
    ${filtersForm(filters, data)}
    ${
      cards.length
        ? cards
        : html`<div class="empty-state">
            <h2>${emptyTitle}</h2>
            <p>${emptyCopy}</p>
            ${filters.day ? html`<p><a class="button-link quiet" href="/admin${filterQuery({ ...filters, day: 0, page: 0 })}#queue">View all days</a></p>` : ''}
          </div>`
    }
    ${pager(filters, data.more)}
  </section>`;
}

function volunteers(list: string[]): Html {
  return html`<section id="volunteers">
    <h1>Volunteers</h1>
    <p class="intro">
      Accounts that have accessed volunteer admin are excluded from the prize draw.
    </p>
    <div class="panel">
      <h2>Excluded accounts</h2>
      <ul class="plain volunteer-list">
        ${list.map((email) => html`<li>${email}</li>`)}
      </ul>
    </div>
  </section>`;
}

export function adminPage(
  c: AdminContext,
  filters: Filters,
  data: PageData,
  options: { notice?: Notice | undefined; prefill?: Prefill; status?: number } = {},
): Response {
  const { notice, prefill, status } = options;
  const section = selectedSection(c, prefill);
  const content: Record<Section, () => Html> = {
    queue: () => queue(filters, data),
    tag: () => tagForm(prefill),
    draw: () => drawSection(c, data),
    counts: () => counts(data),
    reminders: () => pushSection(data.pushes),
    volunteers: () => volunteers(data.volunteers),
  };
  const navigation = Object.entries(SECTIONS).map(
    ([key, label]) =>
      html`<a
        href="${key === 'queue' ? '/admin' : `/admin?section=${key}`}"
        ${section === key ? html` aria-current="page"` : ''}
        >${label}</a
      >`,
  );
  const body = html`<a class="skip-link" href="#main">Skip to main content</a>
    <header class="site-header">
      <div class="header-inner">
        <a class="brand" href="/">Week Without Driving<span>Volunteer admin</span></a>
        <div class="account">
          <span>${c.volunteer}</span><a href="/cdn-cgi/access/logout">Sign out</a>
        </div>
      </div>
    </header>
    <div class="workspace">
      <nav class="admin-nav" aria-label="Admin tasks">
        ${navigation}<a class="public-link" href="/">Open public site ↗</a>
      </nav>
      <main id="main" tabindex="-1">
        ${notice ? html`<div id="admin-notice" class="notice ${notice.problem ? 'problem' : ''}" role="${notice.problem ? 'alert' : 'status'}">${notice.text}</div>` : ''}
        ${content[section]()}
      </main>
    </div>`;
  return page(SECTIONS[section], body, status);
}
