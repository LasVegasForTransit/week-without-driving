import { expect, test } from '@playwright/test';

test('the home page has one title and a way to sign up to win', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('link', { name: /sign up to win/i }).first()).toBeVisible();
});

test('unknown paths get the 404 page with a way home', async ({ page }) => {
  const response = await page.goto('/nowhere');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('link', { name: /home page/i })).toBeVisible();
});
