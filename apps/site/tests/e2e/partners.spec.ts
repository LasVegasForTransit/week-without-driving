import { expect, test } from '@playwright/test';

// The Partners page as the site ships it today, with no partner in the
// roster yet.

test('before the first partner, the page has no roster and opens with how to join', async ({
  page,
}) => {
  await page.goto('/partners');
  await expect(page.getByRole('heading', { level: 1, name: 'Partners' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Taking part in 2026' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Bring your organization' })).toBeVisible();
  await expect(page.getByText('Partnering is free, and any size of group can join')).toBeVisible();
  await expect(page.getByText('Neighborhood and community groups')).toBeVisible();
});

test('"Email us to join" opens an email with the subject and the five lines', async ({ page }) => {
  await page.goto('/partners');
  const href = await page.getByRole('link', { name: 'Email us to join' }).getAttribute('href');
  const url = new URL(href ?? '');
  expect(url.protocol + url.pathname).toBe('mailto:wwd@lasvegasfortransit.org');
  expect(url.searchParams.get('subject')).toBe('Week Without Driving partnership');
  expect(url.searchParams.get('body')?.split('\n')).toEqual([
    'Group name:',
    'Website or social media page (if you have one):',
    'Kind of group:',
    "How we'll take part:",
    'Contact name:',
  ]);
});

test('"Copy email address" copies the address and reads "Copied"', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/partners');
  const button = page.getByRole('button', { name: 'Copy email address' });
  await button.click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  await expect(page.locator('#join-copy-status')).toHaveText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'wwd@lasvegasfortransit.org',
  );
});

test("LVBT's general QR code files exist at their addresses", async ({ request }) => {
  for (const path of ['/partners/qr/general.png', '/partners/qr/general.svg']) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
});

test('after the week, "Bring your organization" gives way to a note about next year', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-09T07:00:00Z'));
  await page.goto('/partners');
  await expect(page.getByRole('heading', { name: 'Bring your organization' })).toBeHidden();
  await expect(
    page.getByText('Week Without Driving 2026 has ended. Want to take part next year?'),
  ).toBeVisible();
});

test('one moment before the week ends, the page is unchanged', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-09T06:59:59.999Z'));
  await page.goto('/partners');
  await expect(page.getByRole('heading', { name: 'Bring your organization' })).toBeVisible();
});

test('the page never scrolls sideways on a phone or a tablet', async ({ page }) => {
  for (const width of [375, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/partners');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `at ${width} pixels`).toBeLessThanOrEqual(0);
  }
});

test.describe('with JavaScript off', () => {
  test.use({ javaScriptEnabled: false });

  test('the address stays visible without its copy button', async ({ page }) => {
    await page.goto('/partners');
    await expect(page.getByRole('button', { name: 'Copy email address' })).toBeHidden();
    await expect(
      page.locator('[data-partners-join]').getByText('wwd@lasvegasfortransit.org', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bring your organization' })).toBeVisible();
  });
});
