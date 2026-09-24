import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as WwdModule from '../src/lib/wwd';

import {
  ACCESS_ENV,
  type AccessKeys,
  accessToken,
  adminGet,
  makeAccessKeys,
} from './support/admin';
import {
  type Platform,
  SIGN_UP,
  apiRequest,
  fakeOutbound,
  signUpAs,
  startPlatform,
} from './support/platform';

// Two partners on the roster, for these tests only; the real roster fills
// in as LVBT confirms each group.
vi.mock('../src/lib/wwd', async (importOriginal) => {
  const real = await importOriginal<typeof WwdModule>();
  const partners = [
    {
      name: 'East Las Vegas Neighbors',
      slug: 'east-las-vegas-neighbors',
      type: 'Community and neighborhood groups',
      sentence: 'Neighbors in East Las Vegas.',
    },
    {
      name: 'Campus Riders',
      slug: 'campus-riders',
      type: 'Student groups',
      sentence: 'Students who ride.',
    },
  ];
  return { ...real, wwd: { ...real.wwd, partners } };
});

const EAST = 'east-las-vegas-neighbors';

// Where a sign-up came from: the partner link that brought the person, and
// whether a volunteer signed them up on a shared device. Run through the
// real Worker against a local D1 database.
describe('partner credit and shared devices', () => {
  let platform: Platform;
  let keys: AccessKeys;
  const realFetch = globalThis.fetch;

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
    const outbound = fakeOutbound(realFetch);
    outbound.accessKeys = [keys.publicJwk];
    vi.stubGlobal('fetch', outbound.fetch);
  });

  const signUp = (body: object) =>
    platform.send(apiRequest('POST', '/api/signup', { body: { ...SIGN_UP, ...body } }));
  const whereFrom = async (contact = 'rosa@example.com') =>
    platform.env.DB.prepare('SELECT partner, shared_device FROM participants WHERE contact = ?1')
      .bind(contact)
      .first<{ partner: string | null; shared_device: number }>();

  // A database that hasn't had migration 0005 yet: anything naming the new
  // columns fails, as D1 would.
  const withoutMigration = (db: D1Database): D1Database =>
    new Proxy(db, {
      get(target, property) {
        if (property === 'prepare') {
          return (sql: string) => {
            if (/partner|shared_device/.test(sql)) throw new Error('no such column: partner');
            return target.prepare(sql);
          };
        }
        const value: unknown = Reflect.get(target, property);
        if (typeof value !== 'function') return value;
        return (value as (...args: unknown[]) => unknown).bind(target);
      },
    });

  it('credits a sign-up to the partner whose link brought it', async () => {
    expect((await signUp({ ref: EAST })).status).toBe(201);
    expect(await whereFrom()).toEqual({ partner: EAST, shared_device: 0 });
  });

  it('ignores capital letters in the short name', async () => {
    await signUp({ ref: 'East-Las-Vegas-Neighbors' });
    expect((await whereFrom())?.partner).toBe(EAST);
  });

  it('saves the sign-up with no credit when the short name matches no partner', async () => {
    for (const ref of ['not-a-partner', 'east las vegas', 42]) {
      const contact = `${String(ref).replace(/\W/g, '')}@example.com`;
      expect((await signUp({ ref, contact })).status).toBe(201);
      expect((await whereFrom(contact))?.partner).toBeNull();
    }
    await signUp({});
    expect((await whereFrom())?.partner).toBeNull();
  });

  it('never changes the credit once the sign-up is made', async () => {
    const cookie = await signUpAs(platform, { ref: EAST });
    const edit = await platform.send(
      apiRequest('PATCH', '/api/me', { body: { zip: '89102', ref: 'campus-riders' }, cookie }),
    );
    expect(edit.status).toBe(200);
    const again = await signUp({ ref: 'campus-riders' });
    expect((await again.json<{ status: string }>()).status).toBe('existing');
    expect((await whereFrom())?.partner).toBe(EAST);
    const counted = await platform.env.DB.prepare('SELECT count(*) AS n FROM participants').first<{
      n: number;
    }>();
    expect(counted?.n).toBe(1);
  });

  it('records a sign-up made after "Sign up someone else" as a shared device', async () => {
    await signUp({ ref: EAST, sharedDevice: true, newsletter: true });
    expect(await whereFrom()).toEqual({ partner: EAST, shared_device: 1 });
    await signUp({ contact: 'luz@example.com', sharedDevice: 'yes' });
    expect((await whereFrom('luz@example.com'))?.shared_device).toBe(0);
  });

  it('takes the sign-up without the credit on a database not yet updated', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await platform.send(
      apiRequest('POST', '/api/signup', { body: { ...SIGN_UP, ref: EAST, sharedDevice: true } }),
      { DB: withoutMigration(platform.env.DB) },
    );
    expect(response.status).toBe(201);
    expect(await whereFrom()).toEqual({ partner: null, shared_device: 0 });
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it('shows volunteers each partner’s sign-ups, including partners with none', async () => {
    await signUp({ ref: EAST });
    await signUp({ ref: EAST, contact: 'luz@example.com' });
    await signUp({ contact: 'ana@example.com' });
    const page = await platform.send(adminGet('/admin', await accessToken(keys)), ACCESS_ENV);
    expect(page.status).toBe(200);
    const html = (await page.text()).replace(/\s+/g, ' ');
    expect(html).toMatch(/East Las Vegas Neighbors<\/td> ?<td>2</);
    expect(html).toMatch(/Campus Riders<\/td> ?<td>0</);
  });

  it('still shows the admin page on a database not yet updated', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const page = await platform.send(adminGet('/admin', await accessToken(keys)), {
      ...ACCESS_ENV,
      DB: withoutMigration(platform.env.DB),
    });
    expect(page.status).toBe(200);
    expect(await page.text()).toMatch(/Sign-ups by partner aren’t ready yet/);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
