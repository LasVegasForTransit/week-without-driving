import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { getPlatformProxy } from 'wrangler';

import type { Env } from '../../worker/env';
import worker from '../../worker/index';

/**
 * A local D1 database and R2 bucket from wrangler's getPlatformProxy, with
 * the real migrations applied, and a way to send requests through the real
 * Worker. Outgoing calls (Turnstile, Resend) are faked by `fakeOutbound`.
 */

const TABLES = [
  'draws',
  'volunteers',
  'checkins',
  'reminders',
  'bingo',
  'link_tokens',
  'sessions',
  'participants',
  'rate_limits',
];

export const ORIGIN = 'https://lvwwd.test';

function migrations(): string[] {
  const directory = fileURLToPath(new URL('../../migrations/', import.meta.url));
  return readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .flatMap((name) =>
      readFileSync(`${directory}${name}`, 'utf8')
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .split(';')
        .map((statement) => statement.trim())
        .filter(Boolean),
    );
}

const assets = {
  fetch: () =>
    Promise.resolve(
      new Response('<!doctype html><title>page</title>', {
        headers: { 'Content-Type': 'text/html' },
      }),
    ),
} as unknown as Fetcher;

/** Test-only changes to the Worker's environment; undefined removes a binding. */
export type Overrides = { [K in keyof Env]?: Env[K] | undefined };

export interface Platform {
  env: Env & { DB: D1Database; PHOTOS: R2Bucket };
  /** Sends a request through the Worker and waits for its background work. */
  send(request: Request, overrides?: Overrides): Promise<Response>;
  /** Empties every table between tests. */
  reset(): Promise<void>;
  dispose(): Promise<void>;
}

export async function startPlatform(): Promise<Platform> {
  const proxy = await getPlatformProxy<{ DB: D1Database; PHOTOS: R2Bucket }>({
    configPath: fileURLToPath(new URL('./wrangler.jsonc', import.meta.url)),
    persist: false,
  });
  for (const statement of migrations()) await proxy.env.DB.prepare(statement).run();

  const env = {
    ASSETS: assets,
    DB: proxy.env.DB,
    PHOTOS: proxy.env.PHOTOS,
    TURNSTILE_SECRET: 'test-secret',
    TURNSTILE_SITE_KEY: 'test-site-key',
  };

  return {
    env,
    async send(request, overrides = {}) {
      const background: Promise<unknown>[] = [];
      const ctx = {
        waitUntil: (promise: Promise<unknown>) => background.push(promise),
        passThroughOnException: () => undefined,
        props: {},
      } as unknown as ExecutionContext;
      const incoming = request as Parameters<typeof worker.fetch>[0];
      const response = await worker.fetch(incoming, { ...env, ...overrides } as Env, ctx);
      await Promise.all(background);
      return response;
    },
    async reset() {
      await proxy.env.DB.batch(TABLES.map((table) => proxy.env.DB.prepare(`DELETE FROM ${table}`)));
    },
    dispose: () => proxy.dispose(),
  };
}

export interface Outbound {
  fetch: typeof fetch;
  /** Emails handed to Resend, newest last. */
  emails: { to: string[]; text: string }[];
  /** Whether Turnstile says yes. */
  turnstilePasses: boolean;
  /** The public keys a Cloudflare Access team publishes, for the admin tests. */
  accessKeys: JsonWebKey[];
  /** How many times the Worker fetched the Access keys. */
  accessKeyFetches: number;
}

/**
 * Stands in for Turnstile, Resend and Cloudflare Access's key list. Anything
 * else goes to the real fetch, which the platform proxy uses to reach its
 * local runtime.
 */
export function fakeOutbound(realFetch: typeof fetch): Outbound {
  const outbound: Outbound = {
    emails: [],
    turnstilePasses: true,
    accessKeys: [],
    accessKeyFetches: 0,
    fetch: async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith('.cloudflareaccess.com/cdn-cgi/access/certs')) {
        outbound.accessKeyFetches += 1;
        return Response.json({ keys: outbound.accessKeys });
      }
      if (url.startsWith('https://challenges.cloudflare.com/')) {
        return Response.json({ success: outbound.turnstilePasses });
      }
      if (url === 'https://api.resend.com/emails') {
        const body = typeof init?.body === 'string' ? init.body : '{}';
        outbound.emails.push(JSON.parse(body) as { to: string[]; text: string });
        return Response.json({ id: 'email-id' });
      }
      return realFetch(input, init);
    },
  };
  return outbound;
}

/** Builds a request the way our own pages send it. */
export function apiRequest(
  method: string,
  path: string,
  options: { body?: unknown; cookie?: string; ip?: string; origin?: string } = {},
): Request {
  const headers = new Headers({
    Origin: options.origin ?? ORIGIN,
    'CF-Connecting-IP': options.ip ?? '203.0.113.7',
  });
  if (options.cookie) headers.set('Cookie', options.cookie);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
}

/** The name=value part of each Set-Cookie header, ready to send back. */
export function cookiesFrom(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0] ?? '')
    .filter((pair) => !pair.endsWith('='))
    .join('; ');
}

export const SIGN_UP = {
  firstName: 'Rosa',
  contact: 'Rosa@Example.com',
  zip: '89101',
  instagram: '@Rosa.Rides',
  age: 'adult',
  newsletter: false,
  turnstileToken: 'token-from-the-widget',
};

/** What the sign-up form sends besides the fields: where it came from. */
export interface WhereFrom {
  ref?: string;
  sharedDevice?: boolean;
}

/** Signs someone up and returns the cookies that sign their phone in. */
export async function signUpAs(
  platform: Platform,
  changes: Partial<typeof SIGN_UP> & WhereFrom = {},
): Promise<string> {
  const response = await platform.send(
    apiRequest('POST', '/api/signup', { body: { ...SIGN_UP, ...changes } }),
  );
  if (response.status !== 201) throw new Error(`Sign-up failed with ${response.status}`);
  return cookiesFrom(response);
}
