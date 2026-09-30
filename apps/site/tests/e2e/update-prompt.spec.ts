import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });

test('the update prompt stays clear of content and refreshes the current worker', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const messages: string[] = [];
    const oldWorker = { postMessage: () => messages.push('old') };
    const newWorker = { postMessage: () => messages.push('new') };
    const registration = {
      waiting: oldWorker,
      update: () => Promise.resolve(undefined),
      addEventListener: () => undefined,
    };
    Object.assign(window, { __updateTest: { messages, newWorker, registration } });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: {},
        register: () => Promise.resolve(registration),
        addEventListener: () => undefined,
      },
    });
  });

  await page.goto('/guides');
  const prompt = page.locator('[data-update-bar]');
  await expect(prompt).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
  expect(
    await page.evaluate(() => {
      const prompt = document.querySelector('[data-update-bar]')?.getBoundingClientRect();
      const main = document.querySelector('main')?.getBoundingClientRect();
      return Boolean(prompt && main && prompt.bottom <= main.top);
    }),
  ).toBe(true);

  await page.evaluate(() => {
    const testState = (
      window as typeof window & {
        __updateTest: {
          messages: string[];
          newWorker: { postMessage: () => number };
          registration: { waiting: { postMessage: () => number } };
        };
      }
    ).__updateTest;
    testState.registration.waiting = testState.newWorker;
  });
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByRole('button', { name: 'Updating…' })).toBeDisabled();
  expect(
    await page.evaluate(
      () =>
        (
          window as typeof window & {
            __updateTest: { messages: string[] };
          }
        ).__updateTest.messages,
    ),
  ).toEqual(['new']);
});
