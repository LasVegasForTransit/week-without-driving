// The Giveaway page's date-gating and both entry forms. This build has no
// backend, so both forms are front-end demos: they validate in the browser
// and show the real success screen without sending anything anywhere.
//
// TODO(01M357CVW9W7S999STRJCKE4ES): connect "Send my entry" to
// POST /api/entries/upload once the Worker exists.
// TODO(01M35FNJHF2SV1M2Y12SKGGNQV): connect "Enter today" to
// POST /api/entries/free once the Worker exists.
//
// Before October 1, 2026, both forms show "Entries open October 1" with a
// disabled state, matching the real behaviour. Add ?preview=open to this
// page's URL to preview the during-the-week, enterable state for a
// screenshot — for example https://lvwwd.org/giveaway?preview=open.

(() => {
  // Keep in sync with src/lib/wwd.ts (wwd.start / wwd.end).
  const WEEK_START = Date.parse('2026-10-01T07:00:00Z');
  const WEEK_END = Date.parse('2026-10-09T07:00:00Z');
  const CLOSED_TEXT =
    "The giveaway is closed. We'll draw the winner by October 15, 2026, and contact them the way they entered. Thanks to everyone who took part.";
  const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'];
  const ALLOWED_FILE_EXT = /\.(jpe?g|png|heic|heif|webp)$/i;

  function currentStatus() {
    const previewOpen = new URLSearchParams(window.location.search).get('preview') === 'open';
    const now = Date.now();
    if (previewOpen) return 'during';
    if (now < WEEK_START) return 'before';
    if (now >= WEEK_END) return 'after';
    return 'during';
  }

  function currentDayNumber() {
    const now = Date.now();
    return Math.min(Math.max(Math.floor((now - WEEK_START) / 86_400_000) + 1, 1), 8);
  }

  function applySection(status, dayNumber, key, panelKey) {
    const lineEl = document.querySelector(`[data-giveaway-day-line="${key}"]`);
    const panel = document.querySelector(`[data-giveaway-panel="${panelKey}"]`);
    if (status === 'before') {
      if (panel) panel.hidden = true;
      return;
    }
    if (status === 'after') {
      if (lineEl) lineEl.textContent = CLOSED_TEXT;
      if (panel) panel.hidden = true;
      return;
    }
    if (lineEl) {
      lineEl.textContent =
        dayNumber === 8
          ? 'Today is day 8 of 8, the last day to enter.'
          : `Today is day ${dayNumber} of 8.`;
    }
    if (panel) panel.hidden = false;
  }

  function applyTagSection(status) {
    const tagOpen = document.querySelector('[data-giveaway-panel="tag-open"]');
    const tagClosed = document.querySelector('[data-giveaway-panel="tag-closed"]');
    if (!tagOpen || !tagClosed) return;
    tagOpen.hidden = status === 'after';
    tagClosed.hidden = status !== 'after';
  }

  // --- shared validation -------------------------------------------------
  function validateHandle(raw) {
    const clean = raw.trim().replace(/^@/, '').toLowerCase();
    if (!clean) return { clean: '', error: 'Enter your Instagram handle.' };
    if (!/^[a-z0-9._]{1,30}$/.test(clean)) {
      return {
        clean: '',
        error:
          'Instagram handles use only letters, numbers, periods and underscores, up to 30 characters. Check yours and try again.',
      };
    }
    return { clean, error: null };
  }

  function validateIdentifier(raw) {
    const value = raw.trim();
    const invalidMessage =
      'Enter a full email address, like name@example.com, or a US phone number with its area code, like 702-555-0123.';
    if (!value)
      return { clean: '', display: '', error: 'Enter your email address or phone number.' };
    if (value.includes('@')) {
      const clean = value.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean))
        return { clean: '', display: '', error: invalidMessage };
      return { clean, display: clean, error: null };
    }
    const digits = value.replace(/\D/g, '').replace(/^1(\d{10})$/, '$1');
    if (digits.length !== 10) return { clean: '', display: '', error: invalidMessage };
    const display = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    return { clean: `+1${digits}`, display, error: null };
  }

  function setError(el, message) {
    if (!el) return;
    el.textContent = message || '';
    el.hidden = !message;
  }

  // --- age question + guardian checkbox, shared by both forms -----------
  function wireAgeGroup(fieldset) {
    if (!fieldset) return { getError: () => null, showError: () => undefined };
    const radios = Array.from(fieldset.querySelectorAll('input[type="radio"]'));
    const teenRadio = fieldset.querySelector('[data-age-radio-teen]');
    const guardianWrap = fieldset.querySelector('[data-guardian-wrap]');
    const guardianCheckbox = fieldset.querySelector('[data-guardian-checkbox]');
    const errorEl = fieldset.querySelector('[data-age-error]');

    function syncGuardian() {
      const showGuardian = Boolean(teenRadio && teenRadio.checked);
      if (guardianWrap) guardianWrap.hidden = !showGuardian;
      if (!showGuardian && guardianCheckbox) guardianCheckbox.checked = false;
    }

    radios.forEach((radio) => {
      radio.addEventListener('change', () => {
        syncGuardian();
        setError(errorEl, null);
      });
    });
    guardianCheckbox?.addEventListener('change', () => setError(errorEl, null));
    syncGuardian();

    return {
      getError() {
        const checked = radios.find((r) => r.checked);
        if (!checked) return 'Choose your age.';
        if (checked === teenRadio && !(guardianCheckbox && guardianCheckbox.checked)) {
          return 'Ask your parent or guardian to read the Official Rules, then tick this box.';
        }
        return null;
      },
      showError(message) {
        setError(errorEl, message);
      },
    };
  }

  // --- upload form ---------------------------------------------------
  function clearFileDisplay(fileChosen, fileReset) {
    if (fileChosen) fileChosen.textContent = '';
    if (fileReset) fileReset.hidden = true;
  }

  function fileTypeAllowed(file) {
    return ALLOWED_FILE_TYPES.includes(file.type) || ALLOWED_FILE_EXT.test(file.name);
  }

  function handleFileChange(fileInput, fileChosen, fileReset, fileError) {
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
      clearFileDisplay(fileChosen, fileReset);
      return;
    }
    if (!fileTypeAllowed(file)) {
      setError(
        fileError,
        "This file isn't a JPEG, PNG, HEIC or WebP image. Pick a screenshot or photo.",
      );
      fileInput.value = '';
      clearFileDisplay(fileChosen, fileReset);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(fileError, 'This file is over 10 MB. Pick a screenshot or a smaller photo.');
      fileInput.value = '';
      clearFileDisplay(fileChosen, fileReset);
      return;
    }
    setError(fileError, null);
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    if (fileChosen) fileChosen.textContent = `${file.name}, ${sizeMb} MB`;
    if (fileReset) fileReset.hidden = false;
  }

  function showSuccess(form, panel, text) {
    form.hidden = true;
    const successPanel = panel?.querySelector('[data-success-panel]');
    const successText = successPanel?.querySelector('[data-success-text]');
    if (successText) successText.textContent = text;
    if (successPanel) successPanel.hidden = false;
  }

  function setupUploadForm() {
    const uploadForm = document.querySelector('[data-upload-form]');
    if (!uploadForm) return;

    const handleInput = uploadForm.querySelector('[data-handle-input]');
    const handleError = uploadForm.querySelector('[data-handle-error]');
    const age = wireAgeGroup(uploadForm.querySelector('[data-age-group]'));
    const fileInput = uploadForm.querySelector('[data-file-input]');
    const fileChosen = uploadForm.querySelector('[data-file-chosen]');
    const fileReset = uploadForm.querySelector('[data-file-reset]');
    const fileError = uploadForm.querySelector('[data-file-error]');
    const formError = uploadForm.querySelector('[data-form-error]');
    const submitBtn = uploadForm.querySelector('[data-submit-button]');
    const panel = uploadForm.closest('[data-giveaway-panel]');

    handleInput?.addEventListener('input', () => setError(handleError, null));
    fileInput?.addEventListener('change', () =>
      handleFileChange(fileInput, fileChosen, fileReset, fileError),
    );
    fileReset?.addEventListener('click', () => {
      if (fileInput) fileInput.value = '';
      clearFileDisplay(fileChosen, fileReset);
      fileInput?.focus();
    });

    uploadForm.addEventListener('submit', (event) => {
      event.preventDefault();
      setError(formError, null);

      const { clean, error: handleErrorMessage } = validateHandle(handleInput?.value ?? '');
      if (handleErrorMessage) {
        setError(handleError, handleErrorMessage);
        handleInput?.focus();
        return;
      }

      const ageError = age.getError();
      if (ageError) {
        age.showError(ageError);
        return;
      }

      const hasFile = Boolean(fileInput?.files && fileInput.files.length > 0);
      if (!hasFile) {
        setError(fileError, 'Pick a screenshot or photo to upload.');
        return;
      }
      if (fileError && !fileError.hidden) return; // A file-level error is still showing.

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending…';
      }
      window.setTimeout(
        () => showSuccess(uploadForm, panel, `That's entry 1 of 8 for @${clean}.`),
        400,
      );
    });
  }

  // --- free entry form -------------------------------------------------
  function setupFreeForm() {
    const freeForm = document.querySelector('[data-free-form]');
    if (!freeForm) return;

    const identifierInput = freeForm.querySelector('[data-identifier-input]');
    const identifierError = freeForm.querySelector('[data-identifier-error]');
    const age = wireAgeGroup(freeForm.querySelector('[data-age-group]'));
    const newsletterWrap = freeForm.querySelector('[data-newsletter-wrap]');
    const newsletterCheckbox = freeForm.querySelector('[data-newsletter-checkbox]');
    const formError = freeForm.querySelector('[data-form-error]');
    const submitBtn = freeForm.querySelector('[data-submit-button]');
    const panel = freeForm.closest('[data-giveaway-panel]');

    identifierInput?.addEventListener('input', () => {
      setError(identifierError, null);
      const hasAt = (identifierInput.value || '').includes('@');
      if (newsletterWrap) newsletterWrap.hidden = !hasAt;
      if (!hasAt && newsletterCheckbox) newsletterCheckbox.checked = false;
    });

    freeForm.addEventListener('submit', (event) => {
      event.preventDefault();
      setError(formError, null);

      const { display, error: identifierErrorMessage } = validateIdentifier(
        identifierInput?.value ?? '',
      );
      if (identifierErrorMessage) {
        setError(identifierError, identifierErrorMessage);
        identifierInput?.focus();
        return;
      }

      const ageError = age.getError();
      if (ageError) {
        age.showError(ageError);
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending…';
      }
      window.setTimeout(
        () => showSuccess(freeForm, panel, `That's entry 1 of 8 for ${display}.`),
        400,
      );
    });
  }

  const status = currentStatus();
  const dayNumber = currentDayNumber();
  applySection(status, dayNumber, 'upload', 'upload-form');
  applySection(status, dayNumber, 'free', 'free-form');
  applyTagSection(status);
  setupUploadForm();
  setupFreeForm();
})();
