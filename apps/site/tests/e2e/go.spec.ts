import { expect, test } from '@playwright/test';

import { destinations, finderPlaces } from '../../src/lib/destinations';
import { buildMapLinks } from '../../src/lib/map-links';

// The Go page's "Places to go" and "Find a bus", checked the way a visitor
// meets them. The expected links come from the same builder and data the
// page is made from, so a copy or coordinate change needs no test change.

test.describe('Places to go', () => {
  test('lists every destination with steps and map buttons that match its places', async ({
    page,
  }) => {
    await page.goto('/go');
    await expect(page.getByRole('heading', { name: 'Places to go', level: 2 })).toBeVisible();
    for (const destination of destinations) {
      const section = page.locator(`#${destination.anchor}`);
      await expect(section.getByRole('heading', { level: 3 })).toHaveText(destination.heading);
      await expect(section.getByRole('listitem')).toHaveCount(3);
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

  test('opens a destination from its own address', async ({ page }) => {
    for (const anchor of ['places-to-go', ...destinations.map((d) => d.anchor)]) {
      // A fresh visit each time, as when someone opens a shared link.
      await page.goto('about:blank');
      await page.goto(`/go#${anchor}`);
      await expect(page.locator(`#${anchor} :is(h2, h3)`).first()).toBeInViewport();
    }
  });

  test('keeps the Go page open behind Google Maps and Apple Maps', async ({ page }) => {
    await page.goto('/go');
    const sunsetPark = page.locator('#sunset-park');
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
    const buttons = page.locator('#places-to-go').getByRole('link', { name: /^Directions to / });
    await expect(buttons.first()).toBeVisible();
    for (const button of await buttons.all()) {
      const box = await button.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe('Places to go without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('still shows every destination and its map buttons', async ({ page }) => {
    await page.goto('/go');
    for (const destination of destinations) {
      const section = page.locator(`#${destination.anchor}`);
      await expect(section.getByRole('heading', { name: destination.heading })).toBeVisible();
      await expect(section.getByRole('link', { name: /in Google Maps$/ }).first()).toBeVisible();
    }
  });
});

test.describe('Find a bus', () => {
  test('shows five stops near each place, with the feed they come from', async ({ page }) => {
    await page.goto('/go');
    const picker = page.getByLabel('Or pick a place:');
    for (const place of finderPlaces) {
      await picker.selectOption({ label: place.label });
      await expect(page.getByRole('heading', { name: `Stops near ${place.label}` })).toBeVisible();
      const results = page.locator('[data-results-list] > li');
      await expect(results).toHaveCount(5);
      await expect(results.first().getByRole('link', { name: /in Google Maps$/ })).toHaveAttribute(
        'href',
        /^https:\/\/www\.google\.com\/maps\/dir\//,
      );
    }
    await expect(page.getByText(/^Stop and route data from RTC \(.+\)\.$/)).toBeVisible();
  });
});
