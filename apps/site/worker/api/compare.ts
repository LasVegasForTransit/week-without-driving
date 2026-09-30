import type { ApiContext } from '../env';
import { clientIp, json, readJsonObject } from '../http';
import { LIMITS, overLimit } from '../rate-limit';

type Mode = 'bus' | 'walk' | 'bike' | 'scooter';
type Reason = 'address' | 'no_route' | 'unavailable';
interface RouteResult {
  minutes: number;
  meters: number;
  fare: number | null;
  busMeters: number | null;
  steps: string[];
}
type Outcome = { route: RouteResult; reason?: never } | { route?: never; reason: Reason };

const API_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const FIELD_MASK = [
  'routes.duration',
  'routes.distanceMeters',
  'routes.travelAdvisory.transitFare',
  'routes.legs.steps.distanceMeters',
  'routes.legs.steps.travelMode',
  'routes.legs.steps.navigationInstruction.instructions',
  'routes.legs.steps.transitDetails',
].join(',');
const MODES: Record<Mode, string> = {
  bus: 'TRANSIT',
  walk: 'WALK',
  bike: 'BICYCLE',
  scooter: 'WALK',
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 160) : '';
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function fare(value: unknown): number | null {
  const money = object(value);
  if (money.currencyCode !== 'USD') return null;
  const units = typeof money.units === 'string' ? Number(money.units) : number(money.units);
  const nanos = number(money.nanos) ?? 0;
  return units !== null && Number.isFinite(units) && units >= 0
    ? Math.round((units + nanos / 1_000_000_000) * 100) / 100
    : null;
}

function transitSummary(details: Record<string, unknown>): string {
  const line = object(details.transitLine);
  const name = text(line.nameShort) || text(line.name) || 'bus';
  const stops = object(details.stopDetails);
  const start = text(object(stops.departureStop).name);
  const end = text(object(stops.arrivalStop).name);
  return `Take ${name}${start ? ` from ${start}` : ''}${end ? ` to ${end}` : ''}.`;
}

function busStepMeters(step: Record<string, unknown>): number | null {
  if (step.travelMode !== 'TRANSIT') return null;
  const details = object(step.transitDetails);
  return object(object(details.transitLine).vehicle).type === 'BUS'
    ? number(step.distanceMeters)
    : null;
}

function stepSummary(step: Record<string, unknown>): string {
  return step.travelMode === 'TRANSIT'
    ? transitSummary(object(step.transitDetails))
    : text(object(step.navigationInstruction).instructions);
}

function routeSteps(route: Record<string, unknown>): {
  summaries: string[];
  busMeters: number | null;
} {
  const steps = array(object(array(route.legs)[0]).steps);
  const summaries: string[] = [];
  let busMeters = 0;
  let busSeen = false;
  for (const raw of steps) {
    const step = object(raw);
    const summary = stepSummary(step);
    if (summary && summaries.length < 4) summaries.push(summary);
    const distance = busStepMeters(step);
    if (distance !== null) {
      busSeen = true;
      busMeters += distance;
    }
  }
  return { summaries, busMeters: busSeen ? busMeters : null };
}

function hasOnlyBusTransit(route: Record<string, unknown>): boolean {
  const steps = array(object(array(route.legs)[0]).steps).map(object);
  const transit = steps.filter((step) => step.travelMode === 'TRANSIT');
  return (
    transit.length > 0 &&
    transit.every((step) => {
      const line = object(object(step.transitDetails).transitLine);
      return object(line.vehicle).type === 'BUS';
    })
  );
}

function routeFromResponse(value: unknown, mode: 'drive' | Mode): RouteResult | null {
  const route = object(array(object(value).routes)[0]);
  if (mode === 'bus' && !hasOnlyBusTransit(route)) return null;
  const meters = number(route.distanceMeters);
  const match = /^(\d+(?:\.\d+)?)s$/.exec(text(route.duration));
  if (meters === null || !match) return null;
  const { summaries, busMeters } = routeSteps(route);
  return {
    minutes: Math.max(1, Math.ceil(Number(match[1]) / 60)),
    meters,
    fare: mode === 'bus' ? fare(object(route.travelAdvisory).transitFare) : null,
    busMeters: mode === 'bus' ? busMeters : null,
    steps: summaries,
  };
}

interface RouteQuery {
  key: string;
  origin: string;
  destination: string;
  departureTime: string;
  mode: 'drive' | Mode;
}

async function fetchRoute(c: ApiContext, query: RouteQuery): Promise<Outcome> {
  if (await overLimit(c.env.DB, LIMITS.routesPerDay, 'all', c.now)) {
    return { reason: 'unavailable' };
  }
  const { key, origin, destination, departureTime, mode } = query;
  const travelMode = mode === 'drive' ? 'DRIVE' : MODES[mode];
  const body = {
    origin: { address: origin },
    destination: { address: destination },
    travelMode,
    ...(mode === 'drive' || mode === 'bus' ? { departureTime } : {}),
    ...(mode === 'drive' ? { routingPreference: 'TRAFFIC_AWARE' } : {}),
    languageCode: 'en-US',
    regionCode: 'us',
    units: 'IMPERIAL',
    ...(mode === 'bus' ? { transitPreferences: { allowedTravelModes: ['BUS'] } } : {}),
  };
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(9000),
    });
    if (response.status === 400) {
      const detail: unknown = await response.json().catch(() => null);
      const message = text(object(object(detail).error).message);
      return {
        reason: /geocod|address could not|could not resolve|location not found/i.test(message)
          ? 'address'
          : 'unavailable',
      };
    }
    if (!response.ok) return { reason: 'unavailable' };
    const value: unknown = await response.json();
    const route = routeFromResponse(value, mode);
    return route ? { route } : { reason: mode === 'bus' ? 'no_route' : 'unavailable' };
  } catch {
    return { reason: 'unavailable' };
  }
}

export async function compareTrip(c: ApiContext): Promise<Response> {
  const data = await readJsonObject(c.request);
  const origin = text(data?.origin);
  const destination = text(data?.destination);
  const mode = text(data?.mode) as Mode;
  const departureTime = text(data?.departureTime);
  const depart = Date.parse(departureTime);
  if (
    origin.length < 3 ||
    destination.length < 3 ||
    !Object.hasOwn(MODES, mode) ||
    !Number.isFinite(depart) ||
    depart < c.now.getTime() - 7 * 86_400_000 ||
    depart > c.now.getTime() + 100 * 86_400_000
  ) {
    return json({ reason: 'address' }, 400);
  }
  if (await overLimit(c.env.DB, LIMITS.comparePerIp, clientIp(c.request), c.now)) {
    return json({ reason: 'unavailable' }, 429);
  }
  const key = c.env.GOOGLE_ROUTES_API_KEY;
  if (!key)
    return json({ drive: { reason: 'unavailable' }, alternative: { reason: 'unavailable' } });
  const [drive, alternative] = await Promise.all([
    fetchRoute(c, { key, origin, destination, departureTime, mode: 'drive' }),
    fetchRoute(c, { key, origin, destination, departureTime, mode }),
  ]);
  return json({ drive, alternative });
}
