import { expect, test } from '@playwright/test';

// The bot check's script comes from challenges.cloudflare.com, which content
// blockers and school or work networks can block on a working connection.
// The sign-up says so, and loads the script again when the visitor retries.

test.use({ serviceWorkers: 'block' });

test('a blocked bot check says why and loads again on the next try', async ({ page }) => {
  await page.route(/\/sign-up(?:\?.*)?$/, async (route) => {
    const response = await route.fetch();
    const html = (await response.text()).replace(
      'data-sitekey=""',
      'data-sitekey="1x00000000000000000000AA"',
    );
    await route.fulfill({ response, body: html });
  });
  let loads = 0;
  let blocked = true;
  await page.route('https://challenges.cloudflare.com/**', (route) => {
    loads += 1;
    if (blocked) return route.abort('blockedbyclient');
    return route.fulfill({
      contentType: 'text/javascript',
      body: `window.turnstile = {
        render(el, options) { setTimeout(() => options.callback('stand-in-token'), 10); return 'w'; },
        reset() {},
      };
      window.lvwwdTurnstileReady && window.lvwwdTurnstileReady();`,
    });
  });
  const signups: unknown[] = [];
  await page.route('**/api/signup', (route) => {
    signups.push(route.request().postDataJSON());
    return route.fulfill({ status: 500, json: { message: 'Stand-in stop.' } });
  });

  await page.goto('/sign-up');
  await page.getByLabel('First name').fill('Ana');
  await page.getByLabel('Email address').fill('ana@example.com');
  await page.getByLabel('ZIP code').fill('89101');
  await page.getByLabel('County where you live').selectOption({ label: 'Clark' });
  await page.getByLabel('18 or older').check();
  const submit = page.getByRole('button', { name: 'Sign up', exact: true });

  await submit.click();
  await expect(page.getByText(/The check that keeps out bots didn’t load/)).toBeVisible();
  await expect(page.getByText(/Check your connection/)).toBeHidden();
  expect(signups).toHaveLength(0);

  const failedLoads = loads;
  blocked = false;
  await submit.click();
  await expect.poll(() => signups.length).toBe(1);
  expect(loads).toBe(failedLoads + 1);
});
