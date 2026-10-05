import { expect, test, type Page } from '@playwright/test';

// My week's "Remind me to share my trip" section, in a real browser. The
// preview server has no Worker, so the API answers here stand in for it,
// and a stand-in push service stands in for the browser maker's
// (Playwright's Chromium can't reach one).

const ME = {
  firstName: 'Ana',
  contactMasked: 'a•••@example.com',
  contactType: 'email',
  zip: '89101',
  county: 'Clark',
  instagram: null,
  age: 'adult',
  days: [],
  trips: [],
  today: 0,
  plans: [],
  eventRemindersEnabled: true,
};

const BEFORE_THE_WEEK = '2026-09-28T19:00:00Z';

/** Signs this browser in as far as My week's script can tell, and answers the API. */
async function signIn(
  page: Page,
  enabled = true,
): Promise<{ subscribed: unknown[]; stopped: unknown[] }> {
  const calls = { subscribed: [] as unknown[], stopped: [] as unknown[] };
  const site = new URL(test.info().project.use.baseURL ?? 'http://127.0.0.1:4321').origin;
  await page.context().addCookies([{ name: 'lvwwd_signed_in', value: '1', url: site }]);
  await page.route('**/api/me', (route) =>
    route.fulfill({ json: { ...ME, eventRemindersEnabled: enabled } }),
  );
  await page.route('**/api/push/status', (route) => route.fulfill({ json: { subscribed: true } }));
  await page.route('**/api/push/key', (route) =>
    route.fulfill({
      json: {
        publicKey:
          'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
      },
    }),
  );
  await page.route('**/api/push/subscribe', async (route) => {
    calls.subscribed.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, json: { ok: true } });
  });
  await page.route('**/api/push/unsubscribe', async (route) => {
    calls.stopped.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true } });
  });
  return calls;
}

interface StandIn {
  /** A subscription is already in place when the page opens. */
  subscribed?: boolean;
  /** What the browser's own question answers. */
  answer?: NotificationPermission;
  /** The permission before anything is asked. */
  permission?: NotificationPermission;
  stopFails?: boolean;
}

/**
 * The browser's notification question and its push service, standing in
 * for the real ones: headless Chromium answers every question with "no"
 * and can't reach a push service.
 */
async function standInPushService(page: Page, options: StandIn = {}): Promise<void> {
  await page.addInitScript(
    ({ subscribed, answer, permission, stopFails }) => {
      let state = permission;
      Object.defineProperty(Notification, 'permission', { get: () => state });
      Notification.requestPermission = () => {
        state = answer;
        return Promise.resolve(state);
      };
      const make = () => ({
        endpoint: 'https://fcm.googleapis.com/fcm/send/playwright',
        toJSON() {
          return {
            endpoint: this.endpoint,
            expirationTime: null,
            keys: {
              p256dh:
                'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
              auth: 'BTBZMqHH6r4Tts7J_aSIgg', // gitleaks:allow (RFC 8291 test value)
            },
          };
        },
        unsubscribe() {
          if (stopFails) return Promise.reject(new Error('test cancellation failure'));
          current = null;
          return Promise.resolve(true);
        },
      });
      let current: ReturnType<typeof make> | null = subscribed ? make() : null;
      PushManager.prototype.getSubscription = () =>
        Promise.resolve(current as unknown as PushSubscription | null);
      PushManager.prototype.subscribe = () => {
        current = make();
        return Promise.resolve(current as unknown as PushSubscription);
      };
    },
    {
      subscribed: options.subscribed ?? false,
      answer: options.answer ?? 'granted',
      permission: options.permission ?? (options.subscribed ? 'granted' : 'default'),
      stopFails: options.stopFails ?? false,
    },
  );
}

const section = (page: Page) => page.locator('[data-remind]');

test.describe('the reminder section on My week', () => {
  test('stays hidden in the public participant journey before phone delivery is proven', async ({
    page,
  }) => {
    await signIn(page, false);
    await page.goto('/my-week');
    await expect(page.getByRole('heading', { name: /Hi, Ana/ })).toBeVisible();
    await expect(section(page)).toBeHidden();
  });

  test('turns notifications on with one tap, and stops them with another', async ({ page }) => {
    const calls = await signIn(page);
    await standInPushService(page);
    await page.clock.setFixedTime(new Date(BEFORE_THE_WEEK));
    await page.goto('/my-week');

    await page.getByRole('button', { name: 'Turn on notifications' }).click();
    await expect(section(page)).toContainText(
      'Event reminders are on for this device. Choose a reminder time when you save a plan.',
    );
    expect(calls.subscribed).toEqual([
      expect.objectContaining({ endpoint: 'https://fcm.googleapis.com/fcm/send/playwright' }),
    ]);
    await expect(page.getByRole('button', { name: 'Turn on notifications' })).toBeHidden();

    await page.getByRole('button', { name: 'Stop reminders' }).click();
    await expect(section(page)).toContainText('Reminders are off for this device.');
    await expect(page.getByRole('button', { name: 'Turn on notifications' })).toBeVisible();
    await expect
      .poll(() => calls.stopped)
      .toEqual([{ endpoint: 'https://fcm.googleapis.com/fcm/send/playwright' }]);
  });

  test('says so when notifications are blocked, with no button', async ({ page }) => {
    await signIn(page);
    await standInPushService(page, { permission: 'denied' });
    await page.clock.setFixedTime(new Date(BEFORE_THE_WEEK));
    await page.goto('/my-week');
    await expect(section(page)).toContainText('Notifications are blocked for lvwwd.org');
    await expect(section(page).getByRole('button', { includeHidden: false })).toHaveCount(0);
  });

  test('turns nothing on when the browser’s question is answered no', async ({ page }) => {
    const calls = await signIn(page);
    await standInPushService(page, { answer: 'denied' });
    await page.clock.setFixedTime(new Date(BEFORE_THE_WEEK));
    await page.goto('/my-week');
    await page.getByRole('button', { name: 'Turn on notifications' }).click();
    await expect(section(page)).toContainText('Notifications are blocked for lvwwd.org');
    expect(calls.subscribed).toEqual([]);
  });

  test('allows enrollment throughout October 8, then closes at midnight', async ({ page }) => {
    await signIn(page);
    await standInPushService(page);
    await page.clock.setFixedTime(new Date('2026-10-08T22:00:00Z'));
    await page.goto('/my-week');
    await expect(page.getByRole('button', { name: 'Turn on notifications' })).toBeVisible();
    await page.clock.setFixedTime(new Date('2026-10-09T07:00:00Z'));
    await page.reload();
    await expect(section(page)).toContainText('Event reminders have ended.');
    await expect(page.getByRole('button', { name: 'Turn on notifications' })).toBeHidden();
  });

  test('keeps Stop available after enrollment closes', async ({ page }) => {
    await signIn(page);
    await standInPushService(page, { subscribed: true });
    await page.clock.setFixedTime(new Date('2026-10-09T07:00:00Z'));
    await page.goto('/my-week');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.reload();
    await expect(page.getByRole('button', { name: 'Stop reminders' })).toBeVisible();
    await page.getByRole('button', { name: 'Stop reminders' }).click();
    await expect(section(page)).toContainText('Reminders are off for this device.');
    await expect(page.getByRole('button', { name: 'Turn on notifications' })).toBeHidden();
  });

  test('keeps Stop available when neither browser nor server confirms cancellation', async ({
    page,
  }) => {
    await signIn(page);
    await standInPushService(page, { subscribed: true, stopFails: true });
    await page.route('**/api/push/unsubscribe', (route) => route.abort('failed'));
    await page.goto('/my-week');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.reload();
    await page.getByRole('button', { name: 'Stop reminders' }).click();
    await expect(section(page)).toContainText(
      'Reminders may still be on. Try stopping them again.',
    );
    await expect(page.getByRole('button', { name: 'Stop reminders' })).toBeEnabled();
    await expect(section(page)).not.toContainText('Reminders are off');
  });

  test('can cancel browser notifications offline', async ({ page, context }) => {
    const calls = await signIn(page);
    await standInPushService(page, { subscribed: true });
    await page.goto('/my-week');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.reload();
    await expect(page.getByRole('button', { name: 'Stop reminders' })).toBeVisible();
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Stop reminders' }).click();
    await expect(section(page)).toContainText('Reminders are off for this device.');
    expect(calls.stopped).toEqual([]);
  });

  test('does not show the previous participant’s subscription as the new participant’s reminders', async ({
    page,
  }) => {
    await signIn(page);
    await standInPushService(page, { subscribed: true });
    await page.route('**/api/push/status', (route) =>
      route.fulfill({ json: { subscribed: false } }),
    );
    await page.goto('/my-week');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.reload();
    await expect(page.getByRole('button', { name: 'Turn on notifications' })).toBeVisible();
    await expect(section(page)).not.toContainText('Event reminders are on');
  });
});

test.describe('on an iPhone outside the Home Screen', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  });

  test('explains the Home Screen and opens the steps', async ({ page }) => {
    await signIn(page);
    // The Home Screen steps have been seen once, so they don't open by themselves.
    await page.addInitScript(() => {
      localStorage.setItem('wwd-ios-install-dismissed', '2026-09-20T00:00:00.000Z');
    });
    await page.clock.setFixedTime(new Date(BEFORE_THE_WEEK));
    await page.goto('/my-week');
    await expect(section(page)).toContainText(
      'On iPhone, notifications work only from the Home Screen.',
    );
    await expect(page.getByRole('button', { name: 'Turn on notifications' })).toBeHidden();
    await page.getByRole('button', { name: 'Show me how' }).click();
    await expect(
      page.getByRole('heading', { name: 'Add WWD Las Vegas to your Home Screen' }),
    ).toBeVisible();
  });
});
