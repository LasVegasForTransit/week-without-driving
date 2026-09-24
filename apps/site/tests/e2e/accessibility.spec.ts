import { test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '@lasvegasfortransit/playwright-config/accessibility';

// Every page a visitor reaches from the menu or a guide meets the
// organization's WCAG 2.2 A and AA baseline, in the phone's light and dark
// settings alike.

const PAGES = [
  '/',
  '/take-part',
  '/go',
  '/guides',
  '/guides/pay-your-fare',
  '/guides/accessible-riding',
  '/guides/heat',
  '/guides/bike-rack',
  '/guides/sidewalk-audit',
  '/bingo',
  '/giveaway',
  '/giveaway/rules',
  '/sign-up',
  '/my-week',
  '/partners',
  '/press',
  '/resources',
  '/privacy',
  '/terms',
];

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`in ${colorScheme} mode`, () => {
    test.use({ colorScheme });

    for (const path of PAGES) {
      test(`${path} has no accessibility violations`, async ({ page }) => {
        await page.goto(path);
        // Show the sections that fade in on scroll, so every one is checked,
        // and let every fade finish so colors are read at their final value.
        await page.evaluate(async () => {
          document.documentElement.classList.remove('reveal-ready');
          const fades = document
            .getAnimations()
            .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity);
          await Promise.allSettled(fades.map((animation) => animation.finished));
        });
        await expectNoAccessibilityViolations(page);
      });
    }
  });
}
