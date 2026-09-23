/**
 * The Take Part pledge picker: tier selection, the optional email and
 * newsletter fields, and the "I'm in" submit.
 *
 * This is a front-end demo. There is no backend yet, so nothing is sent
 * anywhere: after validation, the chosen tier is written to the
 * `lvwwd_tier` cookie (the only pledge data kept in the browser — no name,
 * email or address) and the browser is sent straight to that tier's
 * participant kit. The Docket task "Build pledging and the participant
 * kit pages" (01M357CVBX1XAFKFD6K1X7EPVD) replaces this with a real POST
 * to the Worker, the invisible bot check, and the kit email send.
 *
 * Also renders the returning-pledger state (cookie already set) and the
 * post-campaign "ended" state, both from the pledge Feature drafts.
 */
(() => {
  const COOKIE_NAME = 'lvwwd_tier';
  // Fixed instant the campaign ends, Las Vegas time, matching
  // src/lib/wwd.ts (kept in sync by hand — this file cannot import a
  // module across the CSP's script-src 'self' boundary as a classic script).
  const WEEK_END = Date.parse('2026-10-09T07:00:00Z');

  const TIER_NAMES = { trip: 'One Trip', day: 'One Day', week: 'One Week' };

  function readCookie(name) {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function setCookie(name, value) {
    const oneYear = 60 * 60 * 24 * 365;
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${oneYear}; samesite=lax`;
  }

  function clearCookie(name) {
    document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  const form = document.querySelector('[data-pledge-form]');
  const returningBlock = document.querySelector('[data-pledge-returning]');
  const endedBlock = document.querySelector('[data-pledge-ended]');
  if (!form || !returningBlock || !endedBlock) return;

  const tierError = form.querySelector('[data-tier-error]');
  const emailError = form.querySelector('[data-email-error]');
  const status = form.querySelector('[data-pledge-status]');
  const submitButton = form.querySelector('[data-pledge-submit]');
  const kitEmailBox = form.querySelector('[data-kit-email-box]');
  const newsletterBox = form.querySelector('input[name="newsletter"]');
  const emailField = form.querySelector('#pledge-email');

  function tierInput(tier) {
    return form.querySelector(`input[name="tier"][value="${tier}"]`);
  }

  // Render state on load: ended takes priority over returning, which takes
  // priority over the plain first-time form.
  function renderInitialState() {
    const cookieTier = readCookie(COOKIE_NAME);
    const ended = Date.now() >= WEEK_END;

    if (ended) {
      form.hidden = true;
      returningBlock.hidden = true;
      endedBlock.hidden = false;
      const kitLink = endedBlock.querySelector('[data-ended-kit-link]');
      if (cookieTier && TIER_NAMES[cookieTier] && kitLink instanceof HTMLAnchorElement) {
        kitLink.href = `/pledged/${cookieTier}`;
        kitLink.hidden = false;
      }
      return;
    }

    if (cookieTier && TIER_NAMES[cookieTier]) {
      returningBlock.hidden = false;
      const message = returningBlock.querySelector('[data-returning-message]');
      const kitLink = returningBlock.querySelector('[data-returning-kit-link]');
      if (message) message.textContent = `You’re pledged for ${TIER_NAMES[cookieTier]}.`;
      if (kitLink instanceof HTMLAnchorElement) kitLink.href = `/pledged/${cookieTier}`;
      const input = tierInput(cookieTier);
      if (input instanceof HTMLInputElement) input.checked = true;
    }
  }

  renderInitialState();

  // "Start a new pledge": forgets the pledge on this browser only, per
  // "Let volunteers sign up several people on one shared device". A plain
  // navigation link, so it still works (minus the cookie clear) with the
  // click handler absent.
  document.querySelectorAll('[data-start-new-pledge]').forEach((link) => {
    link.addEventListener('click', () => {
      clearCookie(COOKIE_NAME);
    });
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    tierError.textContent = '';
    emailError.textContent = '';

    const selected = form.querySelector('input[name="tier"]:checked');
    const tier = selected instanceof HTMLInputElement ? selected.value : '';
    const email = emailField instanceof HTMLInputElement ? emailField.value.trim() : '';
    const wantsEmail =
      (kitEmailBox instanceof HTMLInputElement && kitEmailBox.checked) ||
      (newsletterBox instanceof HTMLInputElement && newsletterBox.checked);

    if (!tier) {
      tierError.textContent = 'Pick One Trip, One Day, or One Week first.';
      return;
    }
    if (wantsEmail && !email) {
      emailError.textContent = 'Enter your email, or untick the box.';
      emailField?.focus();
      return;
    }
    if (wantsEmail && !isValidEmail(email)) {
      emailError.textContent = 'Enter a full email address, like name@example.com.';
      emailField?.focus();
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Saving…';
    status.textContent = '';

    // Demo only: no request is made. A brief pause mirrors what pledging
    // will feel like once it calls the real API.
    window.setTimeout(() => {
      setCookie(COOKIE_NAME, tier);
      window.location.href = `/pledged/${tier}`;
    }, 500);
  });
})();
