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
    page.getByRole('heading', { level: 1, name: 'Try a week without driving.' }),
  ).toBeVisible();
});

test('unknown paths get the 404 page with a way home', async ({ page }) => {
  const response = await page.goto('/nowhere');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('link', { name: /home page/i })).toBeVisible();
});
