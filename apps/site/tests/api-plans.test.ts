import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import worker from '../worker/index';
import {
  type Platform,
  type Overrides,
  ORIGIN,
  apiRequest,
  fakeOutbound,
  signUpAs,
  startPlatform,
} from './support/platform';

const SAMPLE = {
  day: 3,
  destination: 'East Las Vegas Library',
  eventName: 'Reading hour',
  startsAt: '2026-10-03T17:00:00.000Z',
  availableModes: ['bus', 'bike'],
  willingModes: ['bus', 'walk', 'scooter'],
};

interface Plan {
  id: string;
  day: number;
  destination: string;
  eventName: string | null;
  startsAt: string | null;
  availableModes: string[];
  willingModes: string[];
  reminderMinutesBefore: number | null;
  reminderAt: string | null;
  loggedEntryId: number | null;
}

describe('participant trip plans', () => {
  let platform: Platform;
  let cookie: string;
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    platform = await startPlatform();
    vi.stubGlobal('fetch', fakeOutbound(realFetch).fetch);
  }, 60_000);
  afterAll(async () => {
    vi.unstubAllGlobals();
    await platform.dispose();
  });
  beforeEach(async () => {
    await platform.reset();
    cookie = await signUpAs(platform);
  });

  const request = (method: string, body?: object, as = cookie, env: Overrides = {}) =>
    platform.send(apiRequest(method, '/api/plans', { cookie: as, body }), env);
  const create = async (body: object = SAMPLE, env: Overrides = {}): Promise<Plan> => {
    const response = await request('POST', body, cookie, env);
    expect(response.status).toBe(201);
    return (await response.json<{ plan: Plan }>()).plan;
  };

  it('saves more than one plan on a day and returns them in My week', async () => {
    const first = await create();
    const second = await create({
      ...SAMPLE,
      destination: 'RTC Bonneville Transit Center',
      eventName: null,
      startsAt: null,
    });
    expect(first.id).not.toBe(second.id);
    expect(first).toMatchObject({ ...SAMPLE, loggedEntryId: null });
    const listed = await (await request('GET')).json<{ plans: Plan[] }>();
    expect(listed.plans.map((plan) => plan.id)).toEqual([first.id, second.id]);
    const me = await platform.send(apiRequest('GET', '/api/me', { cookie }));
    expect((await me.json<{ plans: Plan[] }>()).plans).toEqual(listed.plans);
  });

  it('edits and deletes only this participant’s own plans', async () => {
    const plan = await create();
    const otherCookie = await signUpAs(platform, {
      firstName: 'Sam',
      contact: 'sam@example.com',
      instagram: '@sam.moves',
    });
    expect(
      (await request('PATCH', { id: plan.id, destination: 'Stolen' }, otherCookie)).status,
    ).toBe(404);
    expect((await request('DELETE', { id: plan.id }, otherCookie)).status).toBe(404);
    const changed = await request('PATCH', {
      id: plan.id,
      destination: 'Sunrise Library',
      availableModes: ['scooter'],
    });
    expect(changed.status).toBe(200);
    expect((await changed.json<{ plan: Plan }>()).plan).toMatchObject({
      destination: 'Sunrise Library',
      availableModes: ['scooter'],
      willingModes: SAMPLE.willingModes,
    });
    expect((await request('DELETE', { id: plan.id })).status).toBe(200);
    expect((await (await request('GET')).json<{ plans: Plan[] }>()).plans).toEqual([]);
  });

  it('rejects invalid days, event times, modes and oversized details', async () => {
    for (const body of [
      { ...SAMPLE, day: 0 },
      { ...SAMPLE, day: 9 },
      { ...SAMPLE, destination: '' },
      { ...SAMPLE, destination: 'x'.repeat(121) },
      { ...SAMPLE, eventName: 'x'.repeat(121) },
      { ...SAMPLE, startsAt: '2026-10-04T07:00:00.000Z' },
      { ...SAMPLE, startsAt: '2026-10-03T10:00:00' },
      { ...SAMPLE, availableModes: ['car'] },
      { ...SAMPLE, willingModes: ['bus', 'bus'] },
      { ...SAMPLE, reminderMinutesBefore: 15 },
      { ...SAMPLE, startsAt: null, reminderMinutesBefore: 60 },
    ]) {
      const response = await request('POST', body);
      expect(response.status).toBe(400);
    }
    expect((await (await request('GET')).json<{ plans: Plan[] }>()).plans).toEqual([]);
  });

  it('schedules a requested event reminder and resets delivery when its time changes', async () => {
    const reminder = { EVENT_REMINDERS_ENABLED: 'true' };
    expect((await request('POST', { ...SAMPLE, reminderMinutesBefore: 60 })).status).toBe(400);
    const plan = await create({ ...SAMPLE, reminderMinutesBefore: 60 }, reminder);
    expect(plan).toMatchObject({
      reminderMinutesBefore: 60,
      reminderAt: '2026-10-03T16:00:00.000Z',
    });
    const participant = await platform.env.DB.prepare('SELECT id FROM participants LIMIT 1').first<{
      id: string;
    }>();
    await platform.env.DB.prepare(
      `INSERT INTO push_subscriptions (id, participant_id, endpoint, p256dh, auth, created_at)
       VALUES ('sub-test', ?1, 'https://fcm.googleapis.com/fcm/send/test', 'key', 'auth', ?2)`,
    )
      .bind(participant?.id, '2026-09-29T12:00:00.000Z')
      .run();
    await platform.env.DB.prepare(
      'INSERT INTO trip_plan_pushes (plan_id, subscription_id, sent_at) VALUES (?1, ?2, ?3)',
    )
      .bind(plan.id, 'sub-test', '2026-10-03T16:00:00.000Z')
      .run();
    const response = await request(
      'PATCH',
      {
        id: plan.id,
        startsAt: '2026-10-03T18:00:00.000Z',
      },
      cookie,
      reminder,
    );
    expect(response.status).toBe(200);
    expect((await response.json<{ plan: Plan }>()).plan.reminderAt).toBe(
      '2026-10-03T17:00:00.000Z',
    );
    expect(
      await platform.env.DB.prepare('SELECT count(*) AS n FROM trip_plan_pushes').first(),
    ).toEqual({ n: 0 });
    const removed = await request(
      'PATCH',
      { id: plan.id, reminderMinutesBefore: null },
      cookie,
      reminder,
    );
    expect((await removed.json<{ plan: Plan }>()).plan).toMatchObject({
      reminderMinutesBefore: null,
      reminderAt: null,
    });
  });

  it('links a plan to the one daily trip and keeps the entry when the plan is deleted', async () => {
    const plan = await create();
    const form = new FormData();
    form.set('mode', 'scooter');
    form.set('description', 'I took my scooter to the library.');
    form.set('planId', plan.id);
    const checkin = () =>
      platform.send(
        new Request(`${ORIGIN}/api/checkin`, {
          method: 'POST',
          headers: { Origin: ORIGIN, Cookie: cookie },
          body: form,
        }),
        { CHECKIN_PREVIEW_DAY: '3' },
      );
    expect((await checkin()).status).toBe(200);
    expect((await (await request('GET')).json<{ plans: Plan[] }>()).plans[0]?.loggedEntryId).toBe(
      1,
    );
    expect((await checkin()).status).toBe(200);
    expect(await platform.env.DB.prepare('SELECT count(*) AS n FROM checkins').first()).toEqual({
      n: 1,
    });
    expect((await request('DELETE', { id: plan.id })).status).toBe(200);
    expect(await platform.env.DB.prepare('SELECT plan_id FROM checkins').first()).toEqual({
      plan_id: null,
    });
  });

  it('refuses a plan from another day or participant in the check-in form', async () => {
    const plan = await create();
    const form = new FormData();
    form.set('mode', 'bus');
    form.set('description', 'I rode the bus.');
    form.set('planId', plan.id);
    const checkin = (day: string, as = cookie) =>
      platform.send(
        new Request(`${ORIGIN}/api/checkin`, {
          method: 'POST',
          headers: { Origin: ORIGIN, Cookie: as },
          body: form,
        }),
        { CHECKIN_PREVIEW_DAY: day },
      );
    expect((await checkin('4')).status).toBe(400);
    const otherCookie = await signUpAs(platform, {
      firstName: 'Sam',
      contact: 'sam@example.com',
      instagram: '@sam.moves',
    });
    expect((await checkin('3', otherCookie)).status).toBe(400);
    expect(await platform.env.DB.prepare('SELECT count(*) AS n FROM checkins').first()).toEqual({
      n: 0,
    });
  });

  it('deletes plans with participant data on November 30', async () => {
    await create();
    await worker.scheduled(
      {
        scheduledTime: Date.parse('2026-11-30T13:00:00Z'),
        cron: '0 13 * * *',
        noRetry: () => undefined,
      },
      platform.env,
    );
    expect(await platform.env.DB.prepare('SELECT count(*) AS n FROM trip_plans').first()).toEqual({
      n: 0,
    });
  });
});
