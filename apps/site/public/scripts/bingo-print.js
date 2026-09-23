// Progressive enhancement for the "Print this card" button on
// /bingo/print. Printing already works from the browser's own menu with
// JavaScript off (Ctrl+P / Cmd+P on a computer, Share, then Print on an
// iPhone) — this button is a convenience, not a requirement.
(() => {
  const button = document.querySelector('[data-bingo-print-button]');
  if (!button) return;
  button.addEventListener('click', () => window.print());
})();
