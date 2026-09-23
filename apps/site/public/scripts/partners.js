/**
 * Partners page copy buttons: "Copy email address" and "Copy snippet".
 * Both are progressive enhancement over plain visible text, so they are
 * `hidden` in markup and only shown once this script confirms it can run
 * (see the bottom of this file). A button copies `data-copy-text` directly,
 * or the text content of the element `data-copy-target` points at.
 *
 * No backend involved: this only touches the clipboard and the DOM.
 */
(() => {
  const REVERT_MS = 3000;
  const timers = new WeakMap();

  function revertLater(button, originalLabel) {
    const existing = timers.get(button);
    if (existing) window.clearTimeout(existing);
    timers.set(
      button,
      window.setTimeout(() => {
        button.textContent = originalLabel;
        timers.delete(button);
      }, REVERT_MS),
    );
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  function selectText(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    const button =
      target instanceof Element ? target.closest('[data-copy-text], [data-copy-target]') : null;
    if (!(button instanceof HTMLButtonElement)) return;

    const originalLabel = button.dataset.copyOriginalLabel ?? button.textContent ?? '';
    button.dataset.copyOriginalLabel = originalLabel;

    const statusId = button.getAttribute('aria-describedby');
    const statusEl = statusId ? document.getElementById(statusId) : null;

    const targetSelector = button.getAttribute('data-copy-target');
    const sourceEl = targetSelector ? document.querySelector(targetSelector) : null;
    const text = sourceEl
      ? (sourceEl.textContent ?? '')
      : (button.getAttribute('data-copy-text') ?? '');
    if (!text) return;

    copyText(text).then((ok) => {
      if (ok) {
        if (statusEl) statusEl.textContent = '';
        button.textContent = 'Copied';
        revertLater(button, originalLabel);
        return;
      }
      if (sourceEl) selectText(sourceEl);
      if (statusEl) {
        statusEl.textContent = 'Press and hold, or use your keyboard, to copy the selected text.';
      }
    });
  });

  document.querySelectorAll('[data-copy-text], [data-copy-target]').forEach((el) => {
    el.hidden = false;
  });
})();
