/* "Where to?" on /go: the visitor types a place, and this opens transit
 * directions to it in Google Maps, Apple Maps or the Transit app, with a
 * short "Before you go" list. Loaded as a module under the site's
 * `script-src 'self'` Content Security Policy (see public/_headers).
 *
 * Nothing is sent to lvwwd.org or kept on the phone: the places typed go
 * only into the address of the map app the visitor chooses to open. A link
 * to /go?to=<place> fills in the place and shows the directions, so a
 * partner can share a trip to their door.
 */
const root = document.querySelector('[data-where]');
const form = root?.querySelector('[data-where-form]');
const result = root?.querySelector('[data-where-result]');
const toInput = form?.querySelector('[data-where-to]');
const fromInput = form?.querySelector('[data-where-from]');
const error = form?.querySelector('[data-where-error]');
const title = result?.querySelector('[data-where-title]');
const google = result?.querySelector('[data-where-google]');
const apple = result?.querySelector('[data-where-apple]');
const transit = result?.querySelector('[data-where-transit]');
const guide = result?.querySelector('[data-where-guide]');
const guideLink = result?.querySelector('[data-where-guide-link]');
const again = result?.querySelector('[data-where-again]');

// iPhones open Apple Maps by default, so it goes first there.
function putAppleFirst() {
  const ua = navigator.userAgent;
  const iPhone =
    /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (!iPhone) return;
  apple.classList.replace('btn--outline', 'btn--primary');
  google.classList.replace('btn--primary', 'btn--outline');
  apple.after(google);
}

// Typed places get ", NV", so "Sunset Park" means the one in Las Vegas.
function inNevada(text) {
  return /\b(NV|Nevada)\b/i.test(text) ? text : `${text}, NV`;
}

/** The suggested place whose name matches what was typed, if any. */
function knownPlace(text) {
  const wanted = text.trim().toLowerCase();
  return (
    [...form.querySelectorAll('datalist option')].find(
      (option) => option.value.toLowerCase() === wanted,
    ) ?? null
  );
}

function setError(message) {
  if (error) error.textContent = message;
  if (message) toInput.setAttribute('aria-invalid', 'true');
  else toInput.removeAttribute('aria-invalid');
}

/** "lat,lng" for a suggested place, or "" for anything typed. */
function pointOf(place) {
  const lat = Number(place?.dataset.lat);
  const lng = Number(place?.dataset.lng);
  if (!place || !Number.isFinite(lat) || !Number.isFinite(lng)) return '';
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

// Without a starting point, each app starts from where the phone is.
function setMapLinks(name, destination, origin, point) {
  const googleQuery = new URLSearchParams({ api: '1', destination, travelmode: 'transit' });
  if (origin) googleQuery.set('origin', origin);
  google.href = `https://www.google.com/maps/dir/?${googleQuery}`;
  google.setAttribute('aria-label', `Directions to ${name} in Google Maps`);

  const appleQuery = new URLSearchParams({ daddr: destination, dirflg: 'r' });
  if (origin) appleQuery.set('saddr', origin);
  apple.href = `https://maps.apple.com/?${appleQuery}`;
  apple.setAttribute('aria-label', `Directions to ${name} in Apple Maps`);

  // The Transit app takes only a map point, and starts from the phone.
  transit.hidden = !point || Boolean(origin);
  if (point) {
    transit.href = `transit://directions?to=${point}`;
    transit.setAttribute('aria-label', `Directions to ${name} in the Transit app`);
  }
}

function setGuide(anchor, name) {
  if (!guide || !guideLink) return;
  guide.hidden = !anchor;
  if (!anchor) return;
  guideLink.href = `#${anchor}`;
  guideLink.textContent = `Step-by-step directions to ${name}`;
}

function show(to, from) {
  const place = knownPlace(to);
  const point = pointOf(place);
  const name = place ? place.value : to;
  setMapLinks(name, point || inNevada(to), from ? inNevada(from) : '', point);
  setGuide(place?.dataset.anchor, name);
  title.textContent = `Getting to ${name}`;
  form.hidden = true;
  result.hidden = false;
  title.focus();
}

const shared = new URLSearchParams(window.location.search).get('to')?.trim().slice(0, 200);

/** Starts the page once its markup is known to be there. */
function startPage() {
  if ([toInput, fromInput, title, google, apple, transit].some((element) => !element)) return;
  putAppleFirst();
  form.noValidate = true;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const to = toInput.value.trim();
    if (!to) {
      setError('Type where you’re going.');
      toInput.focus();
      return;
    }
    setError('');
    show(to, fromInput.value.trim());
  });
  toInput.addEventListener('input', () => setError(''));
  again?.addEventListener('click', () => {
    result.hidden = true;
    form.hidden = false;
    toInput.value = '';
    toInput.focus();
  });
  form.hidden = false;
  if (shared) {
    toInput.value = shared;
    show(shared, '');
  }
}

if (form instanceof HTMLFormElement && result instanceof HTMLElement) startPage();
