import { maskContact } from '../validate';
import { type AdminContext, SOURCE_LABELS, dayDate } from './common';
import { messagePage } from './html';
import { ENTRY_COLUMNS, type EntryRow } from './queries';

/**
 * The two files the admin views hand out: a screenshot a participant sent
 * (GET /api/admin/screenshot/<key>, streamed from R2), and every entry that
 * counts as a CSV file (GET /api/admin/entries.csv). Contacts in the file
 * are masked, as on the page.
 */

const SCREENSHOT_PREFIX = '/api/admin/screenshot/';
// The keys worker/api/photo.ts makes: photos/<participant>/<day>-<hex>.<ext>.
const SCREENSHOT_KEY = /^photos\/[A-Za-z0-9-]+\/[0-9]-[0-9a-f]+\.(jpg|png|webp|heic|heif)$/;

function notFound(): Response {
  return messagePage(404, 'Not found', 'There’s no screenshot here.');
}

export async function screenshot(c: AdminContext): Promise<Response> {
  const key = c.url.pathname.slice(SCREENSHOT_PREFIX.length);
  const bucket = c.env.PHOTOS;
  if (!SCREENSHOT_KEY.test(key) || !bucket) return notFound();
  const object = await bucket.get(key);
  if (!object) return notFound();
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'Content-Disposition': 'inline',
      // Only this volunteer's browser may keep it, and not for long.
      'Cache-Control': 'private, max-age=3600',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

/**
 * One CSV cell, quoted. A cell a spreadsheet would read as a formula gets
 * an apostrophe in front, so opening the file never runs anything.
 */
export function csvCell(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

const HEADER = [
  'entry',
  'date',
  'source',
  'state',
  'first_name',
  'contact',
  'zip',
  'instagram',
  'modes',
  'what_was_hard',
  'post_link',
  'screenshot',
  'may_share',
  'sent_at',
  'received_on',
  'logged_by',
  'checked_by',
];

function csvRow(entry: EntryRow): string {
  const contact =
    entry.contact && entry.contact_type ? maskContact(entry.contact, entry.contact_type) : null;
  return [
    entry.id,
    dayDate(entry.day),
    SOURCE_LABELS[entry.source],
    entry.checked_at ? 'checked' : 'to check',
    entry.first_name,
    contact,
    entry.zip,
    entry.instagram ?? entry.handle,
    entry.modes,
    entry.hard,
    entry.post_url,
    entry.screenshot_key ? 'yes' : 'no',
    entry.source === 'post' ? (entry.share ? 'yes' : 'no') : null,
    entry.created_at,
    entry.received_on,
    entry.logged_by,
    entry.checked_by,
  ]
    .map(csvCell)
    .join(',');
}

export async function entriesCsv(c: AdminContext): Promise<Response> {
  const rows = await c.env.DB.prepare(
    `SELECT ${ENTRY_COLUMNS}
     FROM checkins c LEFT JOIN participants p ON p.id = c.participant_id
     WHERE c.removed_at IS NULL
     ORDER BY c.day, c.created_at, c.id`,
  ).all<EntryRow>();
  // A byte order mark, so spreadsheet apps read accents and emoji as UTF-8.
  const lines = [HEADER.join(','), ...rows.results.map(csvRow)];
  return new Response(`\uFEFF${lines.join('\r\n')}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="lvwwd-entries.csv"',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
