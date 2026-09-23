import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import worker from '../worker/index';
import {
  type Platform,
  ORIGIN,
  apiRequest,
  fakeOutbound,
  signUpAs,
  startPlatform,
} from './support/platform';

interface Me {
  firstName: string;
  contactMasked: string;
  contactType: string;
  instagram: string | null;
  days: number[];
  trips: { day: number; modes: string[] }[];
  today: number;
  reminders: { push: boolean; text: boolean; email: boolean };
  photos: { day: number; share: boolean }[];
}

// A PNG's signature and a little padding: enough for the type check.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72]);

// My week's API, through the real Worker against a local D1 database.
describe('my week', () => {
  let platform: Platform;
  let cookie: string;
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    platform = await startPlatform();
    vi.stubGlobal('fetch', fakeOutbound(realFetch).fetch);
  }, 60_000);
  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    await platform.dispose();
  });
  beforeEach(async () => {
    vi.useRealTimers();
    await platform.reset();
    cookie = await signUpAs(platform);
  });

  const me = async () => {
    const response = await platform.send(apiRequest('GET', '/api/me', { cookie }));
    return response.json<Me>();
  };
  const logTrip = (previewDay?: string, body: Record<string, unknown> = { modes: ['bus'] }) =>
    platform.send(
      apiRequest('POST', '/api/checkin', { cookie, body }),
      previewDay === undefined ? {} : { CHECKIN_PREVIEW_DAY: previewDay },
    );
  const checkIn = (previewDay?: string) => logTrip(previewDay);

  it('says who is signed in, with the contact masked', async () => {
    const mine = await me();
    expect(mine.firstName).toBe('Rosa');
    expect(mine.contactType).toBe('email');
    expect(mine.contactMasked).not.toContain('rosa@');
    expect(mine.contactMasked).toMatch(/@example\.com$/);
    expect(mine.instagram).toBe('rosa.rides');
    expect(mine.days).toEqual([]);
  });

  it('answers 401 without a session, and clears the signed-in flag', async () => {
    const response = await platform.send(apiRequest('GET', '/api/me'));
    expect(response.status).toBe(401);
    expect((await response.json<{ message: string }>()).message).toBeTruthy();
    expect(
      response.headers.getSetCookie().some((c) => /^lvwwd_signed_in=;.*Max-Age=0/.test(c)),
    ).toBe(true);
  });

  it('counts one entry a day, however many times a trip is logged', async () => {
    const first = await checkIn('3');
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ count: 1, days: [3] });
    expect(await (await checkIn('3')).json()).toMatchObject({ count: 1, days: [3] });
    expect(await (await checkIn('4')).json()).toMatchObject({ count: 2, days: [3, 4] });
  });

  it('keeps how the person got around, and lets them change it that day', async () => {
    await logTrip('3', { modes: ['bus', 'walk'], hard: 'No shade at the stop.' });
    expect((await me()).trips).toEqual([{ day: 3, modes: ['bus', 'walk'] }]);
    const again = await logTrip('3', { modes: ['bike'] });
    expect(await again.json()).toMatchObject({ count: 1, trips: [{ day: 3, modes: ['bike'] }] });
  });

  it('asks how the person got around before logging a trip', async () => {
    for (const body of [{}, { modes: [] }, { modes: ['car'] }, { modes: ['bus', 'bus'] }]) {
      const response = await logTrip('3', body);
      expect(response.status).toBe(400);
      expect((await response.json<{ message: string }>()).message).toBeTruthy();
    }
    expect((await me()).days).toEqual([]);
  });

  it('turns away a note that is too long', async () => {
    const response = await logTrip('3', { modes: ['walk'], hard: 'x'.repeat(281) });
    expect(response.status).toBe(400);
    expect((await me()).days).toEqual([]);
  });

  it('checks in on the Las Vegas date, and only October 1 to 8', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 11 pm on October 4 in Las Vegas is already October 5 in UTC.
    vi.setSystemTime(new Date('2026-10-05T06:00:00Z'));
    expect(await (await checkIn()).json()).toMatchObject({ count: 1, days: [4] });
    expect((await me()).today).toBe(4);

    vi.setSystemTime(new Date('2026-09-30T20:00:00Z'));
    expect((await checkIn()).status).toBe(409);
    vi.setSystemTime(new Date('2026-10-09T07:30:00Z'));
    const after = await checkIn();
    expect(after.status).toBe(409);
    expect((await after.json<{ message: string }>()).message).toBeTruthy();
    expect((await me()).today).toBe(9);
  });

  it('changes details but never the contact', async () => {
    const change = (body: object) =>
      platform.send(apiRequest('PATCH', '/api/me', { cookie, body }));
    const saved = await change({ firstName: 'Rosalind', instagram: '', newsletter: true });
    expect(saved.status).toBe(200);
    const mine = await me();
    expect(mine.firstName).toBe('Rosalind');
    expect(mine.instagram).toBeNull();

    expect((await change({ zip: '10001' })).status).toBe(400);
    const contact = await change({ contact: 'someone@else.com' });
    expect(contact.status).toBe(400);
    expect((await me()).contactMasked).toMatch(/@example\.com$/);
  });

  it('keeps reminder choices, offering texts only to phone sign-ups', async () => {
    const set = (body: object) =>
      platform.send(apiRequest('POST', '/api/reminders', { cookie, body }));
    expect((await set({ push: true, text: true, email: true })).status).toBe(200);
    expect((await me()).reminders).toEqual({ push: true, text: false, email: true });
    await set({ email: false });
    expect((await me()).reminders).toEqual({ push: true, text: false, email: false });
    expect((await set({ push: 'yes' })).status).toBe(400);

    const phone = await signUpAs(platform, { contact: '702-555-0199' });
    await platform.send(
      apiRequest('POST', '/api/reminders', { cookie: phone, body: { text: true, email: true } }),
    );
    const response = await platform.send(apiRequest('GET', '/api/me', { cookie: phone }));
    expect((await response.json<Me>()).reminders).toEqual({
      push: false,
      text: true,
      email: false,
    });
  });

  it('keeps a bingo card of up to 4 KB', async () => {
    const put = (state: unknown) =>
      platform.send(apiRequest('PUT', '/api/bingo', { cookie, body: { state } }));
    expect((await put({ marked: [0, 5, 12] })).status).toBe(200);
    const got = await platform.send(apiRequest('GET', '/api/bingo', { cookie }));
    expect(await got.json()).toEqual({ state: { marked: [0, 5, 12] } });
    expect((await put({ big: 'x'.repeat(5000) })).status).toBe(413);
  });

  it('takes a photo, checking what the file really is', async () => {
    const upload = (bytes: Uint8Array<ArrayBuffer>, name: string) => {
      const form = new FormData();
      form.set('photo', new File([bytes], name, { type: 'image/png' }));
      form.set('share', '1');
      return platform.send(
        new Request(`${ORIGIN}/api/photo`, {
          method: 'POST',
          headers: { Origin: ORIGIN, Cookie: cookie },
          body: form,
        }),
        { CHECKIN_PREVIEW_DAY: '3' },
      );
    };
    expect((await upload(PNG, 'bus.png')).status).toBe(201);
    expect((await me()).photos).toEqual([{ day: 3, share: true }]);
    expect((await upload(new TextEncoder().encode('<script>'), 'fake.png')).status).toBe(415);

    const listed = await platform.env.PHOTOS.list({ prefix: 'photos/' });
    expect(listed.objects).toHaveLength(1);
    expect(listed.objects[0]?.key).toMatch(/^photos\/[\w-]+\/3-[0-9a-f]+\.png$/);
  });

  it('says photos are coming soon without a bucket', async () => {
    const form = new FormData();
    form.set('photo', new File([PNG], 'bus.png', { type: 'image/png' }));
    const response = await platform.send(
      new Request(`${ORIGIN}/api/photo`, {
        method: 'POST',
        headers: { Origin: ORIGIN, Cookie: cookie },
        body: form,
      }),
      { PHOTOS: undefined },
    );
    expect(response.status).toBe(503);
  });

  it('signs this phone out and forgets its session', async () => {
    const out = await platform.send(apiRequest('POST', '/api/signout', { cookie, body: {} }));
    expect(out.status).toBe(200);
    expect(out.headers.getSetCookie()).toHaveLength(2);
    expect((await platform.send(apiRequest('GET', '/api/me', { cookie }))).status).toBe(401);
  });

  it('deletes everything from November 30, 2026, and not before', async () => {
    await checkIn('3');
    await platform.env.PHOTOS.put('photos/someone/3-abc.png', PNG);
    const cleanup = (at: string) =>
      worker.scheduled(
        { scheduledTime: Date.parse(at), cron: '0 13 * * *', noRetry: () => undefined },
        platform.env,
      );
    await cleanup('2026-11-29T13:00:00Z');
    expect((await me()).days).toEqual([3]);

    await cleanup('2026-11-30T13:00:00Z');
    for (const table of ['participants', 'sessions', 'link_tokens', 'checkins']) {
      const row = await platform.env.DB.prepare(`SELECT count(*) AS n FROM ${table}`).first();
      expect(row).toEqual({ n: 0 });
    }
    expect((await platform.env.PHOTOS.list({ prefix: 'photos/' })).objects).toHaveLength(0);
  });
});
