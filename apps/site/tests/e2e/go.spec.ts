import { expect, test, type Page } from '@playwright/test';

import { destinations, finderPlaces } from '../../src/lib/destinations';
import { buildMapLinks } from '../../src/lib/map-links';

// The Go page's "Places to go" and "Find a bus", checked the way a visitor
// meets them. The expected links come from the same builder and data the
// page is made from, so a copy or coordinate change needs no test change.

// Each place is a closed <details> that opens one at a time; a test opens
// the one it checks by tapping its row, as a visitor would.
async function openPlace(page: Page, anchor: string) {
  const place = page.locator(`#${anchor}`);
  if (!(await place.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await place.locator('summary').click();
  }
  await expect(place).toHaveAttribute('open', '');
  return place;
}

test.describe('Places to go', () => {
  test('lists every destination closed, with steps and map buttons inside that match its places', async ({
    page,
  }) => {
    await page.goto('/go');
    await expect(page.getByRole('heading', { name: 'Places to go', level: 2 })).toBeVisible();
    for (const destination of destinations) {
      const section = page.locator(`#${destination.anchor}`);
      await expect(section).not.toHaveAttribute('open');
      await expect(section.getByRole('heading', { level: 3 })).toHaveText(destination.heading);
      await openPlace(page, destination.anchor);
      // The three steps; a note's own list (Water Street's stop changes) is extra.
      await expect(section.locator('ol > li')).toHaveCount(3);
      for (const row of destination.buttonRows) {
        const links = buildMapLinks(row.lat, row.lng, row.placeName);
        for (const app of ['google', 'apple', 'transit'] as const) {
          await expect(section.getByRole('link', { name: links.labels[app] })).toHaveAttribute(
            'href',
            links[app],
          );
        }
      }
    }
  });

  test('shows each place’s buses as badges', async ({ page }) => {
    await page.goto('/go');
    await expect(page.locator('#east-las-vegas-library .route-badge')).toHaveText(['215', '110']);
    await expect(page.locator('#unlv .route-badge')).toHaveText(['Red Line', '201']);
    // Downtown names many routes: three badges, then a count.
    await expect(page.locator('#downtown .route-badge')).toHaveCount(3);
    await expect(page.locator('#downtown .place__more')).toHaveText(/^\+\d+ more$/);
  });

  test('opens a destination from its own address', async ({ page }) => {
    for (const anchor of ['places-to-go', ...destinations.map((d) => d.anchor)]) {
      // A fresh visit each time, as when someone opens a shared link.
      await page.goto('about:blank');
      await page.goto(`/go#${anchor}`);
      await expect(page.locator(`#${anchor} :is(h2, h3)`).first()).toBeInViewport();
      if (anchor !== 'places-to-go') {
        await expect(page.locator(`#${anchor}`)).toHaveAttribute('open', '');
      }
    }
  });

  test('keeps the Go page open behind Google Maps and Apple Maps', async ({ page }) => {
    await page.goto('/go');
    const sunsetPark = await openPlace(page, 'sunset-park');
    for (const name of [/in Google Maps$/, /in Apple Maps$/]) {
      await expect(sunsetPark.getByRole('link', { name })).toHaveAttribute('target', '_blank');
    }
    await expect(sunsetPark.getByRole('link', { name: /in the Transit app$/ })).not.toHaveAttribute(
      'target',
      '_blank',
    );
  });

  test('gives every map button room for a thumb', async ({ page }) => {
    await page.goto('/go');
    for (const destination of destinations) {
      const place = await openPlace(page, destination.anchor);
      for (const button of await place.getByRole('link', { name: /^Directions to / }).all()) {
        const box = await button.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }
    }
  });
});

test.describe('Places to go without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('still opens every destination and shows its map buttons', async ({ page }) => {
    await page.goto('/go');
    for (const destination of destinations) {
      const section = page.locator(`#${destination.anchor}`);
      await section.locator('summary').click();
      await expect(section.getByRole('link', { name: /in Google Maps$/ }).first()).toBeVisible();
    }
  });
});

test.describe('Find a bus', () => {
  test('shows up to five stops near each place, each adding a bus, with the feed they come from', async ({
    page,
  }) => {
    await page.goto('/go');
    const picker = page.getByLabel('Or pick a place:');
    for (const place of finderPlaces) {
      await picker.selectOption({ label: place.label });
      await expect(page.getByRole('heading', { name: `Stops near ${place.label}` })).toBeVisible();
      const results = page.locator('[data-results-list] > li');
      await expect(results.first()).toBeVisible();
      const routeLines = await results.locator('p').allInnerTexts();
      expect(routeLines.length, place.label).toBeLessThanOrEqual(5);
      // No two stops repeat the same routes in the same direction.
      const names = await results.locator('h4').allInnerTexts();
      const keys = names.map((name, i) => `${/\((\w+bound)\)$/.exec(name)?.[1]} ${routeLines[i]}`);
      expect(new Set(keys).size, place.label).toBe(keys.length);
      await expect(results.first().getByRole('link', { name: /in Google Maps$/ })).toHaveAttribute(
        'href',
        /^https:\/\/www\.google\.com\/maps\/dir\//,
      );
    }
    await expect(page.getByText(/^Stop and route data from RTC \(.+\)\.$/)).toBeVisible();
  });
});

test.describe('Where to?', () => {
  test('opens transit directions to a suggested place, with its step-by-step guide', async ({
    page,
  }) => {
    await page.goto('/go');
    const destination = destinations[0];
    const row = destination?.buttonRows[0];
    if (!destination || !row) throw new Error('No destinations to test');
    const links = buildMapLinks(row.lat, row.lng, destination.heading);
    await page.getByLabel('Where to?').fill(destination.heading);
    await page.getByRole('button', { name: 'Show me how to get there' }).click();

    await expect(
      page.getByRole('heading', { name: `Getting to ${destination.heading}` }),
    ).toBeFocused();
    await expect(page.getByRole('link', { name: links.labels.google })).toHaveAttribute(
      'href',
      links.google,
    );
    await expect(page.getByRole('link', { name: links.labels.transit })).toHaveAttribute(
      'href',
      links.transit,
    );
    await expect(
      page.getByRole('link', { name: `Step-by-step directions to ${destination.heading}` }),
    ).toHaveAttribute('href', `#${destination.anchor}`);
    await expect(page.getByRole('link', { name: '3 easy steps' })).toHaveAttribute(
      'href',
      '/guides/first-ride',
    );
  });

  test('sends a typed place and start to the map apps, in Nevada', async ({ page }) => {
    await page.goto('/go');
    await page.getByLabel('Where to?').fill('Meadows Mall');
    await page.getByLabel(/Starting from/).fill('Charleston and Decatur');
    await page.getByRole('button', { name: 'Show me how to get there' }).click();

    const google = page.getByRole('link', { name: 'Directions to Meadows Mall in Google Maps' });
    const href = new URL((await google.getAttribute('href')) ?? '');
    expect(href.searchParams.get('destination')).toBe('Meadows Mall, NV');
    expect(href.searchParams.get('origin')).toBe('Charleston and Decatur, NV');
    expect(href.searchParams.get('travelmode')).toBe('transit');
    const apple = new URL(
      (await page
        .getByRole('link', { name: 'Directions to Meadows Mall in Apple Maps' })
        .getAttribute('href')) ?? '',
    );
    expect(apple.searchParams.get('dirflg')).toBe('r');
    // The Transit app takes only a map point.
    await expect(
      page.locator('[data-where-result]').getByRole('link', { name: /in the Transit app$/ }),
    ).toBeHidden();
  });

  test('asks for a place before showing directions', async ({ page }) => {
    await page.goto('/go');
    await page.getByRole('button', { name: 'Show me how to get there' }).click();
    await expect(page.getByText('Type where you’re going.', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Where to?')).toBeFocused();
  });

  test('opens straight to the directions from a shared link', async ({ page }) => {
    await page.goto('/go?to=Sunset%20Park');
    await expect(page.getByRole('heading', { name: 'Getting to Sunset Park' })).toBeVisible();
    await page.getByRole('button', { name: 'Plan another trip' }).click();
    await expect(page.getByLabel('Where to?')).toHaveValue('');
  });
});
