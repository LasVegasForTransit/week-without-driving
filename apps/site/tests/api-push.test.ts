import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACCESS_ENV,
  type AccessKeys,
  adminClient,
  countRows,
  makeAccessKeys,
  noticeOf,
} from './support/admin';
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
  TEST_VAPID,
  VAPID_ENV,
  makeBrowser,
  pushService,
  readReminder,
} from './support/push';

// Turning browser notifications on and off from My week, and the
// volunteers' test reminder, through the real Worker against a local D1
// database and a stand-in push service.
describe('browser reminders', () => {
  let platform: Platform;
  let service: PushService;
  let access: AccessKeys;
  let cookie: string;
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    platform = await startPlatform();
    access = await makeAccessKeys();
    service = pushService();
    const outbound = fakeOutbound(realFetch);
    outbound.accessKeys = [access.publicJwk];
    vi.stubGlobal('fetch', service.fetch(outbound.fetch));
  }, 60_000);
  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    await platform.dispose();
  });
  beforeEach(async () => {
    vi.useRealTimers();
    await platform.reset();
    service.requests.length = 0;
    service.statusFor = () => 201;
    cookie = await signUpAs(platform);
  });

  const at = (iso: string) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(iso));
  };
  // `as` is the phone's cookies; null sends none.
  const subscribe = (browser: TestBrowser | object, as: string | null = cookie) =>
    platform.send(
      apiRequest('POST', '/api/push/subscribe', {
        ...(as ? { cookie: as } : {}),
        body:
          'keys' in browser
            ? { endpoint: browser.endpoint, expirationTime: null, keys: browser.keys }
            : browser,
      }),
      VAPID_ENV,
    );
  const unsubscribe = (endpoint: string) =>
    platform.send(apiRequest('POST', '/api/push/unsubscribe', { body: { endpoint } }), VAPID_ENV);
  const rows = () =>
    platform.env.DB.prepare(
      'SELECT id, participant_id, endpoint, created_at, last_sent_on FROM push_subscriptions',
    ).all<{
      id: string;
      participant_id: string;
      endpoint: string;
      created_at: string;
      last_sent_on: string | null;
    }>();
  const participantId = async (email: string) =>
    (
      await platform.env.DB.prepare('SELECT id FROM participants WHERE contact = ?1')
        .bind(email)
        .first<{ id: string }>()
    )?.id;

  it('gives browsers the public key the Worker works out from its private key', async () => {
    const response = await platform.send(apiRequest('GET', '/api/push/key'), VAPID_ENV);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ publicKey: TEST_VAPID.publicKey });

    const off = await platform.send(apiRequest('GET', '/api/push/key'));
    expect(off.status).toBe(503);
  });

  it('saves a subscription once for the person signed in', async () => {
    const browser = await makeBrowser();
    expect((await subscribe(browser)).status).toBe(201);
    expect((await subscribe(browser)).status).toBe(200);
    const saved = (await rows()).results;
    expect(saved).toHaveLength(1);
    expect(saved[0]?.endpoint).toBe(browser.endpoint);
    expect(saved[0]?.participant_id).toBe(await participantId('rosa@example.com'));
  });

  it('gives a shared phone’s subscription to whoever turned it on last', async () => {
    const browser = await makeBrowser();
    await subscribe(browser);
    const second = await signUpAs(platform, { contact: 'sam@example.com', firstName: 'Sam' });
    expect((await subscribe(browser, second)).status).toBe(200);
    const saved = (await rows()).results;
    expect(saved).toHaveLength(1);
    expect(saved[0]?.participant_id).toBe(await participantId('sam@example.com'));
  });

  it('saves nothing without a signed-in phone', async () => {
    const browser = await makeBrowser();
    expect((await subscribe(browser, null)).status).toBe(401);
    const stale = `__Host-lvwwd_session=${'A'.repeat(43)}; lvwwd_signed_in=1`;
    expect((await subscribe(browser, stale)).status).toBe(401);
    expect(await countRows(platform, 'SELECT count(*) AS n FROM push_subscriptions')).toBe(0);
  });

  it('refuses addresses outside the browser makers’ push services, and missing keys', async () => {
    const browser = await makeBrowser();
    const tries = [
      { endpoint: 'https://example.com/push/1', keys: browser.keys },
      { endpoint: browser.endpoint.replace('https:', 'http:'), keys: browser.keys },
      { endpoint: browser.endpoint, keys: { p256dh: browser.keys.p256dh } },
      { endpoint: browser.endpoint },
    ];
    for (const body of tries) expect((await subscribe(body)).status).toBe(400);
    expect(await countRows(platform, 'SELECT count(*) AS n FROM push_subscriptions')).toBe(0);

    for (const service of [
      'https://updates.push.services.mozilla.com/wpush/v2/',
      'https://web.push.apple.com/',
      'https://wns2-by3p.notify.windows.com/w/?token=',
    ]) {
      expect((await subscribe(await makeBrowser(service))).status).toBe(201);
    }
  });

  it('stops taking sign-ups at 8:00 am on October 8', async () => {
    at('2026-10-08T15:00:00Z');
    expect((await subscribe(await makeBrowser())).status).toBe(410);
    at('2026-10-08T14:59:59Z');
    expect((await subscribe(await makeBrowser())).status).toBe(201);
  });

  it('stops reminders for an address without a sign-in, and says so twice', async () => {
    const browser = await makeBrowser();
    await subscribe(browser);
    expect((await unsubscribe(browser.endpoint)).status).toBe(200);
    expect((await unsubscribe(browser.endpoint)).status).toBe(200);
    expect((await unsubscribe('https://fcm.googleapis.com/fcm/send/nobody')).status).toBe(200);
    expect(await countRows(platform, 'SELECT count(*) AS n FROM push_subscriptions')).toBe(0);
    const empty = await platform.send(
      apiRequest('POST', '/api/push/unsubscribe', { body: {} }),
      VAPID_ENV,
    );
    expect(empty.status).toBe(400);
  });

  it('keeps reminders on a phone that signs out', async () => {
    const browser = await makeBrowser();
    await subscribe(browser);
    await platform.send(apiRequest('POST', '/api/signout', { cookie, body: {} }));
    expect((await rows()).results).toHaveLength(1);
  });

  describe('the volunteers’ test reminder', () => {
    let admin: ReturnType<typeof adminClient>;
    beforeEach(() => {
      admin = adminClient(platform, access, VAPID_ENV);
    });

    it('lists browsers newest first, with no address and no name', async () => {
      await subscribe(await makeBrowser());
      await subscribe(await makeBrowser());
      const page = await (await admin.get('/admin')).text();
      expect(page).toContain('2 browsers have daily reminders on');
      expect(page.match(/<button type="submit">Send test reminder<\/button>/g)).toHaveLength(2);
      expect(page).not.toContain('fcm.googleapis.com');
      expect(page).not.toContain('Rosa');
    });

    it('shows a phone today’s reminder at once, day 1’s before the week, without using up that day', async () => {
      at('2026-09-28T19:00:00Z');
      const browser = await makeBrowser();
      await subscribe(browser);
      const [row] = (await rows()).results;
      const response = await admin.post('/admin/push/test', { id: row?.id ?? '' });
      expect(noticeOf(response)).toBe('push-sent');
      const [push] = service.requests;
      expect(push?.endpoint).toBe(browser.endpoint);
      const shown = await readReminder(push, browser);
      expect(shown.title).toBe('Day 1 of 8: leave the car at home today');
      expect((await rows()).results[0]?.last_sent_on).toBeNull();

      await admin.post('/admin/push/test', { id: row?.id ?? '' });
      const preview = adminClient(platform, access, { ...VAPID_ENV, CHECKIN_PREVIEW_DAY: '3' });
      await preview.post('/admin/push/test', { id: row?.id ?? '' });
      const day3 = await readReminder(service.requests.at(-1), browser);
      expect(day3.title).toBe('Day 3 of 8: leave the car at home today');
    });

    it('takes a browser off the list when its push service says it’s gone', async () => {
      const browser = await makeBrowser();
      await subscribe(browser);
      const [row] = (await rows()).results;
      service.statusFor = () => 410;
      const response = await admin.post('/admin/push/test', { id: row?.id ?? '' });
      expect(noticeOf(response)).toBe('push-gone');
      expect((await rows()).results).toHaveLength(0);
    });

    it('says so when the push service refuses, or the browser is not on the list', async () => {
      await subscribe(await makeBrowser());
      const [row] = (await rows()).results;
      service.statusFor = () => 500;
      expect(noticeOf(await admin.post('/admin/push/test', { id: row?.id ?? '' }))).toBe(
        'push-failed',
      );
      expect((await rows()).results).toHaveLength(1);
      expect(noticeOf(await admin.post('/admin/push/test', { id: 'nobody' }))).toBe('push-missing');
      const noKey = adminClient(platform, access, {});
      expect(noticeOf(await noKey.post('/admin/push/test', { id: row?.id ?? '' }))).toBe(
        'push-off',
      );
    });

    it('keeps /admin open before the reminders table exists', async () => {
      const db = platform.env.DB;
      const schema = await db
        .prepare("SELECT sql FROM sqlite_master WHERE tbl_name = 'push_subscriptions'")
        .all<{ sql: string | null }>();
      await db.prepare('DROP TABLE push_subscriptions').run();
      try {
        const response = await admin.get('/admin');
        expect(response.status).toBe(200);
        expect(await response.text()).toContain('pnpm bootstrap --production');
      } finally {
        for (const { sql } of schema.results) if (sql) await db.prepare(sql).run();
      }
    });

    it('is for volunteers only', async () => {
      await subscribe(await makeBrowser());
      const [row] = (await rows()).results;
      const body = new URLSearchParams({ id: row?.id ?? '' });
      const response = await platform.send(
        new Request('https://lvwwd.test/admin/push/test', {
          method: 'POST',
          headers: { Origin: 'https://lvwwd.test' },
          body,
        }),
        { ...ACCESS_ENV, ...VAPID_ENV },
      );
      expect(response.status).toBe(403);
      expect(service.requests).toHaveLength(0);
    });
  });
});
