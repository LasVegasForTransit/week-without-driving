/**
 * My week: fills in the page for the person signed in on this phone.
 *
 * This is a front-end demo. There is no backend yet, so check-ins, the
 * photo and reminder choices are kept in this browser's localStorage
 * under `lvwwd_me` (written by /scripts/sign-up.js) and nothing is sent.
 * The real version reads and writes the same things through the Worker.
 *
 * Before October 1, 2026 the check-in button waits for the week. Add
 * ?preview=during to see the page as it looks on Day 3, with Days 1 and 2
 * already checked in, for screenshots.
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

  function checkedDays() {
    const days = new Set(me.checkins ?? []);
    if (preview) {
      days.add(1);
      days.add(2);
    }
    return days;
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

  function initEntries() {
    // Entries.
    const button = document.querySelector('[data-checkin]');
    const label = document.querySelector('[data-checkin-label]');
    const status = document.querySelector('[data-checkin-status]');

    function renderEntries() {
      const today = todayNumber();
      const done = checkedDays();
      setText('[data-me-count]', String(Math.min(done.size, MAX_ENTRIES)));

      document.querySelectorAll('[data-day]').forEach((box) => {
        const n = Number(box.getAttribute('data-day'));
        let state = 'future';
        if (done.has(n)) state = 'done';
        else if (n === today) state = 'today';
        else if (n < today) state = 'missed';
        box.setAttribute('data-state', state);
        const sr = box.querySelector('[data-day-status]');
        if (sr) {
          sr.textContent = {
            done: 'Checked in',
            today: 'Today, not checked in yet',
            missed: 'Missed',
            future: 'Coming up',
          }[state];
        }
        if (state === 'today') box.setAttribute('aria-current', 'date');
        else box.removeAttribute('aria-current');
      });

      if (!(button instanceof HTMLButtonElement) || !label) return;
      if (today === 0) {
        button.disabled = true;
        label.textContent = 'Check-ins open October 1';
        setText(
          '[data-me-phase]',
          'Check-ins open October 1. Come back then, or turn on a reminder.',
        );
      } else if (today > 8) {
        button.disabled = true;
        label.textContent = 'Check-ins are closed';
        setText('[data-me-phase]', 'The week is over. We’ll draw the winner by October 15, 2026.');
      } else if (done.has(today)) {
        button.disabled = true;
        label.textContent = 'You’re checked in for today';
        setText('[data-me-phase]', `Day ${today} of 8. Come back tomorrow for your next entry.`);
      } else {
        button.disabled = false;
        label.textContent = 'Check in for today';
        setText('[data-me-phase]', `Day ${today} of 8. Check in once today for one more entry.`);
      }
    }

    renderEntries();

    button?.addEventListener('click', () => {
      const today = todayNumber();
      if (today < 1 || today > 8) return;
      const days = new Set(me.checkins ?? []);
      days.add(today);
      me.checkins = [...days].sort((a, b) => a - b);
      saveMe(me);
      renderEntries();
      const count = Math.min(checkedDays().size, MAX_ENTRIES);
      if (status)
        status.textContent = `You’re checked in. That’s entry ${count} of ${MAX_ENTRIES}.`;
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
