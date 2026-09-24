import { expect, test, type BrowserContext, type Page, type Request } from '@playwright/test';

// "Keep going after the week" on My week and "Stay involved with LVBT" on
// Home. The tests stand in for the Worker: GET /api/me for a signed-in
// participant, POST /api/newsletter with a chosen reply, and Turnstile.
// The one-tap sign-up ships turned off until the newsletter route exists,
// so the tests that exercise it turn it on in the page they load.

const CLOSES = new Date('2026-10-09T07:00:00Z');
const JUST_BEFORE = new Date('2026-10-09T06:59:59.999Z');
const SUCCESS =
  "Almost done! Check your email for a message from Las Vegans for Better Transit, and tap Confirm my subscription. Already subscribed? You're all set.";

const EMAIL_PARTICIPANT = {
  firstName: 'Marcus',
  contactMasked: 'w•••@example.com',
  contactType: 'email',
  zip: '89030',
  instagram: null,
  days: [],
  trips: [],
  today: 3,
  reminders: { push: false, text: false, email: false },
};
const PHONE_PARTICIAPNT = {
  ...EMAIL_PARTICIPANT,
  contactMasked: '(•••) •••-1234',
  contactType: 'phone',
};

test.use({ serviceWorkers: 'block' });

async function signIn(context: BrowserContext, page: Page, me: object) {
  const url = new URL(page.url() === 'about:blank' ? 'http://127.0.0.1' : page.url());
  await context.addCookies([
    { name: 'lvwwd_signed_in', value: '1', domain: url.hostname, path: '/' },
  ]);
  await page.route('**/api/me', (route) => route.fulfill({ json: me }));
}

/** Loads pages with the one-tap sign-up on and a Turnstile site key, as it will ship. */
async function turnOnOneTap(page: Page) {
  await page.route(/\/(my-week)?$/, async (route) => {
    const response = await route.fetch();
    const html = (await response.text())
      .replace(/data-keep-going(?![-\w])/g, 'data-keep-going data-one-tap="on"')
      .replace(/data-sitekey=""/g, 'data-sitekey="1x00000000000000000000AA"');
    await route.fulfill({ response, body: html });
  });
}

/** Turnstile's stand-in: counts loads, and answers each render with a token unless told not to. */
async function standInTurnstile(page: Page, answer = true) {
  const loads: string[] = [];
  await page.route('https://challenges.cloudflare.com/**', (route) => {
    loads.push(route.request().url());
    return route.fulfill({
      contentType: 'text/javascript',
      body: `let answer = () => {};
      window.turnstile = {
        render(el, options) {
          answer = () => ${answer ? "setTimeout(() => options.callback('stand-in-token'), 10)" : 'undefined'};
          answer();
          return 'widget';
        },
        reset() { answer(); },
      };
      window.lvwwdTurnstileReady && window.lvwwdTurnstileReady();`,
    });
  });
  return loads;
}

/** POST /api/newsletter's stand-in: records each request and answers with the given replies in turn. */
async function standInNewsletter(page: Page, replies: Array<{ status: number; body?: object }>) {
  const sent: Array<Record<string, unknown>> = [];
  let next = 0;
  await page.route('**/api/newsletter', async (route) => {
    sent.push(route.request().postDataJSON() as Record<string, unknown>);
    const reply = replies[Math.min(next++, replies.length - 1)] ?? { status: 200 };
    await route.fulfill({ status: reply.status, json: reply.body ?? { ok: true } });
  });
  return sent;
}

const card = (page: Page, name = 'Keep going after the week') => page.getByRole('region', { name });

test.describe('My week', () => {
  test('the card sits after the reminders and before signing out, linking to the newsletter page', async ({
    page,
    context,
  }) => {
    await signIn(context, page, EMAIL_PARTICIPANT);
    await page.goto('/my-week#keep-going');
    const keepGoing = card(page);
    await expect(keepGoing.getByRole('heading', { level: 2 })).toHaveText(
      'Keep going after the week',
    );
    await expect(
      keepGoing.getByText(
        'Week Without Driving lasts eight days, but Las Vegans for Better Transit works all year for better buses and safer streets across the valley. Keep going with us.',
      ),
    ).toBeVisible();
    await expect(
      keepGoing.getByRole('link', { name: "Sign up on LVBT's newsletter page" }),
    ).toHaveAttribute('href', 'https://mail.lasvegasfortransit.org/');
    await expect(keepGoing.getByText('Ready to do more?')).toBeVisible();
    await expect(keepGoing.getByRole('link', { name: 'Become a member' })).toHaveAttribute(
      'href',
      'https://lasvegasfortransit.org/join',
    );
    await expect(keepGoing.getByRole('button', { name: 'Join the newsletter' })).toBeHidden();

    const order = await page.evaluate(() => {
      const at = (el: Element | null) =>
        el ? Array.from(document.querySelectorAll('*')).indexOf(el) : -1;
      return {
        reminders: at(document.getElementById('remind-heading')),
        card: at(document.getElementById('keep-going')),
        signOut: at(document.querySelector('[data-signout]')),
      };
    });
    expect(order.reminders).toBeLessThan(order.card);
    expect(order.card).toBeLessThan(order.signOut);
  });

  test('with an email contact, one tap sends one request with no email, the source and a token', async ({
    page,
    context,
  }) => {
    await turnOnOneTap(page);
    await signIn(context, page, EMAIL_PARTICIPANT);
    const loads = await standInTurnstile(page);
    const sent = await standInNewsletter(page, [{ status: 200 }]);
    await page.goto('/my-week');
    const keepGoing = card(page);
    await expect(keepGoing.getByText("We'll send it to w•••@example.com.")).toBeVisible();
    await expect(
      keepGoing.getByRole('link', { name: "Sign up on LVBT's newsletter page" }),
    ).toBeHidden();
    expect(loads).toEqual([]);

    await keepGoing.getByRole('button', { name: 'Join the newsletter' }).click();
    await expect(keepGoing.getByText(SUCCESS)).toBeVisible();
    await expect(keepGoing.getByRole('button', { name: 'Join the newsletter' })).toBeHidden();
    expect(sent).toEqual([{ source: 'keep_going', turnstileToken: 'stand-in-token' }]);
    expect(loads).toHaveLength(1);

    await page.reload();
    await expect(card(page).getByRole('button', { name: 'Join the newsletter' })).toBeVisible();
    await expect(card(page).getByText(SUCCESS)).toBeHidden();
  });

  test('with a phone contact, the card asks for an email and sends it', async ({
    page,
    context,
  }) => {
    await turnOnOneTap(page);
    await signIn(context, page, PHONE_PARTICIAPNT);
    await standInTurnstile(page);
    const sent = await standInNewsletter(page, [{ status: 200 }]);
    await page.goto('/my-week');
    const field = card(page).getByRole('textbox', { name: 'Email' });
    await expect(field).toBeVisible();
    await expect(field).toHaveAttribute('type', 'email');
    await expect(field).toHaveAttribute('autocomplete', 'email');
    await field.fill('rider@example.com');
    await field.press('Enter');
    await expect(card(page).getByText(SUCCESS)).toBeVisible();
    expect(sent).toEqual([
      { source: 'keep_going', email: 'rider@example.com', turnstileToken: 'stand-in-token' },
    ]);
  });

  test('"Use a different email" swaps in the field, focused, and the typed address is sent', async ({
    page,
    context,
  }) => {
    await turnOnOneTap(page);
    await signIn(context, page, EMAIL_PARTICIPANT);
    await standInTurnstile(page);
    const sent = await standInNewsletter(page, [{ status: 200 }]);
    await page.goto('/my-week');
    await card(page).getByRole('button', { name: 'Use a different email' }).click();
    const field = card(page).getByRole('textbox', { name: 'Email' });
    await expect(field).toBeFocused();
    await expect(card(page).getByText("We'll send it to")).toBeHidden();
    await field.fill('other@example.com');
    await card(page).getByRole('button', { name: 'Join the newsletter' }).click();
    await expect(card(page).getByText(SUCCESS)).toBeVisible();
    expect(sent[0]?.email).toBe('other@example.com');
  });
});

test.describe('the card on Home after the close', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(CLOSES);
    await turnOnOneTap(page);
    await standInTurnstile(page);
  });

  test('empty and incomplete addresses are marked on the field, and nothing is sent', async ({
    page,
  }) => {
    const sent = await standInNewsletter(page, [{ status: 200 }]);
    await page.goto('/');
    const section = card(page, 'Stay involved with LVBT');
    const field = section.getByRole('textbox', { name: 'Email' });
    const join = section.getByRole('button', { name: 'Join the newsletter' });
    await join.click();
    await expect(section.getByText('Enter your email address.')).toBeVisible();
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(field).toBeFocused();
    await field.fill('rider@example');
    await join.click();
    await expect(
      section.getByText('Enter a full email address, like name@example.com.'),
    ).toBeVisible();
    expect(sent).toEqual([]);
  });

  const failures: Array<[string, { status: number; body?: object }, string]> = [
    [
      '429',
      { status: 429, body: { error: 'rate_limited' } },
      'Too many tries. Wait a minute, then try again.',
    ],
    [
      '403',
      { status: 403, body: { error: 'verification_failed' } },
      "We couldn't confirm you're a person. Reload the page and try again.",
    ],
    [
      '502',
      { status: 502, body: { error: 'newsletter_unavailable' } },
      "LVBT's newsletter service isn't answering right now. Please try again in a few minutes.",
    ],
    [
      '503',
      { status: 503, body: { error: 'bot_check_unavailable' } },
      'Something went wrong. Please try again.',
    ],
    [
      '500',
      { status: 500, body: { error: 'internal' } },
      'Something went wrong. Please try again.',
    ],
  ];
  for (const [status, reply, message] of failures) {
    test(`a ${status} reply shows its message, keeps the address, and the next tap works`, async ({
      page,
    }) => {
      const sent = await standInNewsletter(page, [reply, { status: 200 }]);
      await page.goto('/');
      const section = card(page, 'Stay involved with LVBT');
      const field = section.getByRole('textbox', { name: 'Email' });
      await field.fill('rider@example.com');
      await section.getByRole('button', { name: 'Join the newsletter' }).click();
      await expect(section.getByText(message)).toBeVisible();
      await expect(field).toHaveValue('rider@example.com');
      await section.getByRole('button', { name: 'Join the newsletter' }).click();
      await expect(section.getByText(SUCCESS)).toBeVisible();
      expect(sent.map((body) => body.source)).toEqual(['home', 'home']);
    });
  }

  test('no reply at all asks to check the connection', async ({ page }) => {
    await page.route('**/api/newsletter', (route) => route.abort('internetdisconnected'));
    await page.goto('/');
    const section = card(page, 'Stay involved with LVBT');
    await section.getByRole('textbox', { name: 'Email' }).fill('rider@example.com');
    await section.getByRole('button', { name: 'Join the newsletter' }).click();
    await expect(
      section.getByText(
        "We couldn't reach the server. Check your connection and tap Join the newsletter again.",
      ),
    ).toBeVisible();
  });

  test('while joining, the button reads "Joining…" and a second tap sends nothing more', async ({
    page,
  }) => {
    const requests: Request[] = [];
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/newsletter', async (route) => {
      requests.push(route.request());
      await held;
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto('/');
    const section = card(page, 'Stay involved with LVBT');
    await section.getByRole('textbox', { name: 'Email' }).fill('rider@example.com');
    const join = section.getByRole('button', { name: 'Join the newsletter' });
    await join.click();
    const joining = section.getByRole('button', { name: 'Joining…' });
    await expect(joining).toBeDisabled();
    await joining.click({ force: true });
    release();
    await expect(section.getByText(SUCCESS)).toBeVisible();
    expect(requests).toHaveLength(1);
  });

  test('offline, the card says so and the button is marked disabled until the phone is back', async ({
    page,
    context,
  }) => {
    const sent = await standInNewsletter(page, [{ status: 200 }]);
    await page.goto('/');
    const section = card(page, 'Stay involved with LVBT');
    const notice = section.getByText(
      "You're offline. Joining the newsletter needs a connection. Try again when you're back online.",
    );
    const join = section.getByRole('button', { name: 'Join the newsletter' });
    await context.setOffline(true);
    await expect(notice).toBeVisible();
    await expect(join).toHaveAttribute('aria-disabled', 'true');
    await context.setOffline(false);
    await expect(notice).toBeHidden();
    await section.getByRole('textbox', { name: 'Email' }).fill('rider@example.com');
    await join.click();
    await expect(section.getByText(SUCCESS)).toBeVisible();
    expect(sent).toHaveLength(1);
  });
});

test('with no Turnstile token within 10 seconds, the card says something went wrong', async ({
  page,
}) => {
  await page.clock.install({ time: CLOSES });
  await turnOnOneTap(page);
  const loads = await standInTurnstile(page, false);
  const sent = await standInNewsletter(page, [{ status: 200 }]);
  await page.goto('/');
  const section = card(page, 'Stay involved with LVBT');
  await section.getByRole('textbox', { name: 'Email' }).fill('rider@example.com');
  await section.getByRole('button', { name: 'Join the newsletter' }).click();
  await expect(section.getByRole('button', { name: 'Joining…' })).toBeVisible();
  // The card starts its 10-second wait as it asks Turnstile, which it loads on this tap.
  await expect.poll(() => loads.length).toBe(1);
  await page.clock.fastForward(10_000);
  await expect(section.getByText('Something went wrong. Please try again.')).toBeVisible();
  await expect(section.getByRole('button', { name: 'Join the newsletter' })).toBeEnabled();
  expect(sent).toEqual([]);
});

test.describe('Home', () => {
  test('just before the close, Home keeps "Sign up to win" and has no "Stay involved" section', async ({
    page,
  }) => {
    await page.clock.setFixedTime(JUST_BEFORE);
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Stay involved with LVBT' })).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Stay involved with LVBT' })).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Try it this October.' })).toBeVisible();
  });

  test('at the close, a visitor who is not signed in is invited to stay involved', async ({
    page,
  }) => {
    await page.clock.setFixedTime(CLOSES);
    await page.goto('/');
    await expect(
      page.getByText('Week Without Driving 2026 has ended. Thanks to everyone who took part.'),
    ).toBeVisible();
    const button = page.getByRole('link', { name: 'Stay involved with LVBT' });
    await expect(button).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Try it this October.' })).toBeHidden();
    await expect(
      page.locator('.home-final').getByRole('link', { name: 'Sign up to win' }),
    ).toBeHidden();
    await expect(page.locator('.home-final').getByText('Questions? Email')).toBeVisible();
    const section = card(page, 'Stay involved with LVBT');
    await expect(
      section.getByText(
        'Week Without Driving 2026 is over. Thank you for taking part. Keep going after the week with Las Vegans for Better Transit: we work all year for better buses and safer streets across the valley.',
      ),
    ).toBeVisible();

    await button.click();
    await expect(section.getByRole('heading', { name: 'Stay involved with LVBT' })).toBeFocused();
  });

  test('at the close, a signed-in visitor keeps their way back to My week', async ({
    page,
    context,
  }) => {
    await page.clock.setFixedTime(CLOSES);
    await signIn(context, page, EMAIL_PARTICIPANT);
    await page.goto('/');
    await expect(page.locator('.home-hero__actions [data-signup-link]')).toBeVisible();
    await expect(page.locator('.home-hero__actions [data-signup-link]')).toHaveAttribute(
      'href',
      '/my-week',
    );
    await expect(page.getByRole('link', { name: 'Stay involved with LVBT' })).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Stay involved with LVBT' })).toBeHidden();
  });
});

test.describe('with JavaScript off', () => {
  test.use({ javaScriptEnabled: false });

  test('the card still shows its heading, the newsletter page and "Become a member", with no field', async ({
    page,
  }) => {
    await page.goto('/');
    // Home keeps its campaign text without JavaScript, so this reads the card's markup, which
    // is the same on My week.
    const section = page.locator('#stay-involved');
    await expect(section.locator('a[href="https://mail.lasvegasfortransit.org/"]')).toHaveText(
      "Sign up on LVBT's newsletter page",
    );
    await expect(section.locator('a[href="https://lasvegasfortransit.org/join"]')).toHaveText(
      'Become a member',
    );
    await expect(section.locator('form')).toHaveAttribute('hidden', '');
    await expect(page.getByRole('heading', { name: 'Try it this October.' })).toBeVisible();
  });
});
