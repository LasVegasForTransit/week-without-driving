import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

import { buildMapLinks, type MapLinks } from '../src/lib/map-links';

/** The browser copy in public/scripts/map-links.js, run the way a page runs it. */
function browserBuilder(): typeof buildMapLinks {
  const source = readFileSync(new URL('../public/scripts/map-links.js', import.meta.url), 'utf8');
  const window: { LVWWD_MAP_LINKS?: { buildMapLinks: typeof buildMapLinks } } = {};
  runInNewContext(source, { window });
  if (!window.LVWWD_MAP_LINKS) throw new Error('map-links.js did not define LVWWD_MAP_LINKS');
  return window.LVWWD_MAP_LINKS.buildMapLinks;
}

describe('the map-link builder', () => {
  it('builds the three map links and their names for a place', () => {
    expect(buildMapLinks(36.06431, -115.11359, 'Sunset Park')).toEqual({
      google:
        'https://www.google.com/maps/dir/?api=1&destination=36.06431,-115.11359&travelmode=transit',
      apple: 'https://maps.apple.com/?daddr=36.06431,-115.11359&dirflg=r',
      transit: 'transit://directions?to=36.06431,-115.11359',
      labels: {
        google: 'Directions to Sunset Park in Google Maps',
        apple: 'Directions to Sunset Park in Apple Maps',
        transit: 'Directions to Sunset Park in the Transit app',
      },
    } satisfies MapLinks);
  });

  it('writes coordinates with five decimal places and a period', () => {
    const links = buildMapLinks(36.090736, -115.18333, 'Allegiant Stadium');
    expect(links.transit).toBe('transit://directions?to=36.09074,-115.18333');
    expect(buildMapLinks(36.2403, -115.154, 'Craig Ranch').apple).toContain('36.24030,-115.15400');
  });

  it.each([
    [91, -115, '91'],
    [36, 200, '200'],
    [Number.NaN, -115, 'NaN'],
    ['36.1' as unknown as number, -115, '36.1'],
  ])('refuses latitude %s, longitude %s, naming the bad value', (lat, lng, named) => {
    expect(() => buildMapLinks(lat, lng, 'Nowhere')).toThrow(named);
  });

  it('gives the same links and names in the browser as at build time', () => {
    const inBrowser = browserBuilder();
    for (const [lat, lng, name] of [
      [36.06431, -115.11359, 'Sunset Park'],
      [36.090736, -115.18333, 'Allegiant Stadium'],
      [36.19399, -115.14734, 'D after Alexander (northbound)'],
    ] as const) {
      expect(inBrowser(lat, lng, name)).toEqual(buildMapLinks(lat, lng, name));
    }
    expect(() => inBrowser(91, 0, 'Nowhere')).toThrow('91');
  });
});
