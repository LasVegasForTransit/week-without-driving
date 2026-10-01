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
// checked again by the Worker. Run through the real Worker against a local D1 database.
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

  it('shows a private, readable fallback when storage is unavailable', async () => {
    const response = await platform.send(adminGet('/admin', await accessToken(keys)), {
      ...ACCESS_ENV,
      DB: undefined,
    });
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await response.text();
    expect(body).toContain('Admin is unavailable');
    expect(body).toContain('Back to admin');
    expect(body).not.toContain('database');
    expect(body).not.toContain('binding');
  });

  it('keeps provider errors and participant details out of responses and logs', async () => {
    const privateDetail = 'private-person@example.test /photos/private-person/1-secret.png';
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const DB = {
        prepare: () => {
          throw new Error(privateDetail);
        },
      } as unknown as D1Database;
      const response = await platform.send(adminGet('/admin', await accessToken(keys)), {
        ...ACCESS_ENV,
        DB,
      });
      expect(response.status).toBe(500);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(await response.text()).not.toContain(privateDetail);
      expect(log).toHaveBeenCalledWith('Admin request failed', 'GET', 'showAdmin');
      expect(JSON.stringify(log.mock.calls)).not.toContain(privateDetail);
    } finally {
      log.mockRestore();
    }
  });

  it('accepts an audience written as a single string', async () => {
    const response = await open(await accessToken(keys, { aud: ACCESS_ENV.ACCESS_AUD }));
    expect(response.status).toBe(200);
  });

  it('refuses every admin address without a token', async () => {
    await seedEntry(platform, {
      participantId: await seedParticipant(platform, { contact: 'a@b.co' }),
    });
    for (const path of [
      '/admin',
      '/admin/',
      '/api/admin/entries.csv',
      '/api/admin/screenshot/x',
      '/api/admin',
      '/admin/unknown',
    ]) {
      const response = await platform.send(adminGet(path), ACCESS_ENV);
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain('a@b.co');
    }
    for (const path of [
      '/admin/entries/check',
      '/admin/entries/remove',
      '/admin/entries/restore',
      '/admin/tags',
      '/admin/draw',
      '/admin/push/test',
    ]) {
      const post = await platform.send(adminPost(path, {}), ACCESS_ENV);
      expect(post.status).toBe(403);
      expect(post.headers.get('Cache-Control')).toBe('no-store');
    }
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

  it('rejects retired preview keys on every admin route, even if still bound', async () => {
    const env = { ...ACCESS_ENV, PREVIEW_ADMIN_KEY: PREVIEW_KEY };
    for (const path of [
      '/admin',
      '/api/admin/entries.csv',
      '/api/admin/screenshot/x',
      `/admin/preview-login?key=${PREVIEW_KEY}`,
    ]) {
      const response = await platform.send(
        adminGet(path, undefined, `lvwwd_admin_preview=${PREVIEW_KEY}`),
        env,
      );
      expect(response.status).toBe(403);
      expect(response.headers.getSetCookie()).toHaveLength(0);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
    expect(await countRows(platform, 'SELECT count(*) AS n FROM volunteers')).toBe(0);
  });

  it.each([null, 'tomorrow', {}, [], 9e9].map((nbf) => ({ nbf })))(
    'rejects malformed or future not-before claims: %j',
    async ({ nbf }) => {
      expect((await open(await accessToken(keys, { nbf }))).status).toBe(403);
    },
  );

  it('rejects non-finite NumericDates even in a signed token', async () => {
    const valid = await accessToken(keys);
    const [head = '', body = ''] = valid.split('.');
    const claims = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/'))) as Record<
      string,
      unknown
    >;
    for (const field of ['exp', 'nbf']) {
      const raw = JSON.stringify({ ...claims, [field]: 'overflow' }).replace('"overflow"', '1e400');
      const encoded = btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const payload = `${head}.${encoded}`;
      const signed = new Uint8Array(
        await crypto.subtle.sign(
          'RSASSA-PKCS1-v1_5',
          keys.privateKey,
          new TextEncoder().encode(payload),
        ),
      );
      const signature = btoa(String.fromCharCode(...signed))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      expect((await open(`${payload}.${signature}`)).status).toBe(403);
    }
  });
});
