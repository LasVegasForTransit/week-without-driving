import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type AccessKeys,
  type Admin,
  VOLUNTEER,
  adminClient,
  countRows,
  makeAccessKeys,
  noticeOf,
  seedEntry,
  seedParticipant,
} from './support/admin';
import { type Platform, fakeOutbound, startPlatform } from './support/platform';

// Volunteer intake must join Instagram tags to a registered, eligible person.
describe('volunteer tag logging', () => {
  let platform: Platform;
  let keys: AccessKeys;
  let admin: Admin;
  const realFetch = globalThis.fetch;
  const TAG = 'https://www.instagram.com/p/TAG1/';
  const logTag = (handle: string, day = '3', link = TAG) =>
    admin.post('/admin/tags', { handle, day, link, 'trip-confirmed': 'yes' });

  beforeAll(async () => {
    platform = await startPlatform();
    keys = await makeAccessKeys();
    admin = adminClient(platform, keys);
  }, 60_000);
  afterAll(async () => {
    vi.unstubAllGlobals();
    await platform.dispose();
  });
  beforeEach(async () => {
    await platform.reset();
    const outbound = fakeOutbound(realFetch);
    outbound.accessKeys = [keys.publicJwk];
    vi.stubGlobal('fetch', outbound.fetch);
  });

  it('counts a registered Instagram tag for its participant', async () => {
    const ana = await seedParticipant(platform, {
      contact: 'ana@example.com',
      instagram: 'ana.rides',
    });
    expect(noticeOf(await logTag('https://www.instagram.com/Ana.Rides/'))).toBe('tag-entered');
    const row = await platform.env.DB.prepare(
      'SELECT participant_id, instagram, day, source, post_url, checked_by FROM checkins',
    ).first();
    expect(row).toMatchObject({
      participant_id: ana,
      instagram: null,
      day: 3,
      source: 'tag',
      post_url: TAG,
      checked_by: VOLUNTEER,
    });
  });

  it('rejects an unmatched or ineligible handle without making an entry', async () => {
    expect((await logTag('solo.rider')).status).toBe(400);
    await seedParticipant(platform, {
      contact: 'outside@example.com',
      instagram: 'outside',
      county: null,
    });
    expect((await logTag('outside')).status).toBe(400);
    expect(await countRows(platform, 'SELECT count(*) AS n FROM checkins')).toBe(0);
  });

  it('does not count a tag without volunteer confirmation of the trip and disclosure', async () => {
    await seedParticipant(platform, { contact: 'ana@example.com', instagram: 'ana.rides' });
    const response = await admin.post('/admin/tags', {
      handle: 'ana.rides',
      day: '3',
      link: TAG,
    });
    expect(response.status).toBe(400);
    expect(await countRows(platform, 'SELECT count(*) AS n FROM checkins')).toBe(0);
  });

  it('tells reviewers to verify the account, tag, posted day and trip', async () => {
    const page = (await (await admin.get('/admin?section=tag')).text()).replace(/\s+/g, ' ');
    expect(page).toContain('came from the registered handle');
    expect(page).toContain('tagged @lasvegasfortransit');
    expect(page).toContain('on the selected day');
    expect(page).toContain('trip without driving');
  });

  it('counts a story without a durable link and refuses an ambiguous handle', async () => {
    const ana = await seedParticipant(platform, {
      contact: 'ana@example.com',
      instagram: 'ana.rides',
    });
    expect(noticeOf(await logTag('ana.rides', '3', ''))).toBe('tag-entered');
    const row = await platform.env.DB.prepare(
      'SELECT participant_id, post_url FROM checkins',
    ).first();
    expect(row).toMatchObject({ participant_id: ana, post_url: null });
    await seedParticipant(platform, {
      contact: 'other@example.com',
      instagram: 'ana.rides',
    });
    expect((await logTag('ana.rides', '4', '')).status).toBe(400);
    expect(await countRows(platform, 'SELECT count(*) AS n FROM checkins')).toBe(1);
  });

  it('allows one entry per participant per day across text and tags, eight total', async () => {
    const ana = await seedParticipant(platform, {
      contact: 'ana@example.com',
      instagram: 'ana.rides',
    });
    await seedEntry(platform, { participantId: ana, day: 3, postUrl: null });
    expect((await logTag('ana.rides')).status).toBe(409);
    for (const day of [1, 2, 4, 5, 6, 7, 8]) {
      expect(noticeOf(await logTag('ana.rides', String(day)))).toBe('tag-entered');
    }
    expect((await logTag('ana.rides', '9')).status).toBe(400);
    expect(await countRows(platform, 'SELECT count(*) AS n FROM checkins')).toBe(8);
  });

  it('refuses a bad day or non-Instagram link', async () => {
    await seedParticipant(platform, { contact: 'ana@example.com', instagram: 'ana.rides' });
    expect((await logTag('ana.rides', '9')).status).toBe(400);
    expect((await logTag('ana.rides', '3', 'https://example.com/post')).status).toBe(400);
    expect(await countRows(platform, 'SELECT count(*) AS n FROM checkins')).toBe(0);
  });

  it('has no mail intake, and closes tag logging after the draw', async () => {
    expect((await admin.post('/admin/mail', { contact: 'ana@example.com' })).status).toBe(404);
    await seedParticipant(platform, { contact: 'ana@example.com', instagram: 'ana.rides' });
    await platform.env.DB.prepare(
      `INSERT INTO draws (round, entry_id, entrant, eligible_count, drawn_at, drawn_by)
       VALUES (1, 1, 'someone', 1, '2026-10-14T18:00:00Z', 'sam@lvbt.test')`,
    ).run();
    expect((await logTag('ana.rides')).status).toBe(409);
  });
});
