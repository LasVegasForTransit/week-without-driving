import { expect, test } from '@playwright/test';

// A recovery link can change the participant without an explicit sign-out.
test('does not upload the previous participant’s Bingo marks into the next account', async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([{ name: 'lvwwd_signed_in', value: '1', url: baseURL ?? '' }]);
  const previous = Array.from({ length: 25 }, (_, index) => index === 0 || index === 12);
  const saved = Array.from({ length: 25 }, (_, index) => index === 12);
  await page.addInitScript(
    ({ previous }) => {
      localStorage.setItem('lvwwd_bingo_2026', JSON.stringify(previous));
      localStorage.setItem('lvwwd_bingo_owner', 'previous-test-participant');
    },
    { previous },
  );
  let uploaded: unknown = null;
  await page.route('**/api/bingo', async (route) => {
    if (route.request().method() === 'PUT') {
      uploaded = route.request().postDataJSON();
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { participantId: 'next-test-participant', state: saved } });
  });
  await page.goto('/bingo');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('lvwwd_bingo_owner')))
    .toBe('next-test-participant');
  await expect(page.getByRole('checkbox').first()).not.toBeChecked();
  expect(uploaded).toBeNull();
});

test('keeps an anonymous card when that person first signs in', async ({
  page,
  context,
  baseURL,
}) => {
  await page.goto('/bingo');
  await page.getByRole('checkbox').first().click();
  await context.addCookies([{ name: 'lvwwd_signed_in', value: '1', url: baseURL ?? '' }]);
  let upload: Record<string, unknown> | null = null;
  await page.route('**/api/bingo', async (route) => {
    if (route.request().method() === 'PUT') {
      upload = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { participantId: 'first-test-participant', state: null } });
  });
  await page.reload();
  await expect(page.getByRole('checkbox').first()).toBeChecked();
  await expect.poll(() => upload).toMatchObject({ participantId: 'first-test-participant' });
  expect((upload as unknown as { state: boolean[] }).state[0]).toBe(true);
});

test('does not upload marks when ownership could not be checked', async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([{ name: 'lvwwd_signed_in', value: '1', url: baseURL ?? '' }]);
  let uploads = 0;
  await page.addInitScript(() =>
    localStorage.setItem('lvwwd_bingo_owner', 'previous-test-participant'),
  );
  await page.route('**/api/bingo', (route) => {
    if (route.request().method() === 'PUT') uploads += 1;
    return route.fulfill({ status: 503, json: { message: 'Try again later.' } });
  });
  await page.goto('/bingo');
  await page.getByRole('checkbox').first().click();
  await page.waitForTimeout(1000);
  expect(uploads).toBe(0);
});

test('a stale open tab reconciles an account change without uploading its old card', async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([{ name: 'lvwwd_signed_in', value: '1', url: baseURL ?? '' }]);
  await page.addInitScript(() =>
    localStorage.setItem('lvwwd_bingo_owner', 'previous-test-participant'),
  );
  let currentId = 'previous-test-participant';
  const writes: Record<string, unknown>[] = [];
  await page.route('**/api/bingo', (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      writes.push(body);
      return body.participantId === currentId
        ? route.fulfill({ json: { ok: true } })
        : route.fulfill({ status: 409, json: { message: 'Sign in again.' } });
    }
    return route.fulfill({
      json: { participantId: currentId, state: Array.from({ length: 25 }, (_, i) => i === 12) },
    });
  });
  await page.goto('/bingo');
  await page.getByRole('checkbox').first().click();
  await expect.poll(() => writes.length).toBe(1);
  currentId = 'next-test-participant';
  await page.evaluate(() => localStorage.setItem('lvwwd_bingo_owner', 'next-test-participant'));
  await page.getByRole('checkbox').nth(1).click();
  await expect.poll(() => writes.length).toBe(2);
  await expect(page.getByRole('checkbox').first()).not.toBeChecked();
  await expect(page.getByRole('checkbox').nth(1)).not.toBeChecked();
  await page.waitForTimeout(1000);
  expect(writes.every((body) => body.participantId === 'previous-test-participant')).toBe(true);
});
