import { expect, test } from '@playwright/test';

test('an installed phone opens Home and public tools after the connection is lost', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);

  await context.setOffline(true);
  for (const path of ['/', '/?ref=partner']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Try a week without driving',
    );
    await expect(page.getByRole('heading', { level: 1, name: 'You’re offline' })).toHaveCount(0);
  }
  for (const [path, heading] of [
    ['/guides', 'Rider guides'],
    ['/go', 'Plan a trip'],
    ['/bingo', 'Digital Transit Bingo'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    if (path === '/go') {
      await page.getByLabel('Where to?').fill('Sunset Park');
      await page.getByRole('button', { name: 'Show me how to get there' }).click();
      await expect(page.getByRole('heading', { name: 'Getting to Sunset Park' })).toBeFocused();
      await expect(page.locator('[data-where-google]')).toHaveAttribute(
        'href',
        'https://www.google.com/maps/dir/?api=1&destination=36.06431,-115.11359&travelmode=transit',
      );
    }
  }
  for (const path of ['/my-week', '/sign-up']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('You’re offline');
    await expect(page.locator('[data-offline-private]')).toBeVisible();
  }
});
