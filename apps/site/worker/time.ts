/**
 * The calendar the API runs on. Week Without Driving is October 1 to 8,
 * 2026, in Las Vegas time, and everything personal is deleted on
 * November 30, 2026.
 */

/** Sessions and links stop working here (midnight, December 1, Pacific). */
export const SIGNED_IN_UNTIL = new Date('2026-12-01T08:00:00Z');

/** The daily cleanup deletes all participant data from here on (midnight, November 30, Pacific). */
export const DELETE_FROM = new Date('2026-11-30T08:00:00Z');

export const FIRST_DAY = '2026-10-01';
export const LAST_DAY = '2026-10-08';

// Intl knows when Las Vegas changes its clocks; a fixed -07:00 offset would
// put the evening of a winter day on the next date.
const lasVegasCalendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The date in Las Vegas at this instant, as YYYY-MM-DD. */
export function lasVegasDate(now: Date): string {
  const parts = Object.fromEntries(
    lasVegasCalendar.formatToParts(now).map((part) => [part.type, part.value]),
  );
  return `${parts.year ?? ''}-${parts.month ?? ''}-${parts.day ?? ''}`;
}

/**
 * Which day of the week it is in Las Vegas: 0 before October 1, 1 to 8
 * during the week, and 9 after October 8.
 */
export function weekDayNumber(now: Date): number {
  const date = lasVegasDate(now);
  if (date < FIRST_DAY) return 0;
  if (date > LAST_DAY) return 9;
  return Number(date.slice(-2));
}

/**
 * Today's day number, unless the preview Worker pins it with
 * CHECKIN_PREVIEW_DAY so testers can check in before October.
 */
export function todayNumber(previewDay: string | undefined, now: Date): number {
  if (previewDay && /^[0-9]$/.test(previewDay)) return Number(previewDay);
  return weekDayNumber(now);
}
