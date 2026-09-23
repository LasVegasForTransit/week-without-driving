/**
 * My week: fills in the page for the person signed in on this phone.
 *
 * This is a front-end demo. There is no backend yet, so logged trips, the
 * photo and reminder choices are kept in this browser's localStorage
 * under `lvwwd_me` (written by /scripts/sign-up.js) and nothing is sent.
 * The real version reads and writes the same things through the Worker.
 *
 * Before October 1, 2026 trip logging waits for the week. Add
 * ?preview=during to see the page as it looks on Day 3, with trips already
 * logged on Days 1 and 2, for screenshots.
 */
(() => {
  const STORE = 'lvwwd_me';
  const FLAG = 'lvwwd_signed_in';
  const MAX_ENTRIES = 8;
  // Midnight at the start of October 1, 2026, Las Vegas time.
  const WEEK_START = Date.parse('2026-10-01T07:00:00Z');
  const DAY = 86_400_000;
  const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

  const out = document.querySelector('[data-me-out]');
  const inside = document.querySelector('[data-me-in]');
  if (!out || !inside) return;

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
      // Storage refused (private browsing): the page still works until reload.
    }
  }

  const me = readMe();
  const signedIn = document.cookie.split('; ').includes(`${FLAG}=1`);
  if (!signedIn || !me) {
    out.hidden = false;
    return;
  }
  inside.hidden = false;

  const params = new URLSearchParams(window.location.search);
  const preview = params.get('preview') === 'during';

  // Which day of the week it is: 0 before October 1, 1–8 during, 9 after.
  function todayNumber() {
    if (preview) return 3;
    const now = Date.now();
    if (now < WEEK_START) return 0;
    return Math.min(Math.floor((now - WEEK_START) / DAY) + 1, 9);
  }

  // Logged trips, one per day: { day, modes, hard }. Older demo data kept
  // plain day numbers under `checkins`.
  function trips() {
    const logged = me.trips ?? (me.checkins ?? []).map((day) => ({ day, modes: ['walk'] }));
    if (preview && !logged.some((t) => t.day === 1)) {
      return [{ day: 1, modes: ['bus'] }, { day: 2, modes: ['walk'] }, ...logged];
    }
    return logged;
  }

  function mask(contact, type) {
    if (!contact) return '';
    if (type === 'phone') {
      const digits = contact.replace(/\D/g, '');
      return `(•••) •••-${digits.slice(-4)}`;
    }
    const [name, domain] = contact.split('@');
    return `${name.slice(0, 1)}•••@${domain}`;
  }

  function setText(selector, text) {
    const el = document.querySelector(selector);
    if (el) el.textContent = text;
  }

  function initGreetingAndDetails() {
    // Greeting and one-off banners.
    setText('[data-me-name]', me.firstName);
    const welcome = document.querySelector('[data-me-welcome]');
    if (welcome && (params.get('welcome') === '1' || params.get('saved') === '1')) {
      welcome.hidden = false;
      setText(
        '[data-me-welcome-text]',
        params.get('saved') === '1' ? 'Your details are saved.' : 'You’re signed up to win.',
      );
    }

    // Details.
    setText('[data-me-field="firstName"]', me.firstName);
    setText('[data-me-field="contact"]', mask(me.contact, me.contactType));
    setText('[data-me-field="zip"]', me.zip);
    setText('[data-me-field="instagram"]', me.instagram ? `@${me.instagram}` : 'Not added');
    setText(
      '[data-me-link-line]',
      `We sent your link to ${mask(me.contact, me.contactType)}. Open it on any phone to come back here.`,
    );
  }

  const DAY_STATUS = {
    done: 'Trip logged',
    today: 'Today, no trip logged yet',
    missed: 'No trip logged',
    future: 'Coming up',
  };

  function renderDays(today, loggedDays) {
    setText('[data-me-count]', String(Math.min(loggedDays.size, MAX_ENTRIES)));
    document.querySelectorAll('[data-day]').forEach((box) => {
      const n = Number(box.getAttribute('data-day'));
      let state = 'future';
      if (loggedDays.has(n)) state = 'done';
      else if (n === today) state = 'today';
      else if (n < today) state = 'missed';
      box.setAttribute('data-state', state);
      const sr = box.querySelector('[data-day-status]');
      if (sr) sr.textContent = DAY_STATUS[state];
      if (state === 'today') box.setAttribute('aria-current', 'date');
      else box.removeAttribute('aria-current');
    });
  }

  function showShare(trip, count) {
    const done = document.querySelector('[data-log-done]');
    if (!done) return;
    done.hidden = false;
    setText(
      '[data-log-done-title]',
      `Day ${trip.day} logged. That’s entry ${count} of ${MAX_ENTRIES}.`,
    );
    window.lvwwdShareTrip?.setUp(done, { ...trip, dayCount: count });
  }

  function renderEntries() {
    const today = todayNumber();
    const logged = trips();
    const loggedDays = new Set(logged.map((t) => t.day));
    renderDays(today, loggedDays);

    const form = document.querySelector('[data-log-form]');
    const closed = document.querySelector('[data-log-closed]');
    if (form) form.hidden = true;
    if (closed) closed.hidden = true;

    if (today === 0 || today > 8) {
      const text =
        today === 0
          ? 'Logging trips opens October 1. Turn on a reminder so you don’t miss it.'
          : 'The week is over. We’ll draw the winner by October 15, 2026.';
      setText('[data-me-phase]', text);
      if (closed) {
        closed.hidden = false;
        closed.textContent = text;
      }
      return;
    }
    const todays = logged.find((t) => t.day === today);
    if (todays) {
      setText(
        '[data-me-phase]',
        `Day ${today} of 8. Nice work. Come back tomorrow for another entry.`,
      );
      showShare(todays, Math.min(loggedDays.size, MAX_ENTRIES));
    } else {
      setText('[data-me-phase]', `Day ${today} of 8. Skip the car today for one more entry.`);
      if (form) form.hidden = false;
    }
  }

  function initEntries() {
    renderEntries();
    const form = document.querySelector('[data-log-form]');
    if (!(form instanceof HTMLFormElement)) return;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const today = todayNumber();
      const modes = [...form.querySelectorAll('input[name="mode"]:checked')].map(
        (box) => box.value,
      );
      if (modes.length === 0) {
        setText('[data-log-error]', 'Pick how you got around. Pick more than one if you like.');
        return;
      }
      setText('[data-log-error]', '');
      const hard = form.elements.namedItem('hard');
      const trip = {
        day: today,
        modes,
        hard: hard instanceof HTMLTextAreaElement ? hard.value.trim() : '',
      };
      me.trips = [...trips().filter((t) => t.day !== today), trip].sort((x, y) => x.day - y.day);
      saveMe(me);
      renderEntries();
    });
  }

  function initPhoto() {
    // Photo: optional, never an extra entry.
    const photoForm = document.querySelector('[data-photo-form]');
    const photoInput = document.querySelector('[data-photo-input]');
    const photoPreview = document.querySelector('[data-photo-preview]');
    const photoSubmit = document.querySelector('[data-photo-submit]');
    const photoStatus = document.querySelector('[data-photo-status]');

    photoInput?.addEventListener('change', () => {
      if (!(photoInput instanceof HTMLInputElement) || !photoInput.files?.[0]) return;
      const file = photoInput.files[0];
      if (photoStatus) photoStatus.textContent = '';
      if (file.size > MAX_PHOTO_BYTES) {
        if (photoStatus)
          photoStatus.textContent = 'That photo is over 10 MB. Try a screenshot instead.';
        if (photoSubmit instanceof HTMLButtonElement) photoSubmit.disabled = true;
        return;
      }
      if (photoPreview instanceof HTMLImageElement) {
        photoPreview.src = URL.createObjectURL(file);
        photoPreview.alt = 'The photo you chose';
        photoPreview.hidden = false;
      }
      setText('[data-photo-pick-label]', 'Choose a different photo');
      if (photoSubmit instanceof HTMLButtonElement) photoSubmit.disabled = false;
    });

    photoForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!(photoForm instanceof HTMLFormElement)) return;
      const share = photoForm.elements.namedItem('share');
      me.photos = [
        ...(me.photos ?? []),
        { day: todayNumber(), share: share instanceof HTMLInputElement && share.checked },
      ];
      saveMe(me);
      if (photoSubmit instanceof HTMLButtonElement) photoSubmit.disabled = true;
      if (photoStatus) photoStatus.textContent = 'Photo added. Thank you!';
    });
  }

  function initReminders() {
    // Reminders: the text and email options match how this person signed up.
    const reminders = me.reminders ?? {};
    const remindStatus = document.querySelector('[data-remind-status]');
    const contactRow = document.querySelector(
      `[data-remind-row="${me.contactType === 'phone' ? 'text' : 'email'}"]`,
    );
    if (contactRow) contactRow.hidden = false;
    document.querySelectorAll('[data-remind]').forEach((box) => {
      if (!(box instanceof HTMLInputElement)) return;
      const kind = box.getAttribute('data-remind');
      box.checked = Boolean(reminders[kind]);
      box.addEventListener('change', () => {
        reminders[kind] = box.checked;
        me.reminders = reminders;
        saveMe(me);
        if (remindStatus) {
          remindStatus.textContent = Object.values(reminders).some(Boolean)
            ? 'Reminders are on. The first one comes October 1.'
            : 'Reminders are off.';
        }
      });
    });
  }

  function initSignOut() {
    // Sign out of this phone only.
    document.querySelector('[data-signout]')?.addEventListener('click', () => {
      try {
        window.localStorage.removeItem(STORE);
      } catch {
        // Nothing stored.
      }
      document.cookie = `${FLAG}=; path=/; max-age=0; samesite=lax`;
      window.location.href = '/';
    });
  }

  initGreetingAndDetails();
  initEntries();
  initPhoto();
  initReminders();
  initSignOut();
})();
