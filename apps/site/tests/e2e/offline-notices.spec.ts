import { type BrowserContext, expect, test } from '@playwright/test';

// The forms that need a connection say so while the phone is offline, dim
// the buttons that send something, keep what was typed, and work again
// when the connection returns. Nothing may ask the API while offline.

const SIGN_UP_NOTICE = 'You’re offline. You can sign up as soon as you’re back online.';
const GET_LINK_NOTICE = 'You’re offline. Try requesting your link when you’re back online.';
const TRIP_NOTICE =
  'You’re offline. My week needs a connection to show entries and submit your trip.';
const SEND_LINK_NOTICE = 'You’re offline. Try requesting your link when you’re back online.';

let offline = false;
let apiCallsOffline: string[] = [];

test.beforeEach(({ page }) => {
  offline = false;
  apiCallsOffline = [];
  page.on('request', (request) => {
    const api = new URL(request.url()).pathname.startsWith('/api/');
    if (api && offline) apiCallsOffline.push(request.url());
  });
});

test.afterEach(() => {
  expect(apiCallsOffline).toEqual([]);
});

async function goOffline(context: BrowserContext) {
  offline = true;
  await context.setOffline(true);
}

test('Sign up says it needs a connection, and works again when back online', async ({
  page,
  context,
}) => {
  await page.goto('/sign-up');
  await page.getByLabel('First name').fill('Luz');
  await page.getByLabel('ZIP code').fill('89101');

  await goOffline(context);
  const notice = page.getByText(SIGN_UP_NOTICE);
  await expect(notice).toBeVisible();
  const button = page.getByRole('button', { name: 'Sign up', exact: true });
  await expect(button).toHaveAttribute('aria-disabled', 'true');
  // The notice is the element just before the button, and is read aloud.
  const before = button.locator('xpath=preceding-sibling::*[1]');
  await expect(before).toContainText(SIGN_UP_NOTICE);
  await expect(before).toHaveAttribute('aria-live', 'assertive');

  // Tapping the dimmed button, or pressing Enter in a field, sends nothing.
  // (force: Playwright itself won't tap a button marked disabled.)
  await button.click({ force: true });
  await page.getByLabel('ZIP code').press('Enter');
  await expect(notice).toBeVisible();
  await expect(page).toHaveURL('/sign-up');
  await expect(page.getByLabel('First name')).toHaveValue('Luz');
  await expect(page.getByLabel('ZIP code')).toHaveValue('89101');

  // The button can still be reached with the keyboard.
  await button.focus();
  await expect(button).toBeFocused();

  offline = false;
  await context.setOffline(false);
  await expect(notice).toHaveCount(0);
  await expect(button).not.toHaveAttribute('aria-disabled', 'true');
  const backOnline = page.locator('[aria-live="polite"]', { hasText: 'You’re back online.' });
  await expect(backOnline).toHaveCount(1);
  await expect(backOnline).toHaveCount(0, { timeout: 5000 });
});

test('Get my link says it needs a connection, and keeps the typed email', async ({
  page,
  context,
}) => {
  await page.goto('/my-week/link');
  await page.getByLabel('Email address').fill('luz@example.com');
  await goOffline(context);
  await expect(page.getByText(GET_LINK_NOTICE)).toBeVisible();
  const button = page.getByRole('button', { name: 'Send my link' });
  await expect(button).toHaveAttribute('aria-disabled', 'true');
  await button.click({ force: true });
  await expect(page.getByLabel('Email address')).toHaveValue('luz@example.com');
  await expect(page.getByText('Check your email.')).toBeHidden();
});

test('a page opened while offline shows its notice at once', async ({ page }) => {
  // The page itself comes from the network, but the phone says it's offline.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false });
  });
  await page.goto('/sign-up');
  await expect(page.getByText(SIGN_UP_NOTICE)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign up', exact: true })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
});

test('with the clock after sign-up closes, no notice appears', async ({ page, context }) => {
  await page.clock.install({ time: new Date('2026-10-09T08:00:00Z') });
  await page.goto('/sign-up');
  await goOffline(context);
  await expect(page.getByRole('heading', { name: 'Entries are closed.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign up', exact: true })).toBeHidden();
  await expect(page.locator('[data-offline-notice]')).toHaveCount(0);
});

test('My week says which of its parts need a connection', async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: 'lvwwd_signed_in', value: '1', url: baseURL ?? '' }]);
  await page.route('**/api/me', (route) =>
    route.fulfill({
      json: {
        firstName: 'Luz',
        contactMasked: 'l•••@example.com',
        contactType: 'email',
        zip: '89101',
        county: 'Clark',
        instagram: null,
        age: 'adult',
        days: [1],
        trips: [],
        today: 3,
      },
    }),
  );
  await page.goto('/my-week');
  await expect(page.getByRole('heading', { name: /Hi, Luz/ })).toBeVisible();
  // The keyboard, as the page's sticky header can sit over a box on a phone.
  await page.getByLabel('Bus').focus();
  await page.keyboard.press('Space');
  await expect(page.getByLabel('Bus')).toBeChecked();

  await goOffline(context);
  await expect(page.getByText(TRIP_NOTICE)).toBeVisible();
  await expect(page.locator('[data-remind]')).toBeHidden();
  await expect(page.getByText(SEND_LINK_NOTICE)).toBeVisible();

  const send = page.getByRole('button', { name: 'Enter today’s trip' });
  await expect(send).toHaveAttribute('aria-disabled', 'true');
  await send.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Bus')).toBeChecked();

  const again = page.getByRole('link', { name: 'Send my link again' });
  await again.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/my-week');
});

test('a personal link opened offline says to open it again, and does once back online', async ({
  page,
  context,
}) => {
  // One visit with a connection lets the service worker save the offline page.
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);

  await goOffline(context);
  await page.goto('/my-week?t=a-link-opened-offline');
  const notice = page.getByText('You’re offline. Open this link again when you’re back online.');
  await expect(notice).toBeVisible();

  offline = false;
  await context.setOffline(false);
  // A phone fires "online" when its connection returns. Chromium's
  // emulation doesn't for a page the service worker answered, so fire it.
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  // The link is opened again. (This test server has no Worker to sign the
  // phone in, so it shows My week signed out.)
  await expect(notice).toBeHidden();
  await expect(page.getByRole('heading', { level: 1, name: 'My week' })).toBeVisible();
});
