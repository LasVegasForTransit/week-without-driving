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

  // A partner's link or QR code adds ?ref=<its short name> to any page.
  // The sign-up form sends it along, so the sign-up counts for that
  // partner. It is kept for this tab only, and the last one opened wins.
  // The Worker checks it against the partner roster.
  const ref = new URLSearchParams(window.location.search).get('ref')?.trim().toLowerCase();
  if (ref && /^[a-z0-9-]{1,64}$/.test(ref)) {
    try {
      window.sessionStorage.setItem('lvwwd_ref', ref);
    } catch {
      // Storage refused: the sign-up simply isn't credited.
    }
  }

  // Once someone has signed up, the sign-up buttons become "My week". The
  // Worker sets this readable flag next to the real, HttpOnly session
  // cookie; the flag carries no identity, only "this phone is signed in".
  // "Sign up someone else" signs the phone out without leaving the page,
  // and says so with the lvwwd:signed-out event; the buttons change back.
  const links = [...document.querySelectorAll('[data-signup-link]')];
  const labels = [...document.querySelectorAll('[data-signup-label]')];
  const hrefs = links.map((link) => link.getAttribute('href'));
  const texts = labels.map((label) => label.textContent);
  if (/(?:^|; )lvwwd_signed_in=1(?:;|$)/.test(document.cookie)) {
    links.forEach((link) => link.setAttribute('href', '/my-week'));
    labels.forEach((label) => (label.textContent = 'My week'));
  }
  document.addEventListener('lvwwd:signed-out', () => {
    links.forEach((link, i) => link.setAttribute('href', hrefs[i] ?? '/sign-up'));
    labels.forEach((label, i) => (label.textContent = texts[i]));
  });
})();
