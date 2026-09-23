/**
 * My week: fills in the page for the person signed in on this phone, from
 * the Worker (GET /api/me, through /scripts/participant-api.js), and sends
 * shared trips (the giveaway entries), reminder choices and sign-out back
 * to it. /scripts/share-trip.js makes the picture people can post.
 *
 * The Worker decides which day it is, in Las Vegas time, so a phone with
 * the wrong clock can't enter a trip early. The preview Worker pins the day
 * (CHECKIN_PREVIEW_DAY) so the week can be tried before October.
 */
(() => {
  const api = window.lvwwdApi;
  const out = document.querySelector('[data-me-out]');
  const inside = document.querySelector('[data-me-in]');
  const offline = document.querySelector('[data-me-offline]');
  if (!api || !out || !inside) return;

  const MAX_ENTRIES = 8;
  const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
  const PREVIEW_KEY = 'lvwwd_preview_link';
  const params = new URLSearchParams(window.location.search);
  let me = null;

  function setText(selector, text) {
    const el = document.querySelector(selector);
    if (el) el.textContent = text;
  }

  function showSignedOut() {
    inside.hidden = true;
    out.hidden = false;
  }

  function dayState(n, today, done) {
    if (done.has(n)) return 'done';
    if (n === today) return 'today';
    return n < today ? 'missed' : 'future';
  }

  const DAY_STATUS = {
    done: 'Trip shared',
    today: 'Today, no trip shared yet',
    missed: 'No trip shared',
    future: 'Coming up',
  };

  // Public posts can come from these apps; the Worker checks the same list.
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

  function renderToday(today, done) {
    const form = document.querySelector('[data-trip-form]');
    const entered = document.querySelector('[data-trip-done]');
    const closed = document.querySelector('[data-log-closed]');
    [form, entered, closed].forEach((el) => {
      if (el) el.hidden = true;
    });
    if (today === 0 || today > 8) return showClosed(today);
    if (done.has(today)) {
      setText('[data-me-phase]', `Day ${today} of 8. Nice work.`);
      setText(
        '[data-trip-done-title]',
        `Day ${today} entered. That’s entry ${Math.min(done.size, MAX_ENTRIES)} of ${MAX_ENTRIES}.`,
      );
      if (entered) entered.hidden = false;
    } else {
      setText('[data-me-phase]', `Day ${today} of 8. Share a trip without the car today to enter.`);
      if (form) form.hidden = false;
    }
    return undefined;
  }

  function renderEntries() {
    const done = new Set(me.days);
    setText('[data-me-count]', String(Math.min(done.size, MAX_ENTRIES)));
    document.querySelectorAll('[data-day]').forEach((box) => {
      const state = dayState(Number(box.getAttribute('data-day')), me.today, done);
      box.setAttribute('data-state', state);
      const sr = box.querySelector('[data-day-status]');
      if (sr) sr.textContent = DAY_STATUS[state];
      if (state === 'today') box.setAttribute('aria-current', 'date');
      else box.removeAttribute('aria-current');
    });
    renderToday(me.today, done);
  }

  function renderDetails() {
    setText('[data-me-name]', me.firstName);
    setText('[data-me-field="firstName"]', me.firstName);
    setText('[data-me-field="contact"]', me.contactMasked);
    setText('[data-me-field="zip"]', me.zip);
    setText('[data-me-field="instagram"]', me.instagram ? `@${me.instagram}` : 'Not added');
    setText(
      '[data-me-link-line]',
      `We sent your link to ${me.contactMasked}. Open it on any phone to come back here.`,
    );
  }

  function renderBanners() {
    const welcome = document.querySelector('[data-me-welcome]');
    const saved = params.get('saved') === '1';
    if (welcome && (params.get('welcome') === '1' || saved)) {
      welcome.hidden = false;
      setText(
        '[data-me-welcome-text]',
        saved ? 'Your details are saved.' : 'You’re signed up to win.',
      );
    }
    // The preview Worker hands back the link it would have sent; show it once.
    try {
      const link = window.sessionStorage.getItem(PREVIEW_KEY);
      window.sessionStorage.removeItem(PREVIEW_KEY);
      api.showPreviewLink(document.querySelector('[data-preview-link]'), link);
    } catch {
      // No storage, no preview box.
    }
  }

  function chosenModes(form) {
    return [...form.querySelectorAll('input[name="mode"]:checked')].map((box) => box.value);
  }

  function bindPicture(form) {
    const step = form.querySelector('[data-share-step]');
    const kit = form.querySelector('[data-share-kit]');
    form.querySelector('[data-make-picture]')?.addEventListener('click', async () => {
      const modes = chosenModes(form);
      if (modes.length === 0) {
        setText('[data-trip-error]', 'First pick how you got around, in step 1.');
        return;
      }
      setText('[data-trip-error]', '');
      await window.lvwwdShareTrip?.setUp(step, { day: me.today, modes });
      if (kit) kit.hidden = false;
    });
  }

  function bindScreenshot(form) {
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

  // The entry as a form for the Worker, or an error message to show.
  function tripForm(form) {
    const modes = chosenModes(form);
    if (modes.length === 0) return 'Pick how you got around, in step 1.';
    const linkField = form.elements.namedItem('link');
    const link = linkField instanceof HTMLInputElement ? linkField.value.trim() : '';
    const shot = form.querySelector('[data-screenshot-input]');
    const file = shot instanceof HTMLInputElement ? shot.files?.[0] : undefined;
    if (!link && !file) return 'Paste the link to your post, or add a screenshot of it.';
    if (link && !isPostLink(link)) {
      return 'Paste the link to a post on Instagram, Facebook, TikTok, Threads, X or Bluesky.';
    }
    const body = new FormData();
    modes.forEach((mode) => body.append('mode', mode));
    const hard = form.elements.namedItem('hard');
    if (hard instanceof HTMLTextAreaElement) body.set('hard', hard.value.trim());
    if (link) body.set('link', link);
    if (file) body.set('screenshot', file);
    const share = form.elements.namedItem('share');
    if (share instanceof HTMLInputElement && share.checked) body.set('share', '1');
    return body;
  }

  function bindTrip() {
    const form = document.querySelector('[data-trip-form]');
    if (!(form instanceof HTMLFormElement)) return;
    const tagNote = form.querySelector('[data-tag-note]');
    if (tagNote && me.instagram) tagNote.hidden = false;
    bindPicture(form);
    bindScreenshot(form);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const body = tripForm(form);
      if (typeof body === 'string') {
        setText('[data-trip-error]', body);
        return undefined;
      }
      setText('[data-trip-error]', '');
      const button = form.querySelector('[data-trip-submit]');
      if (button instanceof HTMLButtonElement) button.disabled = true;
      const { ok, status, data } = await api.call('POST', '/api/checkin', body);
      if (button instanceof HTMLButtonElement) button.disabled = false;
      if (status === 401) return showSignedOut();
      if (!ok) {
        setText('[data-trip-error]', data.message);
        return undefined;
      }
      me.days = data.days;
      me.trips = data.trips;
      renderEntries();
      return undefined;
    });
  }

  function bindReminders() {
    const row = document.querySelector(
      `[data-remind-row="${me.contactType === 'phone' ? 'text' : 'email'}"]`,
    );
    if (row) row.hidden = false;
    document.querySelectorAll('[data-remind]').forEach((box) => {
      if (!(box instanceof HTMLInputElement)) return;
      const kind = box.getAttribute('data-remind');
      box.checked = Boolean(me.reminders?.[kind]);
      box.addEventListener('change', async () => {
        const { ok, data } = await api.call('POST', '/api/reminders', { [kind]: box.checked });
        if (!ok) {
          box.checked = !box.checked;
          setText('[data-remind-status]', data.message);
          return;
        }
        me.reminders = data.reminders;
        setText(
          '[data-remind-status]',
          Object.values(data.reminders).some(Boolean)
            ? 'Reminders are on. The first one comes October 1.'
            : 'Reminders are off.',
        );
      });
    });
  }

  // Signs out this phone only; other phones stay signed in.
  function bindSignOut() {
    document.querySelector('[data-signout]')?.addEventListener('click', async () => {
      const { ok, status, data } = await api.call('POST', '/api/signout', {});
      if (ok || status === 401) window.location.href = '/';
      else setText('[data-signout-status]', data.message);
    });
  }

  async function start() {
    // Without the flag cookie this phone isn't signed in; don't ask.
    if (!/(?:^|; )lvwwd_signed_in=1(?:;|$)/.test(document.cookie)) return showSignedOut();
    const { ok, status, data } = await api.call('GET', '/api/me');
    if (status === 401) return showSignedOut();
    if (!ok) {
      if (offline) {
        offline.textContent = data.message;
        offline.hidden = false;
      }
      return undefined;
    }
    me = data;
    renderDetails();
    renderBanners();
    renderEntries();
    inside.hidden = false;
    bindTrip();
    bindReminders();
    bindSignOut();
    return undefined;
  }

  void start();
})();
