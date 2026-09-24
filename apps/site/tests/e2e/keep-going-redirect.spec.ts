import { expect, test, type Page } from '@playwright/test';

// /keep-going, the one address that reaches "Keep going after the week"
// from anywhere: My week's card on a signed-in phone, LVBT's join page on
// any other.

/** Sets the cookie that tells the site's scripts this phone is signed in. */
async function signIn(page: Page): Promise<void> {
  const site = new URL(test.info().project.use.baseURL ?? 'http://127.0.0.1:4321').origin;
  await page.context().addCookies([{ name: 'lvwwd_signed_in', value: '1', url: site }]);
}

test.describe('lvwwd.org/keep-going', () => {
  test('opens the card on My week for a signed-in phone, without a step back', async ({ page }) => {
    await signIn(page);
    await page.goto('/privacy');
    await page.goto('/keep-going');
    await expect(page).toHaveURL(/\/my-week#keep-going$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/privacy$/);
  });

  test('opens LVBT’s join page on any other phone', async ({ page }) => {
    await page.route('https://lasvegasfortransit.org/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<h1>Join LVBT</h1>' }),
    );
    await page.goto('/keep-going');
    await expect(page).toHaveURL('https://lasvegasfortransit.org/join');
  });

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    test('offers both ways and stays out of search engines', async ({ page }) => {
      await page.goto('/keep-going');
      await expect(page.getByRole('heading', { name: 'Keep going after the week' })).toBeVisible();
      await expect(
        page.getByText(
          'Week Without Driving is over, but the work isn’t. Stay involved with LVBT.',
        ),
      ).toBeVisible();
      await expect(page.getByRole('link', { name: 'Join LVBT' }).first()).toHaveAttribute(
        'href',
        'https://lasvegasfortransit.org/join',
      );
      await expect(page.getByRole('link', { name: 'Signed up? Go to My week' })).toHaveAttribute(
        'href',
        '/my-week',
      );
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    });
  });
});
