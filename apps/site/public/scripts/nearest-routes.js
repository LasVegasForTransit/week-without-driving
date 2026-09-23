/* "Find routes near you" — the nearest-route finder on /go. Loaded as a
 * classic <script src> under the site's `script-src 'self'` Content
 * Security Policy (see public/_headers); map-links.js must load first,
 * since this file calls window.LVWWD_MAP_LINKS.buildMapLinks().
 *
 * Behavior is written to the Docket Engineering Task "Build the
 * nearest-route finder" (01M357CW9ZM9FKQK1SGM6FMV78) and the Features
 * "Show the bus stops and routes nearest the visitor" and "Show stops near
 * a chosen place without sharing location". The short version: get a
 * position from the phone or from a fixed list of seven places, measure
 * the straight-line (haversine) distance to every stop in stops.json on
 * the visitor's own phone, and show the five nearest within one mile. The
 * position never leaves the phone — it is held in memory for this
 * calculation only, never sent in a network request, and never written to
 * storage, a cookie or the address bar.
 */
(() => {
  const root = document.querySelector('[data-finder]');
  if (!root) return;

  const app = root.querySelector('[data-finder-app]');
  const nodata = root.querySelector('[data-finder-nodata]');
  const useLocationButton = root.querySelector('[data-use-location]');
  const placeSelect = root.querySelector('[data-place-select]');
  const statusEl = root.querySelector('[data-finder-status]');
  const announceEl = root.querySelector('[data-finder-announce]');
  const resultsHeading = root.querySelector('[data-results-heading]');
  const resultsList = root.querySelector('[data-results-list]');
  const notes = root.querySelector('[data-finder-notes]');
  const dataCredit = root.querySelector('[data-data-credit]');

  if (!app || !nodata || !useLocationButton || !placeSelect || !statusEl || !resultsList) return;

  const EARTH_RADIUS_MILES = 3958.8;
  const MAX_DISTANCE_MILES = 1.0;
  const MAX_RESULTS = 5;
  const LOCATION_TIMEOUT_MS = 10000;
  const LOCATION_MAX_AGE_MS = 60000;

  const COPY = {
    locating: 'Finding your location…',
    denied: 'Location is turned off for this site. Pick a place instead.',
    notFound: "We couldn't find your location. Try again, or pick a place instead.",
    noStops:
      'There are no bus stops within 1 mile of you. Pick a place instead to see how the finder works.',
  };

  let stopsData = null;
  let routesByShortName = new Map();

  function toRadians(degrees) {
    return (degrees * Math.PI) / 180;
  }

  // The standard haversine formula for the straight-line distance between
  // two points on the Earth's surface, in miles.
  function haversineMiles(lat1, lng1, lat2, lng2) {
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(a));
  }

  function formatDistance(miles) {
    if (miles < 0.05) return 'Under 0.1 mi';
    return `${miles.toFixed(1)} mi`;
  }

  const DIRECTIONS = { NB: 'northbound', SB: 'southbound', EB: 'eastbound', WB: 'westbound' };

  function displayStopName(rawName) {
    const match = /^(NB|SB|EB|WB)\s+(.+)$/.exec(rawName);
    if (!match) return rawName;
    return `${match[2]} (${DIRECTIONS[match[1]]})`;
  }

  function routeDisplayText(route) {
    if (route.longName && route.longName.startsWith(route.shortName)) return route.longName;
    return `${route.shortName} ${route.longName}`.trim();
  }

  function setStatus(message) {
    if (!message) {
      statusEl.hidden = true;
      statusEl.textContent = '';
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = message;
  }

  function announce(message) {
    if (announceEl) announceEl.textContent = message;
  }

  function clearResults() {
    resultsList.innerHTML = '';
    if (resultsHeading) resultsHeading.hidden = true;
    resultsList.hidden = true;
    if (notes) notes.hidden = true;
  }

  function renderStop(stop) {
    const item = document.createElement('li');
    item.className = 'stop-card border border-outline bg-surface-container p-5';

    const header = document.createElement('div');
    header.className = 'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1';

    const name = document.createElement('h4');
    name.className = 'text-title-md';
    name.textContent = displayStopName(stop.name);

    const distance = document.createElement('span');
    distance.className = 'tnum shrink-0 font-semibold text-on-surface-variant';
    distance.textContent = formatDistance(stop.distance);

    header.append(name, distance);

    const routesLine = document.createElement('p');
    routesLine.className = 'mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm';
    const routesLabel = document.createTextNode('Routes: ');
    routesLine.append(routesLabel);
    stop.routes.forEach((shortName, index) => {
      const route = routesByShortName.get(shortName) ?? {
        shortName,
        longName: '',
        color: '#6B6E75',
      };
      if (index > 0) routesLine.append(document.createTextNode(', '));
      const swatch = document.createElement('span');
      swatch.className = 'mr-1 inline-block size-3 shrink-0 align-middle';
      swatch.style.backgroundColor = route.color;
      swatch.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.className = 'align-middle text-on-surface';
      label.textContent = routeDisplayText(route);
      routesLine.append(swatch, label);
    });

    const buttons = document.createElement('div');
    buttons.className = 'mt-3 flex flex-wrap gap-2';
    let links;
    try {
      links = window.LVWWD_MAP_LINKS.buildMapLinks(stop.lat, stop.lng, displayStopName(stop.name));
    } catch {
      links = null;
    }
    if (links) {
      buttons.append(
        mapButton(links.google, links.labels.google, 'Google Maps', false),
        mapButton(links.apple, links.labels.apple, 'Apple Maps', false),
        mapButton(links.transit, links.labels.transit, 'Transit app', true),
      );
    }

    item.append(header, routesLine, buttons);
    return item;
  }

  function mapButton(href, ariaLabel, label, sameTab) {
    const a = document.createElement('a');
    a.href = href;
    a.setAttribute('aria-label', ariaLabel);
    a.className =
      'press inline-flex min-h-11 items-center justify-center border border-outline px-4 py-2 text-sm font-semibold no-underline hover:bg-on-surface hover:text-surface focus-visible:bg-on-surface focus-visible:text-surface';
    if (!sameTab) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    a.textContent = label;
    return a;
  }

  function showResults(stops, headingText, announceText) {
    clearResults();
    if (stops.length === 0) {
      setStatus(COPY.noStops);
      return;
    }
    setStatus('');
    if (resultsHeading) {
      resultsHeading.textContent = headingText;
      resultsHeading.hidden = false;
    }
    resultsList.hidden = false;
    for (const stop of stops) resultsList.append(renderStop(stop));
    if (notes) notes.hidden = false;
    announce(announceText);
  }

  function findNearest(lat, lng) {
    if (!stopsData) return [];
    return stopsData.stops
      .map((stop) => ({ ...stop, distance: haversineMiles(lat, lng, stop.lat, stop.lng) }))
      .filter((stop) => stop.distance <= MAX_DISTANCE_MILES)
      .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id))
      .slice(0, MAX_RESULTS);
  }

  function searchFrom(lat, lng, headingText, announceLabel) {
    const stops = findNearest(lat, lng);
    showResults(stops, headingText, `${stops.length} stops found near ${announceLabel}.`);
  }

  function useMyLocation() {
    setStatus(COPY.locating);
    clearResults();
    navigator.geolocation.getCurrentPosition(
      (position) => {
        searchFrom(position.coords.latitude, position.coords.longitude, 'Stops near you', 'you');
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setStatus(COPY.denied);
          placeSelect.focus();
        } else {
          setStatus(COPY.notFound);
        }
      },
      { timeout: LOCATION_TIMEOUT_MS, maximumAge: LOCATION_MAX_AGE_MS, enableHighAccuracy: false },
    );
  }

  function choosePlace() {
    const option = placeSelect.selectedOptions[0];
    if (!option || !option.value) return; // "Choose a place" re-selected: leave results as they are
    const lat = Number(option.dataset.lat);
    const lng = Number(option.dataset.lng);
    const label = option.textContent.trim();
    searchFrom(lat, lng, `Stops near ${label}`, label);
  }

  function indexRoutes(routes) {
    const map = new Map();
    for (const route of routes) map.set(route.shortName, route);
    return map;
  }

  async function init() {
    if (!('geolocation' in navigator)) useLocationButton.hidden = true;

    try {
      const [stopsResponse, routesResponse] = await Promise.all([
        fetch('/data/stops.json'),
        fetch('/data/routes.json'),
      ]);
      if (!stopsResponse.ok || !routesResponse.ok) throw new Error('stop data request failed');
      const [stops, routes] = await Promise.all([stopsResponse.json(), routesResponse.json()]);
      stopsData = stops;
      routesByShortName = indexRoutes(routes.routes);
      if (dataCredit) {
        dataCredit.textContent = `Stop and route data from RTC (${stops.feedVersion}).`;
      }
      app.hidden = false;
      nodata.hidden = true;
    } catch {
      app.hidden = true;
      nodata.hidden = false;
      return;
    }

    useLocationButton.addEventListener('click', useMyLocation);
    placeSelect.addEventListener('change', choosePlace);
  }

  void init();
})();
