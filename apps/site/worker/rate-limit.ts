import { sha256 } from './tokens';

/**
 * Fixed-window rate limits kept in D1: one counter row per subject per
 * window, bumped and read in a single statement. The subject (an IP
 * address or a contact) is stored only as a hash. window_start is the
 * minute (counted from 1970) the window began, whatever its length, so the
 * daily cleanup can drop old windows of every limit with one comparison.
 *
 * Sign-up allows 20 tries a minute from one connection: a volunteer's table
 * on a library's Wi-Fi signs people up one after another, and a minute's
 * wait is all anyone should need. The two link limits are per hour.
 */
const MINUTE_MS = 60_000;

export const LIMITS = {
  signupPerIp: { scope: 'signup-ip', max: 20, minutes: 1 },
  linkPerIp: { scope: 'link-ip', max: 10, minutes: 60 },
  linkPerContact: { scope: 'link-contact', max: 3, minutes: 60 },
} as const;

export type Limit = (typeof LIMITS)[keyof typeof LIMITS];

/** Minutes since 1970. */
export function currentMinute(now: Date): number {
  return Math.floor(now.getTime() / MINUTE_MS);
}

/** The minute the limit's current window began. */
export function windowStart(limit: Limit, now: Date): number {
  const minute = currentMinute(now);
  return minute - (minute % limit.minutes);
}

/** Counts one more request and says whether that goes over the limit. */
export async function overLimit(
  db: D1Database,
  limit: Limit,
  subject: string,
  now: Date,
): Promise<boolean> {
  const key = await sha256(`${limit.scope}:${subject}`);
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(key, windowStart(limit, now))
    .first<{ count: number }>();
  return (row?.count ?? 0) > limit.max;
}
