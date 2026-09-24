import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import { vi } from 'vitest';

import { type Build, injectBuild } from '../../src/integrations/service-worker';

/**
 * Runs the real public/sw.js in a sandbox with an in-memory Cache API and a
 * fake network, then sends it the events a browser would.
 */

export const ORIGIN = 'https://lvwwd.test';
export const SOURCE = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');

export type Handler = (event: unknown) => void;

/** An open browser window, as the service worker sees it. */
export interface FakeWindow {
  url: string;
  focus: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
}

export function openWindow(url: string): FakeWindow {
  const window: FakeWindow = {
    url,
    focus: vi.fn(() => Promise.resolve(window)),
    navigate: vi.fn((to: string) => Promise.resolve({ ...window, url: to })),
  };
  return window;
}

export function pathOf(input: string | { url: string }): string {
  const url = new URL(typeof input === 'string' ? input : input.url, ORIGIN);
  return url.pathname + url.search;
}

export class MemoryCache {
  readonly entries = new Map<string, Response>();

  match(input: string | { url: string }, options?: { ignoreSearch?: boolean }) {
    const key = pathOf(input);
    const hit =
      this.entries.get(key) ??
      (options?.ignoreSearch
        ? [...this.entries].find(([stored]) => stored.split('?')[0] === key.split('?')[0])?.[1]
        : undefined);
    return Promise.resolve(hit?.clone());
  }

  put(input: string | { url: string }, response: Response) {
    this.entries.set(pathOf(input), response.clone());
    return Promise.resolve();
  }

  keys() {
    return Promise.resolve([...this.entries.keys()].map((key) => new Request(ORIGIN + key)));
  }

  delete(input: string | { url: string }) {
    return Promise.resolve(this.entries.delete(pathOf(input)));
  }
}

export class MemoryCaches {
  readonly stores = new Map<string, MemoryCache>();

  open(name: string) {
    const store = this.stores.get(name) ?? new MemoryCache();
    this.stores.set(name, store);
    return Promise.resolve(store);
  }

  keys() {
    return Promise.resolve([...this.stores.keys()]);
  }

  delete(name: string) {
    return Promise.resolve(this.stores.delete(name));
  }

  async match(input: string | { url: string }, options?: { ignoreSearch?: boolean }) {
    for (const store of this.stores.values()) {
      const hit = await store.match(input, options);
      if (hit) return hit;
    }
    return undefined;
  }

  /** Every stored key in every cache, as "cache name: path". */
  everything(): string[] {
    return [...this.stores].flatMap(([name, store]) =>
      [...store.entries.keys()].map((key) => `${name}: ${key}`),
    );
  }
}

export const page = (body: string, headers: Record<string, string> = {}) =>
  new Response(body, { headers: { 'Content-Type': 'text/html', ...headers } });

export const BUILD: Build = {
  precache: [
    { url: '/offline', revision: 'off1', bytes: 10, core: true },
    { url: '/_astro/site.css', revision: 'css1', bytes: 10, core: true },
    { url: '/guides', revision: 'gui1', bytes: 10, core: false },
    { url: '/fonts/body.woff2', revision: 'fon1', bytes: 10, core: false },
  ],
  files: {
    '/_astro/site.css': 'css1',
    '/fonts/body.woff2': 'fon1',
    '/scripts/app.js': 'app1',
    '/photos/bus.webp': 'pho1',
  },
};

/** What the fake network answers: a response per path, or offline for everything. */
export function network(routes: Record<string, () => Response | Promise<Response>>) {
  const state = { offline: false, calls: [] as string[] };
  const fetch = vi.fn(async (input: string | { url: string }) => {
    const path = pathOf(input);
    state.calls.push(path);
    if (state.offline) throw new TypeError('Failed to fetch');
    const route = routes[path] ?? routes[path.split('?')[0] ?? path];
    return route ? route() : new Response('Not found', { status: 404 });
  });
  return { state, fetch };
}

export const SITE: Record<string, () => Response | Promise<Response>> = {
  '/offline': () => page('<h1>You’re offline</h1>'),
  '/_astro/site.css': () => new Response('body{}'),
  '/guides': () => page('<h1>Rider guides</h1>'),
  '/fonts/body.woff2': () => new Response('font'),
  '/data/stops.json': () => new Response('{"stops":[]}'),
  '/data/routes.json': () => new Response('{"routes":[]}'),
};

export function load(
  build: Build | null,
  options: {
    routes?: Record<string, () => Response | Promise<Response>>;
    saveData?: boolean;
    /** The phone's caches, to install a new version over an earlier one. */
    caches?: MemoryCaches;
    /** True when an earlier version is already running. */
    running?: boolean;
    /** lvwwd.org windows already open, for notification taps. */
    windows?: FakeWindow[];
  } = {},
) {
  const listeners: Record<string, Handler> = {};
  const caches = options.caches ?? new MemoryCaches();
  const net = network({ ...SITE, ...options.routes });
  const self = {
    addEventListener: (type: string, handler: Handler) => (listeners[type] = handler),
    location: { origin: ORIGIN },
    navigator: { connection: { saveData: options.saveData ?? false } },
    registration: {
      active: options.running ? {} : null,
      showNotification: vi.fn((_title: string, _options: object) => Promise.resolve()),
    },
    skipWaiting: vi.fn(() => Promise.resolve()),
    clients: {
      claim: vi.fn(() => Promise.resolve()),
      matchAll: vi.fn((_options: object) => Promise.resolve(options.windows ?? [])),
      openWindow: vi.fn((url: string) => Promise.resolve({ url })),
    },
  };
  const context = vm.createContext({
    self,
    caches,
    fetch: net.fetch,
    Response,
    Request,
    Headers,
    URL,
    setTimeout: (callback: () => void, ms: number, ...rest: unknown[]) =>
      setTimeout(callback, ms, ...rest),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  });
  vm.runInContext(build ? injectBuild(SOURCE, build) : SOURCE, context);

  /** Sends an extendable event and waits for everything it waits on. */
  const extendable = async (type: string, extra: object = {}) => {
    const waits: Promise<unknown>[] = [];
    listeners[type]?.({ ...extra, waitUntil: (promise: Promise<unknown>) => waits.push(promise) });
    await Promise.all(waits);
  };

  /**
   * Sends a fetch event. `handled` is false when the worker let the request
   * pass to the network; `settled()` waits for the response and for
   * everything the worker stores after it.
   */
  const request = (url: string, init: { mode?: string; method?: string } = {}) => {
    let responded: Promise<Response> | undefined;
    const waits: Promise<unknown>[] = [];
    listeners.fetch?.({
      request: {
        url: new URL(url, ORIGIN).href,
        method: init.method ?? 'GET',
        mode: init.mode ?? 'cors',
      },
      respondWith: (promise: Promise<Response>) => (responded = promise),
      waitUntil: (promise: Promise<unknown>) => waits.push(promise),
    });
    const settled = async () => {
      const response = await responded;
      for (let seen = -1; seen !== waits.length;) {
        seen = waits.length;
        await Promise.all(waits);
      }
      return response;
    };
    return { handled: responded !== undefined, response: responded, settled };
  };

  return { context, caches, net, self, extendable, request };
}

export const navigate = { mode: 'navigate' } as const;
