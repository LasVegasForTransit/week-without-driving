/**
 * Get my link: checks the phone number or email, runs the bot check, and
 * asks the Worker to send the "Open my week" link (POST /api/link, through
 * /scripts/participant-api.js). The Worker answers the same whether or not
 * the contact matches a sign-up, so the page does too.
 */
(() => {
  const api = window.lvwwdApi;
  const form = document.querySelector('[data-link-form]');
  const sent = document.querySelector('[data-link-sent]');
  const error = document.querySelector('[data-link-error]');
  const status = document.querySelector('[data-link-status]');
  const submit = document.querySelector('[data-link-submit]');
  if (!api || !(form instanceof HTMLFormElement) || !sent || !error) return;

  if (new URLSearchParams(window.location.search).get('expired') === '1') {
    const expired = document.querySelector('[data-link-expired]');
    if (expired) expired.hidden = false;
  }

  const bot = api.botCheck(form.querySelector('[data-turnstile]'), 'link');

  function looksLikeContact(text) {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text)) return true;
    const digits = text.replace(/\D/g, '');
    return (
      /^[\d\s().+-]+$/.test(text) &&
      (digits.length === 10 || (digits.length === 11 && digits.startsWith('1')))
    );
  }

  function setBusy(busy) {
    if (!(submit instanceof HTMLButtonElement)) return;
    submit.disabled = busy;
    submit.textContent = busy ? 'Sending…' : 'Send my link';
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
      error.textContent =
        'Enter a phone number, like 702-555-0123, or an email, like name@example.com.';
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
    form.hidden = true;
    sent.hidden = false;
    api.showPreviewLink(sent.querySelector('[data-preview-link]'), data.previewLink);
  });
})();
