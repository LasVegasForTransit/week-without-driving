import {
  captureBeacon,
  captureEvents,
  serveAsProduction,
  type CapturedRequest,
} from '@lasvegasfortransit/analytics/testing';
import { expect, test, type Page } from '@playwright/test';

const production = serveAsProduction('http://127.0.0.1:4322', 'lvwwd.org');
test.use({ baseURL: production.url, launchOptions: { args: production.chromiumArgs } });

interface EventPayload {
  site: string;
  name: string;
  props: Record<string, string>;
}

function payloads(requests: CapturedRequest[]): EventPayload[] {
  return requests.map((request) => JSON.parse(request.body ?? '{}') as EventPayload);
}

async function captureAnalytics(page: Page) {
  return { beacons: await captureBeacon(page), events: await captureEvents(page) };
}

async function answer(page: Page, method: string, path: string, body: unknown) {
  await page.route(`**${path}`, (route) =>
    route.request().method() === method
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
      : route.fallback(),
  );
}

test('production loads one Web Analytics beacon', async ({ page }) => {
  const { beacons } = await captureAnalytics(page);
  await page.goto('/');
  await expect.poll(() => beacons.length).toBe(1);
});

test('a saved trip sends only its day and entry method', async ({ page }) => {
  const { events } = await captureAnalytics(page);
  await page.context().addCookies([{ name: 'lvwwd_signed_in', value: '1', url: production.url }]);
  await answer(page, 'GET', '/api/me', {
    firstName: 'Rosa',
    contactMasked: 'r•••@example.com',
    contactType: 'email',
    zip: '89101',
    instagram: 'rosa.rides',
    age: 'adult',
    newsletter: false,
    days: [],
    trips: [],
    today: 3,
    reminders: { push: false, text: false, email: false },
  });
  await answer(page, 'POST', '/api/checkin', {
    count: 1,
    days: [3],
    trips: [{ day: 3, modes: ['bus'], status: 'pending' }],
  });

  await page.goto('/my-week');
  await page.locator('label', { has: page.locator('input[value="bus"]') }).click();
  await page.getByLabel('Link to your post').fill('https://www.instagram.com/p/C0mmuteByBus/');
  await page.locator('[data-trip-submit]').click();

  await expect
    .poll(() => payloads(events).filter((event) => event.name === 'trip_entry_submitted'))
    .toEqual([
      { site: 'lvwwd.org', name: 'trip_entry_submitted', props: { day: '3', method: 'link' } },
    ]);
  expect(events.map((event) => event.body).join('')).not.toContain('C0mmuteByBus');
});

test('Global Privacy Control suppresses the beacon and events', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-03T18:00:00Z'));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'globalPrivacyControl', { value: true });
  });
  const { beacons, events } = await captureAnalytics(page);

  await page.goto('/bingo');
  await page.locator('label[for="bingo-0"]').click();
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));

  expect(beacons).toEqual([]);
  expect(events).toEqual([]);
});
