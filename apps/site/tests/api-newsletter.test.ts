import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type Platform,
  apiRequest,
  fakeOutbound,
  signUpAs,
  startPlatform,
} from './support/platform';

const CONFIG = {
  LVBT_BEEHIIV_API_KEY: 'newsletter-test-key',
  LVBT_BEEHIIV_PUBLICATION_ID: 'pub_00000000-0000-0000-0000-000000000000',
};
const ENDPOINT = `https://api.beehiiv.com/v2/publications/${CONFIG.LVBT_BEEHIIV_PUBLICATION_ID}/subscriptions`;

describe('newsletter enrollment through the Worker', () => {
  let platform: Platform;
  let sent: Array<{ headers: Headers; body: Record<string, unknown> }>;
  let provider: () => Promise<Response>;
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
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-04T19:20:00Z'));
    await platform.reset();
    sent = [];
    provider = () =>
      Promise.resolve(Response.json({ data: { id: 'sub_test', status: 'pending' } }));
    const outbound = fakeOutbound(realFetch);
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url !== ENDPOINT) return outbound.fetch(input, init);
      sent.push({
        headers: new Headers(init?.headers),
        body: JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<
          string,
          unknown
        >,
      });
      return provider();
    });
  });

  const join = (body: object, cookie?: string) =>
    platform.send(
      apiRequest('POST', '/api/newsletter', {
        body: { source: 'home', turnstileToken: 'widget-token', ...body },
        ...(cookie ? { cookie } : {}),
      }),
      CONFIG,
    );

  it('uses the authenticated participant email and requests confirmation without sending their other details', async () => {
    const cookie = await signUpAs(platform);
    expect((await join({ source: 'keep_going' }, cookie)).status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.headers.get('Authorization')).toBe(`Bearer ${CONFIG.LVBT_BEEHIIV_API_KEY}`);
    expect(sent[0]?.body).toEqual({
      email: 'rosa@example.com',
      reactivate_existing: true,
      send_welcome_email: false,
      double_opt_override: 'on',
      utm_source: 'lvwwd.org',
      utm_medium: 'website',
      utm_campaign: 'week-without-driving-2026',
      utm_content: 'keep_going',
    });
    expect(await platform.env.DB.prepare('SELECT newsletter FROM participants').first()).toEqual({
      newsletter: 1,
    });
  });

  it('accepts an explicit email without a campaign account and normalizes it', async () => {
    expect((await join({ email: ' Rider@Example.COM ' })).status).toBe(200);
    expect(sent[0]?.body.email).toBe('rider@example.com');
    expect(sent[0]?.body.utm_content).toBe('home');
    expect(await platform.env.DB.prepare('SELECT count(*) AS n FROM participants').first()).toEqual(
      { n: 0 },
    );
  });

  it('keeps an alternate newsletter address separate from the signed-in campaign address', async () => {
    const cookie = await signUpAs(platform);
    expect((await join({ source: 'keep_going', email: 'other@example.com' }, cookie)).status).toBe(
      200,
    );
    expect(sent[0]?.body.email).toBe('other@example.com');
    expect(
      await platform.env.DB.prepare('SELECT contact, newsletter FROM participants').first(),
    ).toEqual({ contact: 'rosa@example.com', newsletter: 0 });
  });

  it('takes the saved email from the current session, ignoring a supplied participant ID', async () => {
    await signUpAs(platform);
    const cookie = await signUpAs(platform, { contact: 'ana@example.com' });
    const victim = await platform.env.DB.prepare(
      "SELECT id FROM participants WHERE contact = 'rosa@example.com'",
    ).first<{ id: string }>();
    expect((await join({ source: 'keep_going', participantId: victim?.id }, cookie)).status).toBe(
      200,
    );
    expect(sent[0]?.body.email).toBe('ana@example.com');
    expect(
      await platform.env.DB.prepare(
        "SELECT newsletter FROM participants WHERE contact = 'rosa@example.com'",
      ).first(),
    ).toEqual({ newsletter: 0 });
  });

  it('rejects invalid inputs and absent authentication before contacting the provider', async () => {
    for (const email of [
      '',
      'rider@example',
      '+17025551234',
      123,
      `${'a'.repeat(255)}@example.com`,
    ]) {
      expect((await join({ email })).status).toBe(400);
    }
    expect((await join({ source: 'elsewhere', email: 'rider@example.com' })).status).toBe(400);
    expect((await join({})).status).toBe(400);
    expect((await join({ source: 'keep_going' })).status).toBe(401);
    expect(sent).toHaveLength(0);
  });

  it('enforces same-origin JSON writes and the bot check', async () => {
    const body = { source: 'home', email: 'rider@example.com', turnstileToken: 'widget-token' };
    expect(
      (
        await platform.send(
          apiRequest('POST', '/api/newsletter', { body, origin: 'https://other.test' }),
          CONFIG,
        )
      ).status,
    ).toBe(403);
    expect((await platform.send(apiRequest('GET', '/api/newsletter'), CONFIG)).status).toBe(405);
    expect((await join({ email: 'rider@example.com', turnstileToken: '' })).status).toBe(403);
    expect(sent).toHaveLength(0);
  });

  it('keeps unavailable provider configuration closed', async () => {
    const response = await platform.send(
      apiRequest('POST', '/api/newsletter', {
        body: { source: 'home', email: 'rider@example.com', turnstileToken: 'token' },
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: 'newsletter_unavailable' });
    expect(sent).toHaveLength(0);
  });

  it('reports rejected, unreachable and malformed provider replies without recording enrollment', async () => {
    const cookie = await signUpAs(platform);
    for (const reply of [
      () => Promise.resolve(new Response(null, { status: 503 })),
      () => Promise.reject(new Error('provider offline')),
      () => Promise.resolve(Response.json({ data: { status: 'inactive' } })),
    ]) {
      provider = reply;
      const response = await join({ source: 'keep_going' }, cookie);
      expect(response.status).toBe(502);
      expect(await response.json()).toMatchObject({ error: 'newsletter_unavailable' });
    }
    expect(await platform.env.DB.prepare('SELECT newsletter FROM participants').first()).toEqual({
      newsletter: 0,
    });
  });

  it('limits repeated subscriptions for an address even across connections', async () => {
    const body = { source: 'home', email: 'rider@example.com', turnstileToken: 'token' };
    let response: Response | undefined;
    for (let n = 0; n < 4; n += 1)
      response = await platform.send(
        apiRequest('POST', '/api/newsletter', { body, ip: `203.0.113.${n + 1}` }),
        CONFIG,
      );
    expect(response?.status).toBe(429);
    expect(sent).toHaveLength(3);
  });
});
