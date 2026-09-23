import type { ContactType } from '../env';
import type { AdminContext, Filters, Source, View } from './common';
import { ELIGIBLE_COUNT_SQL } from './pick';

/**
 * Everything /admin shows, read in one batch: one round trip and five
 * queries, well within the Workers Free plan.
 */

export const PAGE_SIZE = 50;

export interface EntryRow {
  id: number;
  day: number;
  source: Source;
  created_at: string;
  modes: string;
  hard: string | null;
  post_url: string | null;
  screenshot_key: string | null;
  share: number;
  received_on: string | null;
  logged_by: string | null;
  checked_at: string | null;
  checked_by: string | null;
  removed_at: string | null;
  removed_by: string | null;
  removal_reason: string | null;
  /** The handle of a handle-only entry. */
  handle: string | null;
  first_name: string | null;
  contact: string | null;
  contact_type: ContactType | null;
  zip: string | null;
  instagram: string | null;
}

export interface DayStats {
  day: number;
  entries: number;
  checked: number;
  bus: number;
  walk: number;
  bike: number;
  ride: number;
}

export interface Totals {
  participants: number;
  to_check: number;
  checked: number;
  removed: number;
  entrants: number;
  eligible_entries: number;
  eligible_entrants: number;
}

export interface DrawRow {
  round: number;
  entry_id: number;
  entrant: string;
  eligible_count: number;
  drawn_at: string;
  drawn_by: string;
  first_name: string | null;
  contact: string | null;
  contact_type: ContactType | null;
  zip: string | null;
  instagram: string | null;
  win_day: number | null;
  win_source: Source | null;
  win_post: string | null;
  win_screenshot: string | null;
  win_received: string | null;
  entries: number;
}

export interface PageData {
  stats: DayStats[];
  totals: Totals;
  entries: EntryRow[];
  more: boolean;
  draws: DrawRow[];
  volunteers: string[];
}

const VIEW_WHERE: Record<View, string> = {
  check: 'c.removed_at IS NULL AND c.checked_at IS NULL',
  checked: 'c.removed_at IS NULL AND c.checked_at IS NOT NULL',
  removed: 'c.removed_at IS NOT NULL',
};

const hasMode = (mode: string) => `sum(instr(',' || modes || ',', ',${mode},') > 0) AS ${mode}`;

const STATS_SQL = `
  SELECT day, count(*) AS entries, sum(checked_at IS NOT NULL) AS checked,
    ${['bus', 'walk', 'bike', 'ride'].map(hasMode).join(', ')}
  FROM checkins WHERE removed_at IS NULL GROUP BY day ORDER BY day`;

const TOTALS_SQL = `
  SELECT (SELECT count(*) FROM participants) AS participants,
    (SELECT count(*) FROM checkins WHERE removed_at IS NULL AND checked_at IS NULL) AS to_check,
    (SELECT count(*) FROM checkins WHERE removed_at IS NULL AND checked_at IS NOT NULL) AS checked,
    (SELECT count(*) FROM checkins WHERE removed_at IS NOT NULL) AS removed,
    (SELECT count(DISTINCT coalesce(participant_id, 'ig:' || instagram)) FROM checkins
     WHERE removed_at IS NULL) AS entrants,
    eligible.entries AS eligible_entries, eligible.entrants AS eligible_entrants
  FROM (${ELIGIBLE_COUNT_SQL}) AS eligible`;

export const ENTRY_COLUMNS = `
  c.id, c.day, c.source, c.created_at, c.modes, c.hard, c.post_url, c.screenshot_key, c.share,
  c.received_on, c.logged_by, c.checked_at, c.checked_by, c.removed_at, c.removed_by,
  c.removal_reason, c.instagram AS handle,
  p.first_name, p.contact, p.contact_type, p.zip, p.instagram`;

function queueSql(view: View): string {
  return `
    SELECT ${ENTRY_COLUMNS}
    FROM checkins c LEFT JOIN participants p ON p.id = c.participant_id
    WHERE ${VIEW_WHERE[view]} AND (?1 = 0 OR c.day = ?1)
    ORDER BY c.day DESC, c.created_at DESC, c.id DESC
    LIMIT ?2 OFFSET ?3`;
}

const DRAWS_SQL = `
  SELECT d.round, d.entry_id, d.entrant, d.eligible_count, d.drawn_at, d.drawn_by,
    p.first_name, p.contact, p.contact_type, p.zip, coalesce(p.instagram, w.instagram) AS instagram,
    w.day AS win_day, w.source AS win_source, w.post_url AS win_post,
    w.screenshot_key AS win_screenshot, w.received_on AS win_received,
    (SELECT count(*) FROM checkins c WHERE c.removed_at IS NULL
       AND (c.participant_id = d.entrant OR 'ig:' || c.instagram = d.entrant)) AS entries
  FROM draws d
  LEFT JOIN checkins w ON w.id = d.entry_id
  LEFT JOIN participants p ON p.id = d.entrant
  ORDER BY d.round DESC`;

export async function loadPage(c: AdminContext, filters: Filters): Promise<PageData> {
  const db = c.env.DB;
  const [stats, totals, entries, draws, volunteers] = await db.batch<Record<string, unknown>>([
    db.prepare(STATS_SQL),
    db.prepare(TOTALS_SQL),
    db.prepare(queueSql(filters.view)).bind(filters.day, PAGE_SIZE + 1, filters.page * PAGE_SIZE),
    db.prepare(DRAWS_SQL),
    db.prepare('SELECT email FROM volunteers ORDER BY email'),
  ]);
  const rows = (entries?.results ?? []) as unknown as EntryRow[];
  return {
    stats: (stats?.results ?? []) as unknown as DayStats[],
    totals: totals?.results[0] as unknown as Totals,
    entries: rows.slice(0, PAGE_SIZE),
    more: rows.length > PAGE_SIZE,
    draws: (draws?.results ?? []) as unknown as DrawRow[],
    volunteers: (volunteers?.results ?? []).map((row) => String(row.email)),
  };
}
