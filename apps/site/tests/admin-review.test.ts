import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type AccessKeys,
  type Admin,
  VOLUNTEER,
  adminClient,
  adminGet,
  countRows,
  makeAccessKeys,
  noticeOf,
  seedEntry,
  seedParticipant,
} from './support/admin';
import {
  ORIGIN,
  type Platform,
  apiRequest,
  fakeOutbound,
  signUpAs,
  startPlatform,
} from './support/platform';

// Checking entries in the admin views: the queue, "Mark checked", "Remove
// entry" and "Restore entry", screenshots, and the CSV file.
describe('admin review', () => {
  let platform: Platform;
  let keys: AccessKeys;
  let admin: Admin;
  const realFetch = globalThis.fetch;
  const POST = 'https://www.instagram.com/p/ROSA1/';
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72]);

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

  // Sends a shared trip from My week, as Rosa, on the preview's Day 3.
  const sendTrip = (cookie: string, fields: { hard?: string; screenshot?: boolean } = {}) => {
    const form = new FormData();
    form.append('mode', 'bus');
    form.append('mode', 'walk');
    if (fields.hard) form.set('hard', fields.hard);
    if (fields.screenshot) form.set('screenshot', new File([PNG], 'post.png'));
    else form.set('link', POST);
    return platform.send(
      new Request(`${ORIGIN}/api/checkin`, {
        method: 'POST',
        headers: { Origin: ORIGIN, Cookie: cookie },
        body: form,
      }),
      { CHECKIN_PREVIEW_DAY: '3' },
    );
  };
  const entry = () =>
    platform.env.DB.prepare(
      'SELECT id, created_at, checked_at, checked_by, removed_at, removed_by, removal_reason FROM checkins',
    ).first<{
      id: number;
      created_at: string;
      checked_at: string | null;
      checked_by: string | null;
      removed_at: string | null;
      removed_by: string | null;
      removal_reason: string | null;
    }>();
  const days = async (cookie: string) => {
    const response = await platform.send(apiRequest('GET', '/api/me', { cookie }));
    return (await response.json<{ days: number[] }>()).days;
  };

  it('lists an entry waiting for a check with what a volunteer needs, and no full contact', async () => {
    const cookie = await signUpAs(platform);
    await sendTrip(cookie, { hard: 'No shade at the stop.' });
    const page = await (await admin.get('/admin')).text();
    expect(page).toContain('Rosa');
    expect(page).toContain('89101');
    expect(page).toContain('No shade at the stop.');
    expect(page).toMatch(/r•••@example\.com/);
    expect(page).not.toContain('rosa@example.com');
    const link = /<a [^>]*href="https:\/\/www\.instagram\.com\/p\/ROSA1\/"[^>]*>/.exec(page)?.[0];
    expect(link).toContain('target="_blank"');
    expect(link).toContain('rel="noopener noreferrer"');
  });

  it('shows what participants typed as text, never as HTML', async () => {
    const id = await seedParticipant(platform, { firstName: '<img src=x>', contact: 'x@y.co' });
    await seedEntry(platform, { participantId: id, hard: '<b>hello</b>' });
    const page = await (await admin.get('/admin')).text();
    expect(page).toContain('&lt;b&gt;hello&lt;/b&gt;');
    expect(page).toContain('&lt;img src=x&gt;');
    expect(page).not.toContain('<b>hello</b>');
  });

  it('marks an entry checked, which then can’t be changed on My week', async () => {
    const cookie = await signUpAs(platform);
    await sendTrip(cookie);
    const before = await entry();
    const response = await admin.post('/admin/entries/check', {
      id: String(before?.id),
      seen: before?.created_at ?? '',
    });
    expect(response.status).toBe(303);
    const after = await entry();
    expect(after?.checked_at).toBeTruthy();
    expect(after?.checked_by).toBe(VOLUNTEER);

    const again = await sendTrip(cookie);
    expect(again.status).toBe(409);
    expect((await again.json<{ message: string }>()).message).toBeTruthy();
    expect((await entry())?.created_at).toBe(before?.created_at);
  });

  it('asks the volunteer to look again when the participant replaced the post', async () => {
    const cookie = await signUpAs(platform);
    await sendTrip(cookie);
    const seen = await entry();
    await platform.env.DB.prepare(
      "UPDATE checkins SET created_at = '2026-10-03T23:59:00.000Z'",
    ).run();
    const check = await admin.post('/admin/entries/check', {
      id: String(seen?.id),
      seen: seen?.created_at ?? '',
    });
    expect(noticeOf(check)).toBe('stale');
    const remove = await admin.post('/admin/entries/remove', {
      id: String(seen?.id),
      seen: seen?.created_at ?? '',
      reason: 'no-trip',
    });
    expect(noticeOf(remove)).toBe('stale');
    const now = await entry();
    expect(now?.checked_at).toBeNull();
    expect(now?.removed_at).toBeNull();
  });

  it('removes an entry softly with a reason, and restores it', async () => {
    const cookie = await signUpAs(platform);
    await sendTrip(cookie);
    const sent = await entry();
    const fields = { id: String(sent?.id), seen: sent?.created_at ?? '', back: 'view=check&day=3' };

    const noReason = await admin.post('/admin/entries/remove', fields);
    expect(noticeOf(noReason)).toBe('no-reason');
    expect((await entry())?.removed_at).toBeNull();

    const removed = await admin.post('/admin/entries/remove', { ...fields, reason: 'our-picture' });
    expect(removed.headers.get('Location')).toContain('day=3');
    const row = await entry();
    expect(row).toMatchObject({ removed_by: VOLUNTEER, removal_reason: 'our-picture' });
    expect(await days(cookie)).toEqual([]);
    const removedView = await (await admin.get('/admin?view=removed')).text();
    expect(removedView).toContain('Restore entry');
    expect(await (await admin.get('/admin')).text()).not.toContain('Rosa</strong>');

    await admin.post('/admin/entries/restore', { id: String(sent?.id) });
    expect((await entry())?.removed_at).toBeNull();
    expect(await days(cookie)).toEqual([3]);
  });

  it('lets a participant send a new post for a day whose entry was removed', async () => {
    const cookie = await signUpAs(platform);
    await sendTrip(cookie);
    const sent = await entry();
    await admin.post('/admin/entries/remove', {
      id: String(sent?.id),
      seen: sent?.created_at ?? '',
      reason: 'not-theirs',
    });
    expect((await sendTrip(cookie)).status).toBe(200);
    const resent = await entry();
    expect(resent?.removed_at).toBeNull();
    expect(resent?.checked_at).toBeNull();
    expect(await days(cookie)).toEqual([3]);
  });

  it('shows a screenshot to volunteers only, with private caching', async () => {
    const cookie = await signUpAs(platform);
    await sendTrip(cookie, { screenshot: true });
    const row = await platform.env.DB.prepare('SELECT screenshot_key AS key FROM checkins').first<{
      key: string;
    }>();
    const path = `/api/admin/screenshot/${row?.key ?? ''}`;
    expect(await (await admin.get('/admin')).text()).toContain(path);

    const response = await admin.get(path);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Cache-Control')).toMatch(/^private/);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);

    expect((await platform.send(adminGet(path))).status).toBe(403);
    expect((await admin.get('/api/admin/screenshot/photos/../secret.png')).status).toBe(404);
    expect((await admin.get('/api/admin/screenshot/photos/x/3-00.png')).status).toBe(404);
  });

  it('exports the entries that count as a CSV file, with masked contacts', async () => {
    const rosa = await seedParticipant(platform, {
      firstName: 'Rosa',
      contact: 'rosa@example.com',
    });
    const eve = await seedParticipant(platform, { firstName: 'Eve', contact: '+17025550100' });
    await seedEntry(platform, {
      participantId: rosa,
      day: 2,
      hard: '=HYPERLINK("x")',
      checked: true,
    });
    await seedEntry(platform, { participantId: eve, day: 3, removed: true });
    await seedEntry(platform, { instagram: 'solo.rider', day: 4, source: 'tag', modes: '' });

    const response = await admin.get('/api/admin/entries.csv');
    expect(response.headers.get('Content-Type')).toContain('text/csv');
    expect(response.headers.get('Content-Disposition')).toContain('attachment');
    const bytes = new Uint8Array(await response.arrayBuffer());
    // A UTF-8 byte order mark first, which reading the text drops.
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes);
    const lines = text.trim().split('\r\n');
    expect(lines[0]?.split(',')).toContain('first_name');
    expect(lines).toHaveLength(3);
    expect(text).toContain('"Rosa"');
    expect(text).toContain('"solo.rider"');
    expect(text).not.toContain('Eve');
    expect(text).not.toContain('rosa@example.com');
    expect(text).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('counts sign-ups and entries by day and by how people got around', async () => {
    const rosa = await seedParticipant(platform, { contact: 'rosa@example.com' });
    await seedEntry(platform, { participantId: rosa, day: 1, modes: 'bus,walk' });
    await seedEntry(platform, { participantId: rosa, day: 2, modes: 'bike', removed: true });
    await seedEntry(platform, { instagram: 'solo.rider', day: 1, source: 'tag', modes: '' });
    expect(await countRows(platform, 'SELECT count(*) AS n FROM checkins')).toBe(3);
    const page = await (await admin.get('/admin')).text();
    const dayOne = /<tr>\s*<td>Oct 1<\/td>([\s\S]*?)<\/tr>/.exec(page)?.[1] ?? '';
    const cells = [...dayOne.matchAll(/<td>(\d+)<\/td>/g)].map((match) => Number(match[1]));
    // Entries, checked, bus, walk, bike, ride.
    expect(cells).toEqual([2, 0, 1, 1, 0, 0]);
  });
});
