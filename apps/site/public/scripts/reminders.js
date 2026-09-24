/**
 * My week's "Remind me to share my trip" section. It sits inside My week's
 * signed-in view, so nobody sees it until /scripts/my-week.js has
 * confirmed who is signed in.
 *
 * From 8:00 am on October 8 (the section's data-closes-at) the section
 * shows only its closing line. Before that, the "Browser notifications"
 * part shows the one state that fits this browser: iPhone help outside the
 * Home Screen app, a line when the browser can't show notifications or has
 * them blocked, "on" with Stop reminders, or the consent line with Turn on
 * notifications.
 *
 * Turning on asks the browser's own question only after a tap, subscribes
 * with the Worker's public key (GET /api/push/key) and saves the
 * subscription for the person signed in (POST /api/push/subscribe). If
 * saving fails, the browser's subscription is cancelled again, so the
 * phone and the Worker never disagree. Stopping cancels the browser's
 * subscription first, which stops reminders on this phone even offline,
 * then tells the Worker (POST /api/push/unsubscribe).
 *
 * Loading the page makes no request; only the two buttons do.
 */
(() => {
  const section = document.querySelector('[data-remind]');
  const part = section?.querySelector('[data-push]');
  const api = window.lvwwdApi;
  if (!section || !(part instanceof HTMLElement) || !api) return;

  const closesAt = Date.parse(section.getAttribute('data-closes-at') ?? '');
  // 12:00 am on October 1, Las Vegas time: from here on, the next reminder
  // is at most a day away.
  const FIRST_DAY = Date.parse('2026-10-01T07:00:00Z');
  // How long to wait for the service worker before giving up on turning
  // on, and for the browser to confirm a stop before saying it's done.
  const WAIT_MS = 10_000;
  const STOP_WAIT_MS = 2000;

  const SAY = {
    onBefore:
      'Reminders are on for this device. Your first one arrives October 1 at about 8:00 am.',
    onDuring: 'Reminders are on for this device. The next one arrives at about 8:00 am.',
    off: 'Reminders are off for this device.',
    unsupported:
      'This browser can’t show notifications from lvwwd.org. Open My week in your phone’s own browser, such as Chrome, to turn them on.',
    blocked:
      'Notifications are blocked for lvwwd.org in this browser. To allow them, change this site’s settings in your browser.',
    failed: 'Something went wrong, and reminders are not on. Try again in a minute.',
  };

  const pick = (name) => part.querySelector(`[data-push-${name}]`);
  const status = pick('status');
  const buttons = { on: pick('on'), stop: pick('stop'), how: pick('how') };
  const lines = { consent: pick('consent'), iphone: pick('iphone') };

  /** Shows one line, one message and the named buttons; hides the rest. */
  function show({ line = null, message = '', buttons: shown = [] }) {
    Object.entries(lines).forEach(([name, el]) => {
      if (el) el.hidden = name !== line;
    });
    Object.entries(buttons).forEach(([name, el]) => {
      if (el instanceof HTMLButtonElement) {
        el.hidden = !shown.includes(name);
        el.disabled = false;
      }
    });
    if (status) status.textContent = message;
  }

  const showOn = () =>
    show({ message: Date.now() < FIRST_DAY ? SAY.onBefore : SAY.onDuring, buttons: ['stop'] });
  const showReady = (message = '') => show({ line: 'consent', message, buttons: ['on'] });

  function showClosed() {
    const intro = section.querySelector('[data-remind-intro]');
    const closed = section.querySelector('[data-remind-closed]');
    if (intro) intro.hidden = true;
    if (closed) closed.hidden = false;
    part.hidden = true;
  }

  function apple() {
    const ua = navigator.userAgent;
    return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  }

  function fromHomeScreen() {
    return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  }

  function canNotify() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  const timeout = (ms) =>
    new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), ms));

  async function currentSubscription() {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      return (await registration?.pushManager.getSubscription()) ?? null;
    } catch {
      return null;
    }
  }

  // The public key as bytes: every browser takes these, not all take text.
  function keyBytes(base64url) {
    const text = atob(base64url.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(text, (character) => character.charCodeAt(0));
  }

  async function subscribe(publicKey) {
    // app.js registers the service worker after the page loads; asking
    // again is harmless and makes sure it exists before subscribing.
    await navigator.serviceWorker.register('/sw.js');
    const registration = await Promise.race([navigator.serviceWorker.ready, timeout(WAIT_MS)]);
    return registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey),
    });
  }

  async function turnOn() {
    if (buttons.on instanceof HTMLButtonElement) buttons.on.disabled = true;
    let permission = 'default';
    try {
      permission = await Notification.requestPermission();
    } catch {
      // Treated as closing the question.
    }
    if (permission === 'denied') return show({ message: SAY.blocked });
    if (permission !== 'granted') return showReady();

    const key = await api.call('GET', '/api/push/key');
    if (!key.ok) return showReady(key.status === 0 ? api.OFFLINE : SAY.failed);
    let subscription;
    try {
      subscription = await subscribe(key.data.publicKey);
    } catch {
      return showReady(navigator.onLine === false ? api.OFFLINE : SAY.failed);
    }
    const saved = await api.call('POST', '/api/push/subscribe', subscription.toJSON());
    if (saved.ok) {
      // Analytics: the `reminder_opt_in` event, channel "push", is sent
      // here once LVBT's analytics allow lvwwd.org's events.
      return showOn();
    }
    await subscription.unsubscribe().catch(() => undefined);
    if (saved.status === 401) return window.location.reload();
    if (saved.status === 410) return showClosed();
    return showReady(saved.status === 0 ? api.OFFLINE : SAY.failed);
  }

  async function stop() {
    if (buttons.stop instanceof HTMLButtonElement) buttons.stop.disabled = true;
    const subscription = await currentSubscription();
    if (subscription) {
      // Without a connection the browser may take a while to confirm, but
      // it has already stopped showing this site's pushes.
      await Promise.race([subscription.unsubscribe(), timeout(STOP_WAIT_MS)]).catch(
        () => undefined,
      );
    }
    showReady(SAY.off);
    if (subscription) {
      void api.call('POST', '/api/push/unsubscribe', { endpoint: subscription.endpoint });
    }
  }

  async function start() {
    if (!(Date.now() < closesAt)) return showClosed();
    part.hidden = false;
    if (apple() && !fromHomeScreen()) return show({ line: 'iphone', buttons: ['how'] });
    if (!canNotify()) return show({ message: SAY.unsupported });
    if (Notification.permission === 'denied') return show({ message: SAY.blocked });
    if (await currentSubscription()) return showOn();
    return showReady();
  }

  buttons.on?.addEventListener('click', () => void turnOn());
  buttons.stop?.addEventListener('click', () => void stop());
  void start();
})();
