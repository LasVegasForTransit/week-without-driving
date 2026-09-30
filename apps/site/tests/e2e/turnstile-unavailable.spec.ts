import { type Page, expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

// The Worker writes this state into the HTML when a required provider is
// missing. The preview server serves static HTML, so reproduce that rewrite.
async function unavailableSignUp(page: Page) {
  await page.route(/\/sign-up(?:\?.*)?$/, async (route) => {
    const response = await route.fetch();
    const html = (await response.text())
      .replace(
        '<form data-signup-form',
        '<form hidden inert style="display: none !important" data-turnstile-unavailable data-signup-form',
      )
      .replace('data-signup-unavailable hidden', 'data-signup-unavailable');
    await route.fulfill({ response, body: html });
  });
}

test('a cached script clearing hidden cannot show an unavailable sign-up form', async ({
  page,
}) => {
  await unavailableSignUp(page);
  await page.goto('/sign-up');

  const form = page.locator('[data-signup-form]');
  await expect(page.getByText('Sign-up is temporarily unavailable.')).toBeVisible();
  await expect(form).toBeHidden();

  // An older cached sign-up.js sets form.hidden = false without checking
  // data-turnstile-unavailable. The server's other guards still hold.
  await form.evaluate((element: HTMLFormElement) => {
    element.hidden = false;
  });
  await expect(form).toBeHidden();
  await expect(form).toHaveAttribute('inert', '');
});

test('a verified signed-in participant can still edit their details', async ({
  page,
  context,
  baseURL,
}) => {
  await unavailableSignUp(page);
  await context.addCookies([{ name: 'lvwwd_signed_in', value: '1', url: baseURL ?? '' }]);
  await page.route('**/api/me', (route) =>
    route.fulfill({
      json: {
        firstName: 'Luz',
        contactMasked: 'l•••@example.com',
        zip: '89101',
        county: 'Clark',
        instagram: null,
        age: 'adult',
      },
    }),
  );
  await page.goto('/sign-up?edit=1');

  const form = page.locator('[data-signup-form]');
  await expect(form).toBeVisible();
  await expect(form).not.toHaveAttribute('inert');
  await expect(form).not.toHaveAttribute('data-turnstile-unavailable');
  await expect(page.getByText('Sign-up is temporarily unavailable.')).toBeHidden();
  await expect(page.getByLabel('First name')).toHaveValue('Luz');
});
