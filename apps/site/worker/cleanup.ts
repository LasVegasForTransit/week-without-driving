import type { Env } from './env';
import { currentWindow } from './rate-limit';
import { DELETE_FROM } from './time';

/**
 * The daily job (cron "0 13 * * *", early morning in Las Vegas). Every day
 * it drops rate-limit counters older than a day. From November 30, 2026 it
 * deletes every participant's data and screenshots, as the Privacy page
 * promises. LVBT's newsletter list lives elsewhere and is not touched.
 */

// Screenshots are deleted a page at a time; the Free plan allows 50 outgoing
// calls per run. Anything left is picked up the next day.
const PHOTO_PAGES_PER_RUN = 20;

async function deleteAllPhotos(bucket: R2Bucket): Promise<void> {
  let cursor: string | undefined;
  for (let page = 0; page < PHOTO_PAGES_PER_RUN; page += 1) {
    const listed = await bucket.list({
      prefix: 'photos/',
      limit: 1000,
      ...(cursor ? { cursor } : {}),
    });
    if (listed.objects.length > 0) await bucket.delete(listed.objects.map((object) => object.key));
    if (!listed.truncated) return;
    cursor = listed.cursor;
  }
}

export async function dailyCleanup(env: Env, now: Date): Promise<void> {
  const db = env.DB;
  if (!db) return;
  await db
    .prepare('DELETE FROM rate_limits WHERE window_start < ?1')
    .bind(currentWindow(now) - 24)
    .run();
  if (now < DELETE_FROM) return;

  if (env.PHOTOS) await deleteAllPhotos(env.PHOTOS);
  // Children first, then the people, in one transaction.
  await db.batch(
    ['checkins', 'reminders', 'bingo', 'link_tokens', 'sessions', 'participants'].map((table) =>
      db.prepare(`DELETE FROM ${table}`),
    ),
  );
  console.log('Deleted all participant data, as scheduled for November 30, 2026.');
}
