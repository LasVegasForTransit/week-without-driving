/**
 * Sign up to win: checks the form and signs this phone in.
 *
 * This is a front-end demo. There is no backend yet, so nothing leaves the
 * phone: the details are kept in this browser's localStorage under
 * `lvwwd_me`, and the readable `lvwwd_signed_in` flag switches the header
 * button to "My week". The real version posts the form to the Worker,
 * which stores the sign-up, sets the HttpOnly session cookie next to the
 * same flag, and sends the "Open my week" link. Add ?edit=1 to change the
 * details of the person signed in on this phone.
 */
(() => {
  const STORE = 'lvwwd_me';
  const FLAG = 'lvwwd_signed_in';
  // Personal details are deleted on November 30, 2026, so the sign-in ends then too.
  const SIGNED_IN_UNTIL = new Date('2026-12-01T08:00:00Z');

  const form = document.querySelector('[data-signup-form]');
  const already = document.querySelector('[data-signup-already]');
  if (!(form instanceof HTMLFormElement) || !already) return;

  function readMe() {
    try {
      const raw = window.localStorage.getItem(STORE);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveMe(me) {
    try {
      window.localStorage.setItem(STORE, JSON.stringify(me));
    } catch {
      // Private browsing can refuse storage; the flag cookie still signs the phone in.
    }
    document.cookie = `${FLAG}=1; path=/; expires=${SIGNED_IN_UNTIL.toUTCString()}; samesite=lax`;
  }

  // Returns { type, value } for a US phone number or an email address, or null.
  function parseContact(raw) {
    const text = raw.trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text))
      return { type: 'email', value: text.toLowerCase() };
    const digits = text.replace(/\D/g, '');
    if (/^[\d\s().+-]+$/.test(text)) {
      if (digits.length === 10) return { type: 'phone', value: `+1${digits}` };
      if (digits.length === 11 && digits.startsWith('1'))
        return { type: 'phone', value: `+${digits}` };
    }
    return null;
  }

  function cleanHandle(raw) {
    return raw
      .trim()
      .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
      .replace(/^@/, '')
      .replace(/\/.*$/, '')
      .toLowerCase();
  }

  function field(name) {
    return form.elements.namedItem(name);
  }

  function setError(name, message) {
    const error = form.querySelector(`[data-error-for="${name}"]`);
    if (error) error.textContent = message;
    const input = field(name);
    if (input instanceof HTMLInputElement) {
      if (message) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
  }

  // Each check returns an error message, or '' when the answer is fine.
  function checkContact(raw) {
    if (!raw.trim()) return 'Enter a phone number or an email address.';
    if (!parseContact(raw)) {
      return 'Enter a phone number, like 702-555-0123, or an email, like name@example.com.';
    }
    return '';
  }

  function checkZip(zip) {
    if (!/^\d{5}$/.test(zip)) return 'Enter a 5-digit ZIP code.';
    if (!/^89[01]\d\d$/.test(zip)) {
      return 'The giveaway is only for people who live in Southern Nevada. You can still take part in the week.';
    }
    return '';
  }

  function checkInstagram(handle) {
    if (handle && !/^[a-z0-9._]{1,30}$/.test(handle)) {
      return 'Instagram names use only letters, numbers, periods and underscores.';
    }
    return '';
  }

  function readForm() {
    const ageInput = form.querySelector('input[name="age"]:checked');
    return {
      firstName: field('firstName').value.trim(),
      contact: field('contact').value.trim(),
      zip: field('zip').value.trim(),
      instagram: cleanHandle(field('instagram').value),
      age: ageInput instanceof HTMLInputElement ? ageInput.value : '',
      newsletter: field('newsletter').checked,
    };
  }

  // Shows every error at once and returns the first field with one, or null.
  function validate(values) {
    const errors = {
      firstName: values.firstName ? '' : 'Enter your first name.',
      contact: checkContact(values.contact),
      zip: checkZip(values.zip),
      instagram: checkInstagram(values.instagram),
      age: values.age ? '' : 'Pick one. You need to be 13 or older to sign up.',
    };
    Object.entries(errors).forEach(([name, message]) => setError(name, message));
    return Object.keys(errors).find((name) => errors[name]) ?? null;
  }

  function focusField(name) {
    const target = name === 'age' ? form.querySelector('input[name="age"]') : field(name);
    if (target instanceof HTMLElement) target.focus();
  }

  function showAlreadySignedIn(me) {
    form.hidden = true;
    already.hidden = false;
    const nameLine = already.querySelector('[data-signup-already-name]');
    if (nameLine) nameLine.textContent = `You signed up as ${me.firstName}.`;
  }

  function prefill(me) {
    field('firstName').value = me.firstName ?? '';
    field('contact').value = me.contact ?? '';
    field('zip').value = me.zip ?? '';
    field('instagram').value = me.instagram ?? '';
    const age = form.querySelector(`input[name="age"][value="${me.age}"]`);
    if (age instanceof HTMLInputElement) age.checked = true;
    field('newsletter').checked = Boolean(me.newsletter);
    const submit = form.querySelector('[data-signup-submit]');
    if (submit) submit.textContent = 'Save my details';
  }

  function submit(event) {
    event.preventDefault();
    const values = readForm();
    const firstBad = validate(values);
    if (firstBad) {
      focusField(firstBad);
      return;
    }

    const button = form.querySelector('[data-signup-submit]');
    if (button instanceof HTMLButtonElement) {
      button.disabled = true;
      button.textContent = 'Signing up…';
    }

    const previous = readMe();
    saveMe({
      ...values,
      contactType: parseContact(values.contact).type,
      checkins: previous?.checkins ?? [],
      photos: previous?.photos ?? [],
      reminders: previous?.reminders ?? {},
    });

    // Demo only: a short pause stands in for the request to the Worker.
    window.setTimeout(() => {
      window.location.href = previous ? '/my-week?saved=1' : '/my-week?welcome=1';
    }, 450);
  }

  const editing = new URLSearchParams(window.location.search).get('edit') === '1';
  const me = readMe();
  const signedIn = document.cookie.split('; ').includes(`${FLAG}=1`);

  if (signedIn && me && !editing) {
    showAlreadySignedIn(me);
    return;
  }
  if (signedIn && me) prefill(me);
  form.addEventListener('submit', submit);
})();
