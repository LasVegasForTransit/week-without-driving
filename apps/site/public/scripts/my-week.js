/**
 * My week: fills in the page for the person signed in on this phone.
 *
 * This is a front-end demo. There is no backend yet, so shared trips and
 * reminder choices are kept in this browser's localStorage
 * under `lvwwd_me` (written by /scripts/sign-up.js) and nothing is sent.
 * The real version reads and writes the same things through the Worker.
 *
 * Before October 1, 2026 sharing trips waits for the week. Add
 * ?preview=during to see the page as it looks on Day 3, with trips already
 * shared on Days 1 and 2, for screenshots.
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

  // Shared trips, one per day: { day, modes, hard, link, screenshot }.
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
    done: 'Trip shared',
    today: 'Today, no trip shared yet',
    missed: 'No trip shared',
    future: 'Coming up',
  };

  // Where a shared trip's link can come from: public posts on these apps.
  const POST_HOSTS = [
    'instagram.com',
    'facebook.com',
    'fb.com',
    'tiktok.com',
    'threads.net',
    'threads.com',
    'x.com',
    'twitter.com',
    'bsky.app',
  ];

  function isPostLink(text) {
    try {
      const url = new URL(text);
      const host = url.hostname.replace(/^www\./, '');
      return (
        url.protocol === 'https:' &&
        POST_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
      );
    } catch {
      return false;
    }
  }

  function renderDays(today, sharedDays) {
    setText('[data-me-count]', String(Math.min(sharedDays.size, MAX_ENTRIES)));
    document.querySelectorAll('[data-day]').forEach((box) => {
      const n = Number(box.getAttribute('data-day'));
      let state = 'future';
      if (sharedDays.has(n)) state = 'done';
      else if (n === today) state = 'today';
      else if (n < today) state = 'missed';
      box.setAttribute('data-state', state);
      const sr = box.querySelector('[data-day-status]');
      if (sr) sr.textContent = DAY_STATUS[state];
      if (state === 'today') box.setAttribute('aria-current', 'date');
      else box.removeAttribute('aria-current');
    });
  }

  function showClosed(today) {
    const text =
      today === 0
        ? 'Sharing trips opens October 1. Turn on a reminder so you don’t miss it.'
        : 'The week is over. We’ll draw the winner by October 15, 2026.';
    setText('[data-me-phase]', text);
    const closed = document.querySelector('[data-log-closed]');
    if (closed) {
      closed.hidden = false;
      closed.textContent = text;
    }
  }

  function renderEntries() {
    const today = todayNumber();
    const shared = trips();
    const sharedDays = new Set(shared.map((t) => t.day));
    renderDays(today, sharedDays);

    const form = document.querySelector('[data-trip-form]');
    const done = document.querySelector('[data-trip-done]');
    const closed = document.querySelector('[data-log-closed]');
    [form, done, closed].forEach((el) => {
      if (el) el.hidden = true;
    });
    if (today === 0 || today > 8) return showClosed(today);

    if (sharedDays.has(today)) {
      setText('[data-me-phase]', `Day ${today} of 8. Nice work.`);
      setText(
        '[data-trip-done-title]',
        `Day ${today} entered. That’s entry ${Math.min(sharedDays.size, MAX_ENTRIES)} of ${MAX_ENTRIES}.`,
      );
      if (done) done.hidden = false;
    } else {
      setText('[data-me-phase]', `Day ${today} of 8. Share a trip without the car today to enter.`);
      if (form) form.hidden = false;
    }
    return undefined;
  }

  function chosenModes(form) {
    return [...form.querySelectorAll('input[name="mode"]:checked')].map((box) => box.value);
  }

  function initPicture(form) {
    const step = form.querySelector('[data-share-step]');
    const kit = form.querySelector('[data-share-kit]');
    form.querySelector('[data-make-picture]')?.addEventListener('click', async () => {
      const modes = chosenModes(form);
      if (modes.length === 0) {
        setText('[data-trip-error]', 'First pick how you got around, in step 1.');
        return;
      }
      setText('[data-trip-error]', '');
      await window.lvwwdShareTrip?.setUp(step, { day: todayNumber(), modes });
      if (kit) kit.hidden = false;
    });
  }

  function initScreenshot(form) {
    const input = form.querySelector('[data-screenshot-input]');
    input?.addEventListener('change', () => {
      const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
      if (!file) return;
      if (file.size > MAX_PHOTO_BYTES) {
        setText('[data-trip-error]', 'That screenshot is over 10 MB. Try a smaller one.');
        input.value = '';
        return;
      }
      setText('[data-trip-error]', '');
      setText('[data-screenshot-label]', `Screenshot added: ${file.name}`);
    });
  }

  // Returns the trip to save, or an error message.
  function readTrip(form) {
    const modes = chosenModes(form);
    if (modes.length === 0) return 'Pick how you got around, in step 1.';
    const linkField = form.elements.namedItem('link');
    const link = linkField instanceof HTMLInputElement ? linkField.value.trim() : '';
    const shot = form.querySelector('[data-screenshot-input]');
    const hasShot = shot instanceof HTMLInputElement && Boolean(shot.files?.length);
    if (!link && !hasShot) return 'Paste the link to your post, or add a screenshot of it.';
    if (link && !isPostLink(link)) {
      return 'Paste the link to a post on Instagram, Facebook, TikTok, Threads, X or Bluesky.';
    }
    const hard = form.elements.namedItem('hard');
    const share = form.elements.namedItem('share');
    return {
      day: todayNumber(),
      modes,
      hard: hard instanceof HTMLTextAreaElement ? hard.value.trim() : '',
      link,
      screenshot: hasShot,
      share: share instanceof HTMLInputElement && share.checked,
    };
  }

  function initEntries() {
    renderEntries();
    const form = document.querySelector('[data-trip-form]');
    if (!(form instanceof HTMLFormElement)) return;
    const tagNote = form.querySelector('[data-tag-note]');
    if (tagNote && me.instagram) tagNote.hidden = false;
    initPicture(form);
    initScreenshot(form);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const trip = readTrip(form);
      if (typeof trip === 'string') {
        setText('[data-trip-error]', trip);
        return;
      }
      setText('[data-trip-error]', '');
      me.trips = [...trips().filter((t) => t.day !== trip.day), trip].sort((x, y) => x.day - y.day);
      saveMe(me);
      renderEntries();
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
  initReminders();
  initSignOut();
})();
