/**
 * Which entries are in the draw, and the fair pick among them.
 *
 * An entry is in the draw when a volunteer checked it and didn't remove
 * it. Each entrant has at most one entry a day: a person who signed up is
 * one entrant, and so is each handle nobody saved, except that a
 * handle-only tag counts as the entry of the person who has since saved
 * that handle, and only when they have no other entry that day. People
 * whose email is a volunteer's (anyone who has opened the admin views)
 * and earlier winners are left out. Every entry left is one equal chance.
 */

// Each counted entry with its entrant: the participant's id, or "ig:" and
// the handle. One row per entrant and day; the lowest id wins a tie.
const ENTRIES_IN_DRAW = `
  WITH counted AS (
    SELECT c.id, c.day,
      coalesce(
        c.participant_id,
        (SELECT p.id FROM participants p WHERE p.instagram = c.instagram
         ORDER BY p.created_at, p.id LIMIT 1),
        'ig:' || c.instagram
      ) AS entrant
    FROM checkins c
    WHERE c.checked_at IS NOT NULL AND c.removed_at IS NULL
  ),
  one_a_day AS (
    SELECT min(id) AS id, entrant FROM counted GROUP BY entrant, day
  )
  SELECT e.id, e.entrant FROM one_a_day e
  LEFT JOIN participants p ON p.id = e.entrant
  WHERE e.entrant NOT IN (SELECT entrant FROM draws)
    AND (p.contact IS NULL OR p.contact NOT IN (SELECT email FROM volunteers))`;

export const ELIGIBLE_SQL = `${ENTRIES_IN_DRAW} ORDER BY e.id`;

export const ELIGIBLE_COUNT_SQL = `
  SELECT count(*) AS entries, count(DISTINCT entrant) AS entrants FROM (${ENTRIES_IN_DRAW})`;

const RANGE = 2 ** 32;

/**
 * A whole number from 0 to n − 1, each equally likely, from the Web Crypto
 * random number generator. Values from the uneven top of the 32-bit range
 * are thrown away and drawn again, so no number is favored.
 */
export function randomIndex(n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > RANGE) throw new RangeError('n must be 1 to 2^32');
  const limit = RANGE - (RANGE % n);
  const value = new Uint32Array(1);
  do {
    crypto.getRandomValues(value);
  } while ((value[0] ?? 0) >= limit);
  return (value[0] ?? 0) % n;
}

/** The draw opens at 12:00 am on October 14 in Las Vegas, after the last mailed cards arrive. */
export const DRAW_OPENS = new Date('2026-10-14T07:00:00Z');

/** Whether the draw may run now. The preview Worker can open it early to test it. */
export function drawOpen(env: { PREVIEW_DRAW_ANYTIME?: string | undefined }, now: Date): boolean {
  return env.PREVIEW_DRAW_ANYTIME === 'true' || now >= DRAW_OPENS;
}
