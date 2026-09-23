// Header behaviour: the ☰ menu and the sign-up button. Lives in
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

  // Once someone has signed up, the sign-up buttons become "My week". The
  // Worker sets this readable flag next to the real, HttpOnly session
  // cookie; the flag carries no identity, only "this phone is signed in".
  if (/(?:^|; )lvwwd_signed_in=1(?:;|$)/.test(document.cookie)) {
    document.querySelectorAll('[data-signup-link]').forEach((link) => {
      link.setAttribute('href', '/my-week');
    });
    document.querySelectorAll('[data-signup-label]').forEach((label) => {
      label.textContent = 'My week';
    });
  }
})();
