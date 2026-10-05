import { expect, test, type Page } from '@playwright/test';

// The Partners page with the current roster and an extra partner added
// to the kit picker for referral-link coverage.

/** Serves /partners with one more organization in the kit's picker. */
async function withExamplePartner(page: Page) {
  await page.route('**/partners', async (route) => {
    const response = await route.fetch();
    const html = (await response.text()).replace(
      /<option value="general"/,
      '<option value="example-club">Example Club</option>$&',
    );
    await route.fulfill({ response, body: html });
  });
}

// The service worker would answer some page loads itself, around the test's
// rewritten page; the Partners page is never saved for offline use anyway.
test.use({ serviceWorkers: 'block' });

const picker = (page: Page) => page.getByRole('combobox', { name: 'Choose a sharing link' });

test('the full partner card opens its organization from the logo', async ({ page }) => {
  await page.route('https://www.rtcsnv.com/', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>RTC</h1>' }),
  );
  await page.goto('/partners');
  const card = page.locator('#partner-rtc-southern-nevada');
  const link = card.getByRole('link', { name: 'RTC of Southern Nevada' });
  await expect(link).toHaveAttribute('href', 'https://www.rtcsnv.com/');
  await expect(card.locator('a')).toHaveCount(1);
  await link.locator('.partner-roster__mark').click();
  await expect(page).toHaveURL('https://www.rtcsnv.com/');
});

test('the QR code and banner files exist at their addresses', async ({ request }) => {
  for (const path of ['/partners/qr/general.png', '/partners/qr/general.svg']) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
  for (const file of ['1080x1080', '1080x1920', '300x250', '728x90']) {
    const response = await request.get(`/partners/banners/${file}.png`);
    expect(response.status(), file).toBe(200);
  }
});

test('a partner gets its own link and snippet, and the address picks it again', async ({
  page,
  context,
}) => {
  await withExamplePartner(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/partners');
  await picker(page).selectOption({ label: 'Example Club' });
  expect(new URL(page.url()).hash).toBe('#kit-example-club');
  await expect(page.locator('#kit-link')).toHaveText('https://lvwwd.org/giveaway?ref=example-club');
  await expect(page.getByText('The general link does not credit a partner.')).toBeHidden();
  await expect(
    page.getByRole('img', { name: 'QR code for lvwwd.org/giveaway?ref=example-club' }),
  ).toBeVisible();

  const snippet = page.getByRole('textbox', { name: 'Embed snippet' });
  await expect(snippet).toHaveValue(/href="https:\/\/lvwwd\.org\/giveaway\?ref=example-club"/);
  const embed = await snippet.inputValue();
  await page.getByRole('button', { name: 'Copy snippet' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(embed);
  await expect(page.locator('#kit-snippet-status')).toHaveText('Copied');

  await page.getByRole('radio', { name: 'Website strip, 728 × 90' }).check();
  await expect(snippet).toHaveValue(/partners\/banners\/728x90\.png/);
  const preview = page.locator('[data-kit-preview] a');
  await expect(preview).toHaveAttribute('href', 'https://lvwwd.org/giveaway?ref=example-club');
  await expect(preview.getByRole('img')).toHaveAttribute('src', '/partners/banners/728x90.png');

  const second = await context.newPage();
  await withExamplePartner(second);
  await second.goto('/partners#kit-example-club');
  await expect(picker(second)).toHaveValue('example-club');
  await expect(second.locator('#kit-link')).toHaveText(
    'https://lvwwd.org/giveaway?ref=example-club',
  );
});

test('an address with an unknown organization uses the ready general materials', async ({
  page,
}) => {
  await page.goto('/partners#kit-nobody');
  await expect(picker(page)).toHaveValue('general');
  await expect(page.locator('#kit-link')).toHaveText('https://lvwwd.org/giveaway');
});

test('when copying is refused, the text is selected with a note', async ({ page }) => {
  await page.goto('/partners#kit-general');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('refused')) },
      configurable: true,
    });
  });
  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.locator('#kit-link-status')).toHaveText(
    'Press and hold, or use your keyboard, to copy the selected text.',
  );
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
    'https://lvwwd.org/giveaway',
  );
});

test('after the week, the kit shows only its closing message and the join section gives way', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-09T07:00:00Z'));
  await page.goto('/partners');
  await expect(
    page.getByText('Week Without Driving 2026 has ended. Thank you for taking part.'),
  ).toBeVisible();
  await expect(picker(page)).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Bring your organization' })).toBeHidden();
  await expect(
    page.getByText('Week Without Driving 2026 has ended. Want to take part next year?'),
  ).toBeVisible();
});

test('one moment before the week ends, the page is unchanged', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-09T06:59:59.999Z'));
  await page.goto('/partners');
  await expect(picker(page)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bring your organization' })).toBeVisible();
});

test('the page never scrolls sideways on a phone or a tablet', async ({ page }) => {
  for (const width of [375, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/partners#kit-general');
    await expect(page.locator('#kit-link')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `at ${width} pixels`).toBeLessThanOrEqual(0);
  }
});

test.describe('with JavaScript off', () => {
  test.use({ javaScriptEnabled: false });

  test('the kit asks for an email, and the address stays visible without its copy button', async ({
    page,
  }) => {
    await page.goto('/partners');
    await expect(page.locator('[data-kit-body]')).toBeHidden();
    await expect(page.getByRole('combobox', { name: 'Choose a sharing link' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Copy email address' })).toBeHidden();
    await expect(
      page.locator('[data-partners-join]').getByText('wwd@lasvegasfortransit.org', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bring your organization' })).toBeVisible();
  });
});
