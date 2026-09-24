/**
 * Offline notices for the forms that need a connection: Sign up, today's
 * trip, reminders and "Send my link again" on My week, and Get my link.
 *
 * Each form (or section) carries data-needs-connection with its notice
 * key, and each button that sends something to lvwwd.org carries
 * data-needs-connection-button. While the phone is offline, the notice
 * sits directly above the form's first such button, where a screen reader
 * reaches it first, and every such button is dimmed with aria-disabled: it
 * can still be reached with Tab, but a tap sends nothing and the notice is
 * read again. Whatever the visitor typed, picked or attached stays as it
 * is, and nothing is kept to send later. When the connection returns, the
 * notices go, the buttons work again, and screen readers hear "You're back
 * online."
 *
 * navigator.onLine only says whether the phone has a network. A request
 * that still can't reach lvwwd.org shows the form's own error message.
 * Once a form has ended (sign-up and trips at 12:00 am on October 9,
 * reminders at 8:00 am on October 8, Las Vegas time) it gets no notice.
 * A personal "Open my week" link opened offline gets the offline page
 * from the service worker, and offline-page.js gives it its own notice.
 */
(() => {
  const NOTICES = {
    'sign-up': 'You’re offline. You can sign up as soon as you’re back online.',
    trip: 'You’re offline. My week needs a connection to show your entries and send your post.',
    'edit-details': 'You’re offline. You can save your details as soon as you’re back online.',
    'send-link': 'You’re offline. You can send your link as soon as you’re back online.',
    'get-link': 'You’re offline. You can get your link as soon as you’re back online.',
    reminders: 'You’re offline. You can sign up for reminders when you’re back online.',
  };
  const TRIPS_END = Date.parse('2026-10-09T07:00:00Z');
  const ENDS = {
    'sign-up': TRIPS_END,
    trip: TRIPS_END,
    reminders: Date.parse('2026-10-08T15:00:00Z'),
  };
  const BACK_ONLINE = 'You’re back online.';
  const CLEAR_AFTER_MS = 3000;
  const BUTTON = '[data-needs-connection-button]';
  const DIMMED = '[data-needs-connection-button][aria-disabled="true"]';

  const places = () => [...document.querySelectorAll('[data-needs-connection]')];
  if (places().length === 0) return;

  // Read politely when the connection returns, then emptied so the same
  // words are read again next time.
  const announcer = document.createElement('p');
  announcer.className = 'sr-only';
  announcer.setAttribute('aria-live', 'polite');
  document.body.append(announcer);
  let clearing = 0;

  function textFor(place) {
    const key = place.getAttribute('data-needs-connection') ?? '';
    if (Date.now() >= (ENDS[key] ?? Infinity)) return null;
    return NOTICES[key] ?? null;
  }

  // Directly above the first button, as a child of the form itself, so a
  // button inside a label or a row keeps its row together.
  function spotFor(place) {
    let spot = place.querySelector(BUTTON);
    if (!spot) return null;
    while (spot.parentElement && spot.parentElement !== place) spot = spot.parentElement;
    return spot;
  }

  function noticeFor(place) {
    const existing = place.querySelector('[data-offline-notice]');
    if (existing) return existing;
    const notice = document.createElement('p');
    notice.className = 'offline-notice';
    notice.setAttribute('data-offline-notice', '');
    notice.setAttribute('aria-live', 'assertive');
    const icon = document.createElement('span');
    icon.className = 'offline-notice__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '!';
    notice.append(icon, document.createElement('span'));
    const spot = spotFor(place);
    if (spot) spot.before(notice);
    else place.prepend(notice);
    return notice;
  }

  // Emptying the words and writing them again a moment later makes screen
  // readers read them again. A notice already there when the page opens is
  // read in page order instead.
  function say(notice, text, aloud) {
    const words = notice.lastElementChild;
    if (!words) return;
    if (!aloud) {
      words.textContent = text;
      return;
    }
    words.textContent = '';
    window.setTimeout(() => (words.textContent = text), 100);
  }

  function goOffline(aloud) {
    places().forEach((place) => {
      const text = textFor(place);
      if (!text) return;
      say(noticeFor(place), text, aloud);
      place.querySelectorAll(BUTTON).forEach((button) => {
        button.setAttribute('aria-disabled', 'true');
      });
    });
  }

  function goOnline() {
    document.querySelectorAll('[data-offline-notice]').forEach((notice) => notice.remove());
    document.querySelectorAll(DIMMED).forEach((button) => button.removeAttribute('aria-disabled'));
    announcer.textContent = BACK_ONLINE;
    window.clearTimeout(clearing);
    clearing = window.setTimeout(() => (announcer.textContent = ''), CLEAR_AFTER_MS);
  }

  // A dimmed button sends nothing: its click (which a tap, Enter or Space
  // on it makes) is stopped before the page's own handlers see it.
  document.addEventListener(
    'click',
    (event) => {
      const button = event.target instanceof Element ? event.target.closest(DIMMED) : null;
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const place = button.closest('[data-needs-connection]');
      const notice = place?.querySelector('[data-offline-notice]');
      const text = place ? textFor(place) : null;
      if (notice && text) say(notice, text, true);
    },
    true,
  );
  document.addEventListener(
    'submit',
    (event) => {
      if (!(event.target instanceof HTMLFormElement) || !event.target.querySelector(DIMMED)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );

  window.addEventListener('offline', () => goOffline(true));
  window.addEventListener('online', goOnline);
  if (!navigator.onLine) goOffline(false);
})();
