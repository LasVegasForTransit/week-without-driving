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
      origin: 'Downtown Las Vegas',
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
  origin: string;
  destination: string;
  startsAt: string;
  availableModes: string[];
  willingModes: string[];
}

async function standInPlanApi(page: Page, baseURL: string | undefined): Promise<PlanInput[]> {
  const saves: PlanInput[] = [];
  const me = { ...ME, plans: [...ME.plans] };
  await page
    .context()
    .addCookies([{ name: 'lvwwd_signed_in', value: '1', url: baseURL ?? 'http://127.0.0.1:4322' }]);
  await page.route('**/api/me', (route) => route.fulfill({ json: me }));
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
    const plan = { id: 18, eventName: null, loggedEntryId: null, ...input };
    me.plans.push(plan);
    await route.fulfill({
      status: 201,
      json: { plan },
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

  await page.locator('.myweek__hello').getByRole('link', { name: 'Plan a trip' }).click();
  await expect(page).toHaveURL(/\/my-week\/plan\/where$/);
  await expect(page.getByRole('heading', { name: 'Where are you going?' })).toBeVisible();
  const planner = page.locator('[data-plan-form]');
  await planner.getByLabel('Where will you start?').fill('Downtown Las Vegas');
  await planner.getByLabel('Pick from the list').check();
  await planner.getByLabel('Choose a place').selectOption('east-las-vegas-library');
  await planner.getByRole('button', { name: 'Next' }).click();
  await expect(page).toHaveURL(/\/my-week\/plan\/when$/);
  await planner.getByLabel('Day of the week').selectOption('4');
  await planner.getByLabel('About what time?').fill('13:30');
  await page.reload();
  await expect(planner.getByLabel('Day of the week')).toHaveValue('4');
  await expect(planner.getByLabel('About what time?')).toHaveValue('13:30');
  await planner.getByRole('button', { name: 'Next' }).click();
  await expect(page).toHaveURL(/\/my-week\/plan\/available$/);

  await planner.locator('input[name="availableMode"][value="bus"]').check();
  await planner.getByRole('button', { name: 'Next' }).click();
  await expect(page).toHaveURL(/\/my-week\/plan\/try$/);
  await planner.locator('input[name="willingMode"][value="bus"]').check();
  await planner.getByRole('button', { name: 'Next' }).click();
  await expect(page).toHaveURL(/\/my-week\/plan\/review$/);
  await expect(
    planner.getByRole('link', { name: /route guide for East Las Vegas Library/ }),
  ).toHaveAttribute('href', '/go#east-las-vegas-library');
  await expect(planner.getByRole('link', { name: 'See how to pay your bus fare' })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/my-week\/plan\/try$/);
  await expect(planner.locator('input[name="willingMode"][value="bus"]')).toBeChecked();
  await planner.locator('input[name="willingMode"][value="bus"]').uncheck();
  await planner.locator('input[name="willingMode"][value="bike"]').check();
  await planner.getByRole('button', { name: 'Next' }).click();
  await expect(page).toHaveURL(/\/my-week\/plan\/review$/);
  await expect(planner.getByRole('link', { name: 'See how to pay your bus fare' })).toHaveCount(0);
  await expect(
    planner.getByRole('link', { name: 'See how to put a bike on the bus' }),
  ).toBeVisible();

  await planner.getByRole('button', { name: 'Save this plan' }).click();
  await expect(page).toHaveURL(/\/my-week\?plan=saved$/);
  await expect.poll(() => saves).toHaveLength(1);
  expect(saves[0]).toEqual({
    day: 4,
    origin: 'Downtown Las Vegas',
    destination: 'East Las Vegas Library',
    startsAt: '2026-10-04T20:30:00.000Z',
    availableModes: ['bus'],
    willingModes: ['bike'],
  });
  await expect(page.locator('[data-day="4"]')).toContainText('East Las Vegas Library');
  await expect(page.locator('[data-day="3"]')).not.toContainText('East Las Vegas Library');
  await expect(page.locator('[data-day="5"]')).not.toContainText('East Las Vegas Library');
  await expect(page.locator('[data-me-welcome-text]')).toContainText('Your plan is saved');
});

test('carries a compared trip into the planner for review', async ({ page, baseURL }) => {
  const saves = await standInPlanApi(page, baseURL);
  await page.goto('/go/compare');
  await page.evaluate(() => {
    sessionStorage.setItem(
      'wwd-compare-plan',
      JSON.stringify({
        origin: 'Sahara and Maryland',
        destination: 'Sunset Park',
        day: 4,
        time: '17:00',
        mode: 'bike',
      }),
    );
  });
  await page.goto('/my-week/plan/where');
  await expect(page.getByLabel('Enter another place')).toBeChecked();
  await expect(page.getByLabel('Where will you start?')).toHaveValue('Sahara and Maryland');
  await expect(page.getByLabel('Where do you want to go?')).toHaveValue('Sunset Park');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByLabel('Day of the week')).toHaveValue('4');
  await expect(page.getByLabel('About what time?')).toHaveValue('17:00');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page).toHaveURL(/\/my-week\/plan\/available$/);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page).toHaveURL(/\/my-week\/plan\/try$/);
  await expect(page.locator('input[name="willingMode"][value="bike"]')).toBeChecked();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('[data-plan-summary]')).toContainText('Sunset Park');
  await page.getByRole('button', { name: 'Save this plan' }).click();
  await expect.poll(() => saves).toHaveLength(1);
  expect(saves[0]).toMatchObject({
    origin: 'Sahara and Maryland',
    destination: 'Sunset Park',
    day: 4,
    willingModes: ['bike'],
  });
});

test('keeps choices when navigating the plan with a keyboard', async ({ page, baseURL }) => {
  await standInPlanApi(page, baseURL);
  await page.goto('/my-week/plan/where');
  const own = page.getByLabel('Enter another place');
  await own.focus();
  await page.keyboard.press('Space');
  await page.getByLabel('Where will you start?').fill('Downtown Las Vegas');
  await page.getByLabel('Where do you want to go?').fill('Sunset Park');
  await page.getByRole('button', { name: 'Next' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/my-week\/plan\/when$/);
  const back = page.getByRole('button', { name: 'Back' });
  await back.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/my-week\/plan\/where$/);
  await expect(page.getByLabel('Enter another place')).toBeChecked();
  await expect(page.getByLabel('Where will you start?')).toHaveValue('Downtown Las Vegas');
  await expect(page.getByLabel('Where do you want to go?')).toHaveValue('Sunset Park');
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
  await expect(page.locator('[data-plan-status]')).toHaveText(
    'Plan removed. Your logged trips are unchanged.',
  );
  const trip = page.locator('[data-trip-form]');
  await trip.locator('input[name="mode"][value="bus"]').check({ force: true });
  await trip.getByLabel('Where did you go, and how did you get there?').fill('I took the bus.');
  await trip.getByRole('button', { name: 'Enter today’s trip' }).click();

  await expect.poll(() => checkinBody).not.toBe('');
  expect(checkinBody).not.toContain('planId=');
});
