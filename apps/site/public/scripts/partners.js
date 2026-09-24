/**
 * The Partners page: its copy buttons, and its text after the week.
 *
 * A copy button copies `data-copy-text`, or the text (or a text box's
 * value) of the element `data-copy-target` points at. It then reads
 * "Copied" for 3 seconds, and its status line (the element its
 * aria-describedby names, a polite live region) says "Copied" so screen
 * readers hear it. If the browser refuses, the text is selected instead,
 * with a note on how to copy it. The buttons in markup that are `hidden`
 * are shown only once this script runs.
 *
 * From 12:00 am October 9, 2026, Las Vegas time, by the phone's clock, the
 * roster heading reads "Took part in 2026" and "Bring your organization"
 * gives way to a note about next year.
 */
(() => {
  const ENDED = Date.parse('2026-10-09T07:00:00Z');
  const REVERT_MS = 3000;
  const timers = new WeakMap();

  function showEnded() {
    const heading = document.querySelector('[data-partners-roster-heading]');
    if (heading) heading.textContent = 'Took part in 2026';
    const join = document.querySelector('[data-partners-join]');
    const ended = document.querySelector('[data-partners-ended]');
    if (join) join.hidden = true;
    if (ended) ended.hidden = false;
  }

  async function copyText(text) {
    if (!navigator.clipboard || !window.isSecureContext) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  function select(el) {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      el.focus();
      el.select();
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  function textOf(button) {
    const selector = button.getAttribute('data-copy-target');
    const source = selector ? document.querySelector(selector) : null;
    if (source instanceof HTMLTextAreaElement || source instanceof HTMLInputElement) {
      return { source, text: source.value };
    }
    if (source) return { source, text: source.textContent ?? '' };
    return { source: null, text: button.getAttribute('data-copy-text') ?? '' };
  }

  function statusFor(button) {
    const id = button.getAttribute('aria-describedby');
    return id ? document.getElementById(id) : null;
  }

  async function copy(button) {
    const { source, text } = textOf(button);
    if (!text) return;
    const status = statusFor(button);
    const label = button.querySelector('[data-copy-label]') ?? button;
    button.dataset.copyLabel ??= label.textContent ?? '';

    if (await copyText(text)) {
      label.textContent = 'Copied';
      if (status) status.textContent = 'Copied';
      window.clearTimeout(timers.get(button));
      timers.set(
        button,
        window.setTimeout(() => {
          label.textContent = button.dataset.copyLabel ?? '';
          if (status?.textContent === 'Copied') status.textContent = '';
        }, REVERT_MS),
      );
      return;
    }
    if (source) select(source);
    if (status) {
      status.textContent = 'Press and hold, or use your keyboard, to copy the selected text.';
    }
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest('[data-copy-text], [data-copy-target]');
    if (button instanceof HTMLButtonElement) void copy(button);
  });

  document
    .querySelectorAll('[data-copy-text][hidden], [data-copy-target][hidden]')
    .forEach((el) => {
      el.hidden = false;
    });
  if (Date.now() >= ENDED) showEnded();
})();
