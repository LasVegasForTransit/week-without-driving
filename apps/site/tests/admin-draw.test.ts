import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { randomIndex } from '../worker/admin/pick';
import worker from '../worker/index';
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

// Drawing the winner: when it may run, which entries are in it, and that
// each of them is one equal chance.
describe('admin draw', () => {
  let platform: Platform;
  let keys: AccessKeys;
  let admin: Admin;
  let preview: Admin;
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    platform = await startPlatform();
    keys = await makeAccessKeys();
    admin = adminClient(platform, keys);
    preview = adminClient(platform, keys, { PREVIEW_DRAW_ANYTIME: 'true' });
  }, 60_000);
  afterAll(async () => {
    vi.unstubAllGlobals();
    await platform.dispose();
  });
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T16:00:00Z'));
    await platform.reset();
    const outbound = fakeOutbound(realFetch);
    outbound.accessKeys = [keys.publicJwk];
    vi.stubGlobal('fetch', outbound.fetch);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const draw = (round = 1, client = admin) =>
    client.post('/admin/draw', { confirm: 'yes', round: String(round) });
  const draws = async () =>
    (
      await platform.env.DB.prepare(
        'SELECT round, entry_id, entrant, eligible_count, drawn_by FROM draws ORDER BY round',
      ).all<{ round: number; entry_id: number; entrant: string; eligible_count: number }>()
    ).results;
  const person = (contact: string, instagram: string | null = null) =>
    seedParticipant(platform, { contact, instagram });

  it('waits until October 14, unless the preview opens it early', async () => {
    await seedEntry(platform, { participantId: await person('ana@example.com'), checked: true });
    vi.setSystemTime(new Date('2026-10-14T06:59:00Z'));
    expect(noticeOf(await draw())).toBe('draw-not-open');
    expect(await draws()).toHaveLength(0);
    expect(noticeOf(await draw(1, preview))).toBe('drawn');
    expect(await draws()).toHaveLength(1);
  });

  it('needs the volunteer to confirm', async () => {
    await seedEntry(platform, { participantId: await person('ana@example.com'), checked: true });
    const response = await admin.post('/admin/draw', { round: '1' });
    expect(noticeOf(response)).toBe('draw-confirm');
    expect(await draws()).toHaveLength(0);
  });

  it('waits until every entry is checked or removed', async () => {
    await seedEntry(platform, { participantId: await person('ana@example.com'), checked: true });
    await seedEntry(platform, { participantId: await person('ben@example.com') });
    expect(noticeOf(await draw())).toBe('draw-unchecked');
    expect(await draws()).toHaveLength(0);
    // The page doesn't offer the draw yet.
    expect(await (await admin.get('/admin')).text()).not.toContain('action="/admin/draw"');
  });

  it('draws only from checked entries that were not removed', async () => {
    const ana = await person('ana@example.com');
    const ben = await person('ben@example.com');
    const winning = await seedEntry(platform, { participantId: ana, day: 2, checked: true });
    await seedEntry(platform, { participantId: ben, day: 2, checked: true, removed: true });
    await seedEntry(platform, { participantId: ben, day: 3, removed: true });
    expect(noticeOf(await draw())).toBe('drawn');
    expect(await draws()).toMatchObject([
      { round: 1, entry_id: winning, entrant: ana, eligible_count: 1, drawn_by: VOLUNTEER },
    ]);
  });

  it('leaves out anyone whose email is a volunteer’s', async () => {
    const sam = await person(VOLUNTEER);
    const ana = await person('ana@example.com');
    await seedEntry(platform, { participantId: sam, day: 1, checked: true });
    await seedEntry(platform, { participantId: sam, day: 2, checked: true });
    await seedEntry(platform, { participantId: ana, day: 1, checked: true });
    await draw();
    expect(await draws()).toMatchObject([{ entrant: ana, eligible_count: 1 }]);
  });

  it('draws again without earlier winners, and shows the winner in full', async () => {
    const ana = await person('ana@example.com');
    const ben = await person('+17025550188');
    await seedEntry(platform, { participantId: ana, day: 1, checked: true });
    await seedEntry(platform, { participantId: ben, day: 1, checked: true });
    await seedEntry(platform, { instagram: 'solo.rider', day: 1, source: 'tag', checked: true });
    await draw(1);
    await draw(2);
    await draw(3);
    const rounds = await draws();
    expect(new Set(rounds.map((row) => row.entrant)).size).toBe(3);
    expect(rounds.map((row) => row.eligible_count)).toEqual([3, 2, 1]);
    expect(noticeOf(await draw(4))).toBe('draw-no-entries');

    const page = await (await admin.get('/admin')).text();
    const latest = rounds[2]?.entrant ?? '';
    if (latest === ana) expect(page).toContain('ana@example.com');
    else if (latest === ben) expect(page).toContain('(702) 555-0188');
    else expect(page).toContain('@solo.rider');
  });

  it('makes one draw when two volunteers draw at the same moment', async () => {
    await seedEntry(platform, { participantId: await person('ana@example.com'), checked: true });
    await seedEntry(platform, { participantId: await person('ben@example.com'), checked: true });
    const [first, second] = await Promise.all([draw(1), draw(1)]);
    expect([noticeOf(first), noticeOf(second)].sort()).toEqual(['draw-stale', 'drawn']);
    expect(await draws()).toHaveLength(1);
    expect(noticeOf(await draw(5))).toBe('draw-stale');
    expect(await draws()).toHaveLength(1);
  });

  it('counts a handle-only tag as the entry of the person who later saved the handle', async () => {
    await seedEntry(platform, { instagram: 'ana.rides', day: 2, source: 'tag', checked: true });
    await seedEntry(platform, { instagram: 'ana.rides', day: 5, source: 'tag', checked: true });
    const ana = await seedParticipant(platform, {
      contact: 'ana@example.com',
      instagram: 'ana.rides',
      createdAt: '2026-10-06T00:00:00.000Z',
    });
    await seedEntry(platform, { participantId: ana, day: 2, checked: true });
    await draw();
    // Day 2 counts once, day 5's tag counts for Ana.
    expect(await draws()).toMatchObject([{ entrant: ana, eligible_count: 2 }]);
  });

  it('gives each entry the same chance', () => {
    const counts = [0, 0, 0, 0];
    for (let draw = 0; draw < 10_000; draw += 1) {
      const index = randomIndex(4);
      counts[index] = (counts[index] ?? 0) + 1;
    }
    for (const count of counts) expect(count).toBeGreaterThan(2200);
    for (const count of counts) expect(count).toBeLessThan(2800);
    // An entrant with 3 of 4 entries wins about three times in four.
    const threeOfFour = (counts[0] ?? 0) + (counts[1] ?? 0) + (counts[2] ?? 0);
    expect(threeOfFour / 10_000).toBeGreaterThan(0.72);
    expect(threeOfFour / 10_000).toBeLessThan(0.78);
  });

  it('throws away random values from the uneven top of the range', () => {
    const values = [2 ** 32 - 1, 7];
    const fake = (array: Uint32Array) => {
      array[0] = values.shift() ?? 0;
      return array;
    };
    const spy = vi
      .spyOn(crypto, 'getRandomValues')
      .mockImplementation(fake as typeof crypto.getRandomValues);
    // 2^32 − 1 is past the last whole set of 3, so it is drawn again: 7 % 3 = 1.
    expect(randomIndex(3)).toBe(1);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it('is deleted with everything else on November 30', async () => {
    const ana = await person('ana@example.com');
    await seedEntry(platform, { participantId: ana, checked: true });
    await seedEntry(platform, { instagram: 'solo.rider', source: 'tag', checked: true });
    await draw();
    await worker.scheduled(
      {
        scheduledTime: Date.parse('2026-11-30T13:00:00Z'),
        cron: '0 13 * * *',
        noRetry: () => undefined,
      },
      platform.env,
    );
    for (const table of ['draws', 'volunteers', 'checkins', 'participants']) {
      expect(await countRows(platform, `SELECT count(*) AS n FROM ${table}`)).toBe(0);
    }
  });
});
