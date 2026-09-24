import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { destinations, finderPlaces } from '../src/lib/destinations';
import { parseInlineLinks } from '../src/lib/inline-links';
import { buildMapLinks } from '../src/lib/map-links';

/** The rules every "Places to go" destination follows, and the stop data behind the Go page. */

interface StopsFile {
  feedVersion: string;
  stops: { id: string; name: string; lat: number; lng: number; routes: string[] }[];
}
interface RoutesFile {
  feedVersion: string;
  routes: { shortName: string; longName: string; color: string }[];
}

const data = (file: string) =>
  JSON.parse(readFileSync(new URL(`../public/data/${file}`, import.meta.url), 'utf8')) as unknown;
const stops = data('stops.json') as StopsFile;
const routes = data('routes.json') as RoutesFile;
const routeNames = new Set(routes.routes.map((route) => route.shortName));

function miles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const a =
    Math.sin(radians(lat2 - lat1) / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lng2 - lng1) / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(a));
}

/** Route names a step mentions: "Route 215", "routes 105, 106 and 401", the RED LINE, the Deuce. */
function routesIn(step: string): string[] {
  const found = [...step.matchAll(/\bRoute (\d+)/g)].map((match) => match[1] ?? '');
  for (const [list] of step.matchAll(/\broutes (?:\d+(?:, | and ))*\d+/g)) {
    found.push(...(list.match(/\d+/g) ?? []));
  }
  for (const named of ['RED LINE', 'BHX', 'CX', 'DVX', 'SX']) {
    if (new RegExp(`\\b${named}\\b`).test(step)) found.push(named);
  }
  if (/\bDeuce\b/.test(step)) found.push('DEUCE');
  return found;
}

describe('Places to go', () => {
  it('gives every destination its own anchor and three steps', () => {
    const anchors = destinations.map((destination) => destination.anchor);
    expect(new Set(anchors).size).toBe(anchors.length);
    for (const destination of destinations) {
      expect(destination.anchor).toMatch(/^[a-z0-9-]+$/);
      expect(destination.steps).toHaveLength(3);
      expect(destination.buttonRows.length).toBeGreaterThan(0);
    }
  });

  it('points every map button at a real place', () => {
    for (const { buttonRows } of destinations) {
      for (const row of buttonRows) {
        expect(() => buildMapLinks(row.lat, row.lng, row.placeName)).not.toThrow();
      }
    }
  });

  it('never sends anyone up stairs, and says "walk or roll"', () => {
    for (const step of destinations.flatMap((destination) => destination.steps)) {
      expect(step).not.toMatch(/\bstairs?\b/i);
      expect(step).not.toMatch(/\bwalk\b(?! or roll)/i);
    }
  });

  it('adds the wheelchair note exactly where a step crosses a bridge', () => {
    for (const destination of destinations) {
      const crossesBridge = destination.steps.some((step) => /\bbridge\b/i.test(step));
      expect(Boolean(destination.note), destination.anchor).toBe(crossesBridge);
    }
  });

  it('links only to guides that exist', () => {
    const links = destinations
      .flatMap((destination) => destination.steps)
      .flatMap((step) => parseInlineLinks(step))
      .flatMap((segment) => (segment.href ? [segment.href] : []));
    expect(links.length).toBeGreaterThan(0);
    for (const href of links) {
      const guide = /^\/guides\/([a-z0-9-]+)$/.exec(href)?.[1];
      expect(guide, href).toBeDefined();
      expect(existsSync(new URL(`../src/content/guides/${guide}.md`, import.meta.url)), href).toBe(
        true,
      );
    }
  });

  it('names only routes that are in the stop data', () => {
    const named = destinations.flatMap((destination) => destination.steps.flatMap(routesIn));
    expect(named.length).toBeGreaterThan(0);
    for (const route of named) expect(routeNames.has(route), route).toBe(true);
  });
});

describe('Find a bus', () => {
  it('lists its places in alphabetical order', () => {
    const labels = finderPlaces.map((place) => place.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });

  it('finds five stops within a mile of every place', () => {
    for (const place of finderPlaces) {
      const near = stops.stops.filter(
        (stop) => miles(place.lat, place.lng, stop.lat, stop.lng) <= 1,
      );
      expect(near.length, place.label).toBeGreaterThanOrEqual(5);
    }
  });

  it('reads stop data from one feed, with every route a stop names', () => {
    expect(stops.feedVersion).toBe(routes.feedVersion);
    expect(stops.stops.length).toBeGreaterThanOrEqual(3000);
    const unknown = stops.stops.flatMap((stop) =>
      stop.routes
        .filter((route) => !routeNames.has(route))
        .map((route) => `${stop.name}: ${route}`),
    );
    expect(unknown).toEqual([]);
  });
});
