/* Places to go on /go: each place is a closed <details>. A link to one
 * (/go#sunset-park, or "Step-by-step directions" under "Where to?") opens
 * it and brings it into view. Without JavaScript the places still open by
 * tapping them. Loaded under the site's `script-src 'self'` policy.
 */
function open(hash) {
  const id = decodeURIComponent(hash.slice(1));
  const place = id ? document.getElementById(id) : null;
  if (!(place instanceof HTMLDetailsElement) || !place.hasAttribute('data-place')) return;
  place.open = true;
  place.scrollIntoView({ block: 'start' });
}
window.addEventListener('hashchange', () => open(window.location.hash));
// A link to the place already in the address bar fires no hashchange.
document.addEventListener('click', (event) => {
  const link = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
  if (link && link.getAttribute('href') === window.location.hash) open(window.location.hash);
});
open(window.location.hash);
