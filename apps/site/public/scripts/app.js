/**
 * The offline service worker, from the page. On every page this registers
 * /sw.js once the page has loaded, which keeps the guides, Find a bus and
 * Bingo working offline, and shows the update bar when a new version is
 * waiting, switching to it when the visitor taps Refresh.
 */
(() => {
  function offerUpdate(worker, state) {
    const bar = document.querySelector('[data-update-bar]');
    if (!bar || bar.childElementCount) return;
    const text = document.createElement('p');
    text.textContent = 'A new version of lvwwd.org is ready.';
    const refresh = document.createElement('button');
    refresh.type = 'button';
    refresh.className = 'update-bar__button';
    refresh.textContent = 'Refresh';
    refresh.addEventListener('click', () => {
      state.refreshing = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
    });
    bar.append(text, refresh);
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    const sw = navigator.serviceWorker;
    const state = { refreshing: false };
    // The first version takes control without a reload; only a new
    // version the visitor asked for reloads the page, once.
    sw.addEventListener('controllerchange', () => {
      if (state.refreshing) window.location.reload();
      state.refreshing = false;
    });
    const register = () => {
      sw.register('/sw.js')
        .then((registration) => {
          if (registration.waiting && sw.controller) offerUpdate(registration.waiting, state);
          registration.addEventListener('updatefound', () => {
            const worker = registration.installing;
            worker?.addEventListener('statechange', () => {
              if (worker.state === 'installed' && sw.controller) offerUpdate(worker, state);
            });
          });
        })
        .catch(() => {
          // No service worker (private mode, blocked storage): the site
          // works as plain pages.
        });
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }

  registerServiceWorker();
})();
