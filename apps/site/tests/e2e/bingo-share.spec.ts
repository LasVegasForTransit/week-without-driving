import { expect, test, type Page } from '@playwright/test';

// The bingo card picture as the browser draws it, and the share screen that
// shows it. Pixel checks read the drawn canvas; they look for colors in
// places the layout fixes, not for an exact image.

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

interface DrawnText {
  text: string;
  x: number;
  y: number;
  font: string;
  width: number;
}
interface Box {
  x: number;
  y: number;
  size: number;
}
interface PictureApi {
  make: (
    marks: boolean[],
    squares: unknown[],
  ) => { width: number; height: number; fonts: string[]; draw: (c: HTMLCanvasElement) => void };
  tileBox: (i: number) => Box;
}
interface DrawnWindow {
  lvwwdBingoPicture: PictureApi;
  drawn?: { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D };
}

function squaresOnPage(): unknown[] {
  return JSON.parse(document.getElementById('bingo-squares')?.textContent ?? '[]') as unknown[];
}

/**
 * Draws the picture for the given marks on a fresh canvas, keeps the canvas
 * on the page for the checks below, and returns every text it drew.
 */
async function draw(page: Page, marked: number[]) {
  await page.addScriptTag({ content: `window.squaresOnPage = ${squaresOnPage.toString()};` });
  return page.evaluate(async (indexes) => {
    const w = window as unknown as DrawnWindow & { squaresOnPage: () => unknown[] };
    const marks = Array.from({ length: 25 }, (_, i) => i === 12 || indexes.includes(i));
    const definition = w.lvwwdBingoPicture.make(marks, w.squaresOnPage());
    await Promise.all(definition.fonts.map((font) => document.fonts.load(font)));
    const canvas = document.createElement('canvas');
    canvas.width = definition.width;
    canvas.height = definition.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No canvas');
    const texts: DrawnText[] = [];
    const fillText = context.fillText.bind(context);
    context.fillText = (text: string, x: number, y: number) => {
      texts.push({ text, x, y, font: context.font, width: context.measureText(text).width });
      fillText(text, x, y);
    };
    Object.defineProperty(canvas, 'getContext', { value: () => context });
    definition.draw(canvas);
    w.drawn = { canvas, context };
    return { width: canvas.width, height: canvas.height, texts };
  }, marked);
}

/** The drawn canvas's colors at the given points, as #RRGGBB. */
async function colorsAt(page: Page, points: Array<[number, number]>): Promise<string[]> {
  return page.evaluate((list) => {
    const { context } = (window as unknown as DrawnWindow).drawn ?? {};
    if (!context) throw new Error('Nothing drawn');
    return list.map(([x, y]) => {
      const [r = 0, g = 0, b = 0] = context.getImageData(x, y, 1, 1).data;
      return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
    });
  }, points);
}

/** How many pixels of `color` are in the rectangle, sampling every other pixel. */
async function countColor(page: Page, rect: [number, number, number, number], color: string) {
  return page.evaluate(
    ([[x, y, width, height], hex]) => {
      const { context } = (window as unknown as DrawnWindow).drawn ?? {};
      if (!context) throw new Error('Nothing drawn');
      const data = context.getImageData(x, y, width, height).data;
      const want = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      let count = 0;
      for (let i = 0; i < data.length; i += 8) {
        if (data[i] === want[0] && data[i + 1] === want[1] && data[i + 2] === want[2]) count++;
      }
      return count;
    },
    [rect, color] as const,
  );
}

/** Pixels that are not the background above y 250 or below y 1670. */
async function strayPixels(page: Page): Promise<number> {
  const [top, bottom] = await Promise.all([
    countColor(page, [0, 0, 1080, 250], '#0F1115'),
    countColor(page, [0, 1671, 1080, 249], '#0F1115'),
  ]);
  return (1080 * 250) / 2 - top + (1080 * 249) / 2 - bottom;
}

async function tileBoxes(page: Page): Promise<Box[]> {
  return page.evaluate(() =>
    Array.from({ length: 25 }, (_, i) =>
      (window as unknown as DrawnWindow).lvwwdBingoPicture.tileBox(i),
    ),
  );
}

/** For each tile: its fill low on the left, its left edge, and white pixels where a check goes. */
async function readTiles(page: Page) {
  const boxes = await tileBoxes(page);
  const fills = await colorsAt(
    page,
    boxes.map((box) => [box.x + 20, box.y + box.size - 16]),
  );
  const edges = await colorsAt(
    page,
    boxes.map((box) => [box.x + 4, box.y + box.size / 2]),
  );
  const checks = await Promise.all(
    boxes.map((box) => countColor(page, [box.x + box.size - 60, box.y + 12, 48, 48], '#FFFFFF')),
  );
  return boxes.map((box, i) => ({ box, fill: fills[i], edge: edges[i], check: checks[i] ?? 0 }));
}

test.beforeEach(async ({ page }) => {
  await page.goto('/bingo');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test('the picture for the row-3 squares shows their checks, the star and the finished line', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  const drawn = await draw(page, [10, 11, 13, 14]);

  expect([drawn.width, drawn.height]).toEqual([1080, 1920]);
  expect(drawn.texts.find((t) => t.y === 390)?.text).toBe('4 squares · 1 bingo');
  const tiles = await readTiles(page);
  tiles.forEach((tile, i) => {
    if (i === 12) return;
    // A check is white on the marked tile's red; an unmarked tile is white
    // all over, with no red and so no check.
    const checked = [10, 11, 13, 14].includes(i);
    expect(tile.fill, `fill of tile ${i}`).toBe(checked ? '#B8360F' : '#FFFFFF');
    if (checked) expect(tile.check, `check on tile ${i}`).toBeGreaterThan(20);
    expect(tile.edge === '#FF8A5C', `outline on tile ${i}`).toBe(i >= 10 && i <= 14);
  });
  const free = tiles[12]?.box;
  if (!free) throw new Error('No free tile');
  expect(await colorsAt(page, [[free.x + free.size / 2, free.y + 40]])).toEqual(['#0F1115']);
  expect(requests).toEqual([]);
});

test('every square shows its short label, inside its tile', async ({ page }) => {
  const drawn = await draw(page, []);
  const squares = (await page.evaluate(squaresOnPage)) as Array<{ label: string }>;
  const boxes = await tileBoxes(page);
  squares.forEach((square, i) => {
    const box = boxes[i];
    if (!box) throw new Error(`No tile ${i}`);
    const lines = drawn.texts.filter(
      (t) => t.y >= box.y && t.y < box.y + box.size && Math.abs(t.x - (box.x + box.size / 2)) < 1,
    );
    expect(lines.map((t) => t.text).join(' '), `tile ${i}`).toBe(square.label);
    for (const line of lines) {
      const size = Number(/(\d+)px/.exec(line.font)?.[1]);
      expect(size, line.text).toBeGreaterThanOrEqual(20);
      expect(line.width, line.text).toBeLessThanOrEqual(box.size - 16);
      expect(line.y + size * 1.15, line.text).toBeLessThanOrEqual(box.y + box.size);
    }
  });
});

test('nothing is drawn above y 250 or below y 1670, for an empty and a full card', async ({
  page,
}) => {
  await draw(page, []);
  expect(await strayPixels(page)).toBe(0);
  const full = await draw(
    page,
    Array.from({ length: 25 }, (_, i) => i),
  );
  expect(await strayPixels(page)).toBe(0);
  expect(full.texts.find((t) => t.y === 390)?.text).toBe('All 24 squares · 12 bingos');
  const tiles = await readTiles(page);
  tiles.forEach((tile, i) => {
    if (i === 12) return;
    expect(tile.fill, `fill of tile ${i}`).toBe('#B8360F');
    expect(tile.check, `check on tile ${i}`).toBeGreaterThan(20);
  });
});

test('the share screen shows the picture, its description and the two lines', async ({ page }) => {
  await mark(page, ROW_THREE);
  await page.getByRole('button', { name: 'Keep playing' }).click();
  const share = page.getByRole('button', { name: 'Share your card' });
  await share.click();

  const screen = page.getByRole('dialog', { name: 'Share your card' });
  await expect(screen).toBeVisible();
  await expect(screen.getByRole('heading', { name: 'Share your card' })).toBeFocused();
  const description =
    "Graphic: my Digital Transit Bingo card for Week Without Driving Las Vegas, October 1 to 8, 2026. 4 squares marked and 1 bingo. Marked: Worked from home, Found my nearest stop, Asked a nondriver, One fix I'd make. Bingo lines: row 3. lvwwd.org. #WeekWithoutDriving";
  await expect(screen.getByRole('img', { name: description })).toBeVisible();
  await expect(screen.getByText(description, { exact: true })).toBeVisible();
  await expect(screen.getByText('Image description', { exact: true })).toBeVisible();
  await expect(
    screen.getByText('The image is made on your phone. Nothing is uploaded.'),
  ).toBeVisible();
  await expect(
    screen.getByText("A bingo card doesn't count as a trip. To enter, share a trip on My week."),
  ).toBeVisible();
  const size = await screen
    .getByRole('img', { name: description })
    .evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]);
  expect(size).toEqual([1080, 1920]);
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
  expect(copied).toContain('No squares marked yet; the middle square is free.');
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
