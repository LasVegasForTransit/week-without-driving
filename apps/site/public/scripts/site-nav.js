// Header behaviour: the ☰ menu and the pledge button. Lives in
// public/scripts for the site's script-src 'self' policy. Without
// JavaScript, the ☰ button links to the menu's anchor and every page
// stays usable.
(() => {
  const menu = document.querySelector('[data-menu]');
  if (menu && typeof menu.showModal === 'function') {
    document.querySelectorAll('[data-menu-open]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        menu.showModal();
      });
    });
    menu.querySelector('[data-menu-close]')?.addEventListener('click', () => menu.close());
    menu.addEventListener('click', (event) => {
      if (event.target === menu) menu.close();
    });
  }

  // Once someone has pledged, the pledge buttons become "My kit".
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
