/**
 * My week: fills in the page for the person signed in on this phone, from
 * the Worker (GET /api/me, through /scripts/participant-api.js), and sends
 * logged trips, photos, reminder choices and sign-out back to it. After a
 * trip is logged, /scripts/share-trip.js makes the picture to share.
 *
 * The Worker decides which day it is, in Las Vegas time, so a phone with
 * the wrong clock can't log a trip early. The preview Worker pins the day
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
    done: 'Trip logged',
    today: 'Today, no trip logged yet',
    missed: 'No trip logged',
    future: 'Coming up',
  };

  let shareShownFor = 0;

  function showShare(trip, count) {
    const done = document.querySelector('[data-log-done]');
    if (!done) return;
    done.hidden = false;
    setText(
      '[data-log-done-title]',
      `Day ${trip.day} logged. That’s entry ${count} of ${MAX_ENTRIES}.`,
    );
    if (shareShownFor !== trip.day) {
      shareShownFor = trip.day;
      window.lvwwdShareTrip?.setUp(done, { ...trip, dayCount: count });
    }
  }

  function renderLog(today, done) {
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
    const todays = (me.trips ?? []).find((t) => t.day === today);
    if (todays || done.has(today)) {
      setText(
        '[data-me-phase]',
        `Day ${today} of 8. Nice work. Come back tomorrow for another entry.`,
      );
      showShare(todays ?? { day: today, modes: [] }, Math.min(done.size, MAX_ENTRIES));
    } else {
      setText('[data-me-phase]', `Day ${today} of 8. Skip the car today for one more entry.`);
      if (form) form.hidden = false;
    }
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
    renderLog(me.today, done);
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

  function bindLog() {
    const form = document.querySelector('[data-log-form]');
    if (!(form instanceof HTMLFormElement)) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const modes = [...form.querySelectorAll('input[name="mode"]:checked')].map(
        (box) => box.value,
      );
      if (modes.length === 0) {
        setText('[data-log-error]', 'Pick how you got around. Pick more than one if you like.');
        return undefined;
      }
      setText('[data-log-error]', '');
      const hardField = form.elements.namedItem('hard');
      const hard = hardField instanceof HTMLTextAreaElement ? hardField.value.trim() : '';
      const button = form.querySelector('[data-log-submit]');
      if (button instanceof HTMLButtonElement) button.disabled = true;
      const { ok, status, data } = await api.call('POST', '/api/checkin', { modes, hard });
      if (button instanceof HTMLButtonElement) button.disabled = false;
      if (status === 401) return showSignedOut();
      if (!ok) {
        setText('[data-log-error]', data.message);
        return undefined;
      }
      me.days = data.days;
      me.trips = data.trips;
      renderEntries();
      return undefined;
    });
  }

  function bindPhoto() {
    const photoForm = document.querySelector('[data-photo-form]');
    const input = document.querySelector('[data-photo-input]');
    const preview = document.querySelector('[data-photo-preview]');
    const submit = document.querySelector('[data-photo-submit]');
    if (!(photoForm instanceof HTMLFormElement) || !(input instanceof HTMLInputElement)) return;
    const canSend = (yes) => {
      if (submit instanceof HTMLButtonElement) submit.disabled = !yes;
    };

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      setText('[data-photo-status]', '');
      if (file.size > MAX_PHOTO_BYTES) {
        setText('[data-photo-status]', 'That photo is over 10 MB. Try a screenshot instead.');
        return canSend(false);
      }
      if (preview instanceof HTMLImageElement) {
        preview.src = URL.createObjectURL(file);
        preview.alt = 'The photo you chose';
        preview.hidden = false;
      }
      setText('[data-photo-pick-label]', 'Choose a different photo');
      return canSend(true);
    });

    photoForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const file = input.files?.[0];
      if (!file) return;
      const body = new FormData();
      body.set('photo', file);
      body.set('share', photoForm.elements.namedItem('share')?.checked ? '1' : '0');
      canSend(false);
      setText('[data-photo-status]', 'Adding your photo…');
      const { ok, data } = await api.call('POST', '/api/photo', body);
      setText('[data-photo-status]', ok ? 'Photo added. Thank you!' : data.message);
      if (!ok) canSend(true);
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
    bindLog();
    bindPhoto();
    bindReminders();
    bindSignOut();
    return undefined;
  }

  void start();
})();
