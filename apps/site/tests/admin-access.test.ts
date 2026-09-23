import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACCESS_ENV,
  type AccessKeys,
  VOLUNTEER,
  accessToken,
  adminGet,
  adminPost,
  countRows,
  encodeJson,
  makeAccessKeys,
  seedEntry,
  seedParticipant,
} from './support/admin';
import { type Outbound, type Platform, fakeOutbound, startPlatform } from './support/platform';

// Who can open the admin views: a volunteer Cloudflare Access signed in,
// checked again by the Worker, or, on the preview only, a tester with the
// preview key. Run through the real Worker against a local D1 database.
describe('admin access', () => {
  let platform: Platform;
  let outbound: Outbound;
  let keys: AccessKeys;
  const realFetch = globalThis.fetch;
  const PREVIEW_KEY = 'a'.repeat(64);

  beforeAll(async () => {
    platform = await startPlatform();
    keys = await makeAccessKeys();
  }, 60_000);
  afterAll(async () => {
    vi.unstubAllGlobals();
    await platform.dispose();
  });
  beforeEach(async () => {
    await platform.reset();
    outbound = fakeOutbound(realFetch);
    outbound.accessKeys = [keys.publicJwk];
    vi.stubGlobal('fetch', outbound.fetch);
  });

  const open = (token?: string, env: Record<string, string | undefined> = ACCESS_ENV) =>
    platform.send(adminGet('/admin', token), env);

  it('lets in a volunteer with a valid Access token, and remembers them', async () => {
    const response = await open(await accessToken(keys));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(VOLUNTEER);
    const row = await platform.env.DB.prepare('SELECT email FROM volunteers').first();
    expect(row).toEqual({ email: VOLUNTEER });
  });

  it('accepts an audience written as a single string', async () => {
    const response = await open(await accessToken(keys, { aud: ACCESS_ENV.ACCESS_AUD }));
    expect(response.status).toBe(200);
  });

  it('refuses every admin address without a token', async () => {
    await seedEntry(platform, {
      participantId: await seedParticipant(platform, { contact: 'a@b.co' }),
    });
    for (const path of ['/admin', '/admin/', '/api/admin/entries.csv', '/api/admin/screenshot/x']) {
      const response = await platform.send(adminGet(path), ACCESS_ENV);
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain('a@b.co');
    }
    const post = await platform.send(
      adminPost('/admin/entries/check', { id: '1', seen: '2026-10-03T18:00:00.000Z' }),
      ACCESS_ENV,
    );
    expect(post.status).toBe(403);
    expect(
      await countRows(platform, 'SELECT count(*) AS n FROM checkins WHERE checked_at IS NOT NULL'),
    ).toBe(0);
    expect(await countRows(platform, 'SELECT count(*) AS n FROM volunteers')).toBe(0);
  });

  it('refuses a token for another application', async () => {
    expect((await open(await accessToken(keys, { aud: ['another-app'] }))).status).toBe(403);
  });

  it('refuses a token from another team', async () => {
    const token = await accessToken(keys, { iss: 'https://someone-else.cloudflareaccess.com' });
    expect((await open(token)).status).toBe(403);
  });

  it('refuses an expired token', async () => {
    const token = await accessToken(keys, { exp: Math.floor(Date.now() / 1000) - 5 });
    expect((await open(token)).status).toBe(403);
  });

  it('refuses a token signed with a key that is not the team’s', async () => {
    const forger = await makeAccessKeys(keys.kid);
    expect((await open(await accessToken(forger))).status).toBe(403);
    const unknownKey = await makeAccessKeys('unknown-key');
    expect((await open(await accessToken(unknownKey))).status).toBe(403);
  });

  it('refuses a token whose claims were changed after signing', async () => {
    const [head, , signature] = (await accessToken(keys)).split('.');
    const body = encodeJson({
      aud: [ACCESS_ENV.ACCESS_AUD],
      email: 'intruder@example.com',
      exp: 9e9,
      iss: `https://${ACCESS_ENV.ACCESS_TEAM_DOMAIN}`,
    });
    expect((await open(`${head ?? ''}.${body}.${signature ?? ''}`)).status).toBe(403);
    expect((await open('not-a-token')).status).toBe(403);
  });

  it('refuses everyone while Access is not configured', async () => {
    expect((await open(await accessToken(keys), {})).status).toBe(403);
  });

  it('keeps the team’s keys instead of fetching them for every request', async () => {
    const token = await accessToken(keys);
    await open(token);
    await open(token);
    await open(token);
    expect(outbound.accessKeyFetches).toBeLessThanOrEqual(1);
  });

  it('refuses a form sent from another site', async () => {
    const id = await seedEntry(platform, {
      participantId: await seedParticipant(platform, { contact: 'a@b.co' }),
    });
    const fields = { id: String(id), seen: '2026-10-03T18:00:00.000Z' };
    for (const origin of ['https://evil.example', null]) {
      const response = await platform.send(
        adminPost('/admin/entries/check', fields, { token: await accessToken(keys), origin }),
        ACCESS_ENV,
      );
      expect(response.status).toBe(403);
    }
    expect(
      await countRows(platform, 'SELECT count(*) AS n FROM checkins WHERE checked_at IS NOT NULL'),
    ).toBe(0);
  });

  it('sends pages that run no script and stay out of search engines', async () => {
    const response = await open(await accessToken(keys));
    const policy = response.headers.get('Content-Security-Policy') ?? '';
    expect(policy).toContain("default-src 'none'");
    expect(policy).not.toContain('script-src');
    expect(response.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    // With no-referrer, browsers send "Origin: null" with a form, which the
    // Origin check refuses.
    expect(response.headers.get('Referrer-Policy')).not.toBe('no-referrer');
  });

  describe('the preview key', () => {
    const login = (key: string, env: Record<string, string | undefined>) =>
      platform.send(adminGet(`/admin/preview-login?key=${key}`), env);
    const withCookie = (cookie: string, env: Record<string, string | undefined>) =>
      platform.send(adminGet('/admin', undefined, cookie), env);

    it('signs a tester in for 8 hours when the key matches', async () => {
      const env = { PREVIEW_ADMIN_KEY: PREVIEW_KEY };
      const response = await login(PREVIEW_KEY, env);
      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe('/admin');
      const cookies = response.headers.getSetCookie();
      expect(cookies.some((cookie) => /Path=\/admin(;|$)/.test(cookie))).toBe(true);
      for (const cookie of cookies) {
        expect(cookie).toMatch(/^lvwwd_admin_preview=/);
        for (const part of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Max-Age=28800']) {
          expect(cookie).toContain(part);
        }
      }
      const page = await withCookie(`lvwwd_admin_preview=${PREVIEW_KEY}`, env);
      expect(page.status).toBe(200);
      const row = await platform.env.DB.prepare('SELECT email FROM volunteers').first();
      expect(row).toEqual({ email: 'preview@lvwwd.org' });
    });

    it('refuses a wrong key, and sets no cookie', async () => {
      const response = await login('b'.repeat(64), { PREVIEW_ADMIN_KEY: PREVIEW_KEY });
      expect(response.status).toBe(403);
      expect(response.headers.getSetCookie()).toHaveLength(0);
      const page = await withCookie(`lvwwd_admin_preview=${'b'.repeat(64)}`, {
        PREVIEW_ADMIN_KEY: PREVIEW_KEY,
      });
      expect(page.status).toBe(403);
    });

    it('does not exist when the key is not set, or is too short to be safe', async () => {
      for (const env of [{}, { PREVIEW_ADMIN_KEY: 'short' }]) {
        const key = env.PREVIEW_ADMIN_KEY ?? PREVIEW_KEY;
        expect((await login(key, env)).status).toBe(403);
        expect((await withCookie(`lvwwd_admin_preview=${key}`, env)).status).toBe(403);
      }
    });
  });
});
