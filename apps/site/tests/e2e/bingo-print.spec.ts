import { expect, test, type Page } from '@playwright/test';

// The Print section on the Bingo page and the paper card it prints. Page
// counts come from Chromium's own print-to-PDF with the page's @page size,
// the same engine as Chrome's print preview.

const ROW_THREE = [
  'Worked from home',
  'Found my nearest stop',
  'Asked a nondriver',
  "One fix I'd make",
];

async function pageCount(page: Page): Promise<number> {
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  const text = new TextDecoder('latin1').decode(pdf);
  return Number(/\/Count\s+(\d+)/.exec(text)?.[1] ?? 0);
}

async function mark(page: Page, labels: string[]) {
  for (const label of labels) {
    await page.getByRole('checkbox', { name: new RegExp(`^${label}`) }).click();
  }
}

async function sendMarks(page: Page, marked: number[]) {
  await page.evaluate((indexes) => {
    const marks = Array.from({ length: 25 }, (_, i) => i === 12 || indexes.includes(i));
    const detail = { marks, progress: `${indexes.length} squares marked`, locked: false };
    document.dispatchEvent(new CustomEvent('bingochange', { detail }));
  }, marked);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/bingo');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test('the Print section starts with large print and the button, and no marks option', async ({
  page,
}) => {
  const large = page.getByRole('checkbox', { name: 'Large print (2 pages)' });
  await expect(large).toBeVisible();
  await expect(large).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Print a card' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Include my marks' })).toBeHidden();
});

test('"Include my marks" follows the card, unticked when it first appears', async ({ page }) => {
  const include = page.getByRole('checkbox', { name: 'Include my marks' });
  await sendMarks(page, [3]);
  await expect(include).toBeVisible();
  await expect(include).not.toBeChecked();
  await sendMarks(page, []);
  await expect(include).toBeHidden();
});

test('clearing the card hides "Include my marks"', async ({ page }) => {
  await mark(page, ['Bus instead of driving']);
  await expect(page.getByRole('checkbox', { name: 'Include my marks' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear my card' }).click();
  await page.getByRole('button', { name: 'Clear card', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Include my marks' })).toBeHidden();
});

test('the paper card prints on exactly one US Letter page', async ({ page }) => {
  expect(await pageCount(page)).toBe(1);
});

test('large print prints on exactly two pages, with rows 3 to 5 on the second', async ({
  page,
}) => {
  await page.getByRole('checkbox', { name: 'Large print (2 pages)' }).check();
  expect(await pageCount(page)).toBe(2);
  await page.emulateMedia({ media: 'print' });
  const rowThree = page.locator('.bp-large .bp-row').nth(2);
  await expect(rowThree).toHaveCSS('break-before', 'page');
});

test('with marks included, the four row-3 squares print checked and the card stays one page', async ({
  page,
}) => {
  await mark(page, ROW_THREE);
  await page.getByRole('button', { name: 'Keep playing' }).click();
  await page.getByRole('checkbox', { name: 'Include my marks' }).check();
  expect(await pageCount(page)).toBe(1);
  await page.emulateMedia({ media: 'print' });

  const card = page.locator('.bp-card');
  await expect(card.locator('[data-print-progress]')).toHaveText('4 squares marked · 1 bingo');
  const marked = card.locator('.bp-cell[data-marked]');
  await expect(marked).toHaveCount(4);
  const indexes = await marked.evaluateAll((cells) =>
    cells.map((cell) => Number(cell.getAttribute('data-print-square'))),
  );
  expect(indexes).toEqual([10, 11, 13, 14]);
  await expect(card.locator('.bp-cell[data-marked] .bp-check')).toHaveCount(4);
  await expect(card.locator('.bp-cell[data-marked]').first()).toHaveCSS('outline-width', '4px');
  const overflowing = await marked.evaluateAll(
    (cells) => cells.filter((cell) => cell.scrollHeight > cell.clientHeight + 1).length,
  );
  expect(overflowing).toBe(0);
});

test('with marks on the card but "Include my marks" unticked, nothing prints marked', async ({
  page,
}) => {
  await mark(page, ROW_THREE);
  await page.getByRole('button', { name: 'Keep playing' }).click();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.bingo-print [data-marked]')).toHaveCount(0);
  await expect(page.locator('.bp-card [data-print-progress]')).toBeHidden();
});

test('no word of any square is cut off, and every square prints its full text', async ({
  page,
}) => {
  await page.emulateMedia({ media: 'print' });
  const cells = page.locator('.bp-card .bp-cell');
  await expect(cells).toHaveCount(25);
  const overflowing = await cells.evaluateAll((elements) =>
    elements
      .filter((el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.textContent.trim()),
  );
  expect(overflowing).toEqual([]);
  await expect(page.locator('.bp-card')).toContainText(
    "Took the bus somewhere you'd usually drive.",
  );
  await expect(page.locator('.bp-card')).toContainText('Scan to play on a phone: lvwwd.org/bingo');
  await expect(page.locator('.bp-card')).toContainText('No purchase or post necessary.');
});

test('printing shows only the paper card', async ({ page }) => {
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.bp-card')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print a card' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Share your card' })).toBeHidden();
  await expect(page.locator('[data-site-header]')).toBeHidden();
  await expect(page.locator('#site-footer')).toBeHidden();
});

test('"Print a card" opens the print window, from the keyboard too, without any request', async ({
  page,
}) => {
  await page.evaluate(() => {
    const calls = { count: 0 };
    Object.assign(window, { printCalls: calls });
    window.print = () => {
      calls.count++;
    };
  });
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));

  await page.getByRole('checkbox', { name: 'Large print (2 pages)' }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('checkbox', { name: 'Large print (2 pages)' })).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Print a card' })).toBeFocused();
  await page.keyboard.press('Enter');
  expect(
    await page.evaluate(
      () => (window as unknown as { printCalls: { count: number } }).printCalls.count,
    ),
  ).toBe(1);
  expect(requests).toEqual([]);
});

test.describe('with JavaScript off', () => {
  test.use({ javaScriptEnabled: false });

  test('the Print section is hidden and the browser prints the blank card on one page', async ({
    page,
  }) => {
    await page.goto('/bingo');
    await expect(page.getByRole('button', { name: 'Print a card' })).toBeHidden();
    expect(await pageCount(page)).toBe(1);
  });
});
