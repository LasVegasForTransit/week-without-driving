import { describe, expect, it } from 'vitest';

import * as browser from '../public/modules/map-links.js';
import { buildMapLinks, type MapLinks } from '../src/lib/map-links';

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

  it('builds directions to a typed place, from the phone or from a typed start', () => {
    const here = browser.buildDirectionLinks('Meadows Mall, NV', 'Meadows Mall');
    expect(here.google).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=Meadows%20Mall,%20NV&travelmode=transit',
    );
    expect(here.apple).toBe('https://maps.apple.com/?daddr=Meadows%20Mall,%20NV&dirflg=r');
    expect(here.transit).toBe('');
    const fromThere = browser.buildDirectionLinks('36.06431,-115.11359', 'Sunset Park', {
      from: 'Charleston & Decatur, NV',
      point: '36.06431,-115.11359',
    });
    expect(new URL(fromThere.google).searchParams.get('origin')).toBe('Charleston & Decatur, NV');
    expect(new URL(fromThere.apple).searchParams.get('saddr')).toBe('Charleston & Decatur, NV');
    // The Transit app always starts from the phone, so a typed start leaves it out.
    expect(fromThere.transit).toBe('');
  });
});
