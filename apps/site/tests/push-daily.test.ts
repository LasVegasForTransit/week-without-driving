import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { REMINDERS } from '../src/lib/reminders';
import { CLEANUP_CRON } from '../worker/cleanup';
import { PREVIEW_PUSH_CRON, PUSHES_AT_ONCE, PUSHES_PER_RUN, PUSH_CRON } from '../worker/push/daily';
import { countRows, seedParticipant } from './support/admin';
import {
  type Platform,
  apiRequest,
  fakeOutbound,
  signUpAs,
  startPlatform,
} from './support/platform';
import {
  type PushService,
  type TestBrowser,
  VAPID_ENV,
  makeBrowser,
  pushService,
  readReminder,
  vapidClaims,
} from './support/push';

// The morning send by browser notification, run as its Cron Trigger would
// run it, against a local D1 database and a stand-in push service.
describe('the daily reminder by browser notification', () => {
  let platform: Platform;
  let service: PushService;
  let person: string;
  const realFetch = globalThis.fetch;

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
    service.mostAtOnce = 0;
    service.statusFor = () => 201;
    person = await seedParticipant(platform, { contact: 'ana@example.com' });
  });

  /** Saves browsers as turned on at these moments, and returns them in the same order. */
  async function turnedOn(...moments: string[]): Promise<TestBrowser[]> {
    const browsers: TestBrowser[] = [];
    for (const [index, moment] of moments.entries()) {
      const browser = await makeBrowser();
      await platform.env.DB.prepare(
        `INSERT INTO push_subscriptions (id, participant_id, endpoint, p256dh, auth, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
      )
        .bind(
          `sub-${String(index).padStart(3, '0')}`,
          person,
          browser.endpoint,
          browser.keys.p256dh,
          browser.keys.auth,
          moment,
        )
        .run();
      browsers.push(browser);
    }
    return browsers;
  }

  /** The moments of `count` sign-ups, a minute apart, from the evening of September 28. */
  const minutes = (count: number) =>
    Array.from({ length: count }, (_, i) => new Date(Date.UTC(2026, 8, 28, 20, i)).toISOString());

  const run = (at: string, cron = PUSH_CRON, env: object = {}) =>
    platform.cron(cron, at, { ...VAPID_ENV, ...env });

  const sentTo = () => service.requests.map((request) => request.endpoint);

  it('reaches 40 browsers a run, oldest first, then the rest, then nobody', async () => {
    const browsers = await turnedOn(...minutes(50));
    await run('2026-10-03T15:01:00Z');
    expect(PUSHES_PER_RUN).toBe(40);
    expect(new Set(sentTo())).toEqual(new Set(browsers.slice(0, 40).map((b) => b.endpoint)));

    await run('2026-10-03T15:03:00Z');
    expect(sentTo().slice(40).sort()).toEqual(
      browsers
        .slice(40)
        .map((b) => b.endpoint)
        .sort(),
    );

    await run('2026-10-03T15:05:00Z');
    expect(service.requests).toHaveLength(50);
    expect(
      await countRows(
        platform,
        "SELECT count(*) AS n FROM push_subscriptions WHERE last_sent_on = '2026-10-03'",
      ),
    ).toBe(50);
  });

  it('sends each date’s own message, encrypted for each browser, and opens nothing else', async () => {
    const [browser] = await turnedOn('2026-09-28T20:00:00.000Z');
    for (const message of REMINDERS.messages) {
      await run(`${message.date}T15:01:00Z`);
      const push = service.requests.at(-1);
      expect(push?.headers.get('Content-Encoding')).toBe('aes128gcm');
      const shown = await readReminder(push, browser);
      expect(shown).toEqual({ title: message.title, body: message.body });
    }
    expect(service.requests).toHaveLength(8);
  });

  it('counts a sign-up for a morning only if it came before 8:00 am', async () => {
    const [late] = await turnedOn('2026-10-03T15:00:00.000Z');
    await run('2026-10-03T15:01:00Z');
    await run('2026-10-03T15:31:00Z');
    expect(service.requests).toHaveLength(0);
    await run('2026-10-04T15:01:00Z');
    expect(sentTo()).toEqual([late?.endpoint]);
  });

  it('sends nothing outside October 1 to 8, 2026, or on another Cron Trigger', async () => {
    await turnedOn(...minutes(3));
    await run('2026-09-30T15:01:00Z');
    await run('2026-10-09T15:01:00Z');
    await run('2027-10-01T15:01:00Z');
    await run('2026-10-03T15:02:00Z', '*/2 15 1-8 10 *');
    await run('2026-10-03T13:00:00Z', CLEANUP_CRON);
    expect(service.requests).toHaveLength(0);
  });

  it('deletes browsers whose push service says they are gone, and tries others again', async () => {
    const [expired, cancelled, busy] = await turnedOn(...minutes(3));
    service.statusFor = (endpoint) =>
      endpoint === expired?.endpoint ? 410 : endpoint === cancelled?.endpoint ? 404 : 500;
    await run('2026-10-05T15:01:00Z');
    const left = await platform.env.DB.prepare(
      'SELECT endpoint, last_sent_on FROM push_subscriptions',
    ).all<{ endpoint: string; last_sent_on: string | null }>();
    expect(left.results).toEqual([{ endpoint: busy?.endpoint, last_sent_on: null }]);

    service.statusFor = () => 201;
    await run('2026-10-05T15:03:00Z');
    expect(sentTo().at(-1)).toBe(busy?.endpoint);
  });

  it('keeps six pushes in flight at most, and three database queries a run', async () => {
    await turnedOn(...minutes(45));
    const db = platform.env.DB;
    let queries = 0;
    // Counts every statement run on its own and every batch as one query each.
    const wrap = (statement: D1PreparedStatement): D1PreparedStatement =>
      new Proxy(statement, {
        get(target, name) {
          const value = Reflect.get(target, name, target) as unknown;
          if (typeof value !== 'function') return value;
          const method = value as (...args: unknown[]) => unknown;
          if (name === 'bind') {
            return (...args: unknown[]) => wrap(method.apply(target, args) as D1PreparedStatement);
          }
          return (...args: unknown[]) => {
            if (['all', 'first', 'run', 'raw'].includes(String(name))) queries += 1;
            return method.apply(target, args);
          };
        },
      });
    const counted = new Proxy(db, {
      get(target, name) {
        if (name === 'prepare') return (sql: string) => wrap(target.prepare(sql));
        if (name === 'batch') {
          return (statements: D1PreparedStatement[]) => {
            queries += 1;
            return target.batch(statements);
          };
        }
        return Reflect.get(target, name, target) as unknown;
      },
    });
    await run('2026-10-06T15:01:00Z', PUSH_CRON, { DB: counted });
    expect(service.requests).toHaveLength(40);
    expect(service.mostAtOnce).toBeGreaterThan(1);
    expect(service.mostAtOnce).toBeLessThanOrEqual(PUSHES_AT_ONCE);
    expect(queries).toBeGreaterThanOrEqual(2);
    expect(queries).toBeLessThanOrEqual(3);
  });

  it('asks push services to drop a reminder after 12 hours, and signs it for that service', async () => {
    await turnedOn(...minutes(1));
    const at = '2026-10-02T15:07:00Z';
    await run(at);
    const [push] = service.requests;
    expect(push?.headers.get('TTL')).toBe('43200');
    const claims = vapidClaims(push?.headers ?? new Headers());
    expect(claims.aud).toBe('https://fcm.googleapis.com');
    expect(claims.sub).toBe('mailto:wwd@lasvegasfortransit.org');
    expect(claims.exp - Date.parse(at) / 1000).toBeGreaterThan(0);
    expect(claims.exp - Date.parse(at) / 1000).toBeLessThanOrEqual(12 * 60 * 60);
  });

  it('keeps sending to a phone that signed out, and stops once reminders are stopped', async () => {
    const cookie = await signUpAs(platform);
    const browser = await makeBrowser();
    await platform.send(
      apiRequest('POST', '/api/push/subscribe', {
        cookie,
        body: { endpoint: browser.endpoint, keys: browser.keys },
      }),
      VAPID_ENV,
    );
    await platform.send(apiRequest('POST', '/api/signout', { cookie, body: {} }));
    // The subscription was saved on the real clock, before October.
    await run('2026-10-07T15:01:00Z');
    expect(sentTo()).toEqual([browser.endpoint]);

    await platform.send(
      apiRequest('POST', '/api/push/unsubscribe', { body: { endpoint: browser.endpoint } }),
      VAPID_ENV,
    );
    await run('2026-10-08T15:01:00Z');
    expect(sentTo()).toEqual([browser.endpoint]);
  });

  it('sends nothing without the private key', async () => {
    await turnedOn(...minutes(2));
    await platform.cron(PUSH_CRON, '2026-10-03T15:01:00Z', {});
    expect(service.requests).toHaveLength(0);
  });

  it('on the preview, sends the pinned day’s reminder to each browser once', async () => {
    const [browser] = await turnedOn('2026-09-23T18:00:00.000Z');
    const preview = { CHECKIN_PREVIEW_DAY: '3' };
    await run('2026-09-23T18:05:00Z', PREVIEW_PUSH_CRON, preview);
    await run('2026-09-23T18:10:00Z', PREVIEW_PUSH_CRON, preview);
    expect(service.requests).toHaveLength(1);
    const shown = await readReminder(service.requests[0], browser);
    expect(shown.title).toBe('Day 3 of 8: leave the car at home today');
  });

  it('deletes every subscription with the rest of the data on November 30', async () => {
    await turnedOn(...minutes(3));
    await platform.cron(CLEANUP_CRON, '2026-11-29T13:00:00Z');
    expect(await countRows(platform, 'SELECT count(*) AS n FROM push_subscriptions')).toBe(3);
    await platform.cron(CLEANUP_CRON, '2026-11-30T13:00:00Z');
    expect(await countRows(platform, 'SELECT count(*) AS n FROM push_subscriptions')).toBe(0);
    expect(await countRows(platform, 'SELECT count(*) AS n FROM participants')).toBe(0);
  });
});
