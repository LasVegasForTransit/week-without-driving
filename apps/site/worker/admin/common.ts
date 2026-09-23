import type { ApiContext } from '../env';

/**
 * What every admin handler shares: its context, reading forms, and the
 * words and formats the pages use.
 */

export interface AdminContext extends ApiContext {
  /** The signed-in volunteer's email. */
  volunteer: string;
}

export type Source = 'post' | 'tag' | 'mail';

export const SOURCE_LABELS: Record<Source, string> = {
  post: 'Shared post',
  tag: 'Instagram tag',
  mail: 'Mailed card or letter',
};

export const MODE_LABELS = {
  bus: 'Bus',
  walk: 'Walked or rolled',
  bike: 'Bike or scooter',
  ride: 'Got a ride',
} as const;

const SHORT_MODES: Record<string, string> = {
  bus: 'Bus',
  walk: 'Walk',
  bike: 'Bike',
  ride: 'Ride',
};

export const REMOVAL_REASONS = {
  'no-trip': 'Not a trip without driving',
  'our-picture': 'Only our picture, no photo of the trip',
  'not-theirs': 'Not their post',
  duplicate: 'Duplicate',
  other: 'Other',
} as const;

export type RemovalReason = keyof typeof REMOVAL_REASONS;

export function isRemovalReason(value: string): value is RemovalReason {
  return Object.hasOwn(REMOVAL_REASONS, value);
}

/** The queue's three views: entries to check, checked ones, removed ones. */
export const VIEWS = ['check', 'checked', 'removed'] as const;
export type View = (typeof VIEWS)[number];

export interface Filters {
  view: View;
  /** 1 to 8, or 0 for every day. */
  day: number;
  /** 0 for the newest page. */
  page: number;
}

/** The queue's filters from a query string, ignoring anything else in it. */
export function readFilters(params: URLSearchParams): Filters {
  const view = VIEWS.find((name) => name === params.get('view')) ?? 'check';
  const day = Number(params.get('day'));
  const pageNumber = Number(params.get('page'));
  return {
    view,
    day: Number.isInteger(day) && day >= 1 && day <= 8 ? day : 0,
    page: Number.isInteger(pageNumber) && pageNumber > 0 && pageNumber < 1000 ? pageNumber : 0,
  };
}

/** The query string for some filters, leaving out the defaults. */
export function filterQuery(filters: Filters, notice?: string): string {
  const params = new URLSearchParams();
  if (filters.view !== 'check') params.set('view', filters.view);
  if (filters.day) params.set('day', String(filters.day));
  if (filters.page) params.set('page', String(filters.page));
  if (notice) params.set('notice', notice);
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** A text field from a form, trimmed; a file or a missing field reads as empty. */
export function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/** A day of the week (1 to 8) from a form field, or null. */
export function dayField(form: FormData, name: string): number | null {
  const day = Number(field(form, name));
  return Number.isInteger(day) && day >= 1 && day <= 8 ? day : null;
}

/** An entry id from a form field, or null. */
export function idField(form: FormData): number | null {
  const id = Number(field(form, 'id'));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** The date of a day of the week, as YYYY-MM-DD. */
export function dayDate(day: number): string {
  return `2026-10-0${day}`;
}

export function dayLabel(day: number): string {
  return `Oct ${day}`;
}

const lasVegasTime = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** A moment in Las Vegas time, like "Oct 3, 9:04 PM". */
export function timeLabel(iso: string): string {
  return lasVegasTime.format(new Date(iso));
}

/** A count with its noun, like "1 entry" or "3 entries". */
export function counted(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** A stored phone number (+17025550123) as (702) 555-0123; anything else as it is. */
export function displayContact(contact: string): string {
  const us = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(contact);
  return us ? `(${us[1] ?? ''}) ${us[2] ?? ''}-${us[3] ?? ''}` : contact;
}

/** Stored modes ("bus,walk") as "Bus + Walk". */
export function modesLabel(modes: string): string {
  return modes
    .split(',')
    .filter(Boolean)
    .map((mode) => SHORT_MODES[mode] ?? mode)
    .join(' + ');
}
