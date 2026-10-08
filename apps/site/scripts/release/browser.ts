import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import {
  accessCredentials,
  readReleaseConfiguration,
  scopeBrowserAccess,
  validateWorkerSmokeOrigin,
} from '@lasvegasfortransit/web-platform/release';

const configured = process.env.PLAYWRIGHT_BASE_URL;
if (!configured)
  throw new Error('Set PLAYWRIGHT_BASE_URL to the selected reviewed release origin.');
const origin = new URL(configured).origin;
const config = await readReleaseConfiguration(
  fileURLToPath(new URL('../../../../', import.meta.url)),
);
let protectedPreview = true;
try {
  validateWorkerSmokeOrigin(origin, config, true);
} catch {
  validateWorkerSmokeOrigin(origin, config, false);
  protectedPreview = false;
}
const credentials = protectedPreview ? accessCredentials(process.env) : undefined;
if (protectedPreview && !credentials)
  throw new Error('Protected preview checks require Access credentials.');
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    serviceWorkers: 'block',
    viewport: { width: 390, height: 844 },
  });
  await scopeBrowserAccess(context, origin, credentials);
  const page = await context.newPage();
  const response = await page.goto(origin, { waitUntil: 'networkidle' });
  assert.equal(response?.status(), 200, 'The reviewed homepage did not render.');
  assert.equal(new URL(page.url()).origin, origin, 'Release browser left the selected origin.');
  assert.ok(
    await page.getByRole('heading', { level: 1, name: 'Try a week without driving.' }).isVisible(),
  );
  const tabs = page.getByRole('navigation', { name: 'Tabs' });
  assert.ok(await tabs.isVisible(), 'The phone navigation did not render.');
  assert.deepEqual(await tabs.getByRole('link').allTextContents(), [
    'Home',
    'Plan',
    'Guides',
    'Bingo',
    'Sign up',
  ]);
  const guide = await page.goto(`${origin}/guides/first-ride`, { waitUntil: 'networkidle' });
  assert.equal(guide?.status(), 200, 'The first-ride guide did not render.');
  assert.ok(await page.getByRole('heading', { level: 1 }).isVisible());
  assert.equal(
    await page
      .getByRole('navigation', { name: 'Tabs' })
      .getByRole('link', { name: 'Guides' })
      .getAttribute('aria-current'),
    'page',
  );
  process.stdout.write(`PASS: reviewed phone homepage and first-ride guide at ${origin}\n`);
} finally {
  await browser.close();
}
