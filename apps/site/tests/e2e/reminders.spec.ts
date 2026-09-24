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
  instagram: null,
  age: 'adult',
  newsletter: false,
  days: [],
  trips: [],
  today: 0,
};

const BEFORE_THE_WEEK = '2026-09-28T19:00:00Z';

/** Signs this browser in as far as My week's script can tell, and answers the API. */
async function signIn(page: Page): Promise<{ subscribed: unknown[]; stopped: unknown[] }> {
  const calls = { subscribed: [] as unknown[], stopped: [] as unknown[] };
  const site = new URL(test.info().project.use.baseURL ?? 'http://127.0.0.1:4321').origin;
  await page.context().addCookies([{ name: 'lvwwd_signed_in', value: '1', url: site }]);
  await page.route('**/api/me', (route) => route.fulfill({ json: ME }));
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
}

/**
 * The browser's notification question and its push service, standing in
 * for the real ones: headless Chromium answers every question with "no"
 * and can't reach a push service.
 */
async function standInPushService(page: Page, options: StandIn = {}): Promise<void> {
  await page.addInitScript(
    ({ subscribed, answer, permission }) => {
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
    },
  );
}

const section = (page: Page) => page.locator('[data-remind]');

test.describe('the reminder section on My week', () => {
  test('sits below the shortcuts and above "Keep going after the week", with its own heading', async ({
    page,
  }) => {
    await signIn(page);
    await standInPushService(page);
    await page.clock.setFixedTime(new Date(BEFORE_THE_WEEK));
    await page.goto('/my-week');

    const heading = page.getByRole('heading', { level: 2, name: 'Remind me to share my trip' });
    await expect(heading).toBeVisible();
    await expect(section(page)).toContainText(
      'One short reminder each morning, October 1 to 8, at about 8:00 am, to leave the car at home and share your trip. You can stop anytime.',
    );
    await expect(
      page.getByRole('heading', { level: 3, name: 'Browser notifications' }),
    ).toBeVisible();
    await expect(section(page)).toContainText('No phone number needed.');
    await expect(section(page).getByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'href',
      '/privacy',
    );

    const shortcuts = await page.getByRole('heading', { name: 'Plan today’s trip' }).boundingBox();
    const reminders = await heading.boundingBox();
    const keepGoing = await page
      .getByRole('heading', { name: 'Keep going after the week' })
      .boundingBox();
    expect(reminders?.y).toBeGreaterThan(shortcuts?.y ?? Infinity);
    expect(reminders?.y).toBeLessThan(keepGoing?.y ?? -Infinity);

    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(sideways).toBe(false);
  });

  test('turns notifications on with one tap, and stops them with another', async ({ page }) => {
    const calls = await signIn(page);
    await standInPushService(page);
    await page.clock.setFixedTime(new Date(BEFORE_THE_WEEK));
    await page.goto('/my-week');

    await page.getByRole('button', { name: 'Turn on notifications' }).click();
    await expect(section(page)).toContainText(
      'Reminders are on for this device. Your first one arrives October 1 at about 8:00 am.',
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

  test('during the week, says the next reminder comes in the morning', async ({ page }) => {
    await signIn(page);
    await standInPushService(page, { subscribed: true });
    await page.clock.setFixedTime(new Date('2026-10-03T20:00:00Z'));
    // A phone with reminders on has been here before, so its service worker is in place.
    await page.goto('/my-week');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.reload();
    await expect(section(page)).toContainText(
      'Reminders are on for this device. The next one arrives at about 8:00 am.',
    );
    await expect(page.getByRole('button', { name: 'Stop reminders' })).toBeVisible();
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

  test('shows only its closing line from 8:00 am on October 8', async ({ page }) => {
    await signIn(page);
    await standInPushService(page);
    await page.clock.setFixedTime(new Date('2026-10-08T14:59:59Z'));
    await page.goto('/my-week');
    await expect(page.getByRole('heading', { name: 'Remind me to share my trip' })).toBeVisible();

    await page.clock.setFixedTime(new Date('2026-10-08T15:00:00Z'));
    await page.reload();
    await expect(section(page)).toContainText(
      'Daily reminders have ended. Thanks for taking part!',
    );
    await expect(page.getByRole('heading', { name: 'Remind me to share my trip' })).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Browser notifications' })).toBeHidden();
  });

  test('is not shown on a phone that is not signed in', async ({ page }) => {
    await page.goto('/my-week');
    await expect(page.getByText('This phone isn’t signed in.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Remind me to share my trip' })).toBeHidden();
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
