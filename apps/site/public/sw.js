/**
 * lvwwd.org's service worker. After one visit it keeps the rider guides,
 * Find a bus with its stop data, Bingo, the Giveaway page and an offline
 * page on the phone, so they open at a bus stop with no signal.
 *
 * What it never keeps: anything under /api/ or /admin, and My week, Get my
 * link and Sign up, which show a person's own details or need a connection
 * anyway. Offline, those three show the offline page instead.
 *
 * The build (src/integrations/service-worker.ts) writes BUILD below: the
 * precache list, with a revision (a fingerprint of the file's content) for
 * each file, and every static file the build made. A deploy that changes a
 * file changes this script, the browser installs the new version in the
 * background, and only files whose revision changed are downloaded again.
 * When the phone asks sites to save data (Save-Data), the background save
 * is only the offline page and what it needs; everything else is saved as
 * the visitor opens it.
 *
 * public/scripts/app.js registers this file and shows the update bar.
 */

/**
 * @typedef {{ url: string, revision: string, bytes: number, core: boolean }} PrecacheEntry
 * @typedef {{ precache: PrecacheEntry[], files: Record<string, string> }} Build
 */

/** @type {Build | null} */
const BUILD = /* __WWD_BUILD__ */ null;

// Bump a name's version only when what is stored under it changes shape;
// activate deletes every other cache whose name starts with "wwd-".
const CACHES = {
  precache: 'wwd-precache-v1',
  pages: 'wwd-pages-v1',
  static: 'wwd-static-v1',
  data: 'wwd-data-v1',
};

// Find a bus reads these; they change when RTC's schedule does.
const DATA_FILES = ['/data/stops.json', '/data/routes.json'];

// Never answered or stored here: the API, the volunteer admin views, this
// script itself, and Cloudflare's own paths.
const NETWORK_ONLY = [/^\/api\//, /^\/admin(?:\/|$)/, /^\/sw\.js$/, /^\/cdn-cgi\//];

// Pages that show a person's own details or need a connection to work. They
// always come from the network, are never stored, and fall back to the
// offline page.
const PRIVATE_PAGES = [/^\/my-week(?:\/|$)/, /^\/sign-up(?:\/|$)/];

// Past this, a page on a weak connection is shown from the phone instead.
const NETWORK_WAIT_MS = 4000;

/**
 * How one request is answered:
 * - "network": not handled here at all; the browser fetches it as usual.
 * - "private-page": from the network, never stored; offline page when that fails.
 * - "page": network first, stored; the saved copy when the network fails or is slow.
 * - "data": the saved copy at once, refreshed in the background.
 * - "static": the saved copy if there is one, otherwise fetched and stored.
 *
 * @param {{ url: string, method: string, mode: string }} request
 * @param {string} origin The site's own origin.
 * @param {Record<string, string>} files The build's static files and their revisions.
 * @returns {'network' | 'private-page' | 'page' | 'data' | 'static'}
 */
function routeFor(request, origin, files) {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== origin) return 'network';
  const path = url.pathname;
  if (NETWORK_ONLY.some((rule) => rule.test(path))) return 'network';
  if (request.mode === 'navigate') {
    return PRIVATE_PAGES.some((rule) => rule.test(path)) ? 'private-page' : 'page';
  }
  if (DATA_FILES.includes(path)) return 'data';
  if (Object.hasOwn(files, path)) return 'static';
  return 'network';
}

/** The key a page is stored under: its path without a trailing slash or query. */
function pageKey(pathname) {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/** The precache key for a file: its address with its revision added. */
function revisionKey(url, revision) {
  return `${url}?__rev=${revision}`;
}

/** The path and query of a cached request, as stored. */
function keyOf(request) {
  const url = new URL(request.url);
  return url.pathname + url.search;
}

/**
 * The precache entries to download: all of them, or only the offline page
 * and what it needs when the phone asks sites to save data.
 *
 * @param {PrecacheEntry[]} precache
 * @param {boolean} saveData
 */
function entriesToSave(precache, saveData) {
  return saveData ? precache.filter((entry) => entry.core) : precache;
}

/**
 * Caches to delete on activate: every "wwd-" cache that is not current.
 * Caches with other names are left alone.
 *
 * @param {string[]} names
 */
function staleCaches(names) {
  const current = new Set(Object.values(CACHES));
  return names.filter((name) => name.startsWith('wwd-') && !current.has(name));
}

/**
 * Stored keys the current build no longer uses: precache entries not in
 * its list, and static files it did not make (or made with other content).
 *
 * @param {string[]} keys Path and query of each stored request.
 * @param {Set<string>} wanted Keys the current build uses.
 */
function staleKeys(keys, wanted) {
  return keys.filter((key) => !wanted.has(key));
}

/** @param {Build} build */
function precacheKeys(build) {
  return new Map(
    build.precache.map((entry) => [entry.url, revisionKey(entry.url, entry.revision)]),
  );
}

/** @param {Build} build */
function staticKeys(build) {
  return new Set(Object.entries(build.files).map(([url, rev]) => revisionKey(url, rev)));
}

/**
 * True when a response may be stored: a whole 200 that allows it. Redirects
 * the page must follow, and other sites' answers, have status 0 here.
 */
function storable(response) {
  return response.status === 200 && !/no-store/i.test(response.headers.get('Cache-Control') ?? '');
}

/**
 * A redirected response can't answer a navigation, so store a plain copy.
 * (Guides are asked for as /guides; the host may redirect to /guides/.)
 */
async function plain(response) {
  if (!response.redirected) return response;
  return new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

if (BUILD) {
  const build = BUILD;
  const precached = precacheKeys(build);

  const offlinePage = async () => {
    const key = precached.get('/offline');
    const saved = key ? await (await caches.open(CACHES.precache)).match(key) : undefined;
    return (
      saved ??
      new Response('You’re offline. Check your connection and try again.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    );
  };

  const savedPage = async (key) => {
    const precacheKey = precached.get(key);
    if (precacheKey) {
      const hit = await (await caches.open(CACHES.precache)).match(precacheKey);
      if (hit) return hit;
    }
    return (await caches.open(CACHES.pages)).match(key);
  };

  const answerPage = async (event, url) => {
    const key = pageKey(url.pathname);
    const network = fetch(event.request).then((response) => {
      if (storable(response)) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHES.pages).then((cache) => cache.put(key, copy)));
      }
      return response;
    });
    let timer;
    const slow = new Promise((resolve) => {
      timer = setTimeout(resolve, NETWORK_WAIT_MS, 'slow');
    });
    const first = await Promise.race([network.catch(() => 'failed'), slow]);
    clearTimeout(timer);
    if (first instanceof Response) return first;
    const saved = await savedPage(key);
    if (saved) {
      // Keep storing the fresh copy if the slow network gets there.
      event.waitUntil(network.catch(() => undefined));
      return saved;
    }
    try {
      return await network;
    } catch {
      return offlinePage();
    }
  };

  const answerPrivatePage = async (event) => {
    try {
      return await fetch(event.request);
    } catch {
      return offlinePage();
    }
  };

  const answerData = async (event, url) => {
    const cache = await caches.open(CACHES.data);
    const saved = await cache.match(url.pathname);
    const fresh = fetch(event.request).then((response) => {
      if (storable(response)) {
        const copy = response.clone();
        event.waitUntil(cache.put(url.pathname, copy));
      }
      return response;
    });
    if (saved) {
      event.waitUntil(fresh.catch(() => undefined));
      return saved;
    }
    return fresh;
  };

  const answerStatic = async (event, url) => {
    const precacheKey = precached.get(url.pathname);
    if (precacheKey) {
      const hit = await (await caches.open(CACHES.precache)).match(precacheKey);
      if (hit) return hit;
    }
    const key = revisionKey(url.pathname, build.files[url.pathname]);
    const cache = await caches.open(CACHES.static);
    const hit = await cache.match(key);
    if (hit) return hit;
    const response = await fetch(event.request);
    if (storable(response)) {
      const copy = response.clone();
      event.waitUntil(cache.put(key, copy));
    }
    return response;
  };

  self.addEventListener('install', (event) => {
    event.waitUntil(
      (async () => {
        const saveData = self.navigator.connection?.saveData === true;
        const cache = await caches.open(CACHES.precache);
        const have = new Set((await cache.keys()).map(keyOf));
        // Any failed download fails the install, which the browser retries
        // on the next visit; files already saved are not downloaded again.
        await Promise.all(
          entriesToSave(build.precache, saveData).map(async (entry) => {
            const key = revisionKey(entry.url, entry.revision);
            if (have.has(key)) return;
            const response = await fetch(entry.url, { cache: 'no-cache' });
            if (!response.ok) throw new Error(`Couldn’t save ${entry.url}: ${response.status}`);
            await cache.put(key, await plain(response));
          }),
        );
        if (!saveData) {
          const data = await caches.open(CACHES.data);
          await Promise.all(
            DATA_FILES.map(async (url) => {
              if (await data.match(url)) return;
              const response = await fetch(url, { cache: 'no-cache' });
              if (!response.ok) throw new Error(`Couldn’t save ${url}: ${response.status}`);
              await data.put(url, response);
            }),
          );
        }
        // The first version takes over at once, so one visit is enough. A
        // later version waits until the visitor taps Refresh on the update
        // bar or closes every lvwwd.org tab.
        if (!self.registration.active) await self.skipWaiting();
      })(),
    );
  });

  self.addEventListener('activate', (event) => {
    event.waitUntil(
      (async () => {
        await Promise.all(staleCaches(await caches.keys()).map((name) => caches.delete(name)));
        const precache = await caches.open(CACHES.precache);
        const keptPrecache = new Set(precached.values());
        const precacheRequests = await precache.keys();
        const stalePrecache = new Set(staleKeys(precacheRequests.map(keyOf), keptPrecache));
        await Promise.all(
          precacheRequests
            .filter((request) => stalePrecache.has(keyOf(request)))
            .map((request) => precache.delete(request)),
        );
        const statics = await caches.open(CACHES.static);
        const keptStatic = staticKeys(build);
        const staticRequests = await statics.keys();
        const staleStatic = new Set(staleKeys(staticRequests.map(keyOf), keptStatic));
        await Promise.all(
          staticRequests
            .filter((request) => staleStatic.has(keyOf(request)))
            .map((request) => statics.delete(request)),
        );
        await self.clients.claim();
      })(),
    );
  });

  self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  });

  self.addEventListener('fetch', (event) => {
    const route = routeFor(event.request, self.location.origin, build.files);
    if (route === 'network') return;
    const url = new URL(event.request.url);
    if (route === 'page') event.respondWith(answerPage(event, url));
    else if (route === 'private-page') event.respondWith(answerPrivatePage(event));
    else if (route === 'data') event.respondWith(answerData(event, url));
    else event.respondWith(answerStatic(event, url));
  });
}
