/**
 * The offline page: lists only the pages saved on this phone, and says so
 * when none are yet. The service worker shows this page at the address
 * the visitor asked for, so My week and Sign up get their own line about
 * needing a connection. Without JavaScript the whole list shows.
 *
 * A personal "Open my week" link (/my-week?t=...) opened offline says to
 * open the link again, and tries it again by itself as soon as the phone
 * is back online: the Worker then signs the phone in and opens My week.
 */
(() => {
  const text = document.querySelector('[data-offline-text]');
  const privateText = document.querySelector('[data-offline-private]');
  const openLink = document.querySelector('[data-offline-open-link]');
  const none = document.querySelector('[data-offline-none]');
  const list = document.querySelector('[data-offline-list]');
  if (!text || !privateText || !openLink || !none || !list) return;

  const path = window.location.pathname;
  const isLink =
    /^\/my-week\/?$/.test(path) && new URLSearchParams(window.location.search).has('t');
  if (isLink) {
    text.hidden = true;
    list.hidden = true;
    openLink.hidden = false;
    window.addEventListener('online', () => window.location.reload());
    return;
  }
  if (/^\/(?:my-week|sign-up)(?:\/|$)/.test(path)) {
    text.hidden = true;
    privateText.hidden = false;
  }

  if (!('caches' in window)) return;
  const items = [...list.querySelectorAll('[data-offline-page]')];
  Promise.all(
    items.map(async (item) => {
      // Saved copies are stored under the address, with a revision query
      // on the ones saved in the background.
      const saved = await caches.match(item.getAttribute('data-offline-page'), {
        ignoreSearch: true,
      });
      item.hidden = !saved;
      return Boolean(saved);
    }),
  )
    .then((found) => {
      if (found.some(Boolean)) return;
      text.hidden = true;
      privateText.hidden = true;
      list.hidden = true;
      none.hidden = false;
    })
    .catch(() => {
      items.forEach((item) => (item.hidden = false));
    });
})();
