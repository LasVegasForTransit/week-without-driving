import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PLAN_PUSH_CRONS } from '../worker/push/plans';
import {
  apiRequest,
  fakeOutbound,
  signUpAs,
  startPlatform,
  type Platform,
} from './support/platform';
import {
  makeBrowser,
  pushService,
  readReminder,
  VAPID_ENV,
  type PushService,
  type TestBrowser,
} from './support/push';

describe('event reminders for saved plans', () => {
  let platform: Platform;
  let service: PushService;
  let cookie: string;
  const realFetch = globalThis.fetch;
  const enabled = { EVENT_REMINDERS_ENABLED: 'true', ...VAPID_ENV };

  beforeAll(async () => {
    platform = await startPlatform();
    service = pushService();
    vi.stubGlobal('fetch', service.fetch(fakeOutbound(realFetch).fetch));
  }, 60_000);
  afterAll(async () => {
    vi.unstubAllGlobals();
    await platform.dispose();
  });
  beforeEach(async () => {
    await platform.reset();
    service.requests.length = 0;
    service.statusFor = () => 201;
    cookie = await signUpAs(platform);
  });

  async function plan(
    lead = 60,
    day = 3,
    startsAt = `2026-10-0${day}T17:00:00.000Z`,
  ): Promise<string> {
    const response = await platform.send(
      apiRequest('POST', '/api/plans', {
        cookie,
        body: {
          day,
          destination: 'East Las Vegas Library',
          eventName: 'Reading hour',
          startsAt,
          availableModes: ['bus'],
          willingModes: ['bus', 'walk'],
          reminderMinutesBefore: lead,
        },
      }),
      enabled,
    );
    expect(response.status).toBe(201);
    return (await response.json<{ plan: { id: string } }>()).plan.id;
  }

  async function subscribe(): Promise<TestBrowser> {
    const browser = await makeBrowser();
    const participant = await platform.env.DB.prepare('SELECT id FROM participants LIMIT 1').first<{
      id: string;
    }>();
    await platform.env.DB.prepare(
      `INSERT INTO push_subscriptions (id, participant_id, endpoint, p256dh, auth, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    )
      .bind(
        crypto.randomUUID(),
        participant?.id,
        browser.endpoint,
        browser.keys.p256dh,
        browser.keys.auth,
        '2026-09-29T12:00:00.000Z',
      )
      .run();
    return browser;
  }

  const run = (at: string, env: object = enabled) => platform.cron(PLAN_PUSH_CRONS[0], at, env);

  it('sends an event-specific push to each phone once when the lead time arrives', async () => {
    const planId = await plan();
    const first = await subscribe();
    const second = await subscribe();
    await run('2026-10-03T15:55:00.000Z');
    expect(service.requests).toHaveLength(0);
    await run('2026-10-03T16:00:00.000Z');
    expect(service.requests).toHaveLength(2);
    expect(service.requests[0]?.headers.get('TTL')).toBe('3600');
    const notice = await readReminder(
      service.requests.find((push) => push.endpoint === first.endpoint),
      first,
    );
    expect(notice.title).toContain('Reading hour');
    expect(notice.body).toContain('East Las Vegas Library');
    expect(notice.tag).toBe(`wwd-plan-${planId}`);
    expect(
      await readReminder(
        service.requests.find((push) => push.endpoint === second.endpoint),
        second,
      ),
    ).toEqual(notice);
    await run('2026-10-03T16:05:00.000Z');
    expect(service.requests).toHaveLength(2);
    expect(
      await platform.env.DB.prepare('SELECT count(*) AS n FROM trip_plan_pushes').first(),
    ).toEqual({ n: 2 });
  });

  it('stays off without the release flag or VAPID key', async () => {
    await plan();
    await subscribe();
    await run('2026-10-03T16:00:00.000Z', VAPID_ENV);
    await run('2026-10-03T16:05:00.000Z', { EVENT_REMINDERS_ENABLED: 'true' });
    expect(service.requests).toHaveLength(0);
    await run('2026-10-03T16:10:00.000Z');
    expect(service.requests).toHaveLength(1);
  });

  it('tracks two plans on the same phone separately', async () => {
    const first = await plan();
    const second = await plan();
    const browser = await subscribe();
    await run('2026-10-03T16:00:00.000Z');
    expect(service.requests).toHaveLength(2);
    const notices = await Promise.all(service.requests.map((push) => readReminder(push, browser)));
    expect(new Set(notices.map((notice) => notice.tag))).toEqual(
      new Set([`wwd-plan-${first}`, `wwd-plan-${second}`]),
    );
    await run('2026-10-03T16:05:00.000Z');
    expect(service.requests).toHaveLength(2);
  });

  it('claims a plan before sending so overlapping runs do not duplicate it', async () => {
    await plan();
    await subscribe();
    await Promise.all([run('2026-10-03T16:00:00.000Z'), run('2026-10-03T16:00:00.000Z')]);
    expect(service.requests).toHaveLength(1);
    expect(
      await platform.env.DB.prepare('SELECT count(*) AS n FROM trip_plan_pushes').first(),
    ).toEqual({ n: 1 });
  });

  it('recovers an abandoned claim after its lease expires', async () => {
    const planId = await plan();
    const browser = await subscribe();
    const subscription = await platform.env.DB.prepare(
      'SELECT id FROM push_subscriptions WHERE endpoint = ?1',
    )
      .bind(browser.endpoint)
      .first<{ id: string }>();
    await platform.env.DB.prepare(
      'INSERT INTO trip_plan_pushes (plan_id, subscription_id, sent_at) VALUES (?1, ?2, ?3)',
    )
      .bind(planId, subscription?.id, 'pending:2026-10-03T15:58:00.000Z:interrupted')
      .run();
    await run('2026-10-03T16:00:00.000Z');
    expect(service.requests).toHaveLength(0);
    await run('2026-10-03T16:05:00.000Z');
    expect(service.requests).toHaveLength(1);
    expect(await platform.env.DB.prepare('SELECT sent_at FROM trip_plan_pushes').first()).toEqual({
      sent_at: '2026-10-03T16:05:00.000Z',
    });
  });

  it('follows a rescheduled event and stops after the reminder is removed', async () => {
    const id = await plan();
    await subscribe();
    await run('2026-10-03T16:00:00.000Z');
    expect(service.requests).toHaveLength(1);
    const rescheduled = await platform.send(
      apiRequest('PATCH', '/api/plans', {
        cookie,
        body: { id, startsAt: '2026-10-03T18:00:00.000Z' },
      }),
      enabled,
    );
    expect(rescheduled.status).toBe(200);
    await run('2026-10-03T16:05:00.000Z');
    expect(service.requests).toHaveLength(1);
    await run('2026-10-03T17:00:00.000Z');
    expect(service.requests).toHaveLength(2);
    const stopped = await platform.send(
      apiRequest('PATCH', '/api/plans', {
        cookie,
        body: { id, reminderMinutesBefore: null },
      }),
      enabled,
    );
    expect(stopped.status).toBe(200);
    await run('2026-10-03T17:05:00.000Z');
    expect(service.requests).toHaveLength(2);
  });

  it('removes an expired phone and never sends a stale event', async () => {
    await plan();
    const browser = await subscribe();
    service.statusFor = () => 410;
    await run('2026-10-03T16:00:00.000Z');
    expect(service.requests.map((request) => request.endpoint)).toEqual([browser.endpoint]);
    expect(
      await platform.env.DB.prepare('SELECT count(*) AS n FROM push_subscriptions').first(),
    ).toEqual({ n: 0 });
    await run('2026-10-03T16:05:00.000Z');
    expect(service.requests).toHaveLength(1);
    await subscribe();
    await run('2026-10-03T17:00:00.000Z');
    expect(service.requests).toHaveLength(1);
  });

  it('keeps other delivery receipts if a plan is deleted during a push', async () => {
    const removed = await plan();
    const kept = await plan();
    await subscribe();
    const pushFetch = service.fetch(fakeOutbound(realFetch).fetch);
    let deleted = false;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await pushFetch(input, init);
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!deleted && url.startsWith('https://fcm.googleapis.com/')) {
        deleted = true;
        await platform.env.DB.prepare('DELETE FROM trip_plans WHERE id = ?1').bind(removed).run();
      }
      return response;
    });
    try {
      await run('2026-10-03T16:00:00.000Z');
      expect(
        await platform.env.DB.prepare('SELECT plan_id FROM trip_plan_pushes').all<{
          plan_id: string;
        }>(),
      ).toMatchObject({ results: [{ plan_id: kept }] });
      const count = service.requests.length;
      await run('2026-10-03T16:05:00.000Z');
      expect(service.requests).toHaveLength(count);
    } finally {
      vi.stubGlobal('fetch', pushFetch);
    }
  });

  it('retries a temporary failure but never sends after the event starts', async () => {
    await plan();
    await subscribe();
    service.statusFor = () => 503;
    await run('2026-10-03T16:00:00.000Z');
    expect(service.requests).toHaveLength(1);
    service.statusFor = () => 201;
    await run('2026-10-03T16:05:00.000Z');
    expect(service.requests).toHaveLength(2);
    await run('2026-10-03T17:00:00.000Z');
    expect(service.requests).toHaveLength(2);
  });

  it('handles September 30 for one-day lead times', async () => {
    await plan(1440, 1);
    await subscribe();
    // Keep this historical execution independent of the machine's date.
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-30T17:00:00.000Z'));
    try {
      await run('2026-09-30T17:00:00.000Z');
      expect(service.requests).toHaveLength(1);
    } finally {
      clock.mockRestore();
    }
  });

  it('covers October 8 evening in Las Vegas, which is October 9 UTC', async () => {
    await plan(30, 8, '2026-10-09T06:45:00.000Z');
    await subscribe();
    await run('2026-10-09T06:10:00.000Z');
    expect(service.requests).toHaveLength(0);
    await run('2026-10-09T06:15:00.000Z');
    expect(service.requests).toHaveLength(1);
  });

  it('leaves the all-year clock idle outside the campaign reminder window', async () => {
    await plan();
    await subscribe();
    await run('2026-10-10T16:00:00.000Z');
    expect(service.requests).toHaveLength(0);
  });

  it('uses actual execution time when a scheduled run arrives late', async () => {
    await plan();
    await subscribe();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-03T16:30:00.000Z'));
    try {
      await run('2026-10-03T16:00:00.000Z');
    } finally {
      clock.mockRestore();
    }
    expect(service.requests[0]?.headers.get('TTL')).toBe('1800');
  });

  it('does not send after an event when its Cron Trigger runs late', async () => {
    await plan();
    await subscribe();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-03T17:05:00.000Z'));
    try {
      await run('2026-10-03T16:00:00.000Z');
    } finally {
      clock.mockRestore();
    }
    expect(service.requests).toHaveLength(0);
  });
});
