import { expect, test } from '@playwright/test';

test('the home hero stays readable when its photo is unavailable', async ({ page }) => {
  await page.route('**/photos/hero*', (route) => route.abort());
  await page.goto('/');

  const photo = page.locator('.home-hero__photo');
  await expect(photo.locator('img')).toBeHidden();
  await expect(photo).toHaveAttribute(
    'aria-label',
    'The Las Vegas Strip seen from the top deck of the Deuce bus, heading south.',
  );
  await expect(photo.locator('.photo__credit')).toBeHidden();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Thank you, Las Vegas.' }),
  ).toBeVisible();
});

test('unknown paths get the 404 page with a way home', async ({ page }) => {
  const response = await page.goto('/nowhere');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('link', { name: /home page/i })).toBeVisible();
});

test.describe('the campaign has ended', () => {
  test.use({ javaScriptEnabled: false });

  test('thanks visitors and offers useful next steps without JavaScript', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Thank you, Las Vegas.');
    await expect(page.locator('.home-hero')).toContainText('We’ll see you in 2027!');
    await expect(
      page.getByRole('link', { name: 'Stay involved with LVBT', exact: true }),
    ).toBeVisible();
    await expect(page.locator('#stay-involved')).toBeVisible();
    await expect(page.getByRole('link', { name: /sign up to win/i })).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Read the rider guides', exact: true }),
    ).toHaveAttribute('href', '/guides');
  });

  test('partners can find next year’s invitation and the 2026 materials notice without JavaScript', async ({
    page,
  }) => {
    await page.goto('/partners');
    await expect(page.getByRole('link', { name: 'Partner with us in 2027' })).toBeVisible();
    await expect(page.locator('[data-partners-ended]')).toBeVisible();
    await expect(page.locator('[data-kit-ended]')).toBeVisible();
  });

  test('the giveaway is an archive and the signup page is closed', async ({ page }) => {
    await page.goto('/giveaway');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'The 2026 giveaway has closed.',
    );
    await expect(page.getByRole('link', { name: /sign up to win/i })).toHaveCount(0);
    await expect(page.getByText('Mystery prizes coming soon')).toHaveCount(0);
    await page.goto('/sign-up');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Entries are closed.');
    await expect(page.getByLabel('First name')).toBeHidden();
    await expect(page.getByRole('link', { name: 'Email me a sign-in link' })).toBeVisible();
  });
});
