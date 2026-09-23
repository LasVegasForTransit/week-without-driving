/**
 * Behaviour for the three participant kit pages (/pledged/trip, /day,
 * /week): the phase line, "Share your pledge", the daily reminder
 * sign-ups, and the "Keep going after the week" newsletter card.
 *
 * This is a front-end demo — there is no backend yet. Every sign-up here
 * validates and shows the real next-step screen without sending anything:
 *   - Sharing uses the Web Share API (or copies the link) only.
 *   - "Turn on notifications" and "Text me reminders" show the same
 *     confirmation text the finished feature will show, without asking for
 *     real browser permission or sending a real text. Docket tasks
 *     "Send daily reminders by web push" (01M357CWJ43YCWW06NMZ5KEX9S) and
 *     "Send daily reminders by text message" (01M357CWN82BPR5AFXH3KR72NB)
 *     wire these up for real.
 *   - "Join the newsletter" shows the same success message the finished
 *     Beehiiv sign-up will show. Docket tasks
 *     "Subscribe participants to LVBT's newsletter through Beehiiv"
 *     (01M35GE93Y8Q76JN782PBB8K1S) and "Build the 'Keep going after the
 *     week' card…" (01M35GE9ADPBX99382W8B5V08A) connect it for real.
 */
(() => {
  const COOKIE_NAME = 'lvwwd_tier';
  // Kept in sync by hand with src/lib/wwd.ts — see the note in
  // pledge-form.js for why this classic script can't import it directly.
  const WEEK_START = Date.parse('2026-10-01T07:00:00Z');
  const WEEK_END = Date.parse('2026-10-09T07:00:00Z');
  // Reminders stop going out after 8:00 am Las Vegas time on October 8,
  // the day of the last message (daily-messages.md, "Other states").
  const REMINDERS_CLOSE = Date.parse('2026-10-08T15:00:00Z');
  const DAY_MS = 24 * 60 * 60 * 1000;
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function clearCookie(name) {
    document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
  }

  function initPhaseLine() {
    const phaseLine = document.querySelector('[data-phase-line]');
    if (!phaseLine) return;

    const now = Date.now();
    if (now < WEEK_START) {
      phaseLine.textContent = 'The week starts October 1.';
    } else if (now >= WEEK_END) {
      phaseLine.textContent = 'The week has ended. Thanks for taking part.';
      const changeLink = document.querySelector('[data-change-pledge]');
      if (changeLink) changeLink.hidden = true;
    } else {
      const day = Math.floor((now - WEEK_START) / DAY_MS) + 1;
      phaseLine.textContent = `The week is on: day ${day} of 8.`;
    }
  }

  function initStartNewPledge() {
    document.querySelectorAll('[data-start-new-pledge]').forEach((link) => {
      link.addEventListener('click', () => clearCookie(COOKIE_NAME));
    });
  }

  async function shareOrCopyLink(shareButton, shareStatus) {
    const tierName = shareButton.getAttribute('data-tier-name') || 'Week Without Driving';
    const shareData = {
      title: 'Week Without Driving Las Vegas',
      text: `I’m in for ${tierName} during Week Without Driving Las Vegas, October 1 to 8, 2026. By bus, walking or rolling, biking, or getting a ride — it all counts.`,
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // The visitor closed the share sheet without picking an app.
      }
      return;
    }

    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareData.url);
        if (shareStatus)
          shareStatus.textContent = 'Link copied. Paste it anywhere to share your pledge.';
        return;
      } catch {
        // Fall through to the manual-copy message below.
      }
    }
    if (shareStatus) shareStatus.textContent = `Copy this link to share: ${shareData.url}`;
  }

  function initSharePledge() {
    const shareButton = document.querySelector('[data-share-pledge]');
    if (!shareButton) return;
    const shareStatus = document.querySelector('[data-share-status]');
    shareButton.addEventListener('click', () => shareOrCopyLink(shareButton, shareStatus));
  }

  // Notifications only work from the Home Screen on iPhone/iPad; the
  // "Show me how" sheet itself belongs to the offline install Epic, so
  // this demo shows the note in its place instead of the button.
  function isIosBrowser() {
    return (
      /iP(hone|od|ad)/.test(navigator.userAgent) &&
      !window.matchMedia('(display-mode: standalone)').matches
    );
  }

  function initPushNotifications() {
    const pushDefault = document.querySelector('[data-push-default]');
    const pushIos = document.querySelector('[data-push-ios]');
    const pushOn = document.querySelector('[data-push-on]');
    const pushOnMessage = document.querySelector('[data-push-on-message]');
    const pushEnable = document.querySelector('[data-push-enable]');
    const pushStop = document.querySelector('[data-push-stop]');
    if (!pushDefault || !pushEnable) return;

    if (isIosBrowser() && pushIos) {
      pushDefault.hidden = true;
      pushIos.hidden = false;
      return;
    }
    if (!pushOn || !pushOnMessage) return;

    pushEnable.addEventListener('click', () => {
      pushOnMessage.textContent =
        Date.now() < WEEK_START
          ? 'Reminders are on for this device. Your first one arrives October 1 at about 8:00 am.'
          : 'Reminders are on for this device. The next one arrives at about 8:00 am.';
      pushDefault.hidden = true;
      pushOn.hidden = false;
    });
    pushStop?.addEventListener('click', () => {
      pushOn.hidden = true;
      pushDefault.hidden = false;
    });
  }

  function submitTextSignup(event, fields) {
    event.preventDefault();
    const { textForm, phoneField, textError, textConfirm, textConfirmMessage } = fields;
    if (textError) textError.textContent = '';

    const digits = (phoneField?.value || '').replace(/\D/g, '').replace(/^1/, '');
    if (digits.length !== 10) {
      if (textError)
        textError.textContent = 'Enter a 10-digit US mobile number, like (702) 555-0123.';
      phoneField?.focus();
      return;
    }

    const formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    if (textConfirmMessage) {
      textConfirmMessage.textContent = `Check your phone. We texted ${formatted}. Reply YES to that text to confirm. No reminders are sent until you do.`;
    }
    textForm.hidden = true;
    if (textConfirm) textConfirm.hidden = false;
  }

  function initTextMessages() {
    const textForm = document.querySelector('[data-text-form]');
    const textConsent = document.querySelector('[data-text-consent]');
    const textSubmit = document.querySelector('[data-text-submit]');
    if (!textForm || !textConsent || !textSubmit) return;

    const fields = {
      textForm,
      phoneField: document.getElementById('reminder-phone'),
      textError: document.querySelector('[data-text-error]'),
      textConfirm: document.querySelector('[data-text-confirm]'),
      textConfirmMessage: document.querySelector('[data-text-confirm-message]'),
    };

    textConsent.addEventListener('change', () => {
      textSubmit.disabled = !textConsent.checked;
    });
    textForm.addEventListener('submit', (event) => submitTextSignup(event, fields));
  }

  function initDailyReminders() {
    const reminderLive = document.querySelector('[data-reminder-live]');
    const reminderClosed = document.querySelector('[data-reminder-closed]');
    if (reminderLive && reminderClosed && Date.now() >= REMINDERS_CLOSE) {
      reminderLive.hidden = true;
      reminderClosed.hidden = false;
      return;
    }
    initPushNotifications();
    initTextMessages();
  }

  function submitNewsletterSignup(event, fields) {
    event.preventDefault();
    const { newsletterEmail, newsletterStatus, newsletterSubmit } = fields;
    const email = newsletterEmail instanceof HTMLInputElement ? newsletterEmail.value.trim() : '';

    if (!email) {
      if (newsletterStatus) newsletterStatus.textContent = 'Enter your email address.';
      newsletterEmail?.focus();
      return;
    }
    if (!EMAIL_PATTERN.test(email)) {
      if (newsletterStatus)
        newsletterStatus.textContent = 'Enter a full email address, like name@example.com.';
      newsletterEmail?.focus();
      return;
    }

    if (newsletterSubmit) {
      newsletterSubmit.disabled = true;
      newsletterSubmit.textContent = 'Joining…';
    }
    window.setTimeout(() => {
      if (newsletterStatus) {
        newsletterStatus.textContent =
          'Almost done! Check your email for a message from Las Vegans for Better Transit, and tap Confirm my subscription. Already subscribed? You’re all set.';
      }
      if (newsletterSubmit) newsletterSubmit.textContent = 'Join the newsletter';
      if (newsletterEmail instanceof HTMLInputElement) newsletterEmail.disabled = true;
    }, 500);
  }

  function initKeepGoing() {
    const newsletterForm = document.querySelector('[data-newsletter-form]');
    if (!newsletterForm) return;

    const fields = {
      newsletterSubmit: newsletterForm.querySelector('[data-newsletter-submit]'),
      newsletterStatus: newsletterForm.querySelector('[data-form-status]'),
      newsletterEmail: document.getElementById('keepgoing-email'),
    };
    newsletterForm.addEventListener('submit', (event) => submitNewsletterSignup(event, fields));
  }

  initPhaseLine();
  initStartNewPledge();
  initSharePledge();
  initDailyReminders();
  initKeepGoing();
})();
