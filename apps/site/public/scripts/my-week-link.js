/**
 * Get my link: checks the phone number or email and shows the neutral
 * confirmation. This is a front-end demo: nothing is sent. The real
 * version posts to the Worker, which rate-limits the request, runs the
 * invisible bot check, and sends the link only if the contact matches a
 * sign-up, while the page says the same thing either way.
 */
(() => {
  const form = document.querySelector('[data-link-form]');
  const sent = document.querySelector('[data-link-sent]');
  const error = document.querySelector('[data-link-error]');
  if (!(form instanceof HTMLFormElement) || !sent || !error) return;

  function looksLikeContact(text) {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text)) return true;
    const digits = text.replace(/\D/g, '');
    return (
      /^[\d\s().+-]+$/.test(text) &&
      (digits.length === 10 || (digits.length === 11 && digits.startsWith('1')))
    );
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = form.elements.namedItem('contact');
    if (!(input instanceof HTMLInputElement)) return;
    const value = input.value.trim();
    if (!looksLikeContact(value)) {
      error.textContent =
        'Enter a phone number, like 702-555-0123, or an email, like name@example.com.';
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    input.removeAttribute('aria-invalid');
    error.textContent = '';
    form.hidden = true;
    sent.hidden = false;
  });
})();
