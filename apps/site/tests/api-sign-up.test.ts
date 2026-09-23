import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type Outbound,
  type Platform,
  SIGN_UP,
  apiRequest,
  cookiesFrom,
  fakeOutbound,
  signUpAs,
  startPlatform,
} from './support/platform';

// Sign-up, "Get my link", opening a link, and the guards in front of them,
// run through the real Worker against a local D1 database.
describe('sign-up and links', () => {
  let platform: Platform;
  let outbound: Outbound;
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    platform = await startPlatform();
  }, 60_000);
  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    await platform.dispose();
  });
  beforeEach(async () => {
    // Mid-hour, so the hourly rate-limit windows can't roll over during a test.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-23T19:20:00Z'));
    await platform.reset();
    outbound = fakeOutbound(realFetch);
    vi.stubGlobal('fetch', outbound.fetch);
  });

  const signUp = (body: object, ip?: string) =>
    platform.send(
      apiRequest('POST', '/api/signup', { body: { ...SIGN_UP, ...body }, ...(ip ? { ip } : {}) }),
      { RESEND_API_KEY: 'test-key' },
    );
  const askForLink = (contact: string, ip?: string) =>
    platform.send(
      apiRequest('POST', '/api/link', {
        body: { contact, turnstileToken: 'token' },
        ...(ip ? { ip } : {}),
      }),
      { RESEND_API_KEY: 'test-key' },
    );
  const count = async (table: string) =>
    (await platform.env.DB.prepare(`SELECT count(*) AS n FROM ${table}`).first<{ n: number }>())?.n;

  it('signs a new person up, signs the phone in, and emails their link', async () => {
    const response = await signUp({});
    expect(response.status).toBe(201);
    const body: { redirect: string; previewLink?: string } = await response.json();
    expect(body.redirect).toBe('/my-week?welcome=1');
    expect(body.previewLink).toBeUndefined();

    const [session, flag] = response.headers.getSetCookie();
    expect(session).toMatch(/^__Host-lvwwd_session=[\w-]{43};/);
    expect(session).toMatch(/HttpOnly/);
    expect(flag).toMatch(/^lvwwd_signed_in=1;/);
    expect(flag).not.toMatch(/HttpOnly/);
    for (const cookie of [session, flag]) {
      expect(cookie).toMatch(/Secure/);
      expect(cookie).toMatch(/SameSite=Lax/);
      expect(cookie).toMatch(/Path=\//);
    }

    expect(outbound.emails).toHaveLength(1);
    expect(outbound.emails[0]?.to).toEqual(['rosa@example.com']);
    expect(outbound.emails[0]?.text).toContain('https://lvwwd.test/my-week?t=');

    const stored = await platform.env.DB.prepare(
      'SELECT contact, instagram FROM participants',
    ).first();
    expect(stored).toEqual({ contact: 'rosa@example.com', instagram: 'rosa.rides' });
  });

  it('stores only hashes of session and link tokens', async () => {
    const response = await signUp({});
    const token = cookiesFrom(response).split('; ')[0]?.split('=')[1] ?? '';
    const link = outbound.emails[0]?.text.match(/t=([\w-]+)/)?.[1] ?? '';
    const rows = await platform.env.DB.prepare(
      'SELECT token_hash FROM sessions UNION ALL SELECT token_hash FROM link_tokens',
    ).all<{ token_hash: string }>();
    const hashes = rows.results.map((row) => row.token_hash);
    expect(hashes).toHaveLength(2);
    expect(hashes).not.toContain(token);
    expect(hashes).not.toContain(link);
  });

  it('shows the link on the preview Worker only', async () => {
    const response = await platform.send(apiRequest('POST', '/api/signup', { body: SIGN_UP }), {
      PREVIEW_SHOW_LINKS: 'true',
    });
    const body: { previewLink?: string } = await response.json();
    expect(body.previewLink).toMatch(/^https:\/\/lvwwd\.test\/my-week\?t=[\w-]{43}$/);
  });

  it('records a phone sign-up’s link as pending, with no email', async () => {
    const response = await signUp({ contact: '(702) 555-0123' });
    expect(response.status).toBe(201);
    expect(outbound.emails).toHaveLength(0);
    const row = await platform.env.DB.prepare(
      'SELECT p.contact, l.delivery FROM participants p JOIN link_tokens l ON l.participant_id = p.id',
    ).first();
    expect(row).toEqual({ contact: '+17025550123', delivery: 'pending' });
  });

  it('never signs a phone in with someone else’s contact, and sends them their link', async () => {
    await signUp({});
    outbound.emails.length = 0;
    const response = await signUp({
      contact: 'ROSA@example.com',
      firstName: 'Mallory',
      zip: '89002',
    });
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toHaveLength(0);
    const body: { status: string; message: string } = await response.json();
    expect(body.status).toBe('existing');
    expect(body.message).toMatch(/already signed up/i);
    expect(outbound.emails.map((email) => email.to)).toEqual([['rosa@example.com']]);
    const stored = await platform.env.DB.prepare(
      'SELECT first_name, zip FROM participants',
    ).first();
    expect(stored).toEqual({ first_name: 'Rosa', zip: '89101' });
  });

  it('checks every field and names the ones that are wrong', async () => {
    const response = await signUp({ firstName: ' ', contact: 'nope', zip: '90210', age: 'child' });
    expect(response.status).toBe(400);
    const body: { errors: Record<string, string> } = await response.json();
    expect(Object.keys(body.errors).sort()).toEqual(['age', 'contact', 'firstName', 'zip']);
    expect(await count('participants')).toBe(0);
  });

  it('refuses a failed or missing bot check', async () => {
    outbound.turnstilePasses = false;
    expect((await signUp({})).status).toBe(403);
    outbound.turnstilePasses = true;
    const noSecret = await platform.send(apiRequest('POST', '/api/signup', { body: SIGN_UP }), {
      TURNSTILE_SECRET: '',
    });
    expect(noSecret.status).toBe(503);
    expect(await count('participants')).toBe(0);
  });

  it('allows five sign-ups an hour from one connection', async () => {
    for (let n = 0; n < 5; n += 1) {
      expect((await signUp({ contact: `person${n}@example.com` }, '198.51.100.1')).status).toBe(
        201,
      );
    }
    const sixth = await signUp({ contact: 'person6@example.com' }, '198.51.100.1');
    expect(sixth.status).toBe(429);
    expect((await sixth.json<{ message: string }>()).message).toBeTruthy();
    expect((await signUp({ contact: 'other@example.com' }, '198.51.100.2')).status).toBe(201);
  });

  it('answers "Get my link" the same way whether or not the contact matches', async () => {
    await signUp({});
    outbound.emails.length = 0;
    const matched = await askForLink('rosa@example.com');
    const unmatched = await askForLink('nobody@example.com');
    expect(matched.status).toBe(202);
    expect(unmatched.status).toBe(202);
    expect(await matched.json()).toEqual(await unmatched.json());
    expect(outbound.emails.map((email) => email.to)).toEqual([['rosa@example.com']]);
  });

  it('sends at most three links an hour to one contact, without saying so', async () => {
    await signUp({});
    outbound.emails.length = 0;
    for (let n = 0; n < 4; n += 1) {
      expect((await askForLink('rosa@example.com', `192.0.2.${n}`)).status).toBe(202);
    }
    expect(outbound.emails).toHaveLength(3);
  });

  it('refuses the eleventh link request an hour from one connection', async () => {
    for (let n = 0; n < 10; n += 1) {
      expect((await askForLink(`person${n}@example.com`, '192.0.2.50')).status).toBe(202);
    }
    expect((await askForLink('person10@example.com', '192.0.2.50')).status).toBe(429);
  });

  it('signs a phone in from a link, then takes the token out of the address', async () => {
    await signUp({});
    const link = new URL(outbound.emails[0]?.text.match(/https:\S+/)?.[0] ?? '');
    const response = await platform.send(new Request(link));
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/my-week');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');

    const me = await platform.send(apiRequest('GET', '/api/me', { cookie: cookiesFrom(response) }));
    expect(me.status).toBe(200);
    expect((await me.json<{ firstName: string }>()).firstName).toBe('Rosa');
  });

  it('sends an unknown or expired link to "Get my link"', async () => {
    await signUp({});
    const link = outbound.emails[0]?.text.match(/https:\S+/)?.[0] ?? '';
    await platform.env.DB.prepare(
      "UPDATE link_tokens SET expires_at = '2026-01-01T00:00:00.000Z'",
    ).run();
    for (const url of [link, 'https://lvwwd.test/my-week?t=not-a-real-token']) {
      const response = await platform.send(new Request(url));
      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe('/my-week/link?expired=1');
      expect(response.headers.getSetCookie()).toHaveLength(0);
    }
  });

  it('refuses writes from another site or without a JSON body', async () => {
    const elsewhere = await platform.send(
      apiRequest('POST', '/api/signup', { body: SIGN_UP, origin: 'https://evil.example' }),
    );
    expect(elsewhere.status).toBe(403);
    const form = new Request('https://lvwwd.test/api/signup', {
      method: 'POST',
      headers: {
        Origin: 'https://lvwwd.test',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'firstName=Rosa',
    });
    expect((await platform.send(form)).status).toBe(403);
    expect(await count('participants')).toBe(0);
  });

  it('says sign-up isn’t open when the Worker has no database', async () => {
    const response = await platform.send(apiRequest('POST', '/api/signup', { body: SIGN_UP }), {
      DB: undefined,
    });
    expect(response.status).toBe(503);
  });

  it('keeps a signed-in phone signed in across requests', async () => {
    const cookie = await signUpAs(platform);
    const response = await platform.send(apiRequest('GET', '/api/me', { cookie }));
    expect(response.status).toBe(200);
  });
});
