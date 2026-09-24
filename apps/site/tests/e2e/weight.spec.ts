import { gzipSync } from 'node:zlib';

import { expect, test, type Page } from '@playwright/test';

// The site is built for the bus: a phone on a weak connection with little
// data. These checks run on the phone profile only.
//
// The preview server sends files uncompressed, so text files (pages,
// styles, scripts, data) are counted at their gzip size, as a phone
// receives them, and fonts and photos as they are.

test.use({ serviceWorkers: 'block' });
test.skip(({ isMobile }) => !isMobile, 'The budget is for phones.');

const BUDGET_BYTES = 100 * 1024;
const TEXT = /^(?:text\/|application\/(?:javascript|json|manifest\+json))|\+xml|svg/;

/** Every file the first visit to a page downloads, with its size on the wire. */
async function firstLoad(page: Page, path: string) {
  const files: { url: string; bytes: number }[] = [];
  const pending: Promise<void>[] = [];
  page.on('response', (response) => {
    pending.push(
      response
        .body()
        .then((body) => {
          const type = response.headers()['content-type'] ?? '';
          files.push({
            url: response.url(),
            bytes: TEXT.test(type) ? gzipSync(body).length : body.length,
          });
        })
        .catch(() => undefined),
    );
  });
  await page.goto(path, { waitUntil: 'networkidle' });
  await Promise.all(pending);
  return files;
}

// Pages whose first screen is text: the fonts, styles and scripts every
// page shares, plus the page itself, must fit well within the budget.
for (const path of ['/go', '/guides', '/guides/heat', '/bingo', '/sign-up', '/my-week', '/press']) {
  test(`${path} loads within the ${BUDGET_BYTES / 1024} KB budget`, async ({ page }) => {
    const files = await firstLoad(page, path);
    const total = files.reduce((sum, file) => sum + file.bytes, 0);
    expect(total, files.map((file) => `${file.url} ${file.bytes}`).join('\n')).toBeLessThanOrEqual(
      BUDGET_BYTES,
    );
  });
}

// Photos: AVIF, and never wider than the phone's screen can show.
for (const path of ['/', '/take-part', '/giveaway']) {
  test(`${path} sends photos sized for the phone`, async ({ page }) => {
    const screenPixels =
      (page.viewportSize()?.width ?? 0) * (await page.evaluate(() => devicePixelRatio));
    const photos = (await firstLoad(page, path)).filter((file) => file.url.includes('/photos/'));
    expect(photos.length).toBeGreaterThan(0);
    for (const photo of photos) {
      expect(photo.url).toMatch(/\.avif$/);
      const width = Number(/-(\d+)\.avif$/.exec(photo.url)?.[1]);
      expect(width, photo.url).toBeLessThanOrEqual(screenPixels);
    }
  });
}
