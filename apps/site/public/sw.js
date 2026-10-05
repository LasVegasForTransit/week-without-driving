/**
 * lvwwd.org's service worker. After one visit it keeps Home, the rider
 * guides, Find a bus with its stop data, Bingo, the Giveaway page and an
 * offline page on the phone, so they open at a bus stop with no signal.
 *
 * What it never keeps: anything under /api/ or /admin, and My week, Get my
 * link and Sign up, which show a person's own details or need a connection
 * anyway. Offline, those three show the offline page instead.
 *
 * The build (src/integrations/service-worker.ts) writes BUILD below: the
 * precache list, with a revision (a fingerprint of the file's content) for
 * each file, and every static file the build made. A deploy that changes a
 * file changes this script, the browser installs the new version in the
 * background, and only files whose revision changed are downloaded again,
 * including the stop and route data used by Find a bus.
 * When the phone asks sites to save data (Save-Data), the background save
 * still keeps the small public pages and stop data, so Home, guides, the
 * bus finder, and Bingo work offline from the first visit.
 *
 * It also shows the daily reminders. Each one arrives as a push message,
 * encrypted by the Worker for this browser alone, with the day's title and
 * body. Tapping it opens My week, in a window that is already open if there
 * is one. Nothing about the reminder is stored.
 *
 * public/modules/app.js registers this file and shows the update bar.
 */

/**
 * @typedef {{ url: string, revision: string, bytes: number, core: boolean }} PrecacheEntry
 * @typedef {{ precache: PrecacheEntry[], files: Record<string, string>, data: Record<string, string> }} Build
 */

/** @type {Build | null} */
const BUILD = /* __WWD_BUILD__ */ null;

// Bump a name's version only when what is stored under it changes shape;
// activate deletes every other cache whose name starts with "wwd-".
const CACHES = {
  precache: 'wwd-precache-v1',
  // Legacy pages reference /scripts files removed by the module migration.
  // Drop those pages together with their assets; the new public bundle stays.
  pages: 'wwd-pages-v2',
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
const PRIVATE_PAGES = [/^\/my-week(?:\/|$)/, /^\/sign-up(?:\/|$)/, /^\/open(?:\/|$)/];

// Past this, a page on a weak connection is shown from the phone instead.
const NETWORK_WAIT_MS = 4000;

// Every reminder opens My week. Daily reminders replace earlier daily ones;
// each outing keeps its own notification until it is opened or dismissed.
const REMINDER = { url: '/my-week', tag: 'wwd-reminder', icon: '/icons/icon-192.png' };
const PLAN_TAG = /^wwd-plan-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

// Shown only if a reminder arrives without its words, which the Worker
// never sends; the browser needs something to show for every push.
const REMINDER_FALLBACK = {
  title: 'Week Without Driving Las Vegas',
  body: 'Leave the car at home today, then describe your trip in My week.',
};

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
 * The precache entries to download. Every public page is core because the
 * complete download fits the offline budget, even under Save Data.
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

/**
 * The title, body and optional plan tag of a reminder from its push message.
 *
 * @param {{ json(): unknown } | null | undefined} data
 * @returns {{ title: string, body: string, tag?: string }}
 */
function reminderFrom(data) {
  try {
    const message = /** @type {{ title?: unknown, body?: unknown, tag?: unknown }} */ (
      data?.json()
    );
    if (typeof message.title === 'string' && typeof message.body === 'string' && message.title) {
      const tag =
        typeof message.tag === 'string' && PLAN_TAG.test(message.tag) ? message.tag : REMINDER.tag;
      return { title: message.title, body: message.body, tag };
    }
  } catch {
    // Not JSON: fall through.
  }
  return REMINDER_FALLBACK;
}

/** Brings an open lvwwd.org window to My week, or opens a new one there. */
async function openMyWeek() {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
  if (open) {
    try {
      const focused = await open.focus();
      return await focused.navigate(REMINDER.url);
    } catch {
      // A window this worker doesn't control can't be sent elsewhere.
    }
  }
  return self.clients.openWindow(REMINDER.url);
}

self.addEventListener('push', (event) => {
  const { title, body, tag = REMINDER.tag } = reminderFrom(event.data);
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: REMINDER.icon,
      tag,
      // A new day's reminder still sounds, even while yesterday's is shown.
      renotify: true,
      data: { url: REMINDER.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(openMyWeek());
});

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
    const key = revisionKey(url.pathname, build.data[url.pathname]);
    const saved = await cache.match(key);
    const fresh = fetch(event.request).then((response) => {
      if (storable(response)) {
        const copy = response.clone();
        event.waitUntil(cache.put(key, copy));
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
        const data = await caches.open(CACHES.data);
        const haveData = new Set((await data.keys()).map(keyOf));
        await Promise.all(
          DATA_FILES.map(async (url) => {
            const revision = build.data[url];
            if (!revision) throw new Error(`The build has no revision for ${url}.`);
            const key = revisionKey(url, revision);
            if (haveData.has(key)) return;
            const response = await fetch(url, { cache: 'no-cache' });
            if (!response.ok) throw new Error(`Couldn’t save ${url}: ${response.status}`);
            await data.put(key, response);
          }),
        );
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
        const data = await caches.open(CACHES.data);
        const keptData = new Set(
          Object.entries(build.data).map(([url, revision]) => revisionKey(url, revision)),
        );
        const dataRequests = await data.keys();
        const staleData = new Set(staleKeys(dataRequests.map(keyOf), keptData));
        await Promise.all(
          dataRequests
            .filter((request) => staleData.has(keyOf(request)))
            .map((request) => data.delete(request)),
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
