import assert from 'node:assert/strict';
import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test.beforeEach(async ({ page }) => {
  await page.goto('/guides');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
});

test('keeps balanced utility groups and both social accounts together', async ({ page }) => {
  const connect = page.getByRole('group', { name: 'Connect', exact: true });
  await expect(connect.getByRole('link')).toHaveCount(2);
  const follow = page.getByRole('group', { name: 'Follow', exact: true });
  await expect(follow.getByRole('link')).toHaveCount(2);
  await expect(
    follow.getByRole('link', { name: 'Week Without Driving on Instagram' }),
  ).toBeVisible();
  await expect(follow.getByRole('link', { name: 'LVBT Instagram' })).toBeVisible();
  await expect(
    page.getByRole('group', { name: 'Explore', exact: true }).getByRole('link'),
  ).toHaveText(['Press', 'Resources']);
});

test('gives the identity and utility links room at the intermediate width', async ({ page }) => {
  await page.setViewportSize({ width: 572, height: 844 });
  const brand = await page.locator('.footer-brand').boundingBox();
  const nav = await page.getByRole('navigation', { name: 'Footer', exact: true }).boundingBox();
  assert(brand && nav, 'Both footer groups must have a visible layout box.');
  expect(brand.y + brand.height).toBeLessThanOrEqual(nav.y);
  expect(nav.width).toBeGreaterThan(480);
  expect(nav.height).toBeLessThan(200);
  for (const name of ['Explore', 'Connect', 'Follow']) {
    const links = page.getByRole('group', { name, exact: true }).getByRole('link');
    const first = await links.nth(0).boundingBox();
    const second = await links.nth(1).boundingBox();
    assert(first && second, 'Both links in each footer group must have layout boxes.');
    expect(second.x).toBe(first.x);
    expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
  }
});

test('phone links fill their columns without overflowing the page', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  for (const name of ['Explore', 'Connect', 'Follow']) {
    const group = page.getByRole('group', { name, exact: true });
    for (const link of await group.getByRole('link').all()) {
      const target = await link.boundingBox();
      const column = await link.locator('..').boundingBox();
      assert(column, 'The navigation column must be visible.');
      assert(target, 'Each footer link must be visible.');
      expect(target.height).toBeGreaterThanOrEqual(28);
      expect(Math.abs(target.width - column.width)).toBeLessThan(1);
    }
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
  const legalRow = await page.getByRole('list', { name: 'Policies' }).boundingBox();
  assert(legalRow, 'The policy links must have a visible layout box.');
  expect(legalRow.height).toBeLessThan(28);
});

test('keyboard focus contrasts with the dark footer', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.getByRole('link', { name: 'Privacy', exact: true }).focus();
  await page.keyboard.press('Tab');
  const colors = await page.evaluate(() => {
    const link = document.activeElement;
    const container = link?.closest('.site-footer');
    if (!link || !container) throw new Error('Keyboard focus must be inside the footer.');
    const style = getComputedStyle(link);
    const footer = getComputedStyle(container);
    return {
      visible: link.matches(':focus-visible'),
      width: Number.parseFloat(style.outlineWidth),
      ring: (style.outlineColor.match(/\d+/g) ?? []).slice(0, 3).map(Number),
      background: (footer.backgroundColor.match(/\d+/g) ?? []).slice(0, 3).map(Number),
    };
  });
  const luminance = (rgb: number[]) => {
    const linear = rgb.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    const [red = 0, green = 0, blue = 0] = linear;
    return red * 0.2126 + green * 0.7152 + blue * 0.0722;
  };
  expect(colors.ring).toHaveLength(3);
  expect(colors.background).toHaveLength(3);
  const ring = luminance(colors.ring);
  const background = luminance(colors.background);
  expect(colors.visible).toBe(true);
  expect(colors.width).toBeGreaterThanOrEqual(2);
  expect(
    (Math.max(ring, background) + 0.05) / (Math.min(ring, background) + 0.05),
  ).toBeGreaterThanOrEqual(3);
});
