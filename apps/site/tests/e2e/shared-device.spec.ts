import { type BrowserContext, type Page, expect, test } from '@playwright/test';

// A volunteer at a partner's table signs people up one after another on one
// tablet: "Sign up someone else" signs the tablet out and shows the empty
// form, and each sign-up carries the partner link the tab was opened with.
// The Worker is stood in for by these routes; the API tests cover it.

const READY = 'Ready for the next person. The last sign-up is saved.';
const ME = {
  firstName: 'Luz',
  contactMasked: 'l•••@example.com',
  contactType: 'email',
  zip: '89101',
  county: 'Clark',
  instagram: null,
  age: 'adult',
  days: [],
  trips: [],
  today: 0,
};

interface Api {
  signUps: Record<string, unknown>[];
}

async function standInApi(page: Page, context: BrowserContext): Promise<Api> {
  const api: Api = { signUps: [] };
  await page.route('**/api/me', (route) => route.fulfill({ json: ME }));
  await page.route('**/api/signout', async (route) => {
    await context.clearCookies();
    await route.fulfill({ json: { signedOut: true } });
  });
  await page.route('**/api/signup', async (route) => {
    api.signUps.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: 201, json: { status: 'created', redirect: '/my-week' } });
  });
  return api;
}

async function signInTablet(context: BrowserContext, baseURL: string | undefined) {
  await context.addCookies([{ name: 'lvwwd_signed_in', value: '1', url: baseURL ?? '' }]);
}

async function fillSignUp(page: Page, contact: string) {
  await page.getByLabel('First name').fill('Marco');
  await page.getByLabel('Email address').fill(contact);
  await page.getByLabel('ZIP code').fill('89104');
  await page.getByLabel('County where you live').selectOption('Clark');
  await page.getByLabel('18 or older').check();
}

test('signs the tablet out on the sign-up page and readies the empty form', async ({
  page,
  context,
  baseURL,
}) => {
  const api = await standInApi(page, context);
  await signInTablet(context, baseURL);
  await page.goto('/giveaway?ref=East-Las-Vegas-Neighbors');
  await page.evaluate(() => localStorage.setItem('lvwwd_bingo_2026', '[true]'));
  await page.goto('/sign-up');

  await expect(page.getByRole('heading', { name: 'You’re signed up, Luz.' })).toBeVisible();
  await expect(page.getByText('Signing up someone else?')).toBeVisible();
  const someoneElse = page.getByRole('button', { name: 'Sign up someone else' });
  const box = await someoneElse.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);

  await someoneElse.click();
  const ready = page.getByText(READY);
  await expect(ready).toBeVisible();
  await expect(ready).toBeFocused();
  await expect(page).toHaveURL('/sign-up');
  await expect(page.getByLabel('First name')).toHaveValue('');
  await expect(page.getByLabel('Email address')).toHaveValue('');
  await expect(page.getByLabel('County where you live')).toHaveValue('');
  await expect(page.locator('input[name="age"]:checked')).toHaveCount(0);
  await expect(page.locator('input[name="newsletter"]')).toHaveCount(0);
  await expect(page.locator('.site-cta').first()).toContainText('Sign up to win');
  expect(await page.evaluate(() => localStorage.getItem('lvwwd_bingo_2026'))).toBeNull();

  await page.keyboard.press('Tab');
  await expect(page.getByLabel('First name')).toBeFocused();

  await fillSignUp(page, 'marco@example.com');
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  await expect.poll(() => api.signUps.length).toBe(1);
  expect(api.signUps[0]).toMatchObject({ ref: 'east-las-vegas-neighbors', sharedDevice: true });
});

test('"Sign up someone else" at the foot of My week opens the empty form', async ({
  page,
  context,
  baseURL,
}) => {
  await standInApi(page, context);
  await signInTablet(context, baseURL);
  await page.goto('/my-week');
  await expect(page.getByRole('heading', { name: /Hi, Luz/ })).toBeVisible();
  await page.getByRole('button', { name: 'Sign up someone else' }).click();
  await expect(page).toHaveURL('/sign-up');
  await expect(page.getByText(READY)).toBeFocused();
  // Only once: reloading the form doesn't say it again.
  await page.reload();
  await expect(page.getByText(READY)).toBeHidden();
});

test('My week explains a failed signup email while keeping this phone signed in', async ({
  page,
  context,
  baseURL,
}) => {
  await standInApi(page, context);
  await signInTablet(context, baseURL);
  await page.goto('/my-week?welcome=1&email=failed');
  await expect(page.getByRole('heading', { name: /Hi, Luz/ })).toBeVisible();
  await expect(page.locator('[data-me-welcome-text]')).toHaveText(
    'You’re signed up on this phone, but we couldn’t email a sign-in link. Keep using this phone and try again later.',
  );
});

test('without a connection the tablet stays signed in and says so', async ({
  page,
  context,
  baseURL,
}) => {
  await standInApi(page, context);
  await page.route('**/api/signout', (route) => route.abort('internetdisconnected'));
  await signInTablet(context, baseURL);
  await page.goto('/sign-up');
  await page.getByRole('button', { name: 'Sign up someone else' }).click();
  await expect(
    page.getByText('We couldn’t reach the server. Check your connection and try again.'),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'You’re signed up, Luz.' })).toBeVisible();
  await expect(page.getByLabel('First name')).toBeHidden();
});

test('a first sign-up on the tablet is not marked as a shared device', async ({
  page,
  context,
}) => {
  const api = await standInApi(page, context);
  await page.goto('/?ref=campus-riders');
  await page.goto('/sign-up');
  await fillSignUp(page, 'ana@example.com');
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  await expect.poll(() => api.signUps.length).toBe(1);
  expect(api.signUps[0]).toMatchObject({ ref: 'campus-riders', sharedDevice: false });
});

test('repeat sign-up without email delivery stays on the form and explains the outage', async ({
  page,
}) => {
  await page.route('**/api/signup', (route) =>
    route.fulfill({
      status: 200,
      json: {
        status: 'existing',
        message: 'You’ve already signed up with that email. We’ll try to send your link.',
        emailStatus: 'unavailable',
      },
    }),
  );
  await page.goto('/sign-up');
  await fillSignUp(page, 'rosa@example.com');
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();

  await expect(page.locator('[data-signup-form]')).toBeVisible();
  await expect(page.locator('[data-signup-status]')).toHaveText(
    'Email links are unavailable right now. Please try again later.',
  );
  await expect(page.locator('[data-signup-status]')).toHaveClass(/form-error/);
});

test('a partner link opened in another tab does not follow into a new one', async ({
  page,
  context,
}) => {
  await page.goto('/giveaway?ref=campus-riders');
  const other = await context.newPage();
  const api = await standInApi(other, context);
  await other.goto('/sign-up');
  await fillSignUp(other, 'ana@example.com');
  await other.getByRole('button', { name: 'Sign up', exact: true }).click();
  await expect.poll(() => api.signUps.length).toBe(1);
  expect(api.signUps[0]).not.toHaveProperty('ref');
});

test('once sign-up closes, "Sign up someone else" is gone', async ({ page, context, baseURL }) => {
  await page.clock.install({ time: new Date('2026-10-09T07:00:00Z') });
  await standInApi(page, context);
  await signInTablet(context, baseURL);
  await page.goto('/sign-up');
  await expect(page.getByRole('heading', { name: 'You’re signed up, Luz.' })).toBeVisible();
  await expect(page.getByText('Signing up someone else?')).toBeHidden();
  await page.goto('/my-week');
  await expect(page.getByRole('heading', { name: /Hi, Luz/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign up someone else' })).toBeHidden();
});

test('after October 8, direct visitors see closed entries and link recovery', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-09T07:00:00Z'));
  await page.goto('/sign-up');
  await expect(page.getByRole('heading', { name: 'Entries are closed.' })).toBeVisible();
  await expect(page.locator('[data-signup-form]')).toBeHidden();
  await expect(page.getByRole('link', { name: 'Email me a sign-in link' })).toBeVisible();
});

test('normal sign-out clears the participant’s local bingo marks and plan draft', async ({
  page,
  context,
  baseURL,
}) => {
  await standInApi(page, context);
  await signInTablet(context, baseURL);
  await page.goto('/my-week');
  await expect(page.getByRole('heading', { name: /Hi, Luz/ })).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem('lvwwd_bingo_2026', '[true]');
    sessionStorage.setItem('wwd-trip-plan-draft', '{"destination":"test trip"}');
  });
  await page.getByRole('button', { name: 'Sign out of this phone', exact: true }).click();
  await expect(page).toHaveURL('/');
  expect(await page.evaluate(() => localStorage.getItem('lvwwd_bingo_2026'))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem('wwd-trip-plan-draft'))).toBeNull();
});
