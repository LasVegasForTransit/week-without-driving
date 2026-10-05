import { expect, test } from '@playwright/test';

const PERSON = {
  firstName: 'Rosa',
  contactMasked: 'r•••@example.com',
  contactType: 'email',
  zip: '89101',
  county: 'Clark',
  instagram: null,
  days: [],
  trips: [],
  plans: [],
  today: 4,
  eventRemindersEnabled: false,
  smsRemindersAvailable: true,
};
test.use({ serviceWorkers: 'block' });

test.beforeEach(async ({ page, context, baseURL }) => {
  await context.addCookies([
    {
      name: 'lvwwd_signed_in',
      value: '1',
      domain: new URL(baseURL ?? 'http://127.0.0.1').hostname,
      path: '/',
    },
  ]);
  await page.clock.setFixedTime(new Date('2026-10-04T19:20:00Z'));
  await page.route('**/api/me', (route) => route.fulfill({ json: PERSON }));
  await page.route('**/api/sms/status', (route) =>
    route.fulfill({ json: { available: true, subscribed: false, pending: false } }),
  );
});

test('texts require consent, a code, and allow cancellation from My week', async ({ page }) => {
  const requested: unknown[] = [];
  await page.route('**/api/sms/request', (route) => {
    requested.push(route.request().postDataJSON());
    return route.fulfill({ json: { pending: true } });
  });
  let approved = false;
  await page.route('**/api/sms/confirm', (route) =>
    route.fulfill({
      status: approved ? 200 : 400,
      json: approved ? { subscribed: true } : { message: 'That code did not match. Try again.' },
    }),
  );
  let stopped = 0;
  await page.route('**/api/sms/unsubscribe', (route) => {
    stopped += 1;
    return route.fulfill({ json: { subscribed: false } });
  });
  await page.goto('/my-week');
  const card = page.getByRole('region', { name: 'Morning text reminders' });
  await expect(card).toBeVisible();
  await card.getByLabel('Mobile number', { exact: true }).fill('7025551234');
  await card.getByRole('button', { name: 'Send confirmation code' }).click();
  expect(requested).toHaveLength(0);
  await card.getByRole('checkbox').check();
  await card.getByRole('button', { name: 'Send confirmation code' }).click();
  await expect(card.getByLabel('Confirmation code', { exact: true })).toBeFocused();
  expect(requested).toEqual([{ phone: '7025551234', consent: true, turnstileToken: '' }]);
  await card.getByLabel('Confirmation code', { exact: true }).fill('000000');
  await card.getByRole('button', { name: 'Confirm text reminders' }).click();
  await expect(card.getByText('That code did not match. Try again.')).toBeVisible();
  approved = true;
  await card.getByLabel('Confirmation code', { exact: true }).fill('123456');
  await card.getByRole('button', { name: 'Confirm text reminders' }).click();
  await expect(
    card.getByText('Morning texts are on. Reply STOP to end them anytime.'),
  ).toBeVisible();
  await card.getByRole('button', { name: 'Stop text reminders' }).click();
  await expect(card.getByText('Text reminders are off.')).toBeVisible();
  expect(stopped).toBe(1);
});

test('unavailable texts stay hidden while the rest of My week works', async ({ page }) => {
  await page.route('**/api/me', (route) =>
    route.fulfill({ json: { ...PERSON, smsRemindersAvailable: false } }),
  );
  await page.goto('/my-week');
  await expect(page.locator('[data-sms]')).toBeHidden();
  await expect(page.getByRole('heading', { name: /Rosa/ })).toBeVisible();
});

test('an SMS fragment opens a sign-in request and is removed from the address bar', async ({
  page,
}) => {
  const token = 'A'.repeat(22);
  const incoming: string[] = [];
  await page.route('**/my-week?t=*', async (route) => {
    incoming.push(new URL(route.request().url()).searchParams.get('t') ?? '');
    await route.fulfill({ status: 302, headers: { Location: '/my-week' }, body: '' });
  });
  await page.goto(`/open#${token}`);
  await expect(page).toHaveURL(/\/my-week$/);
  expect(incoming).toEqual([token]);
});
