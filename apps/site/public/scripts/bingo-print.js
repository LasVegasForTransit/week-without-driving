/**
 * The Bingo page's Print section: "Include my marks", "Large print
 * (2 pages)" and "Print a card". The paper card itself is built into the
 * page (src/components/BingoPrintSheet.astro) and printed by the print
 * styles, so the browser's own Print menu prints the same card with the
 * same choices, and prints the blank card with JavaScript off.
 *
 * It reads the card only from the `bingochange` event that /scripts/bingo.js
 * sends on load and after every change, { marks, progress, locked }, so it
 * must load before bingo.js. It makes no request and stores nothing.
 */
(() => {
  const FREE = 12;
  const controls = document.querySelector('[data-bingo-print-controls]');
  const sheet = document.querySelector('[data-bingo-print-sheet]');
  if (!controls || !sheet) return;

  const marksField = controls.querySelector('[data-print-marks-field]');
  const marksBox = controls.querySelector('[data-print-marks]');
  const largeBox = controls.querySelector('[data-print-large]');
  const button = controls.querySelector('[data-print-button]');
  const squares = sheet.querySelectorAll('[data-print-square]');
  const progressLines = sheet.querySelectorAll('[data-print-progress]');

  let latest = { marks: [], progress: '' };

  function apply() {
    const include = Boolean(marksBox?.checked) && !marksField?.hidden;
    sheet.toggleAttribute('data-include-marks', include);
    squares.forEach((square) => {
      const marked = include && Boolean(latest.marks[Number(square.dataset.printSquare)]);
      square.toggleAttribute('data-marked', marked);
    });
    progressLines.forEach((line) => {
      line.textContent = include ? latest.progress : '';
    });
  }

  document.addEventListener('bingochange', (event) => {
    const detail = event.detail ?? {};
    latest = {
      marks: Array.isArray(detail.marks) ? detail.marks : [],
      progress: typeof detail.progress === 'string' ? detail.progress : '',
    };
    const anyMarked = latest.marks.some((marked, i) => i !== FREE && marked);
    if (marksField && marksBox) {
      if (anyMarked && marksField.hidden) marksBox.checked = false;
      if (!anyMarked) marksBox.checked = false;
      marksField.hidden = !anyMarked;
    }
    apply();
  });

  marksBox?.addEventListener('change', apply);
  largeBox?.addEventListener('change', () => {
    sheet.dataset.layout = largeBox.checked ? 'large' : 'card';
  });
  button?.addEventListener('click', () => window.print());

  // A page restored from the back button may keep old ticks; start clean.
  if (marksBox) marksBox.checked = false;
  if (largeBox) largeBox.checked = false;
  sheet.dataset.layout = 'card';
  controls.hidden = false;
})();
