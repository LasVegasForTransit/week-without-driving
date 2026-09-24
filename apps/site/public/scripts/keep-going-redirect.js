/**
 * /keep-going: opens the "Keep going after the week" card on My week when
 * this phone is signed in (the lvwwd_signed_in cookie), and LVBT's join
 * page otherwise. It replaces the page rather than adding a step, so the
 * Back button doesn't come back here.
 */
(() => {
  const join = document.querySelector('[data-keep-going-join]');
  const signedIn = /(?:^|; )lvwwd_signed_in=1(?:;|$)/.test(document.cookie);
  const next = signedIn ? '/my-week#keep-going' : join?.getAttribute('href');
  if (next) window.location.replace(next);
})();
