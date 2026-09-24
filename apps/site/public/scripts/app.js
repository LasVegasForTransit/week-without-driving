/**
 * lvwwd.org on the phone like an app. On every page this:
 *
 * - registers the service worker (/sw.js) once the page has loaded, which
 *   keeps the guides, Find a bus and Bingo working offline;
 * - shows the update bar when a new version is waiting, and switches to it
 *   when the visitor taps Refresh;
 * - runs the footer's "Add to home screen" button and its instruction
 *   sheet: the browser's own install box where there is one (Chrome,
 *   Edge), the iPhone steps in Safari on an iPhone or iPad, and general
 *   steps in other phone browsers. The iPhone sheet also opens by itself
 *   on My week after signing up, until it has been closed once.
 *
 * Campaign analytics events are listed in docs/operations/reference/analytics.md.
 * Without JavaScript the button stays hidden and every page still works.
 */
(() => {
  const DISMISSED = 'wwd-ios-install-dismissed';
  // Holds only "1" after an install has been counted on this phone.
  const INSTALL_COUNTED = 'wwd-install-counted';

  function countInstall(method) {
    if (!window.lvbt) return;
    let counted;
    try {
      counted = Boolean(localStorage.getItem(INSTALL_COUNTED));
      localStorage.setItem(INSTALL_COUNTED, '1');
    } catch {
      // Without storage every opening would look like the first, so only
      // the browser's own install report counts.
      counted = method === 'home_screen';
    }
    if (!counted) window.lvbt?.track('app_installed', { method });
  }

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

  /** What this browser can do about installing the site. */
  function browser() {
    const ua = navigator.userAgent;
    const apple =
      /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    return {
      standalone:
        window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
      // Safari itself: not Chrome, Firefox, Edge, Google or an app's own browser.
      iosSafari:
        apple &&
        /Safari\//.test(ua) &&
        !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|Instagram|FBAN|FBAV/.test(ua),
      phone: navigator.userAgentData?.mobile === true || apple || /Android|Mobi/.test(ua),
    };
  }

  function dismissed() {
    try {
      return Boolean(localStorage.getItem(DISMISSED));
    } catch {
      return false;
    }
  }

  function rememberDismissal() {
    try {
      localStorage.setItem(DISMISSED, new Date().toISOString());
    } catch {
      // Private browsing: the sheet may open by itself once more.
    }
  }

  /** The instruction sheet: open(which, byItself) shows the iPhone or general steps. */
  function installSheet(sheet) {
    const shown = { kind: 'general', auto: false, opener: null };
    sheet.addEventListener('click', (event) => {
      const target = event.target;
      // The backdrop, or a close button.
      if (
        target === sheet ||
        (target instanceof Element && target.closest('[data-install-close]'))
      ) {
        sheet.close();
      }
    });
    sheet.addEventListener('close', () => {
      if (shown.kind === 'ios') rememberDismissal();
      // After opening by itself, focus goes to the page's heading.
      const back = shown.auto ? document.querySelector('main h1') : shown.opener;
      if (shown.auto) back?.setAttribute('tabindex', '-1');
      if (back instanceof HTMLElement) back.focus();
    });
    return (which, byItself) => {
      if (sheet.open) return;
      Object.assign(shown, { kind: which, auto: byItself, opener: document.activeElement });
      sheet.querySelectorAll('[data-install-ios]').forEach((el) => (el.hidden = which !== 'ios'));
      sheet
        .querySelectorAll('[data-install-general]')
        .forEach((el) => (el.hidden = which === 'ios'));
      sheet.setAttribute('aria-labelledby', `install-${which}-title`);
      sheet.showModal();
      sheet.querySelector('h2:not([hidden])')?.focus();
    };
  }

  function setUpInstall() {
    const button = document.querySelector('[data-install-button]');
    const sheet = document.querySelector('[data-install-sheet]');
    if (!button || !(sheet instanceof HTMLDialogElement) || !sheet.showModal) return;
    const { standalone, iosSafari, phone } = browser();
    if (standalone) {
      countInstall('home_screen');
      return;
    }

    const open = installSheet(sheet);
    let offer = null;
    if (iosSafari || phone) button.hidden = false;
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      offer = event;
      button.hidden = false;
    });
    window.addEventListener('appinstalled', () => {
      offer = null;
      button.hidden = true;
      countInstall('browser');
    });
    button.addEventListener('click', () => {
      // The browser's install box can be shown once per offer.
      if (offer) offer.prompt();
      else open(iosSafari ? 'ios' : 'general', false);
      offer = null;
    });
    document.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('[data-open-install-sheet]')) {
        open('ios', false);
      }
    });

    const signedIn = /(?:^|; )lvwwd_signed_in=1(?:;|$)/.test(document.cookie);
    const myWeek = /^\/my-week\/?$/.test(window.location.pathname);
    if (iosSafari && signedIn && myWeek && !dismissed()) open('ios', true);
  }

  function countPrints() {
    const item = document.querySelector('[data-print-item]')?.getAttribute('data-print-item');
    if (item)
      window.addEventListener('beforeprint', () =>
        window.lvbt?.track('material_printed', { item }),
      );
  }

  function countSeen() {
    const sections = document.querySelectorAll('[data-seen-event]');
    if (sections.length === 0 || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          const name = entry.target.getAttribute('data-seen-event');
          if (name) window.lvbt?.track(name);
        });
      },
      { threshold: 0.5 },
    );
    sections.forEach((section) => observer.observe(section));
  }

  registerServiceWorker();
  setUpInstall();
  countPrints();
  countSeen();
})();
