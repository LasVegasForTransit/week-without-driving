/**
 * My week: fills in the page for the person signed in on this phone, from
 * the Worker (GET /api/me, through /modules/participant-api.js), and sends
 * shared trips (the giveaway entries) and sign-out back to it.
 * /modules/share-trip.js makes the picture people can post, and
 * /modules/reminders.js runs the daily reminders section.
 *
 * The Worker decides which day it is, in Las Vegas time, so a phone with
 * the wrong clock can't enter a trip early. The preview Worker pins the day
 * (CHECKIN_PREVIEW_DAY) so the week can be tried before October.
 */
import { setMe } from './me.js';
import { planCardsFor } from './my-week-plan-cards.js';
import { api } from './participant-api.js';
import { setUp as setUpShareTrip } from './share-trip.js';

const out = document.querySelector('[data-me-out]');
const inside = document.querySelector('[data-me-in]');
const offline = document.querySelector('[data-me-offline]');
const MAX_ENTRIES = 8;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PREVIEW_KEY = 'lvwwd_preview_link';

// 12:00 am on October 9, 2026, in Las Vegas.
const SIGN_UP_ENDS = Date.parse('2026-10-09T07:00:00Z');
const params = new URLSearchParams(window.location.search);
let me = null;
let planCards = null;

/** How an entry came in, for the count: never the link or the picture itself. */
function entryMethod(body) {
  if (body.has('link')) return body.has('screenshot') ? 'link_and_screenshot' : 'link';
  return body.has('screenshot') ? 'screenshot' : 'text';
}

function setText(selector, text) {
  const el = document.querySelector(selector);
  if (el) el.textContent = text;
}

function showSignedOut() {
  inside.hidden = true;
  out.hidden = false;
}

function clearPlanDraft() {
  try {
    sessionStorage.removeItem('wwd-trip-plan-draft');
  } catch {
    // Signing out still works when browser storage is unavailable.
  }
}

function dayState(n, today, done) {
  if (done.has(n)) return 'done';
  if (n === today) return 'today';
  return n < today ? 'missed' : 'future';
}

const DAY_STATUS = {
  done: 'Trip logged',
  today: 'Today · ready to log',
  missed: 'No trip logged',
  future: 'Coming up',
};

const PLAN_MODE_LABELS = {
  bus: 'bus',
  walk: 'walk or roll',
  bike: 'bike',
  scooter: 'scooter',
  ride: 'ride',
};

// Public posts can come from these apps; the Worker checks the same list.
const POST_HOSTS = [
  'instagram.com',
  'facebook.com',
  'fb.com',
  'tiktok.com',
  'threads.net',
  'threads.com',
  'x.com',
  'twitter.com',
  'bsky.app',
];

function isPostLink(text) {
  try {
    const url = new URL(text);
    const host = url.hostname.replace(/^www\./, '');
    return (
      url.protocol === 'https:' &&
      POST_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
    );
  } catch {
    return false;
  }
}

function showClosed(today) {
  const text =
    today === 0
      ? 'Sharing trips opens October 1.'
      : 'The week is over. LVBT will draw one winner by October 15, 2026.';
  setText('[data-me-phase]', text);
  const closed = document.querySelector('[data-log-closed]');
  if (closed) {
    closed.hidden = false;
    closed.textContent = text;
  }
}

function renderToday(today, done) {
  const form = document.querySelector('[data-trip-form]');
  const entered = document.querySelector('[data-trip-done]');
  const closed = document.querySelector('[data-log-closed]');
  [form, entered, closed].forEach((el) => {
    if (el) el.hidden = true;
  });
  if (today === 0 || today > 8) return showClosed(today);
  if (me.contactType !== 'email') {
    setText('[data-me-phase]', 'Entries need an email sign-up. Contact us for help.');
    if (closed) {
      closed.hidden = false;
      closed.textContent = 'Email wwd@lasvegasfortransit.org to use an older phone sign-up.';
    }
    return undefined;
  }
  if (!me.county) {
    setText('[data-me-phase]', 'Add your county in Your details before entering.');
    if (closed) {
      closed.hidden = false;
      closed.textContent = 'Change my details below to add your county before entering.';
    }
    return undefined;
  }
  if (done.has(today)) {
    setText('[data-me-phase]', `Day ${today} of 8. Nice work.`);
    setText(
      '[data-trip-done-title]',
      `Day ${today} entered. That’s entry ${Math.min(done.size, MAX_ENTRIES)} of ${MAX_ENTRIES}.`,
    );
    if (entered) entered.hidden = false;
  } else {
    setText('[data-me-phase]', `Day ${today} of 8. Share a trip without the car today to enter.`);
    if (form) form.hidden = false;
  }
  return undefined;
}

function renderEntries() {
  const done = new Set(me.days);
  const count = Math.min(done.size, MAX_ENTRIES);
  setText('[data-me-count]', String(count));
  setText(
    '[data-me-progress-line]',
    count === 0
      ? 'Your eight days start October 1. Each day you describe a trip can be one entry.'
      : `${count} ${count === 1 ? 'day' : 'days'} with a trip logged. One entry can count for each day after volunteer review.`,
  );
  const progress = document.querySelector('[data-me-progress]');
  if (progress) progress.setAttribute('aria-valuenow', String(count));
  const fill = document.querySelector('[data-me-progress-fill]');
  if (fill instanceof HTMLElement) fill.style.width = `${(count / MAX_ENTRIES) * 100}%`;
  const tripByDay = new Map((me.trips ?? []).map((trip) => [trip.day, trip]));
  document.querySelectorAll('[data-day]').forEach((box) => {
    const day = Number(box.getAttribute('data-day'));
    const state = dayState(day, me.today, done);
    box.setAttribute('data-state', state);
    const status = box.querySelector('[data-day-status]');
    if (status) status.textContent = DAY_STATUS[state];
    const modes = box.querySelector('[data-day-modes]');
    const trip = tripByDay.get(day);
    if (modes) {
      const used = (trip?.modes ?? []).map((mode) => PLAN_MODE_LABELS[mode] ?? mode);
      modes.textContent = used.length ? `By ${used.join(', ')}` : '';
      modes.hidden = used.length === 0;
    }
    if (state === 'today') box.setAttribute('aria-current', 'date');
    else box.removeAttribute('aria-current');
  });
  planCards?.render(me, done);
  renderToday(me.today, done);
}

function renderDetails() {
  setText('[data-me-name]', me.firstName);
  setText('[data-me-field="firstName"]', me.firstName);
  setText('[data-me-field="contact"]', me.contactMasked);
  setText('[data-me-field="zip"]', me.zip);
  setText('[data-me-field="county"]', me.county || 'Add your county');
  setText('[data-me-field="instagram"]', me.instagram ? `@${me.instagram}` : 'Not added');
  setText(
    '[data-me-link-line]',
    me.contactType === 'email'
      ? `We can email a sign-in link to ${me.contactMasked}.`
      : 'Email wwd@lasvegasfortransit.org for help with an older phone sign-up.',
  );
}

function renderEventReminders() {
  const enabled = me.eventRemindersEnabled === true;
  document.querySelector('[data-remind]')?.toggleAttribute('hidden', !enabled);
}

function welcomeMessage() {
  if (params.get('plan') === 'saved')
    return 'Your plan is saved. After your trip, describe what you did for an entry.';
  if (params.get('saved') === '1') return 'Your details are saved.';
  if (params.get('email') === 'failed')
    return 'You’re signed up on this phone, but we couldn’t email a sign-in link. Keep using this phone and try again later.';
  if (params.get('email') === 'unavailable')
    return 'You’re signed up. Email links are unavailable right now; keep using this phone.';
  return 'You’re signed up to win.';
}

function renderBanners() {
  const welcome = document.querySelector('[data-me-welcome]');
  const saved = params.get('saved') === '1';
  const planSaved = params.get('plan') === 'saved';
  if (welcome && (params.get('welcome') === '1' || saved || planSaved)) {
    welcome.hidden = false;
    setText('[data-me-welcome-text]', welcomeMessage());
  }
  // The preview Worker hands back the link it would have sent; show it once.
  try {
    const link = window.sessionStorage.getItem(PREVIEW_KEY);
    window.sessionStorage.removeItem(PREVIEW_KEY);
    api.showPreviewLink(document.querySelector('[data-preview-link]'), link);
  } catch {
    // No storage, no preview box.
  }
}

function chosenModes(form) {
  return [...form.querySelectorAll('input[name="mode"]:checked')].map((box) => box.value);
}

function bindPicture(form) {
  const step = form.querySelector('[data-share-step]');
  const kit = form.querySelector('[data-share-kit]');
  form.querySelector('[data-make-picture]')?.addEventListener('click', async () => {
    const modes = chosenModes(form);
    if (modes.length === 0) {
      setText('[data-trip-error]', 'First pick how you got around, in step 1.');
      return;
    }
    setText('[data-trip-error]', '');
    await setUpShareTrip(step, { day: me.today, modes });
    if (kit) kit.hidden = false;
  });
}

function bindScreenshot(form) {
  const input = form.querySelector('[data-screenshot-input]');
  input?.addEventListener('change', () => {
    const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      setText('[data-trip-error]', 'That screenshot is over 10 MB. Try a smaller one.');
      input.value = '';
      return;
    }
    setText('[data-trip-error]', '');
    setText('[data-screenshot-label]', `Screenshot added: ${file.name}`);
  });
}

// The link field can be in the closed "Add a post" section: open it, so the
// message points at something the visitor can see.
function showLinkField(field) {
  const section = field.closest('details');
  if (section) section.open = true;
  field.focus();
  return 'Paste the link to a post on Instagram, Facebook, TikTok, Threads, X or Bluesky.';
}

// The entry as a form for the Worker, or an error message to show.
function tripForm(form) {
  const modes = chosenModes(form);
  if (modes.length === 0) return 'Pick how you got around, in step 1.';
  const descriptionField = form.elements.namedItem('description');
  const description =
    descriptionField instanceof HTMLTextAreaElement ? descriptionField.value.trim() : '';
  if (!description) return 'Describe the trip you took without driving.';
  if (description.length > 500) return 'Keep the trip description under 500 characters.';
  const linkField = form.elements.namedItem('link');
  const link = linkField instanceof HTMLInputElement ? linkField.value.trim() : '';
  const shot = form.querySelector('[data-screenshot-input]');
  const file = shot instanceof HTMLInputElement ? shot.files?.[0] : undefined;
  if (link && !isPostLink(link)) return showLinkField(linkField);
  const body = new FormData();
  modes.forEach((mode) => body.append('mode', mode));
  body.set('description', description);
  const hard = form.elements.namedItem('hard');
  if (hard instanceof HTMLTextAreaElement) body.set('hard', hard.value.trim());
  if (link) body.set('link', link);
  if (file) body.set('screenshot', file);
  appendPlanId(form, body);
  const share = form.elements.namedItem('share');
  if (share instanceof HTMLInputElement && share.checked) body.set('share', '1');
  return body;
}

function appendPlanId(form, body) {
  const planId = form.querySelector('[data-trip-plan-id]');
  if (planId instanceof HTMLInputElement && !planId.disabled && planId.value)
    body.set('planId', planId.value);
}

function bindTrip() {
  const form = document.querySelector('[data-trip-form]');
  if (!(form instanceof HTMLFormElement)) return;
  const tagNote = form.querySelector('[data-tag-note]');
  if (tagNote && me.instagram) tagNote.hidden = false;
  bindPicture(form);
  bindScreenshot(form);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = tripForm(form);
    if (typeof body === 'string') {
      setText('[data-trip-error]', body);
      return undefined;
    }
    setText('[data-trip-error]', '');
    const day = String(me.today);
    const button = form.querySelector('[data-trip-submit]');
    if (button instanceof HTMLButtonElement) button.disabled = true;
    const { ok, status, data } = await api.call('POST', '/api/checkin', body);
    if (button instanceof HTMLButtonElement) button.disabled = false;
    if (status === 401) return showSignedOut();
    if (!ok) {
      setText('[data-trip-error]', data.message);
      return undefined;
    }
    // Counting must never interrupt a successful trip entry. The shared
    // event catalog does not yet accept text-only entries.
    try {
      window.lvbt?.track('trip_entry_submitted', { day, method: entryMethod(body) });
    } catch {
      // The entry is already saved and remains visible below.
    }
    // app.js offers the Home Screen steps now, once a trip is in.
    document.dispatchEvent(new CustomEvent('lvwwd:trip-entered'));
    const planId = form.querySelector('[data-trip-plan-id]');
    const selectedPlanId =
      planId instanceof HTMLInputElement && !planId.disabled ? String(planId.value) : '';
    me.days = data.days;
    me.trips = data.trips;
    const plan = (me.plans ?? []).find((saved) => String(saved.id) === selectedPlanId);
    if (plan) plan.loggedEntryId = selectedPlanId;
    if (planId instanceof HTMLInputElement) {
      planId.value = '';
      planId.disabled = true;
    }
    const selected = form.querySelector('[data-trip-plan-selected]');
    if (selected) {
      selected.textContent = '';
      selected.hidden = true;
    }
    renderEntries();
    return undefined;
  });
}

// Signs out this phone only; other phones stay signed in.
function bindSignOut() {
  document.querySelector('[data-signout]')?.addEventListener('click', async () => {
    const { ok, message } = await api.signOut();
    if (ok) {
      clearPlanDraft();
      window.location.href = '/';
    } else setText('[data-signout-status]', message);
  });
}

// "Sign up someone else", for a volunteer signing people up on one
// tablet: signs this device out and opens the empty sign-up form. The
// sign-up that was open stays saved. Gone once sign-up closes.
function bindSomeoneElse() {
  const block = document.querySelector('[data-someone-else]');
  const button = document.querySelector('[data-someone-else-button]');
  if (!block || !button || Date.now() >= SIGN_UP_ENDS) return;
  block.hidden = false;
  button.addEventListener('click', async () => {
    setText('[data-someone-else-status]', '');
    const { ok, message } = await api.signUpSomeoneElse();
    if (ok) {
      clearPlanDraft();
      window.location.href = '/sign-up';
    } else setText('[data-someone-else-status]', message);
  });
}

async function start() {
  // Without the flag cookie this phone isn't signed in; don't ask.
  if (!/(?:^|; )lvwwd_signed_in=1(?:;|$)/.test(document.cookie)) return showSignedOut();
  const { ok, status, data } = await api.call('GET', '/api/me');
  if (status === 401) return showSignedOut();
  if (!ok) {
    if (offline) {
      offline.textContent = data.message;
      offline.hidden = false;
    }
    return undefined;
  }
  me = data;
  planCards = planCardsFor({ api, showSignedOut, renderEntries });
  renderDetails();
  renderEventReminders();
  renderBanners();
  renderEntries();
  inside.hidden = false;
  // For the "Keep going after the week" card (/modules/keep-going.js).
  setMe(me);
  bindTrip();
  bindSignOut();
  bindSomeoneElse();
  return undefined;
}

/** Starts the page once its markup is known to be there. */
function startPage() {
  void start();
}

if (out && inside) startPage();
