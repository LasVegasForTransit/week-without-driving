import { expect, test, type Page } from '@playwright/test';

// The preview server has no Worker, so these routes stand in for the signed-in
// participant and the plan API. The test checks the browser journey itself.
const ME = {
  firstName: 'Ana',
  contactMasked: 'a•••@example.com',
  contactType: 'email',
  zip: '89101',
  county: 'Clark',
  instagram: null,
  age: 'adult',
  days: [1],
  trips: [{ day: 1, modes: ['bus'] }],
  today: 2,
  plans: [
    {
      id: 17,
      day: 2,
      destination: 'Sunset Park',
      eventName: null,
      startsAt: '2026-10-02T17:00:00.000Z',
      availableModes: ['bus'],
      willingModes: ['bus'],
      loggedEntryId: null,
    },
  ],
};

interface PlanInput {
  day: number;
  destination: string;
  startsAt: string;
  availableModes: string[];
  willingModes: string[];
}

async function standInPlanApi(page: Page, baseURL: string | undefined): Promise<PlanInput[]> {
  const saves: PlanInput[] = [];
  await page
    .context()
    .addCookies([{ name: 'lvwwd_signed_in', value: '1', url: baseURL ?? 'http://127.0.0.1:4322' }]);
  await page.route('**/api/me', (route) => route.fulfill({ json: ME }));
  await page.route('**/api/plans', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { plans: ME.plans } });
      return;
    }
    if (route.request().method() === 'DELETE') {
      await route.fulfill({ json: {} });
      return;
    }
    const input = route.request().postDataJSON() as PlanInput;
    saves.push(input);
    await route.fulfill({
      status: 201,
      json: { plan: { id: 18, eventName: null, loggedEntryId: null, ...input } },
    });
  });
  return saves;
}

test('shows eight day cards and saves a reactive outing plan on its chosen day', async ({
  page,
  baseURL,
}) => {
  const saves = await standInPlanApi(page, baseURL);
  await page.goto('/my-week');

  await expect(page.getByRole('heading', { name: /Hi, Ana/ })).toBeVisible();
  const days = page.locator('.entries__days [data-day]');
  await expect(days).toHaveCount(8);
  await expect(page.locator('[data-day="1"]')).toContainText('Trip logged');
  await expect(page.locator('[data-day="2"]')).toContainText('Sunset Park');
  await expect(page.getByRole('link', { name: /Play Transit Bingo/ })).toHaveAttribute(
    'href',
    '/bingo',
  );

  const planner = page.locator('[data-plan-form]');
  await expect(planner).toBeVisible();
  await planner.getByLabel('Pick a place to try').check();
  await planner.getByLabel('Choose a place').selectOption('east-las-vegas-library');
  await planner.getByRole('button', { name: 'Next' }).click();
  await planner.getByLabel('Day of the week').selectOption('4');
  await planner.getByLabel('About what time?').fill('13:30');
  await planner.getByRole('button', { name: 'Next' }).click();

  await planner.locator('input[name="availableMode"][value="bus"]').check();
  await planner.locator('input[name="willingMode"][value="bus"]').check();
  await planner.getByRole('button', { name: 'Next' }).click();
  await expect(
    planner.getByRole('link', { name: /route guide for East Las Vegas Library/ }),
  ).toHaveAttribute('href', '/go#east-las-vegas-library');
  await expect(planner.getByRole('link', { name: 'See how to pay your bus fare' })).toBeVisible();

  await planner.getByRole('button', { name: 'Back' }).click();
  await planner.locator('input[name="willingMode"][value="bus"]').uncheck();
  await planner.locator('input[name="willingMode"][value="bike"]').check();
  await planner.getByRole('button', { name: 'Next' }).click();
  await expect(planner.getByRole('link', { name: 'See how to pay your bus fare' })).toHaveCount(0);
  await expect(
    planner.getByRole('link', { name: 'See how to put a bike on the bus' }),
  ).toBeVisible();

  await planner.getByRole('button', { name: 'I’ll go without driving' }).click();
  await expect.poll(() => saves).toHaveLength(1);
  expect(saves[0]).toEqual({
    day: 4,
    destination: 'East Las Vegas Library',
    startsAt: '2026-10-04T20:30:00.000Z',
    availableModes: ['bus'],
    willingModes: ['bike'],
  });
  await expect(page.locator('[data-day="4"]')).toContainText('East Las Vegas Library');
  await expect(page.locator('[data-day="3"]')).not.toContainText('East Las Vegas Library');
  await expect(page.locator('[data-day="5"]')).not.toContainText('East Las Vegas Library');
  await expect(page.locator('[data-plan-status]')).toContainText('Saved for');
});

test('marks a plan as logged as soon as its completed trip is saved', async ({ page, baseURL }) => {
  await standInPlanApi(page, baseURL);
  await page.route('**/api/checkin', async (route) => {
    const body = route.request().postData() ?? '';
    expect(body).toMatch(/name="planId"\r?\n\r?\n17/);
    await route.fulfill({
      json: {
        days: [1, 2],
        trips: [
          { day: 1, modes: ['bus'] },
          { day: 2, modes: ['bus'] },
        ],
      },
    });
  });
  await page.goto('/my-week');

  const day = page.locator('[data-day="2"]');
  await day.getByRole('button', { name: 'Use this plan for today’s entry' }).click();
  const trip = page.locator('[data-trip-form]');
  await trip.locator('input[name="mode"][value="bus"]').check({ force: true });
  await trip
    .getByLabel('Where did you go, and how did you get there?')
    .fill('I took the bus to Sunset Park.');
  await trip.getByRole('button', { name: 'Enter today’s trip' }).click();

  await expect(day).toContainText('Trip entered');
  await expect(day.getByRole('button', { name: 'Use this plan for today’s entry' })).toHaveCount(0);
});

test('does not submit a deleted plan with a completed trip', async ({ page, baseURL }) => {
  await standInPlanApi(page, baseURL);
  let checkinBody = '';
  await page.route('**/api/checkin', async (route) => {
    checkinBody = route.request().postData() ?? '';
    await route.fulfill({ json: { days: [1, 2], trips: [] } });
  });
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/my-week');

  const day = page.locator('[data-day="2"]');
  await day.getByRole('button', { name: 'Use this plan for today’s entry' }).click();
  await day.getByRole('button', { name: 'Remove plan' }).click();
  const trip = page.locator('[data-trip-form]');
  await trip.locator('input[name="mode"][value="bus"]').check({ force: true });
  await trip.getByLabel('Where did you go, and how did you get there?').fill('I took the bus.');
  await trip.getByRole('button', { name: 'Enter today’s trip' }).click();

  await expect.poll(() => checkinBody).not.toBe('');
  expect(checkinBody).not.toContain('planId=');
});
