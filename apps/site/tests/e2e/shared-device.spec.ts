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
  instagram: null,
  age: 'adult',
  newsletter: false,
  days: [],
  trips: [],
  today: 0,
  reminders: { push: false, text: false, email: false },
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
  await page.getByLabel('Phone number or email').fill(contact);
  await page.getByLabel('ZIP code').fill('89104');
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
  await expect(page.getByLabel('Phone number or email')).toHaveValue('');
  await expect(page.locator('input[name="age"]:checked')).toHaveCount(0);
  await expect(page.getByLabel(/newsletter/)).not.toBeChecked();
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

test('the partner link changes nothing on the page', async ({ page }) => {
  await page.goto('/giveaway');
  const plain = await page.locator('main').innerText();
  await page.goto('/giveaway?ref=campus-riders');
  expect(await page.locator('main').innerText()).toBe(plain);
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
