/**
 * Email a sign-in link: checks the email address, runs the bot check, and
 * asks the Worker to send the "Open my week" link (POST /api/link, through
 * /modules/participant-api.js). The Worker answers the same whether or not
 * the contact matches a sign-up, so the page does too.
 */
import { api } from './participant-api.js';

const form = document.querySelector('[data-link-form]');
const sent = document.querySelector('[data-link-sent]');
const error = document.querySelector('[data-link-error]');
const status = document.querySelector('[data-link-status]');
const submit = document.querySelector('[data-link-submit]');
if (form instanceof HTMLFormElement && sent && error) startPage();

/** Starts the page once its markup is known to be there. */
function startPage() {
  if (new URLSearchParams(window.location.search).get('expired') === '1') {
    const expired = document.querySelector('[data-link-expired]');
    if (expired) expired.hidden = false;
  }

  if (form.hasAttribute('data-turnstile-unavailable')) return;

  const bot = api.botCheck(form.querySelector('[data-turnstile]'), 'link');

  function looksLikeContact(text) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text);
  }

  function setBusy(busy) {
    if (!(submit instanceof HTMLButtonElement)) return;
    submit.disabled = busy;
    submit.textContent = busy ? 'Sending…' : 'Email me a sign-in link';
  }

  async function send(contact) {
    let turnstileToken;
    try {
      turnstileToken = await bot.token();
    } catch (failure) {
      return { ok: false, data: { message: failure.message } };
    }
    const result = await api.call('POST', '/api/link', { contact, turnstileToken });
    bot.reset();
    return result;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = form.elements.namedItem('contact');
    if (!(input instanceof HTMLInputElement)) return;
    const value = input.value.trim();
    if (status) status.textContent = '';
    if (!looksLikeContact(value)) {
      error.textContent = 'Enter an email address, like name@example.com.';
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    input.removeAttribute('aria-invalid');
    error.textContent = '';

    setBusy(true);
    const { ok, data } = await send(value);
    setBusy(false);
    if (!ok) {
      if (status) status.textContent = data.message;
      return;
    }
    window.lvbt?.track('week_link_requested', { method: 'link_form' });
    form.hidden = true;
    sent.hidden = false;
    api.showPreviewLink(sent.querySelector('[data-preview-link]'), data.previewLink);
  });
}
