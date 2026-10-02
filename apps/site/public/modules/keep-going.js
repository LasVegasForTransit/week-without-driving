/**
 * "Keep going after the week" on My week and "Stay involved with LVBT" on
 * Home (src/components/KeepGoingCard.astro), and Home's switch once the
 * giveaway closes.
 *
 * The card always links to LVBT's newsletter page. When the one-tap
 * sign-up is on (data-one-tap="on"), this script swaps that link for "Join
 * the newsletter": on My week, with the signed-in participant's own
 * address when their contact is an email, from the GET /api/me that
 * /modules/my-week.js already made; otherwise, and on Home, with an email
 * field. A tap asks Turnstile for a token, then sends POST /api/newsletter.
 *
 * On Home, from 12:00 am October 9, 2026, Las Vegas time, by the phone's
 * clock, a visitor who isn't signed in sees the ended message, the "Stay
 * involved with LVBT" button and section, and the closing band without its
 * heading and "Sign up to win" button.
 */
import { whenMe } from './me.js';

const CLOSES = Date.parse('2026-10-09T07:00:00Z');
const TOKEN_WAIT_MS = 10_000;
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const SOMETHING_WRONG = 'Something went wrong. Please try again.';
const MESSAGES = {
  empty: 'Enter your email address.',
  invalid: 'Enter a full email address, like name@example.com.',
  ok: "Almost done! Check your email for a message from Las Vegans for Better Transit, and tap Confirm my subscription. Already subscribed? You're all set.",
  rate_limited: 'Too many tries. Wait a minute, then try again.',
  verification_failed: "We couldn't confirm you're a person. Reload the page and try again.",
  newsletter_unavailable:
    "LVBT's newsletter service isn't answering right now. Please try again in a few minutes.",
  unreachable:
    "We couldn't reach the server. Check your connection and tap Join the newsletter again.",
};

/** The field message for a typed address, or '' when it is fine. */
function checkEmail(value) {
  const email = value.trim();
  if (email === '') return MESSAGES.empty;
  return email.length <= 254 && EMAIL.test(email) ? '' : MESSAGES.invalid;
}

/** The message for the route's reply: status 0 means no reply at all. */
function messageFor(status, error) {
  if (status === 0) return MESSAGES.unreachable;
  if (status >= 200 && status < 300) return MESSAGES.ok;
  if (error === 'invalid_email') return MESSAGES.invalid;
  return MESSAGES[error] ?? SOMETHING_WRONG;
}

export { checkEmail, messageFor, CLOSES };

const signedIn = () => /(?:^|; )lvwwd_signed_in=1(?:;|$)/.test(document.cookie);

function switchHome() {
  const home = document.querySelector('[data-home-closed]');
  if (!home || signedIn() || Date.now() < CLOSES) return;
  document.querySelectorAll('[data-home-open]').forEach((el) => {
    el.hidden = true;
  });
  document.querySelectorAll('[data-home-closed]').forEach((el) => {
    el.hidden = false;
  });
  const section = document.getElementById('stay-involved');
  document.querySelector('[data-stay-involved-link]')?.addEventListener('click', (event) => {
    if (!section) return;
    event.preventDefault();
    section.scrollIntoView();
    section.querySelector('h2')?.focus({ preventScroll: true });
    window.history.replaceState(null, '', '#stay-involved');
  });
}

/**
 * The participant API (participant-api.js), loaded when first needed. A
 * browser remembers a failed import for the rest of the page's life, so a
 * try after one fails asks for the file at a new address.
 */
let apiLoad = null;
let apiTries = 0;
function participantApi() {
  apiLoad ??= import(
    apiTries === 0 ? './participant-api.js' : `./participant-api.js?try=${apiTries}`
  )
    .then((module) => module.api)
    .catch(() => {
      apiLoad = null;
      apiTries += 1;
      return Promise.reject(new Error('unreachable'));
    });
  return apiLoad;
}

function tokenWithin(bot) {
  const late = new Promise((_resolve, reject) => {
    window.setTimeout(() => reject(new Error('late')), TOKEN_WAIT_MS);
  });
  return Promise.race([bot.token(), late]);
}

async function send(body) {
  try {
    const response = await fetch('/api/newsletter', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    return { status: response.status, error: data.error };
  } catch {
    return { status: 0, error: '' };
  }
}

/** The card's parts, and what it is doing: `known` means it uses the participant's own address. */
function cardState(card) {
  const part = (name) => card.querySelector(`[data-kg-${name}]`);
  return {
    card,
    form: part('form'),
    join: part('join'),
    email: part('email'),
    emailError: part('email-error'),
    message: part('message'),
    knownLine: part('known'),
    address: part('address'),
    field: part('field'),
    other: part('other'),
    offline: part('offline'),
    source: card.dataset.source,
    known: false,
    sending: false,
    bot: null,
  };
}

function showField(ui, focus) {
  ui.known = false;
  if (ui.knownLine) ui.knownLine.hidden = true;
  if (ui.other) ui.other.hidden = true;
  if (ui.field) ui.field.hidden = false;
  if (focus) ui.email.focus();
}

function showKnown(ui, address) {
  ui.known = true;
  if (ui.address) ui.address.textContent = address;
  if (ui.knownLine) ui.knownLine.hidden = false;
  if (ui.other) ui.other.hidden = false;
  if (ui.field) ui.field.hidden = true;
}

function fieldMessage(ui, text) {
  if (ui.emailError) ui.emailError.textContent = text;
  ui.email.setAttribute('aria-invalid', text ? 'true' : 'false');
  if (text) ui.email.focus();
}

/** Home only: a notice and a disabled-looking button while the phone is offline. */
function showConnection(ui) {
  const isOffline = navigator.onLine === false;
  if (ui.offline) ui.offline.hidden = !isOffline;
  ui.join.setAttribute('aria-disabled', String(isOffline));
}

function finish(ui, text, success) {
  ui.sending = false;
  ui.join.disabled = false;
  ui.join.textContent = 'Join the newsletter';
  if (ui.message) ui.message.textContent = text;
  if (success) ui.form.hidden = true;
  else ui.bot?.reset();
}

async function submit(ui, event) {
  event.preventDefault();
  if (ui.sending || ui.join.getAttribute('aria-disabled') === 'true') return;
  if (ui.message) ui.message.textContent = '';
  const body = { source: ui.source };
  if (!ui.known) {
    const problem = checkEmail(ui.email.value);
    fieldMessage(ui, problem);
    if (problem) return;
    body.email = ui.email.value.trim();
  }
  ui.sending = true;
  ui.join.disabled = true;
  ui.join.textContent = 'Joining…';
  try {
    const api = await participantApi();
    ui.bot ??= api.botCheck(ui.card.querySelector('[data-turnstile]'), 'newsletter');
    body.turnstileToken = await tokenWithin(ui.bot);
  } catch {
    finish(ui, SOMETHING_WRONG, false);
    return;
  }
  const reply = await send(body);
  if (reply.error === 'invalid_email' && !ui.known) {
    finish(ui, '', false);
    fieldMessage(ui, MESSAGES.invalid);
    return;
  }
  finish(ui, messageFor(reply.status, reply.error), reply.status >= 200 && reply.status < 300);
}

/** Swaps the newsletter page link for the one-tap sign-up. `me` is My week's participant. */
function start(ui, me) {
  ui.card.querySelector('[data-kg-page-link]')?.setAttribute('hidden', '');
  ui.form.hidden = false;
  if (me?.contactType === 'email' && me.contactMasked) showKnown(ui, me.contactMasked);
  else showField(ui, false);
}

function setUpCard(card) {
  const ui = cardState(card);
  if (!ui.form || !ui.join || !ui.email) return;
  ui.form.addEventListener('submit', (event) => void submit(ui, event));
  ui.other?.addEventListener('click', () => showField(ui, true));
  if (ui.source === 'home') {
    window.addEventListener('online', () => showConnection(ui));
    window.addEventListener('offline', () => showConnection(ui));
    showConnection(ui);
    start(ui, null);
  } else {
    whenMe((me) => start(ui, me));
  }
}

/** Starts the page once its markup is known to be there. */
function startPage() {
  switchHome();
  document.querySelectorAll('[data-keep-going][data-one-tap="on"]').forEach(setUpCard);
}

// The rules above are tested in Node, where there is no page to set up.
if (typeof document !== 'undefined') startPage();
