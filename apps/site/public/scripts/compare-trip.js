import { estimateCarbon, estimateCost } from './compare-estimates.js';

const form = document.querySelector('[data-compare-form]');
if (form instanceof HTMLFormElement) {
  const status = document.querySelector('[data-compare-status]');
  const results = document.querySelector('[data-compare-results]');
  const fallback = document.querySelector('[data-compare-fallback]');
  const gas = document.querySelector('[data-gas]');
  const parking = document.querySelector('[data-parking]');
  const date = form.elements.namedItem('date');
  const time = form.elements.namedItem('time');
  let lastResult = null;
  let requestId = 0;

  const vegasParts = (instant) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(instant);
    const part = (type) => parts.find((item) => item.type === type)?.value ?? '';
    return {
      year: part('year'),
      month: part('month'),
      day: part('day'),
      hour: part('hour'),
      minute: part('minute'),
    };
  };
  const vegasDay = (instant) => {
    const { year, month, day } = vegasParts(instant);
    return `${year}-${month}-${day}`;
  };
  const nextHour = new Date(Date.now() + 3_600_000);
  if (date instanceof HTMLInputElement) {
    date.min = vegasDay(new Date());
    date.max = vegasDay(new Date(Date.now() + 99 * 86_400_000));
    date.value = vegasDay(nextHour);
  }
  if (time instanceof HTMLInputElement) {
    const { hour, minute } = vegasParts(nextHour);
    time.value = `${hour}:${minute}`;
  }

  function vegasDepartureIso(day, clock) {
    const desired = Date.parse(`${day}T${clock}:00Z`);
    let actual = desired;
    for (let i = 0; i < 3; i++) {
      const { year, month, day: localDay, hour, minute } = vegasParts(new Date(actual));
      const localAsUtc = Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(localDay),
        Number(hour),
        Number(minute),
      );
      actual += desired - localAsUtc;
    }
    return new Date(actual).toISOString();
  }

  const value = (name) => {
    const field = form.elements.namedItem(name);
    return field instanceof HTMLInputElement ? field.value.trim() : '';
  };
  const mode = () => form.querySelector('input[name="mode"]:checked')?.value ?? 'bus';
  const names = { bus: 'Bus', walk: 'Walk', bike: 'Bike', scooter: 'Scooter' };
  const link = (service, routeMode) => {
    const origin = value('origin');
    const destination = value('destination');
    if (service === 'google') {
      const url = new URL('https://www.google.com/maps/dir/');
      url.searchParams.set('api', '1');
      url.searchParams.set('origin', origin);
      url.searchParams.set('destination', destination);
      url.searchParams.set(
        'travelmode',
        routeMode === 'drive'
          ? 'driving'
          : routeMode === 'bus'
            ? 'transit'
            : routeMode === 'bike'
              ? 'bicycling'
              : 'walking',
      );
      return url.href;
    }
    const url = new URL('https://maps.apple.com/');
    url.searchParams.set('saddr', origin);
    url.searchParams.set('daddr', destination);
    url.searchParams.set('dirflg', routeMode === 'drive' ? 'd' : routeMode === 'bus' ? 'r' : 'w');
    return url.href;
  };
  const make = (tag, text, className = '') => {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const amount = (n) => `$${n.toFixed(2)}`;
  const carbon = (n) => (n === 0 ? 'No tailpipe emissions' : `${n.toFixed(2)} kg CO₂e`);

  function showFallback(reason, isBus) {
    if (!(fallback instanceof HTMLElement)) return;
    fallback.hidden = false;
    const title = fallback.querySelector('[data-fallback-title]');
    const copy = fallback.querySelector('[data-fallback-copy]');
    const messages = {
      address: ['We couldn’t find that trip.', 'Add a city or ZIP and try again.'],
      no_route: [
        'No bus trip showed up for that time.',
        'Try another time or check RTC’s trip planner.',
      ],
      unavailable: [
        'We can’t compare this trip right now.',
        'You can still open directions in a map app.',
      ],
      offline: ['Reconnect to compare routes.', 'The rider guides and bus finder work offline.'],
    };
    const message = messages[reason] ?? messages.unavailable;
    if (title) title.textContent = message[0];
    if (copy) copy.textContent = message[1];
    fallback.querySelectorAll('[data-google-link]').forEach((a) => {
      a.href = link('google', mode());
    });
    fallback.querySelectorAll('[data-apple-link]').forEach((a) => {
      a.href = link('apple', mode());
      a.textContent = ['bike', 'scooter'].includes(mode())
        ? 'Open walking directions in Apple Maps'
        : 'Open directions in Apple Maps';
    });
    fallback.querySelectorAll('[data-rtc-link]').forEach((a) => {
      a.hidden = !isBus;
    });
    fallback.querySelectorAll('[data-try-time]').forEach((a) => {
      a.hidden = reason !== 'no_route';
    });
    fallback.querySelectorAll('a[href="/guides"],a[href="/go#find-routes"]').forEach((a) => {
      a.hidden = reason !== 'offline';
    });
  }

  function costPresentation(currentMode, cost) {
    if (cost === null) return ['Bus fare', 'Fare varies'];
    if (currentMode === 'drive') return ['Fuel + parking', amount(cost)];
    if (currentMode === 'bus') return ['Bus fare', amount(cost)];
    return ['Fare', 'No fare'];
  }

  function appendStats(body, kind, route) {
    const stats = document.createElement('dl');
    stats.className = 'compare-card__stats';
    const currentMode = kind === 'drive' ? 'drive' : mode();
    const cost = estimateCost(currentMode, route.meters, {
      fare: route.fare,
      gasPrice: Math.max(0, Number(gas?.value ?? 4) || 0),
      parking: Math.max(0, Number(parking?.value ?? 0) || 0),
    });
    const emission = estimateCarbon(currentMode, route.meters, route.busMeters);
    const [costLabel, costValue] = costPresentation(currentMode, cost);
    const carbonValue = emission === null ? 'Estimate unavailable' : carbon(emission);
    for (const [label, value] of [
      [costLabel, costValue],
      ['Operating carbon', carbonValue],
    ]) {
      const box = document.createElement('div');
      box.append(make('dt', label), make('dd', value));
      stats.append(box);
    }
    body.append(stats);
    if (cost === null && currentMode === 'bus') {
      const fares = make('a', 'See RTC fares', 'body-link');
      fares.href = 'https://www.rtcsnv.com/ways-to-travel/fares-passes/';
      fares.target = '_blank';
      fares.rel = 'noopener noreferrer';
      body.append(fares);
    }
  }

  function appendDirections(body, kind, route) {
    if (route.steps.length) {
      const steps = document.createElement('ol');
      route.steps.forEach((step) => steps.append(make('li', step)));
      body.append(steps);
    }
    const directions = make('a', 'Full directions in Google Maps →', 'body-link');
    directions.href = link('google', kind === 'drive' ? 'drive' : mode());
    directions.target = '_blank';
    directions.rel = 'noopener noreferrer';
    body.append(directions);
    body.append(make('p', 'Google Maps', 'compare-card__attribution compare-attribution'));
  }

  function routeBody(kind, outcome) {
    const body = document.querySelector(`[data-route-body="${kind}"]`);
    if (!(body instanceof HTMLElement)) return;
    body.replaceChildren();
    if (!outcome?.route) {
      body.append(
        make(
          'p',
          outcome?.reason === 'no_route'
            ? 'No bus trip showed up for that time.'
            : 'Route estimate unavailable.',
        ),
      );
      return;
    }
    const route = outcome.route;
    body.append(make('p', `${route.minutes} min`, 'compare-card__time'));
    if (kind === 'alternative' && mode() === 'scooter')
      body.append(make('p', 'Walking time shown for scooter.'));
    if (kind === 'alternative' && mode() !== 'bus')
      body.append(make('p', 'Check sidewalks and crossings before you go.'));
    appendStats(body, kind, route);
    appendDirections(body, kind, route);
  }

  function render() {
    if (!lastResult || !(results instanceof HTMLElement)) return;
    document.querySelector('[data-alternative-heading]').textContent = names[mode()];
    routeBody('drive', lastResult.drive);
    routeBody('alternative', lastResult.alternative);
    results.hidden = false;
    document.querySelector('[data-compare-next]').hidden =
      value('date') < '2026-10-01' || value('date') > '2026-10-08';
    const reason = lastResult.alternative?.reason ?? lastResult.drive?.reason;
    if (reason) showFallback(reason, mode() === 'bus');
    else if (fallback instanceof HTMLElement) fallback.hidden = true;
  }

  function readyToCompare() {
    const origin = value('origin');
    const destination = value('destination');
    if (
      origin.length < 3 ||
      destination.length < 3 ||
      !date?.validity.valid ||
      !time?.validity.valid
    ) {
      status.textContent = 'Enter both places, a day, and a time to compare.';
      return false;
    }
    if (!navigator.onLine) {
      status.textContent = '';
      showFallback('offline', mode() === 'bus');
      return false;
    }
    return true;
  }

  async function requestComparison() {
    return fetch('/api/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: value('origin'),
        destination: value('destination'),
        mode: mode(),
        departureTime: vegasDepartureIso(value('date'), value('time')),
      }),
    });
  }

  function clearResult() {
    lastResult = null;
    if (results instanceof HTMLElement) results.hidden = true;
    if (fallback instanceof HTMLElement) fallback.hidden = true;
  }

  async function compare(event) {
    event?.preventDefault();
    clearResult();
    if (!readyToCompare()) return;
    const id = ++requestId;
    status.textContent = 'Finding your trip…';
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const response = await requestComparison();
      if (id !== requestId) return;
      const data = await response.json();
      if (!response.ok || !data.drive || !data.alternative) {
        status.textContent = '';
        showFallback(data.reason === 'address' ? 'address' : 'unavailable', mode() === 'bus');
        return;
      }
      lastResult = data;
      status.textContent =
        data.drive.route || data.alternative.route ? 'Here are your options.' : '';
      render();
    } catch {
      if (id === requestId) {
        status.textContent = '';
        showFallback(navigator.onLine ? 'unavailable' : 'offline', mode() === 'bus');
      }
    } finally {
      if (id === requestId) button.disabled = false;
    }
  }

  form.addEventListener('submit', compare);
  form.addEventListener('change', (event) => {
    const target = event.target;
    if (target?.name === 'workSchool')
      document.querySelector('[data-club-ride]').hidden = !target.checked;
    if (target?.name === 'mode') void compare();
    if (target?.name === 'date') {
      const next = document.querySelector('[data-compare-next]');
      if (next) next.hidden = value('date') < '2026-10-01' || value('date') > '2026-10-08';
    }
  });
  for (const name of ['origin', 'destination', 'date', 'time']) {
    form.elements.namedItem(name)?.addEventListener('input', () => {
      requestId += 1;
      clearResult();
      form.querySelector('button[type="submit"]').disabled = false;
      status.textContent = '';
    });
  }
  for (const field of [gas, parking]) field?.addEventListener('input', render);
  document.querySelector('[data-try-time]')?.addEventListener('click', () => {
    time?.focus();
    time?.showPicker?.();
  });
  document.querySelector('[data-save-plan]')?.addEventListener('click', (event) => {
    const draft = {
      destination: value('destination'),
      day: Number(value('date').slice(-2)),
      time: value('time'),
      mode: mode(),
    };
    try {
      sessionStorage.setItem('wwd-compare-plan', JSON.stringify(draft));
    } catch {
      event.preventDefault();
      status.textContent =
        'Your plan isn’t saved yet. Your choices are still here. Try saving again.';
    }
  });
  window.addEventListener('offline', () => showFallback('offline', mode() === 'bus'));
}
