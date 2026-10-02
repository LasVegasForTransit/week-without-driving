/** Event reminder controls for the signed-in participant on this device. */
import { isAppleTouch } from './device.js';
import { api } from './participant-api.js';

const section = document.querySelector('[data-remind]');
const part = section?.querySelector('[data-push]');
const closesAt = Date.parse(section?.getAttribute('data-closes-at') ?? '');

// How long to wait for the service worker before giving up on turning
// on, and for the browser to confirm a stop before saying it's done.
const WAIT_MS = 10_000;
const STOP_WAIT_MS = 2000;

const SAY = {
  on: 'Event reminders are on for this device. Choose a reminder time when you save a plan.',
  off: 'Reminders are off for this device.',
  unsupported:
    'This browser can’t show notifications from lvwwd.org. Open My week in your phone’s own browser, such as Chrome, to turn them on.',
  blocked:
    'Notifications are blocked for lvwwd.org in this browser. To allow them, change this site’s settings in your browser.',
  failed: 'Reminders aren’t on yet. Try again in a minute.',
  stopFailed: 'Reminders may still be on. Try stopping them again.',
  unknown: 'We couldn’t check your reminders. Reconnect and try again.',
};

const pick = (name) => part?.querySelector(`[data-push-${name}]`);
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

const showOn = () => show({ message: SAY.on, buttons: ['stop'] });
const enrollmentOpen = () => Date.now() < closesAt;
const showReady = (message = '') =>
  enrollmentOpen() ? show({ line: 'consent', message, buttons: ['on'] }) : showClosed(message);

function showClosed(message = '') {
  const closed = section.querySelector('[data-remind-closed]');
  if (closed) closed.hidden = false;
  part.hidden = !message;
  show({ message });
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
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** Either confirmed cancellation is sufficient to stop future delivery. */
async function cancel(subscription) {
  const [browser, server] = await Promise.all([
    Promise.race([subscription.unsubscribe(), timeout(STOP_WAIT_MS)]).catch(() => false),
    navigator.onLine === false
      ? Promise.resolve({ ok: false })
      : Promise.race([
          api.call('POST', '/api/push/unsubscribe', { endpoint: subscription.endpoint }),
          timeout(STOP_WAIT_MS),
        ]).catch(() => ({ ok: false })),
  ]);
  return browser === true || server.ok;
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
  if (!enrollmentOpen()) return showClosed();
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
  if (saved.ok) return showOn();
  return rollback(saved, subscription);
}

async function rollback(saved, subscription) {
  if (!(await cancel(subscription))) return show({ message: SAY.stopFailed, buttons: ['stop'] });
  if (saved.status === 401) return window.location.reload();
  if (saved.status === 410) return showClosed();
  return showReady(saved.status === 0 ? api.OFFLINE : SAY.failed);
}

async function stop() {
  if (buttons.stop instanceof HTMLButtonElement) buttons.stop.disabled = true;
  if (status) status.textContent = 'Stopping reminders…';
  try {
    const subscription = await Promise.race([currentSubscription(), timeout(STOP_WAIT_MS)]);
    if (!subscription || (await cancel(subscription))) return showReady(SAY.off);
  } catch {
    // Keep the Stop control available when cancellation cannot be confirmed.
  }
  return show({ message: SAY.stopFailed, buttons: ['stop'] });
}

async function start() {
  part.hidden = false;
  if (!canNotify()) return enrollmentOpen() ? show({ message: SAY.unsupported }) : showClosed();
  let subscription;
  try {
    subscription = await Promise.race([currentSubscription(), timeout(WAIT_MS)]);
  } catch {
    return show({ message: SAY.unknown });
  }
  if (subscription) {
    const owner = await api.call('POST', '/api/push/status', { endpoint: subscription.endpoint });
    if (!owner.ok) return show({ message: SAY.unknown, buttons: ['stop'] });
    if (owner.data.subscribed === true) return showOn();
    // A browser permission belongs to the device, not its next participant.
    // Cancel the previous subscription and ask for a fresh opt-in.
    if (!(await cancel(subscription))) return show({ message: SAY.stopFailed, buttons: ['stop'] });
  }
  if (!enrollmentOpen()) return showClosed();
  if (isAppleTouch() && !fromHomeScreen()) return show({ line: 'iphone', buttons: ['how'] });
  if (Notification.permission === 'denied') return show({ message: SAY.blocked });
  return showReady();
}

/** Starts the page once its markup is known to be there. */
function startPage() {
  buttons.on?.addEventListener('click', () => void turnOn());
  buttons.stop?.addEventListener('click', () => void stop());
  void start();
}

if (section && part instanceof HTMLElement) startPage();
