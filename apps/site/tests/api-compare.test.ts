import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { type Platform, apiRequest, startPlatform } from './support/platform';
import { LIMITS, windowStart } from '../worker/rate-limit';
import { sha256 } from '../worker/tokens';

const INPUT = () => ({
  origin: '400 S Martin L King Blvd, Las Vegas, NV',
  destination: 'Sunset Park, Las Vegas, NV',
  departureTime: new Date(Date.now() + 86_400_000).toISOString(),
  mode: 'bus',
});

const drive = {
  routes: [
    {
      distanceMeters: 16093.44,
      duration: '1200s',
      legs: [{ steps: [{ navigationInstruction: { instructions: 'Head south' } }] }],
    },
  ],
};
const bus = {
  routes: [
    {
      distanceMeters: 18000,
      duration: '2400s',
      travelAdvisory: { transitFare: { currencyCode: 'USD', units: '2', nanos: 500000000 } },
      legs: [
        {
          steps: [
            {
              travelMode: 'TRANSIT',
              distanceMeters: 12000,
              transitDetails: {
                transitLine: { nameShort: '109', vehicle: { type: 'BUS' } },
                stopDetails: {
                  departureStop: { name: 'Bonneville' },
                  arrivalStop: { name: 'Sunset' },
                },
              },
            },
          ],
        },
      ],
    },
  ],
};

function travelMode(init: RequestInit): string {
  const body = typeof init.body === 'string' ? init.body : '{}';
  const parsed = JSON.parse(body) as { travelMode?: string };
  return parsed.travelMode ?? '';
}

describe('public route comparison', () => {
  let platform: Platform;
  beforeAll(async () => {
    platform = await startPlatform();
  }, 60_000);
  afterAll(async () => {
    vi.unstubAllGlobals();
    await platform.dispose();
  });
  beforeEach(async () => {
    await platform.reset();
    vi.unstubAllGlobals();
  });

  const send = (body: object, key = 'test-key') =>
    platform.send(apiRequest('POST', '/api/compare', { body }), { GOOGLE_ROUTES_API_KEY: key });

  it('returns only safe route details and calculates bus distance without exposing the key', async () => {
    const fetcher = vi.fn((_url: string, init: RequestInit) => {
      expect(init.headers).toMatchObject({ 'X-Goog-Api-Key': 'test-key' });
      return Promise.resolve(Response.json(travelMode(init) === 'TRANSIT' ? bus : drive));
    });
    vi.stubGlobal('fetch', fetcher);
    const response = await send(INPUT());
    expect(response.status).toBe(200);
    const data = await response.json<{
      drive: { route: object };
      alternative: { route: object };
    }>();
    expect(data.drive.route).toMatchObject({ minutes: 20, meters: 16093.44 });
    expect(data.alternative.route).toMatchObject({
      minutes: 40,
      fare: 2.5,
      busMeters: 12000,
      steps: ['Take 109 from Bonneville to Sunset.'],
    });
    expect(JSON.stringify(data)).not.toContain('test-key');
    expect(JSON.stringify(data)).not.toContain(INPUT().origin);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps a driving result if no bus trip is found', async () => {
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) =>
      Promise.resolve(Response.json(travelMode(init) === 'TRANSIT' ? { routes: [] } : drive)),
    );
    const data = await (
      await send(INPUT())
    ).json<{ drive: { route: object }; alternative: { reason: string } }>();
    expect(data.drive.route).toBeTruthy();
    expect(data.alternative.reason).toBe('no_route');
  });

  it('does not label a rail route as a bus route', async () => {
    const rail = structuredClone(bus);
    const step = rail.routes.at(0)?.legs.at(0)?.steps.at(0);
    if (!step) throw new Error('The rail fixture has no transit step');
    step.transitDetails.transitLine.vehicle.type = 'SUBWAY';
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) =>
      Promise.resolve(Response.json(travelMode(init) === 'TRANSIT' ? rail : drive)),
    );
    const data = await (await send(INPUT())).json<{ alternative: { reason: string } }>();
    expect(data.alternative.reason).toBe('no_route');
  });

  it('returns friendly reason codes when the key is absent or addresses fail', async () => {
    const missing = await send(INPUT(), '');
    expect(await missing.json()).toMatchObject({
      drive: { reason: 'unavailable' },
      alternative: { reason: 'unavailable' },
    });
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        Response.json({ error: { message: 'PRIVATE PROVIDER DETAIL' } }, { status: 400 }),
      ),
    );
    const response = await send(INPUT());
    const text = await response.text();
    expect(text).not.toContain('PRIVATE PROVIDER DETAIL');
    expect(text).toContain('unavailable');
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        Response.json({ error: { message: 'Could not geocode origin address' } }, { status: 400 }),
      ),
    );
    const unresolved = await send(INPUT());
    expect(await unresolved.text()).toContain('address');
  });

  it('limits each IP to 30 comparisons in an hour', async () => {
    for (let i = 0; i < 30; i++) expect((await send(INPUT(), '')).status).toBe(200);
    expect((await send(INPUT(), '')).status).toBe(429);
  });

  it('stops outbound calls at 1,000 per day, including the second half of a comparison', async () => {
    const key = await sha256('google-routes-day:all');
    await platform.env.DB.prepare(
      'INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 999)',
    )
      .bind(key, windowStart(LIMITS.routesPerDay, new Date()))
      .run();
    const fetcher = vi.fn(() => Promise.resolve(Response.json(drive)));
    vi.stubGlobal('fetch', fetcher);
    const data = await (
      await send(INPUT())
    ).json<{
      drive: { route?: object; reason?: string };
      alternative: { route?: object; reason?: string };
    }>();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect([data.drive.reason, data.alternative.reason]).toContain('unavailable');
  });
});
