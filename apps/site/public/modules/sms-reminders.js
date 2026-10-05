import { whenMe } from './me.js';
import { api } from './participant-api.js';

const card = document.querySelector('[data-sms]');
const requestForm = card?.querySelector('[data-sms-request]');
const confirmForm = card?.querySelector('[data-sms-confirm]');
const stop = card?.querySelector('[data-sms-stop]');
const status = card?.querySelector('[data-sms-status]');
let busy = false;
let available = false;
let signedOut = false;
let bot;

function show(state, message) {
  requestForm.hidden = !available || state !== 'ready';
  confirmForm.hidden = !available || state !== 'pending';
  stop.hidden = state === 'ready';
  status.textContent = message;
}

async function send(path, body) {
  busy = true;
  card.querySelectorAll('button').forEach((button) => (button.disabled = true));
  const result = await api.call('POST', `/api/sms/${path}`, body);
  busy = false;
  card.querySelectorAll('button').forEach((button) => (button.disabled = false));
  if (!result.ok) status.textContent = result.data.message;
  return result.ok;
}

async function request(event) {
  event.preventDefault();
  if (busy) return;
  if (!navigator.onLine) {
    status.textContent = api.OFFLINE;
    return;
  }
  const fields = new FormData(requestForm);
  if (!fields.has('consent') || !String(fields.get('phone')).trim()) {
    status.textContent = 'Enter your mobile number and choose text reminders first.';
    return;
  }
  busy = true;
  let turnstileToken;
  try {
    bot ??= api.botCheck(card.querySelector('[data-turnstile]'), 'sms');
    turnstileToken = await bot.token();
  } catch (error) {
    status.textContent = error.message;
    busy = false;
    return;
  }
  if (
    await send('request', {
      phone: String(fields.get('phone')).trim(),
      consent: true,
      turnstileToken,
    })
  ) {
    show('pending', 'Enter the six-digit code we texted you. It expires in ten minutes.');
    confirmForm.elements.code.focus();
  }
  bot.reset();
}

async function confirm(event) {
  event.preventDefault();
  if (busy) return;
  const code = confirmForm.elements.code.value.trim();
  if (!/^\d{6}$/.test(code)) {
    status.textContent = 'Enter the six-digit code from the text.';
    return;
  }
  if (await send('confirm', { code })) {
    show('subscribed', 'Morning texts are on. Reply STOP to end them anytime.');
    requestForm.reset();
    confirmForm.reset();
  }
}

async function cancel() {
  if (busy || !(await send('unsubscribe', {}))) return;
  requestForm.reset();
  confirmForm.reset();
  show('ready', 'Text reminders are off.');
}

async function load(me) {
  if (!me.smsRemindersAvailable) return;
  const result = await api.call('GET', '/api/sms/status');
  if (!result.ok || signedOut) return;
  const data = result.data;
  available = data.available;
  card.hidden = false;
  if (data.subscribed) {
    show(
      'subscribed',
      `Morning texts are on${data.phoneMasked ? ` for ${data.phoneMasked}` : ''}. Reply STOP to end them anytime.`,
    );
  } else if (data.pending) {
    show('pending', 'Enter your confirmation code, or stop text reminders to request a new code.');
  } else {
    show('ready', available ? '' : 'Text reminders have ended. Thanks for taking part!');
  }
}

if (card) {
  requestForm.addEventListener('submit', request);
  confirmForm.addEventListener('submit', confirm);
  stop.addEventListener('click', cancel);
  whenMe(load);
  document.addEventListener('lvwwd:signed-out', () => {
    signedOut = true;
    card.hidden = true;
    requestForm.reset();
    confirmForm.reset();
  });
}
