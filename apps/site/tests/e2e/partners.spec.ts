import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

// The Partners page as the site ships it today, with no partner in the
// roster yet, and the partner kit with a partner added to the page for
// the test.

const DESCRIPTION =
  'Week Without Driving Las Vegas, October 1 to 8, 2026. Sign up to win at lvwwd.org.';
const BOX_SNIPPET = `<a href="https://lvwwd.org/giveaway?ref=example-club">
  <img src="https://lvwwd.org/partners/banners/300x250.png" width="300" height="250" style="max-width:100%;height:auto" alt="${DESCRIPTION}">
</a>`;

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

const picker = (page: Page) => page.getByRole('combobox', { name: 'Your organization' });

test('before the first partner, the page has no roster and the kit offers only general materials', async ({
  page,
}) => {
  await page.goto('/partners');
  await expect(page.getByRole('heading', { level: 1, name: 'Partners' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Taking part in 2026' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Bring your organization' })).toBeVisible();
  await expect(page.getByText('Partnering is free, and any size of group can join')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Partner kit' })).toBeVisible();
  const options = await picker(page).locator('option').allTextContents();
  expect(options.filter((text) => text.trim() !== '')).toEqual(['None (general materials)']);
  await expect(
    page.getByText('Pick your organization to see your link and materials.'),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your link' })).toBeHidden();
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

test('general materials: the link, QR code, banners and snippet credit no one', async ({
  page,
}) => {
  await page.goto('/partners');
  await picker(page).selectOption({ label: 'None (general materials)' });
  expect(new URL(page.url()).hash).toBe('#kit-general');
  await expect(page.locator('#kit-link')).toHaveText('https://lvwwd.org/giveaway');
  await expect(
    page.getByText("These don't credit any organization. LVBT uses them for its own outreach."),
  ).toBeVisible();
  const qr = page.getByRole('img', { name: 'QR code for lvwwd.org/giveaway' });
  await expect(qr).toHaveAttribute('src', '/partners/qr/general.svg');
  await expect(page.getByRole('link', { name: 'Download PNG' })).toHaveAttribute(
    'href',
    '/partners/qr/general.png',
  );
  await expect(page.getByRole('link', { name: 'Download SVG' })).toHaveAttribute(
    'href',
    '/partners/qr/general.svg',
  );
  await expect(page.locator('.kit__banners').getByRole('img', { name: DESCRIPTION })).toHaveCount(
    4,
  );
  for (const name of [
    'Square post, 1080 × 1080',
    'Story, 1080 × 1920',
    'Website box, 300 × 250',
    'Website strip, 728 × 90',
  ]) {
    await expect(page.locator('.kit__banners').getByText(name, { exact: true })).toBeVisible();
  }
  const snippet = await page.getByRole('textbox', { name: 'Embed snippet' }).inputValue();
  expect(snippet).toBe(BOX_SNIPPET.replace('?ref=example-club', ''));
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
  await expect(
    page.getByText("These don't credit any organization. LVBT uses them for its own outreach."),
  ).toBeHidden();
  await expect(
    page.getByRole('img', { name: 'QR code for lvwwd.org/giveaway?ref=example-club' }),
  ).toBeVisible();

  const snippet = page.getByRole('textbox', { name: 'Embed snippet' });
  await expect(snippet).toHaveValue(BOX_SNIPPET);
  await page.getByRole('button', { name: 'Copy snippet' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(BOX_SNIPPET);
  await expect(page.locator('#kit-snippet-status')).toHaveText('Copied');

  await page.getByRole('radio', { name: 'Website strip, 728 × 90' }).check();
  await expect(snippet).toHaveValue(
    BOX_SNIPPET.replace('300x250', '728x90').replace(
      'width="300" height="250"',
      'width="728" height="90"',
    ),
  );
  const preview = page.locator('[data-kit-preview] a');
  await expect(preview).toHaveAttribute('href', 'https://lvwwd.org/giveaway?ref=example-club');
  await expect(preview.getByRole('img', { name: DESCRIPTION })).toHaveAttribute(
    'src',
    '/partners/banners/728x90.png',
  );

  const second = await context.newPage();
  await withExamplePartner(second);
  await second.goto('/partners#kit-example-club');
  await expect(picker(second)).toHaveValue('example-club');
  await expect(second.locator('#kit-link')).toHaveText(
    'https://lvwwd.org/giveaway?ref=example-club',
  );
});

test('an address with an unknown organization picks nothing', async ({ page }) => {
  await page.goto('/partners#kit-nobody');
  await expect(picker(page)).toHaveValue('');
  await expect(
    page.getByText('Pick your organization to see your link and materials.'),
  ).toBeVisible();
});

test('"Copy image description" copies the banner description exactly', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/partners#kit-general');
  await page.getByRole('button', { name: 'Copy image description' }).first().click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(DESCRIPTION);
  await expect(page.locator('#kit-banner-1080x1080-status')).toHaveText('Copied');
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

test('a pasted snippet shows the banner on another site, shrinking to fit a phone', async ({
  page,
}) => {
  const strip = readFileSync(new URL('../../public/partners/banners/728x90.png', import.meta.url));
  await page.route('https://lvwwd.org/partners/banners/728x90.png', (route) =>
    route.fulfill({ body: strip, contentType: 'image/png' }),
  );
  await page.setViewportSize({ width: 375, height: 700 });
  await page.setContent(
    `<!doctype html><meta name="viewport" content="width=device-width"><body style="margin:8px">${BOX_SNIPPET.replace(
      '300x250',
      '728x90',
    ).replace('width="300" height="250"', 'width="728" height="90"')}</body>`,
  );
  const image = page.getByRole('link', { name: DESCRIPTION });
  await expect(image).toHaveAttribute('href', 'https://lvwwd.org/giveaway?ref=example-club');
  const box = await page.getByRole('img', { name: DESCRIPTION }).boundingBox();
  expect(box?.width).toBeLessThanOrEqual(375);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
});

test.describe('with JavaScript off', () => {
  test.use({ javaScriptEnabled: false });

  test('the kit asks for an email, and the address stays visible without its copy button', async ({
    page,
  }) => {
    await page.goto('/partners');
    // Playwright's text matching skips <noscript>, so this reads it directly.
    const message = await page
      .locator('[data-partner-kit] noscript')
      .evaluate((el) => el.textContent);
    expect(message).toContain('The partner kit needs JavaScript turned on.');
    await expect(page.locator('[data-kit-body]')).toBeHidden();
    await expect(page.getByRole('combobox', { name: 'Your organization' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Copy email address' })).toBeHidden();
    await expect(
      page.locator('[data-partners-join]').getByText('wwd@lasvegasfortransit.org', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bring your organization' })).toBeVisible();
  });
});
