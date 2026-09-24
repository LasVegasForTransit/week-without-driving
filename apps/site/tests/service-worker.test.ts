import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Build } from '../src/integrations/service-worker';
import { BUILD, ORIGIN, load, navigate, page } from './support/service-worker';

afterEach(() => {
  vi.useRealTimers();
});

describe('routeFor', () => {
  const { context } = load(null);
  const routeFor = context.routeFor as (
    request: { url: string; method: string; mode: string },
    origin: string,
    files: Record<string, string>,
  ) => string;
  const route = (path: string, init: { mode?: string; method?: string; origin?: string } = {}) =>
    routeFor(
      {
        url: (init.origin ?? ORIGIN) + path,
        method: init.method ?? 'GET',
        mode: init.mode ?? 'cors',
      },
      ORIGIN,
      BUILD.files,
    );

  it('never handles the API, the admin views, other sites or anything but GET', () => {
    expect(route('/api/me')).toBe('network');
    expect(route('/api/admin/entries')).toBe('network');
    expect(route('/admin', navigate)).toBe('network');
    expect(route('/admin/entries', navigate)).toBe('network');
    expect(route('/sw.js')).toBe('network');
    expect(route('/guides', { ...navigate, method: 'POST' })).toBe('network');
    expect(route('/', { ...navigate, origin: 'https://example.com' })).toBe('network');
  });

  it('keeps My week, Get my link and Sign up out of every cache', () => {
    expect(route('/my-week', navigate)).toBe('private-page');
    expect(route('/my-week?t=secret', navigate)).toBe('private-page');
    expect(route('/my-week/link', navigate)).toBe('private-page');
    expect(route('/sign-up/', navigate)).toBe('private-page');
  });

  it('answers other pages network first, the stop data from the phone, and built files from the cache', () => {
    expect(route('/guides', navigate)).toBe('page');
    expect(route('/giveaway?ref=partner', navigate)).toBe('page');
    expect(route('/data/stops.json')).toBe('data');
    expect(route('/scripts/app.js')).toBe('static');
    expect(route('/scripts/not-built.js')).toBe('network');
  });

  it('stores a page under its path without a trailing slash', () => {
    const pageKey = context.pageKey as (path: string) => string;
    expect(pageKey('/guides/')).toBe('/guides');
    expect(pageKey('/')).toBe('/');
  });
});

describe('the service worker without a build', () => {
  it('does nothing, so the dev server never serves stale files', () => {
    const { request } = load(null);
    expect(request('/guides', navigate).handled).toBe(false);
  });
});

describe('installing', () => {
  it('saves every precache entry under its revision and the stop data, then takes over', async () => {
    const { caches, extendable, self } = load(BUILD);
    await extendable('install');
    expect(caches.everything().sort()).toEqual([
      'wwd-data-v1: /data/routes.json',
      'wwd-data-v1: /data/stops.json',
      'wwd-precache-v1: /_astro/site.css?__rev=css1',
      'wwd-precache-v1: /fonts/body.woff2?__rev=fon1',
      'wwd-precache-v1: /guides?__rev=gui1',
      'wwd-precache-v1: /offline?__rev=off1',
    ]);
    expect(self.skipWaiting).toHaveBeenCalledOnce();
  });

  it('downloads only what changed, and waits for Refresh when a version is already running', async () => {
    const first = load(BUILD);
    await first.extendable('install');

    const changed: Build = {
      ...BUILD,
      precache: BUILD.precache.map((entry) =>
        entry.url === '/guides' ? { ...entry, revision: 'gui2' } : entry,
      ),
    };
    const next = load(changed, { caches: first.caches, running: true });
    await next.extendable('install');
    expect(next.net.state.calls).toEqual(['/guides']);
    expect(next.self.skipWaiting).not.toHaveBeenCalled();
  });

  it('saves only the offline page and its own files when the phone asks to save data', async () => {
    const { caches, extendable } = load(BUILD, { saveData: true });
    await extendable('install');
    expect(caches.everything().sort()).toEqual([
      'wwd-precache-v1: /_astro/site.css?__rev=css1',
      'wwd-precache-v1: /offline?__rev=off1',
    ]);
  });

  it('fails when a download fails, so the browser tries again on the next visit', async () => {
    const { extendable } = load(BUILD, {
      routes: { '/guides': () => new Response('Server error', { status: 500 }) },
    });
    await expect(extendable('install')).rejects.toThrow(/Couldn’t save \/guides/);
  });
});

describe('activating', () => {
  it('deletes old wwd- caches and entries the build no longer has, and leaves other caches', async () => {
    const { caches, extendable, self } = load(BUILD);
    await extendable('install');
    await (await caches.open('wwd-precache-v1')).put('/guides?__rev=old', page('old'));
    await (await caches.open('wwd-static-v1')).put('/scripts/app.js?__rev=old', new Response(''));
    await (await caches.open('wwd-static-v1')).put('/scripts/gone.js?__rev=x', new Response(''));
    await (await caches.open('wwd-static-v1')).put('/scripts/app.js?__rev=app1', new Response(''));
    await caches.open('wwd-precache');
    await caches.open('someone-else');

    await extendable('activate');

    const kept = caches.everything();
    expect(kept).not.toContain('wwd-precache-v1: /guides?__rev=old');
    expect(kept).not.toContain('wwd-static-v1: /scripts/app.js?__rev=old');
    expect(kept).not.toContain('wwd-static-v1: /scripts/gone.js?__rev=x');
    expect(kept).toContain('wwd-static-v1: /scripts/app.js?__rev=app1');
    expect(await caches.keys()).not.toContain('wwd-precache');
    expect(await caches.keys()).toContain('someone-else');
    expect(self.clients.claim).toHaveBeenCalledOnce();
  });

  it('switches to a waiting version when the page says Refresh was tapped', async () => {
    const { extendable, self } = load(BUILD, { running: true });
    await extendable('message', { data: { type: 'SKIP_WAITING' } });
    expect(self.skipWaiting).toHaveBeenCalledOnce();
  });
});

describe('answering pages', () => {
  it('shows the network copy and stores it without the query string', async () => {
    const { caches, request } = load(BUILD, {
      routes: { '/giveaway': () => page('<h1>Win prizes</h1>') },
    });
    const response = await request('/giveaway?ref=partner', navigate).settled();
    expect(await response?.text()).toBe('<h1>Win prizes</h1>');
    expect(caches.everything()).toEqual(['wwd-pages-v1: /giveaway']);
  });

  it('shows the saved copy offline, and the offline page for a page never saved', async () => {
    const { extendable, net, request } = load(BUILD);
    await extendable('install');
    net.state.offline = true;

    const guides = await request('/guides/', navigate).settled();
    expect(await guides?.text()).toBe('<h1>Rider guides</h1>');

    const partners = await request('/partners', navigate).settled();
    expect(await partners?.text()).toBe('<h1>You’re offline</h1>');
  });

  it('never stores My week, even when a link signs a phone in', async () => {
    const { caches, extendable, net, request } = load(BUILD, {
      routes: { '/my-week': () => page('<h1>Hi, Ana</h1>') },
    });
    await extendable('install');
    const online = await request('/my-week?t=secret-token', navigate).settled();
    expect(await online?.text()).toBe('<h1>Hi, Ana</h1>');
    expect(caches.everything().join('\n')).not.toMatch(/my-week|secret-token/);

    net.state.offline = true;
    const offline = await request('/my-week', navigate).settled();
    expect(await offline?.text()).toBe('<h1>You’re offline</h1>');
  });

  it('shows the saved copy when the network takes more than 4 seconds', async () => {
    let hang = false;
    const { extendable, request } = load(BUILD, {
      routes: {
        '/guides': () =>
          hang ? new Promise<Response>(() => undefined) : page('<h1>Rider guides</h1>'),
      },
    });
    await extendable('install');
    hang = true;
    vi.useFakeTimers();

    let answered = false;
    const pending = request('/guides', navigate).response?.then((response) => {
      answered = true;
      return response;
    });
    await vi.advanceTimersByTimeAsync(3900);
    expect(answered).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(await (await pending)?.text()).toBe('<h1>Rider guides</h1>');
  });

  it('lets the API and the admin views go straight to the network', () => {
    const { request } = load(BUILD);
    expect(request('/api/me').handled).toBe(false);
    expect(request('/admin', navigate).handled).toBe(false);
  });
});

describe('answering files', () => {
  it('serves a built file from the phone after the first fetch', async () => {
    const { net, request } = load(BUILD, {
      routes: { '/scripts/app.js': () => new Response('app') },
    });
    expect(await (await request('/scripts/app.js').settled())?.text()).toBe('app');
    net.state.offline = true;
    expect(await (await request('/scripts/app.js').settled())?.text()).toBe('app');
  });

  it('does not store a response that forbids it', async () => {
    const { caches, request } = load(BUILD, {
      routes: {
        '/photos/bus.webp': () => new Response('x', { headers: { 'Cache-Control': 'no-store' } }),
      },
    });
    await request('/photos/bus.webp').settled();
    expect(caches.everything()).toEqual([]);
  });

  it('serves the saved stop data at once and refreshes it for next time', async () => {
    let version = 1;
    const { request } = load(BUILD, {
      routes: { '/data/stops.json': () => new Response(`{"v":${version}}`) },
    });
    expect(await (await request('/data/stops.json').settled())?.text()).toBe('{"v":1}');
    version = 2;
    expect(await (await request('/data/stops.json').settled())?.text()).toBe('{"v":1}');
    expect(await (await request('/data/stops.json').settled())?.text()).toBe('{"v":2}');
  });
});
