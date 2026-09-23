// Bottom tab bar behaviour: the More sheet and the Pledge tab. Lives in
// public/scripts for the site's script-src 'self' policy. Without
// JavaScript, More links to the sheet's anchor and every page stays usable.
(() => {
  const sheet = document.querySelector('[data-more-sheet]');
  const openers = document.querySelectorAll('[data-more-open]');
  if (sheet && typeof sheet.showModal === 'function') {
    openers.forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        sheet.showModal();
      });
    });
    sheet.querySelector('[data-more-close]')?.addEventListener('click', () => sheet.close());
    sheet.addEventListener('click', (event) => {
      if (event.target === sheet) sheet.close();
    });
  }

  // Once someone has pledged, the Pledge links become "My kit".
  const tier = document.cookie.match(/(?:^|; )lvwwd_tier=(trip|day|week)/)?.[1];
  if (tier) {
    document.querySelectorAll('[data-pledge-link]').forEach((link) => {
      link.setAttribute('href', `/pledged/${tier}`);
    });
    document.querySelectorAll('[data-pledge-label]').forEach((label) => {
      label.textContent = 'My kit';
    });
  }
})();
