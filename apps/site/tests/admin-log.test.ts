import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type AccessKeys,
  type Admin,
  type Fields,
  VOLUNTEER,
  adminClient,
  countRows,
  makeAccessKeys,
  noticeOf,
  seedEntry,
  seedParticipant,
} from './support/admin';
import { type Platform, fakeOutbound, startPlatform } from './support/platform';

// Entries volunteers log by hand: Instagram tags and mailed cards, under
// the same rules as every entry (one per entrant per day, 8 at most).
describe('admin logging', () => {
  let platform: Platform;
  let keys: AccessKeys;
  let admin: Admin;
  const realFetch = globalThis.fetch;
  const TAG = 'https://www.instagram.com/p/TAG1/';

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

  const logTag = (handle: string, day = '3', link = TAG) =>
    admin.post('/admin/tags', { handle, day, link });
  const MAIL: Fields = {
    contact: '(702) 555-0142',
    day: '2',
    received: '2026-10-06',
    mode: ['walk', 'bus'],
    note: 'Wrote it on the bus.',
    firstName: 'Lupe',
    zip: '89110',
    age: 'adult',
  };
  const logMail = (changes: Fields = {}) => admin.post('/admin/mail', { ...MAIL, ...changes });
  const entries = () =>
    platform.env.DB.prepare(
      `SELECT participant_id, instagram, day, source, modes, hard, post_url, received_on,
         logged_by, checked_by FROM checkins ORDER BY day`,
    ).all();

  describe('an Instagram tag', () => {
    it('counts for the person who saved the handle, cleaned like sign-up', async () => {
      const ana = await seedParticipant(platform, {
        contact: 'ana@example.com',
        instagram: 'ana.rides',
      });
      const response = await logTag(' https://www.instagram.com/Ana.Rides/ ');
      expect(noticeOf(response)).toBe('tag-entered');
      const [row] = (await entries()).results;
      expect(row).toMatchObject({
        participant_id: ana,
        instagram: null,
        day: 3,
        source: 'tag',
        post_url: TAG,
        logged_by: VOLUNTEER,
        checked_by: VOLUNTEER,
      });
    });

    it('becomes a handle-only entry when nobody saved the handle', async () => {
      expect(noticeOf(await logTag('@Solo.Rider'))).toBe('tag-handle');
      const [row] = (await entries()).results;
      expect(row).toMatchObject({ participant_id: null, instagram: 'solo.rider', source: 'tag' });
    });

    it('says the day is already entered, for a sign-up or a handle', async () => {
      const ana = await seedParticipant(platform, {
        contact: 'ana@example.com',
        instagram: 'ana.rides',
      });
      await seedEntry(platform, { participantId: ana, day: 3 });
      const taken = await logTag('ana.rides');
      expect(taken.status).toBe(409);
      expect(await countRows(platform, 'SELECT count(*) AS n FROM checkins')).toBe(1);

      await logTag('solo.rider');
      expect((await logTag('solo.rider')).status).toBe(409);
      expect((await logTag('solo.rider', '4')).status).toBe(303);
      expect(await countRows(platform, 'SELECT count(*) AS n FROM checkins')).toBe(3);
    });

    it('takes the place of an entry removed that day', async () => {
      const ana = await seedParticipant(platform, {
        contact: 'ana@example.com',
        instagram: 'ana.rides',
      });
      await seedEntry(platform, { participantId: ana, day: 3, removed: true });
      expect(noticeOf(await logTag('ana.rides'))).toBe('tag-entered');
      const rows = (await entries()).results;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ source: 'tag', post_url: TAG });
      expect(
        await countRows(platform, 'SELECT count(*) AS n FROM checkins WHERE removed_at IS NULL'),
      ).toBe(1);
    });

    it('turns away a bad handle, day or link, and saves nothing', async () => {
      for (const [handle, day, link] of [
        ['not a handle!', '3', TAG],
        ['solo.rider', '9', TAG],
        ['solo.rider', '0', TAG],
        ['solo.rider', '3', 'https://example.com/p/1'],
        ['solo.rider', '3', 'http://www.instagram.com/p/1'],
      ] as const) {
        const response = await logTag(handle, day, link);
        expect(response.status).toBe(400);
      }
      expect(await countRows(platform, 'SELECT count(*) AS n FROM checkins')).toBe(0);
    });

    it('holds at most one entry a day and 8 in all for a handle', async () => {
      for (let day = 1; day <= 8; day += 1) {
        expect((await logTag('solo.rider', String(day))).status).toBe(303);
      }
      expect((await logTag('solo.rider', '9')).status).toBe(400);
      expect(await countRows(platform, 'SELECT count(*) AS n FROM checkins')).toBe(8);
      // The database itself refuses a second entry for the same day.
      await expect(seedEntry(platform, { instagram: 'solo.rider', day: 5 })).rejects.toThrow();
    });
  });

  describe('a mailed card', () => {
    it('makes a sign-up with no session for a new contact, and enters the card', async () => {
      expect(noticeOf(await logMail())).toBe('mail-new');
      const person = await platform.env.DB.prepare(
        'SELECT id, first_name, contact, zip FROM participants',
      ).first<{ id: string }>();
      expect(person).toMatchObject({ first_name: 'Lupe', contact: '+17025550142', zip: '89110' });
      expect(await countRows(platform, 'SELECT count(*) AS n FROM sessions')).toBe(0);
      expect(await countRows(platform, 'SELECT count(*) AS n FROM link_tokens')).toBe(0);
      const [row] = (await entries()).results;
      expect(row).toMatchObject({
        participant_id: person?.id,
        day: 2,
        source: 'mail',
        modes: 'bus,walk',
        hard: 'Wrote it on the bus.',
        received_on: '2026-10-06',
        logged_by: VOLUNTEER,
      });
    });

    it('counts for the sign-up that has the contact, as sign-up writes it', async () => {
      const ana = await seedParticipant(platform, { contact: 'ana@example.com' });
      const response = await logMail({ contact: ' Ana@Example.COM ', firstName: '', zip: '' });
      expect(noticeOf(response)).toBe('mail-entered');
      expect(await countRows(platform, 'SELECT count(*) AS n FROM participants')).toBe(1);
      expect((await entries()).results[0]).toMatchObject({ participant_id: ana, source: 'mail' });
    });

    it('needs a name and a Southern Nevada ZIP code for a new contact', async () => {
      expect((await logMail({ firstName: '' })).status).toBe(400);
      expect((await logMail({ zip: '90210' })).status).toBe(400);
      expect(await countRows(platform, 'SELECT count(*) AS n FROM participants')).toBe(0);
    });

    it('takes cards postmarked October 1 to 8 and received by October 13', async () => {
      const refused: Fields[] = [
        { day: '9' },
        { day: '5', received: '2026-10-04' },
        { received: '2026-10-14' },
        { received: 'soon' },
        { mode: [] },
        { mode: ['car'] },
        { note: 'x'.repeat(281) },
        { contact: 'not a contact' },
      ];
      for (const changes of refused) expect((await logMail(changes)).status).toBe(400);
      expect(await countRows(platform, 'SELECT count(*) AS n FROM checkins')).toBe(0);
      expect((await logMail({ day: '8', received: '2026-10-13' })).status).toBe(303);
    });

    it('keeps one entry a day, whichever way it came in', async () => {
      await logMail();
      expect((await logMail({ received: '2026-10-07' })).status).toBe(409);
      const person = await platform.env.DB.prepare('SELECT id FROM participants').first<{
        id: string;
      }>();
      await seedEntry(platform, { participantId: person?.id ?? null, day: 4 });
      expect((await logMail({ day: '4' })).status).toBe(409);
      expect(await countRows(platform, 'SELECT count(*) AS n FROM checkins')).toBe(2);
    });
  });

  it('stops logging once the winner has been drawn', async () => {
    await platform.env.DB.prepare(
      `INSERT INTO draws (round, entry_id, entrant, eligible_count, drawn_at, drawn_by)
       VALUES (1, 1, 'someone', 1, '2026-10-14T18:00:00Z', 'sam@lvbt.test')`,
    ).run();
    expect((await logTag('solo.rider')).status).toBe(409);
    expect((await logMail()).status).toBe(409);
    expect(await countRows(platform, 'SELECT count(*) AS n FROM checkins')).toBe(0);
  });
});
