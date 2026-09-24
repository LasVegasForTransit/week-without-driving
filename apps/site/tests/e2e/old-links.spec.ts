import { expect, test } from '@playwright/test';

// Section links of the old one-page lvwwd.org open the page each section
// became, without leaving Home in the history.
const MOVED = [
  ['#how-to-participate', '/take-part'],
  ['#giveaway', '/giveaway'],
  ['#resources', '/resources'],
  ['#partners', '/partners'],
] as const;

for (const [hash, page] of MOVED) {
  test(`/${hash} opens ${page}`, async ({ page: tab }) => {
    await tab.goto(`/${hash}`);
    await expect(tab).toHaveURL(page);
    await expect(tab.getByRole('heading', { level: 1 })).toHaveCount(1);
  });
}

test('Back from the new page returns to the page before, not to Home', async ({ page }) => {
  await page.goto('/partners');
  await page.goto('/#giveaway');
  await expect(page).toHaveURL('/giveaway');
  await page.goBack();
  await expect(page).toHaveURL('/partners');
});

test('any other section link, or none, stays on Home', async ({ page }) => {
  for (const address of ['/#first-trip', '/']) {
    await page.goto(address);
    await expect(page).toHaveURL(address);
  }
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('an old section link shows Home', async ({ page }) => {
    await page.goto('/#giveaway');
    await expect(page).toHaveURL('/#giveaway');
  });
});
