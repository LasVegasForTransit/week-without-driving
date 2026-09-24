/**
 * Sign up to win: checks the form, then sends it to the Worker
 * (POST /api/signup, through /scripts/participant-api.js).
 *
 * A new sign-up is signed in on this phone by the Worker's cookies and
 * goes to My week. A phone number or email that already has a sign-up is
 * not signed in here; the Worker sends that person their link instead,
 * and the page says so. Add ?edit=1 to change the details of the person
 * signed in on this phone (PATCH /api/me); the contact can't be changed.
 *
 * A phone that is signed in sees "You're signed up" in place of the form.
 * Until sign-up closes, it also offers "Sign up someone else", for a
 * volunteer signing people up one after another on one tablet: it signs
 * the device out and shows the empty form, ready for the next person.
 * Each sign-up sends the partner link this tab was opened with, if any.
 */
(() => {
  const api = window.lvwwdApi;
  const form = document.querySelector('[data-signup-form]');
  const already = document.querySelector('[data-signup-already]');
  if (!api || !(form instanceof HTMLFormElement) || !already) return;

  const FIELDS = ['firstName', 'contact', 'zip', 'instagram', 'age'];
  const PREVIEW_KEY = 'lvwwd_preview_link';
  // 12:00 am on October 9, 2026, in Las Vegas.
  const SIGN_UP_ENDS = Date.parse('2026-10-09T07:00:00Z');
  const nextPerson = form.querySelector('[data-next-person]');
  const statusLine = form.querySelector('[data-signup-status]');
  const submit = form.querySelector('[data-signup-submit]');
  const submitLabel = submit?.textContent ?? 'Sign up';
  let editing = false;
  let bot = null;

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

  // An error is red; a note (like "we sent your link") is not.
  function setStatus(message, isError = true) {
    if (!statusLine) return;
    statusLine.textContent = message ?? '';
    statusLine.classList.toggle('form-error', isError);
    statusLine.classList.toggle('signup__note', !isError);
  }

  function setBusy(busy, label) {
    if (!(submit instanceof HTMLButtonElement)) return;
    submit.disabled = busy;
    submit.textContent = busy ? label : submitLabel;
  }

  // Shows each message next to its field and focuses the first. True if any.
  function showErrors(errors) {
    FIELDS.forEach((name) => setError(name, errors[name] ?? ''));
    const first = FIELDS.find((name) => errors[name]);
    if (!first) return false;
    const target = first === 'age' ? form.querySelector('input[name="age"]') : field(first);
    if (target instanceof HTMLElement) target.focus();
    return true;
  }

  function readForm() {
    const age = form.querySelector('input[name="age"]:checked');
    return {
      firstName: field('firstName').value.trim(),
      contact: field('contact').value.trim(),
      zip: field('zip').value.trim(),
      instagram: cleanHandle(field('instagram').value),
      age: age instanceof HTMLInputElement ? age.value : '',
      newsletter: field('newsletter').checked,
    };
  }

  // The same rules and words as the Worker (worker/validate.ts).
  function check(details) {
    const errors = {};
    if (!details.firstName) errors.firstName = 'Enter your first name.';
    if (!editing && !details.contact) {
      errors.contact = 'Enter a phone number or an email address.';
    } else if (!editing && !parseContact(details.contact)) {
      errors.contact =
        'Enter a phone number, like 702-555-0123, or an email, like name@example.com.';
    }
    if (!/^\d{5}$/.test(details.zip)) {
      errors.zip = 'Enter a 5-digit ZIP code.';
    } else if (!/^89[01]\d\d$/.test(details.zip)) {
      errors.zip =
        'The giveaway is only for people who live in Southern Nevada. You can still take part in the week.';
    }
    if (details.instagram && !/^[a-z0-9._]{1,30}$/.test(details.instagram)) {
      errors.instagram = 'Instagram names use only letters, numbers, periods and underscores.';
    }
    if (!details.age) errors.age = 'Pick one. You need to be 13 or older to sign up.';
    return errors;
  }

  // The preview Worker returns the link; My week shows it once.
  function rememberPreviewLink(link) {
    if (!link) return;
    try {
      window.sessionStorage.setItem(PREVIEW_KEY, link);
    } catch {
      // Storage refused: the preview box is a convenience, not a need.
    }
  }

  // Resolves to true when the page is moving on to My week.
  async function signUp(details) {
    let turnstileToken;
    try {
      turnstileToken = await bot.token();
    } catch (error) {
      setStatus(error.message);
      return false;
    }
    const { ok, status, data } = await api.call('POST', '/api/signup', {
      ...details,
      ...api.whereFrom(),
      turnstileToken,
    });
    bot.reset();
    if (status === 201) {
      rememberPreviewLink(data.previewLink);
      window.location.href = data.redirect ?? '/my-week?welcome=1';
      return true;
    }
    if (data.errors) showErrors(data.errors);
    setStatus(data.message, !ok);
    if (ok) api.showPreviewLink(document.querySelector('[data-preview-link]'), data.previewLink);
    return false;
  }

  async function saveDetails(details) {
    const { firstName, zip, instagram, age, newsletter } = details;
    const { ok, data } = await api.call('PATCH', '/api/me', {
      firstName,
      zip,
      instagram,
      age,
      newsletter,
    });
    if (ok) {
      window.location.href = '/my-week?saved=1';
      return true;
    }
    if (data.errors) showErrors(data.errors);
    setStatus(data.message);
    return false;
  }

  function startSignUp() {
    bot = api.botCheck(form.querySelector('[data-turnstile]'), 'signup');
    form.hidden = false;
  }

  function startEditing(me) {
    editing = true;
    // Offline, needs-connection.js says saving waits, not signing up.
    form.setAttribute('data-needs-connection', 'edit-details');
    field('firstName').value = me.firstName ?? '';
    const contact = field('contact');
    contact.value = me.contactMasked ?? '';
    contact.disabled = true;
    const help = form.querySelector('[data-contact-help]');
    if (help) help.textContent = 'To change it, email wwd@lasvegasfortransit.org.';
    field('zip').value = me.zip ?? '';
    field('instagram').value = me.instagram ?? '';
    const age = form.querySelector(`input[name="age"][value="${me.age}"]`);
    if (age instanceof HTMLInputElement) age.checked = true;
    field('newsletter').checked = Boolean(me.newsletter);
    if (submit) submit.textContent = 'Save my details';
    form.hidden = false;
  }

  // The empty form for the next person, with the line that says the last
  // sign-up is saved. Focus goes to that line, so a screen reader reads it
  // and the next Tab reaches "First name".
  function showReadyForNext() {
    form.reset();
    showErrors({});
    setStatus('');
    startSignUp();
    if (!(nextPerson instanceof HTMLElement)) return;
    nextPerson.hidden = false;
    nextPerson.focus();
  }

  function offerSomeoneElse() {
    const block = already.querySelector('[data-someone-else]');
    const button = already.querySelector('[data-someone-else-button]');
    const status = already.querySelector('[data-someone-else-status]');
    if (!block || !button || Date.now() >= SIGN_UP_ENDS) return;
    block.hidden = false;
    button.addEventListener('click', async () => {
      if (status) status.textContent = '';
      const { ok, message } = await api.signUpSomeoneElse();
      if (!ok) {
        if (status) status.textContent = message;
        return;
      }
      api.readyForNextPerson();
      already.hidden = true;
      showReadyForNext();
    });
  }

  function showAlready(me) {
    const title = already.querySelector('[data-signup-already-title]');
    if (title) title.textContent = `You’re signed up, ${me.firstName}.`;
    offerSomeoneElse();
    already.hidden = false;
  }

  // Someone signed in on this phone sees who they are, or edits with ?edit=1.
  async function start() {
    if (!/(?:^|; )lvwwd_signed_in=1(?:;|$)/.test(document.cookie)) {
      // Just after "Sign up someone else" on My week.
      if (api.readyForNextPerson()) return showReadyForNext();
      return startSignUp();
    }
    form.hidden = true;
    const { ok, status, data } = await api.call('GET', '/api/me');
    if (!ok) {
      startSignUp();
      if (status !== 401) setStatus(data.message);
      return undefined;
    }
    if (new URLSearchParams(window.location.search).get('edit') === '1') return startEditing(data);
    return showAlready(data);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('');
    const details = readForm();
    if (showErrors(check(details))) return;
    setBusy(true, editing ? 'Saving…' : 'Signing up…');
    const leaving = editing ? await saveDetails(details) : await signUp(details);
    if (!leaving) setBusy(false);
  });

  void start();
})();
