import { partners } from '../../src/lib/partners';
import type { AdminContext } from './common';
import { csvCell } from './files';
import { type Html, html, page } from './html';

/** Aggregate campaign records. No contact, trip location, or participant ID leaves these queries. */
interface Totals {
  signups: number;
  planners: number;
  plans: number;
  entrants: number;
  entries: number;
  checked: number;
  awaiting: number;
  removed: number;
}

interface CountRow {
  label: string;
  count: number;
}

interface DayRow {
  day: number;
  entries: number;
  checked: number;
  bus: number;
  walk: number;
  bike: number;
  ride: number;
}

interface ReportData {
  totals: Totals;
  signupsByDate: CountRow[];
  signupsByPartner: CountRow[];
  days: DayRow[];
}

const TOTALS_SQL = `SELECT
  (SELECT count(*) FROM participants) AS signups,
  (SELECT count(DISTINCT participant_id) FROM trip_plans) AS planners,
  (SELECT count(*) FROM trip_plans) AS plans,
  (SELECT count(DISTINCT participant_id) FROM checkins WHERE removed_at IS NULL) AS entrants,
  (SELECT count(*) FROM checkins WHERE removed_at IS NULL) AS entries,
  (SELECT count(*) FROM checkins WHERE removed_at IS NULL AND checked_at IS NOT NULL) AS checked,
  (SELECT count(*) FROM checkins WHERE removed_at IS NULL AND checked_at IS NULL) AS awaiting,
  (SELECT count(*) FROM checkins WHERE removed_at IS NOT NULL) AS removed`;

const SIGNUPS_SQL = `SELECT substr(created_at, 1, 10) AS label, count(*) AS count
  FROM participants GROUP BY label ORDER BY label`;

const PARTNERS_SQL = `SELECT coalesce(partner, '') AS label, count(*) AS count
  FROM participants GROUP BY label ORDER BY count DESC, label`;

const DAYS_SQL = `SELECT day, count(*) AS entries,
  sum(checked_at IS NOT NULL) AS checked,
  sum(instr(',' || modes || ',', ',bus,') > 0) AS bus,
  sum(instr(',' || modes || ',', ',walk,') > 0) AS walk,
  sum(instr(',' || modes || ',', ',bike,') > 0) AS bike,
  sum(instr(',' || modes || ',', ',ride,') > 0) AS ride
  FROM checkins WHERE removed_at IS NULL GROUP BY day ORDER BY day`;

async function loadReport(c: AdminContext): Promise<ReportData> {
  const db = c.env.DB;
  const [totals, dates, partners, days] = await db.batch<Record<string, unknown>>([
    db.prepare(TOTALS_SQL),
    db.prepare(SIGNUPS_SQL),
    db.prepare(PARTNERS_SQL),
    db.prepare(DAYS_SQL),
  ]);
  return {
    totals: totals?.results[0] as unknown as Totals,
    signupsByDate: (dates?.results ?? []) as unknown as CountRow[],
    signupsByPartner: (partners?.results ?? []) as unknown as CountRow[],
    days: (days?.results ?? []) as unknown as DayRow[],
  };
}

function partnerName(slug: string): string {
  return (
    partners.find((partner) => partner.slug === slug)?.name ??
    (slug ? 'Other partner link' : 'No partner link')
  );
}

function ratio(part: number, total: number): string {
  return total ? `${Math.round((part / total) * 100)}%` : '—';
}

function metric(value: number, singular: string, plural: string): Html {
  return html`<strong>${value}</strong> ${value === 1 ? singular : plural}`;
}

function summary(totals: Totals): Html {
  return html`<div class="report-metrics">
      <section>${metric(totals.signups, 'signup', 'signups')}</section>
      <section>${metric(totals.planners, 'person with a plan', 'people with a plan')}</section>
      <section>${metric(totals.entrants, 'person with an entry', 'people with an entry')}</section>
      <section>${metric(totals.entries, 'entry', 'entries')}</section>
    </div>
    <p>
      ${ratio(totals.entrants, totals.signups)} of signed-up people have entered a trip.
      ${metric(totals.checked, 'entry checked', 'entries checked')} · ${totals.awaiting} awaiting
      review · ${totals.removed} removed.
    </p>
    <p class="muted">
      A saved plan does not count as an entry. The entry rate uses all signups as its denominator;
      it is not a visit-to-signup conversion rate.
    </p>`;
}

function dayTable(days: DayRow[]): Html {
  const byDay = new Map(days.map((row) => [row.day, row]));
  const rows = Array.from({ length: 8 }, (_, index) => {
    const day = index + 1;
    const row = byDay.get(day);
    return html`<tr>
      <th>Oct ${day}</th>
      <td>${row?.entries ?? 0}</td>
      <td>${row?.checked ?? 0}</td>
      <td>${row?.bus ?? 0}</td>
      <td>${row?.walk ?? 0}</td>
      <td>${row?.bike ?? 0}</td>
      <td>${row?.ride ?? 0}</td>
    </tr>`;
  });
  return html`<h2>Entries by campaign day</h2>
    <div class="table-scroll">
      <table class="campaign-days">
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
      </table>
    </div>
    <p class="muted">An entry may use more than one travel mode.</p>`;
}

function breakdown(kind: 'date' | 'partner', rows: CountRow[]): Html {
  const partner = kind === 'partner';
  const title = partner ? 'Partner links' : 'Signups by date';
  const note = partner ? 'Credit comes from the partner link used at signup.' : 'Dates are in UTC.';
  const heading = partner ? 'Link' : 'Date';
  return html`<section>
    <h2>${title}</h2>
    <p class="muted">${note}</p>
    ${
      rows.length
        ? html`<div class="table-scroll">
            <table>
              <tr>
                <th>${heading}</th>
                <th>Signups</th>
              </tr>
              ${rows.map(
                (row) =>
                  html`<tr>
                    <td>${partner ? partnerName(row.label) : row.label}</td>
                    <td>${row.count}</td>
                  </tr>`,
              )}
            </table>
          </div>`
        : html`<p>No signups yet.</p>`
    }
  </section>`;
}

export async function showReport(c: AdminContext): Promise<Response> {
  const data = await loadReport(c);
  return page(
    'Campaign report',
    html`<p><a href="/admin">← Volunteer review</a></p>
      <h1>Campaign report</h1>
      <p class="muted">Signups, plans, and entries saved on lvwwd.org.</p>
      ${summary(data.totals)} ${dayTable(data.days)}
      <div class="report-columns">
        ${breakdown('date', data.signupsByDate)} ${breakdown('partner', data.signupsByPartner)}
      </div>
      <h2>Traffic and referrals</h2>
      <p>
        <a href="https://dash.cloudflare.com/">Open Cloudflare Web Analytics</a> and select
        lvwwd.org to see visits, popular pages, and referring sites. Those are browser measurements;
        the counts above come from saved campaign records and may differ.
      </p>
      <p><a href="/api/admin/report.csv">Download aggregate CSV</a> for a spreadsheet.</p>`,
  );
}

function csvLine(section: string, label: string, metric: string, count: number): string {
  return [section, label, metric, count].map(csvCell).join(',');
}

export async function reportCsv(c: AdminContext): Promise<Response> {
  const data = await loadReport(c);
  const lines = ['section,label,metric,count'];
  for (const metric of [
    'signups',
    'planners',
    'plans',
    'entrants',
    'entries',
    'checked',
    'awaiting',
    'removed',
  ] as const) {
    lines.push(csvLine('campaign', 'all', metric, data.totals[metric]));
  }
  for (const row of data.signupsByDate)
    lines.push(csvLine('signup_date_utc', row.label, 'signups', row.count));
  for (const row of data.signupsByPartner)
    lines.push(csvLine('partner_link', partnerName(row.label), 'signups', row.count));
  for (let day = 1; day <= 8; day += 1) {
    const row = data.days.find((item) => item.day === day);
    for (const metric of ['entries', 'checked', 'bus', 'walk', 'bike', 'ride'] as const)
      lines.push(
        csvLine(
          'campaign_day',
          `2026-10-${String(day).padStart(2, '0')}`,
          metric,
          row?.[metric] ?? 0,
        ),
      );
  }
  return new Response(`${lines.join('\n')}\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="lvwwd-campaign-report.csv"',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
