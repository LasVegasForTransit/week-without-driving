import { expect, test, type Page } from '@playwright/test';

const ROW_THREE = [
  'Worked from home',
  'Found my nearest stop',
  'Asked a nondriver',
  "One fix I'd make",
];

async function mark(page: Page, labels: string[]) {
  for (const label of labels) {
    await page.getByRole('checkbox', { name: new RegExp(`^${label}`) }).click();
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/bingo');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test('the share screen shows the generated picture and describes the marked card', async ({
  page,
}) => {
  await mark(page, ROW_THREE);
  await page.getByRole('button', { name: 'Keep playing' }).click();
  const share = page.getByRole('button', { name: 'Share your card' });
  await share.click();

  const screen = page.getByRole('dialog', { name: 'Share your card' });
  await expect(screen).toBeVisible();
  await expect(screen.getByRole('heading', { name: 'Share your card' })).toBeFocused();
  const image = screen.getByRole('img');
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('alt', /4 squares marked and 1 bingo/);
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
});

test('Tab moves through Close, the share button and the copy button; Escape returns focus', async ({
  page,
}) => {
  const share = page.getByRole('button', { name: 'Share your card' });
  await share.focus();
  await page.keyboard.press('Enter');
  const screen = page.getByRole('dialog', { name: 'Share your card' });
  await expect(screen.getByRole('img')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(screen.getByRole('button', { name: 'Close' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(screen.getByRole('button', { name: /^(Share|Save) image$/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(screen.getByRole('button', { name: 'Copy image description' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(screen).toBeHidden();
  await expect(share).toBeFocused();
  expect(new URL(page.url()).pathname).toBe('/bingo');
});

test('the back button closes the share screen and leaves the Bingo page open', async ({ page }) => {
  await page.getByRole('button', { name: 'Share your card' }).click();
  const screen = page.getByRole('dialog', { name: 'Share your card' });
  await expect(screen).toBeVisible();
  await page.goBack();
  await expect(screen).toBeHidden();
  expect(new URL(page.url()).pathname).toBe('/bingo');
});

test('where files cannot be shared, the button saves lvwwd-bingo.png and says so', async ({
  page,
}) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true });
  });
  await page.getByRole('button', { name: 'Share your card' }).click();
  const screen = page.getByRole('dialog', { name: 'Share your card' });
  const save = screen.getByRole('button', { name: 'Save image' });
  await expect(save).toBeEnabled();
  const download = page.waitForEvent('download');
  await save.click();
  expect((await download).suggestedFilename()).toBe('lvwwd-bingo.png');
  await expect(
    screen.getByText('Image saved. Look for lvwwd-bingo.png in your downloads.'),
  ).toBeVisible();
});

test('"Copy image description" copies the description and says so', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Share your card' }).click();
  const screen = page.getByRole('dialog', { name: 'Share your card' });
  await screen.getByRole('button', { name: 'Copy image description' }).click();
  await expect(screen.getByText('Description copied.')).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(await screen.getByRole('img').getAttribute('alt'));
});

test('the "Bingo!" message opens the share screen and focus comes back to the card', async ({
  page,
}) => {
  await mark(page, ROW_THREE);
  const message = page.getByRole('dialog', { name: 'Bingo!' });
  await expect(message).toBeVisible();
  await message.getByRole('button', { name: 'Share your card' }).click();
  await expect(message).toBeHidden();
  const screen = page.getByRole('dialog', { name: 'Share your card' });
  await expect(screen).toBeVisible();
  await screen.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('button', { name: 'Share your card' })).toBeFocused();
});
