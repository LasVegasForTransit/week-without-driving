import { expect, test } from '@playwright/test';

const DRIVE = {
  route: { minutes: 20, meters: 16093.44, fare: null, busMeters: null, steps: ['Head south'] },
};
const BUS = {
  route: {
    minutes: 35,
    meters: 18000,
    fare: null,
    busMeters: 12000,
    steps: ['Take 109 from Bonneville to Sunset.'],
  },
};

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-30T17:00:00Z'));
});

test('compares two routes, updates costs and modes, and offers Club Ride', async ({ page }) => {
  await page.route('**/api/compare', (route) =>
    route.fulfill({ json: { drive: DRIVE, alternative: BUS } }),
  );
  await page.goto('/go/compare');
  await page.getByLabel('Starting place').fill('Bonneville Transit Center, Las Vegas');
  await page.getByLabel('Where to?').fill('Sunset Park, Las Vegas');
  await page.getByRole('button', { name: 'Compare my trip' }).click();
  await expect(page.locator('[data-route-card="drive"]')).toContainText('20 min');
  await expect(page.locator('[data-route-card="alternative"]')).toContainText('35 min');
  await expect(page.locator('[data-route-card="drive"]')).toContainText('$1.80');
  await page.getByLabel('Gas per gallon').fill('5');
  await expect(page.locator('[data-route-card="drive"]')).toContainText('$2.25');
  await expect(page.locator('[data-route-card="alternative"]')).toContainText('Fare varies');
  await page.getByLabel('This is a work or school trip').check();
  await expect(page.getByText('RTC Club Ride')).toBeVisible();
  await page.getByLabel('Scooter', { exact: true }).check();
  await expect(page.locator('[data-route-card="alternative"]')).toContainText(
    'Walking time shown for scooter.',
  );
  await expect(page.locator('[data-route-card="alternative"]')).toContainText(
    'No tailpipe emissions',
  );
  await expect(page.locator('[data-route-card="alternative"]')).toContainText('No fare');
});

test('compares later trips while limiting My week plans to campaign dates', async ({ page }) => {
  await page.route('**/api/compare', (route) =>
    route.fulfill({ json: { drive: DRIVE, alternative: BUS } }),
  );
  await page.goto('/go/compare');
  await page.getByLabel('Starting place').fill('Bonneville Transit Center, Las Vegas');
  await page.getByLabel('Where to?').fill('Sunset Park, Las Vegas');
  await page.getByLabel('Leave on').fill('2026-10-20');
  await page.getByLabel('Bike', { exact: true }).check();
  await page.getByRole('button', { name: 'Compare my trip' }).click();
  await expect(page.locator('[data-route-card="drive"]')).toContainText('20 min');
  await expect(page.getByRole('link', { name: 'Save to My week' })).toBeHidden();
  await page.route('**/api/compare', (route) =>
    route.fulfill({ json: { drive: DRIVE, alternative: { reason: 'unavailable' } } }),
  );
  await page.getByRole('button', { name: 'Compare my trip' }).click();
  await expect(
    page.getByRole('link', { name: 'Open walking directions in Apple Maps' }),
  ).toBeVisible();
});

test('keeps the working route when the bus route is missing and offers useful links', async ({
  page,
}) => {
  await page.route('**/api/compare', (route) =>
    route.fulfill({ json: { drive: DRIVE, alternative: { reason: 'no_route' } } }),
  );
  await page.goto('/go/compare');
  await page.getByLabel('Starting place').fill('Bonneville Transit Center, Las Vegas');
  await page.getByLabel('Where to?').fill('Sunset Park, Las Vegas');
  await page.getByRole('button', { name: 'Compare my trip' }).click();
  await expect(page.locator('[data-route-card="drive"]')).toContainText('20 min');
  await expect(page.getByText('No bus trip showed up for that time.').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Check RTC’s trip planner' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open directions in Apple Maps' })).toBeVisible();
  await expect(page.locator('[data-compare-fallback]')).not.toContainText('quota');
});

test('editing a place during a pending comparison unlocks the button and drops stale results', async ({
  page,
}) => {
  let releaseFirst: () => void = () => undefined;
  let markStarted: () => void = () => undefined;
  const firstPending = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const firstStarted = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  let calls = 0;
  await page.route('**/api/compare', async (route) => {
    calls += 1;
    if (calls === 1) {
      markStarted();
      await firstPending;
    }
    await route.fulfill({ json: { drive: DRIVE, alternative: BUS } });
  });
  await page.goto('/go/compare');
  await page.getByLabel('Starting place').fill('Bonneville Transit Center, Las Vegas');
  await page.getByLabel('Where to?').fill('Sunset Park, Las Vegas');
  const button = page.getByRole('button', { name: 'Compare my trip' });
  await button.click();
  await firstStarted;
  await expect(button).toBeDisabled();
  await page.getByLabel('Where to?').fill('Floyd Lamb Park, Las Vegas');
  await expect(button).toBeEnabled();
  const staleResponse = page.waitForResponse('**/api/compare');
  releaseFirst();
  await staleResponse;
  await expect(page.locator('[data-compare-results]')).toBeHidden();
  await button.click();
  await expect(page.locator('[data-route-card="drive"]')).toContainText('20 min');
  expect(calls).toBe(2);
});

test('a failed mode switch hides the earlier route and offers other directions', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/api/compare', (route) => {
    calls += 1;
    return calls === 1
      ? route.fulfill({ json: { drive: DRIVE, alternative: BUS } })
      : route.fulfill({ status: 503, json: { reason: 'unavailable' } });
  });
  await page.goto('/go/compare');
  await page.getByLabel('Starting place').fill('Bonneville Transit Center, Las Vegas');
  await page.getByLabel('Where to?').fill('Sunset Park, Las Vegas');
  await page.getByRole('button', { name: 'Compare my trip' }).click();
  await expect(page.locator('[data-route-card="drive"]')).toContainText('20 min');
  await page.getByLabel('Bike', { exact: true }).check();
  await expect(page.locator('[data-compare-results]')).toBeHidden();
  await expect(page.getByText('We can’t compare this trip right now.')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Open walking directions in Apple Maps' }),
  ).toBeVisible();
});

test('unclear addresses and offline use show useful next steps without provider details', async ({
  page,
}) => {
  await page.route('**/api/compare', (route) =>
    route.fulfill({ status: 400, json: { reason: 'address', detail: 'PRIVATE PROVIDER DETAIL' } }),
  );
  await page.goto('/go/compare');
  await page.getByLabel('Starting place').fill('Main Street');
  await page.getByLabel('Where to?').fill('The park');
  await page.getByRole('button', { name: 'Compare my trip' }).click();
  await expect(page.getByText('We couldn’t find that trip.')).toBeVisible();
  await expect(page.locator('[data-compare-fallback]')).not.toContainText(
    'PRIVATE PROVIDER DETAIL',
  );
  await expect(page.getByLabel('Starting place')).toHaveValue('Main Street');
  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'Compare my trip' }).click();
  await expect(page.getByText('Reconnect to compare routes.')).toBeVisible();
  await expect(
    page.locator('[data-compare-fallback]').getByRole('link', { name: 'Rider guides' }),
  ).toBeVisible();
  await expect(
    page.locator('[data-compare-fallback]').getByRole('link', { name: 'Offline bus finder' }),
  ).toBeVisible();
});

test('carries a destination, day, time, and mode into My week for review', async ({
  page,
  baseURL,
}) => {
  await page
    .context()
    .addCookies([{ name: 'lvwwd_signed_in', value: '1', url: baseURL ?? 'http://127.0.0.1:4322' }]);
  await page.route('**/api/compare', (route) =>
    route.fulfill({ json: { drive: DRIVE, alternative: BUS } }),
  );
  await page.route('**/api/me', (route) =>
    route.fulfill({
      json: {
        firstName: 'Ana',
        contactMasked: 'a•••@example.com',
        contactType: 'email',
        zip: '89101',
        county: 'Clark',
        instagram: null,
        age: 'adult',
        days: [],
        trips: [],
        today: 1,
        plans: [],
      },
    }),
  );
  await page.route('**/api/plans', (route) => route.fulfill({ json: { plans: [] } }));
  await page.goto('/go/compare');
  await page.getByLabel('Starting place').fill('Bonneville Transit Center, Las Vegas');
  await page.getByLabel('Where to?').fill('Sunset Park, Las Vegas');
  await page.getByLabel('Leave on').fill('2026-10-03');
  await page.getByLabel('At about').fill('17:30');
  await page.getByLabel('Bike', { exact: true }).check();
  await page.getByRole('button', { name: 'Compare my trip' }).click();
  await page.getByRole('link', { name: 'Save to My week' }).click();
  await expect(page.getByLabel('My own destination')).toBeChecked();
  await expect(page.getByLabel('Where do you want to go?')).toHaveValue('Sunset Park, Las Vegas');
  await expect(page.getByLabel('Day of the week')).toHaveValue('3');
  await expect(page.getByLabel('About what time?')).toHaveValue('17:30');
  await expect(page.locator('input[name="willingMode"][value="bike"]')).toBeChecked();
});
