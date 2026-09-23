import { sha256 } from './tokens';

/**
 * Fixed-window rate limits kept in D1: one counter row per subject per
 * clock hour, bumped and read in a single statement. The subject (an IP
 * address or a contact) is stored only as a hash. The daily cleanup
 * deletes old windows.
 */
export const HOUR_MS = 3_600_000;

export const LIMITS = {
  signupPerIp: { scope: 'signup-ip', perHour: 5 },
  linkPerIp: { scope: 'link-ip', perHour: 10 },
  linkPerContact: { scope: 'link-contact', perHour: 3 },
} as const;

export type Limit = (typeof LIMITS)[keyof typeof LIMITS];

export function currentWindow(now: Date): number {
  return Math.floor(now.getTime() / HOUR_MS);
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
    .bind(key, currentWindow(now))
    .first<{ count: number }>();
  return (row?.count ?? 0) > limit.perHour;
}
