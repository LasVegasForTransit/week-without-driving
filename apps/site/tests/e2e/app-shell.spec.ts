import { expect, test } from '@playwright/test';

// The parts that make lvwwd.org work like an app on a phone: the tab bar
// along the bottom, and when the iPhone Home Screen steps open by themselves.

test.use({ serviceWorkers: 'block' });

const tabs = ['Home', 'Plan', 'Guides', 'Bingo', 'Sign up'];

test.describe('the tab bar on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('shows the five tabs and marks the page you are on', async ({ page }) => {
    await page.goto('/guides/first-ride');
    const bar = page.getByRole('navigation', { name: 'Tabs' });
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('link')).toHaveText(tabs);
    await expect(bar.getByRole('link', { name: 'Guides' })).toHaveAttribute('aria-current', 'page');
    await expect(bar.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
    for (const link of await bar.getByRole('link').all()) {
      const box = await link.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
    }
  });

  test('turns Sign up into My week once this phone has signed up', async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([{ name: 'lvwwd_signed_in', value: '1', url: baseURL ?? '' }]);
    await page.goto('/go');
    const myWeek = page.getByRole('navigation', { name: 'Tabs' }).getByRole('link', {
      name: 'My week',
    });
    await expect(myWeek).toHaveAttribute('href', '/my-week');
  });

  test('keeps the end of the page clear of the bar', async ({ page }) => {
    await page.goto('/go');
    await page.evaluate(() =>
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }),
    );
    const install = page.locator('footer .footer-mission');
    const bar = await page.getByRole('navigation', { name: 'Tabs' }).boundingBox();
    const last = await install.boundingBox();
    expect(last && bar && last.y + last.height).toBeLessThanOrEqual(bar?.y ?? 0);
  });

  test('steps aside while a text field has focus, so the keyboard never hides it', async ({
    page,
  }) => {
    await page.goto('/go');
    const bar = page.getByRole('navigation', { name: 'Tabs' });
    await page.getByLabel('Where to?').focus();
    await expect(bar).toBeHidden();
    await page.getByLabel('Where to?').blur();
    await expect(bar).toBeVisible();
  });
});

test.describe('on a wide screen', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('uses the header links instead of the tab bar', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Tabs' })).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  });
});

test.describe('the iPhone Home Screen steps', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  });

  test('wait until the first trip is entered, then open once', async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([{ name: 'lvwwd_signed_in', value: '1', url: baseURL ?? '' }]);
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
    await page.route('**/api/checkin', (route) =>
      route.fulfill({ json: { days: [1], trips: [{ day: 1, modes: ['bus'] }] } }),
    );
    const steps = page.getByRole('heading', { name: 'Add WWD Las Vegas to your Home Screen' });

    await page.goto('/my-week?welcome=1');
    await expect(page.getByRole('heading', { name: /Hi, Ana/ })).toBeVisible();
    await expect(steps).toBeHidden();

    const trip = page.locator('[data-trip-form]');
    await trip.locator('input[name="mode"][value="bus"]').check({ force: true });
    await trip
      .getByLabel('Where did you go, and how did you get there?')
      .fill('I took the 202 to work.');
    await trip.getByRole('button', { name: 'Enter today’s trip' }).click();
    await expect(steps).toBeVisible();
    await page.getByRole('button', { name: 'Got it' }).click();
    await expect(steps).toBeHidden();

    await page.reload();
    await expect(page.getByRole('heading', { name: /Hi, Ana/ })).toBeVisible();
    await expect(steps).toBeHidden();
  });

  test('puts today’s entry before the eight days', async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: 'lvwwd_signed_in', value: '1', url: baseURL ?? '' }]);
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
    await page.goto('/my-week');
    const question = page.getByText('How did you get around today without driving?');
    await expect(question).toBeVisible();
    const form = await question.boundingBox();
    const days = await page.locator('.entries__days').boundingBox();
    expect(form?.y).toBeLessThan(days?.y ?? 0);
  });
});
