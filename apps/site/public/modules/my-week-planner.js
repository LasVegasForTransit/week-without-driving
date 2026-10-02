/** A saved trip plan is preparation; describing a completed trip creates an entry. */
import { api } from './participant-api.js';

const STEPS = ['where', 'when', 'available', 'try', 'review'];
const DRAFT_KEY = 'wwd-trip-plan-draft';
const MODE_LABELS = {
  bus: 'Bus',
  walk: 'Walk or roll',
  bike: 'Bike',
  scooter: 'Scooter',
  ride: 'Get a ride',
};

function setText(selector, text) {
  const node = document.querySelector(selector);
  if (node) node.textContent = text;
}

function selected(form, name) {
  return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
}

function fieldValue(form, name) {
  const field = form.elements.namedItem(name);
  return field instanceof HTMLInputElement || field instanceof HTMLSelectElement
    ? field.value.trim()
    : '';
}

function values(form) {
  const kind = selected(form, 'planKind')[0] ?? '';
  const outing = form.elements.namedItem('outing');
  const option = outing instanceof HTMLSelectElement ? outing.selectedOptions[0] : null;
  const destination =
    kind === 'outing'
      ? (option?.getAttribute('data-destination') ?? '')
      : kind === 'event'
        ? fieldValue(form, 'eventDestination')
        : fieldValue(form, 'ownDestination');
  return {
    kind,
    origin: fieldValue(form, 'origin'),
    destination,
    eventName: kind === 'event' ? fieldValue(form, 'eventName') : '',
    day: Number(fieldValue(form, 'day')),
    time: fieldValue(form, 'time'),
    outingAnchor: kind === 'outing' ? (option?.value ?? '') : '',
    availableModes: selected(form, 'availableMode'),
    willingModes: selected(form, 'willingMode'),
    reminderMinutesBefore: Number(fieldValue(form, 'reminderMinutesBefore')) || null,
  };
}

function showKindPanel(form) {
  const kind = selected(form, 'planKind')[0] ?? '';
  form.querySelectorAll('[data-plan-kind-panel]').forEach((panel) => {
    panel.hidden = panel.getAttribute('data-plan-kind-panel') !== kind;
  });
}

function directionsUrl(plan) {
  const mode = plan.willingModes.includes('bus')
    ? 'transit'
    : plan.willingModes.includes('bike')
      ? 'bicycling'
      : plan.willingModes.includes('ride')
        ? 'driving'
        : 'walking';
  const query = new URLSearchParams({
    api: '1',
    origin: plan.origin,
    destination: plan.destination,
    travelmode: mode,
  });
  return `https://www.google.com/maps/dir/?${query}`;
}

function suggestionItems(plan) {
  const items = [];
  if (plan.origin && plan.destination)
    items.push({ label: 'Open directions in Google Maps', href: directionsUrl(plan) });
  if (plan.outingAnchor)
    items.push({
      label: `See the route guide for ${plan.destination}`,
      href: `/go#${plan.outingAnchor}`,
    });
  if (plan.willingModes.includes('bus')) {
    items.push({ label: 'Find nearby bus stops', href: '/go' });
    items.push({
      label: 'Check routes and departure times with RTC',
      href: 'https://www.rtcsnv.com/tripplanner/',
    });
    items.push({ label: 'See how to pay your bus fare', href: '/guides/pay-your-fare' });
  }
  if (plan.willingModes.includes('walk'))
    items.push({ label: 'Plan for the heat and shade', href: '/guides/heat' });
  if (plan.willingModes.includes('bike'))
    items.push({ label: 'See how to put a bike on the bus', href: '/guides/bike-rack' });
  if (plan.willingModes.includes('scooter'))
    items.push({ label: 'Check your route and where you can park your scooter', href: '/go' });
  if (plan.willingModes.includes('ride'))
    items.push({ label: 'Arrange your ride home before you leave.' });
  if (plan.kind === 'event')
    items.push({ label: 'Check the event time and your trip home before you leave.' });
  return items;
}

function renderSuggestions(form, items) {
  const list = form.querySelector('[data-plan-suggestions]');
  if (!list) return;
  list.replaceChildren();
  items.forEach(({ label, href }) => {
    const item = document.createElement('li');
    if (href) {
      const link = document.createElement('a');
      link.href = href;
      link.textContent = label;
      if (href.startsWith('https://')) {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
      item.append(link);
    } else item.textContent = label;
    list.append(item);
  });
}

function displayTime(time) {
  if (!time) return '';
  const [hour, minute] = time.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'am' : 'pm'}`;
}

function renderPreview(form) {
  const plan = values(form);
  const dayField = form.elements.namedItem('day');
  const dayOption = dayField instanceof HTMLSelectElement ? dayField.selectedOptions[0] : null;
  const dayLabel = dayOption?.textContent?.trim() ?? '';
  const chosen = plan.willingModes.map((mode) => MODE_LABELS[mode] ?? mode);
  const where = plan.eventName
    ? `${plan.eventName} · ${plan.destination || 'Choose a place'}`
    : plan.destination || 'Choose a place';
  setText('[data-plan-summary-origin]', plan.origin || 'Add a starting point');
  setText('[data-plan-summary-where]', where);
  setText(
    '[data-plan-summary-when]',
    `${dayLabel || 'Choose a day'}${plan.time ? ` · ${displayTime(plan.time)}` : ''}`,
  );
  setText('[data-plan-summary-modes]', chosen.length ? chosen.join(', ') : 'Choose how to go');
  renderSuggestions(form, suggestionItems(plan));
}

function showStep(state, next) {
  state.step = next;
  const { form, step } = state;
  form.querySelectorAll('[data-plan-step]').forEach((panel) => {
    panel.hidden = Number(panel.getAttribute('data-plan-step')) !== step;
  });
  const back = form.querySelector('[data-plan-back]');
  const forward = form.querySelector('[data-plan-next]');
  const save = form.querySelector('[data-plan-save]');
  if (back) back.hidden = step === 1;
  if (forward) forward.hidden = step === 5;
  if (save) save.hidden = step !== 5;
  setText('[data-plan-error]', '');
  renderPreview(form);
}

function readDraft() {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function setField(form, name, value) {
  const field = form.elements.namedItem(name);
  if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement)
    field.value = typeof value === 'string' ? value : '';
}

function restoreDraft(form, draft) {
  if (!draft || typeof draft !== 'object') return;
  const kind = ['outing', 'event', 'own'].includes(draft.kind) ? draft.kind : '';
  const kindRadio = form.querySelector(`input[name="planKind"][value="${kind}"]`);
  if (kindRadio instanceof HTMLInputElement) kindRadio.checked = true;
  setField(form, 'origin', draft.origin);
  setField(form, 'outing', draft.outingAnchor);
  setField(form, 'eventName', draft.eventName);
  setField(form, 'eventDestination', draft.eventDestination);
  setField(form, 'ownDestination', draft.ownDestination);
  setField(form, 'day', String(draft.day ?? ''));
  setField(form, 'time', draft.time);
  setField(form, 'reminderMinutesBefore', String(draft.reminderMinutesBefore ?? ''));
  for (const name of ['availableMode', 'willingMode']) {
    const modes = Array.isArray(draft[name]) ? draft[name] : [];
    form.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
      if (input instanceof HTMLInputElement) input.checked = modes.includes(input.value);
    });
  }
}

function draftValues(form) {
  const plan = values(form);
  return {
    ...plan,
    eventDestination: fieldValue(form, 'eventDestination'),
    ownDestination: fieldValue(form, 'ownDestination'),
    availableMode: plan.availableModes,
    willingMode: plan.willingModes,
  };
}

function keepDraft(form) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draftValues(form)));
    return true;
  } catch {
    setText('[data-plan-error]', 'This browser could not keep your choices. Try another browser.');
    return false;
  }
}

function goToStep(state, next) {
  if (!keepDraft(state.form)) return;
  window.location.assign(`/my-week/plan/${STEPS[next - 1]}`);
}

function placeMessage(plan) {
  if (!plan.origin) return 'Enter a starting point.';
  if (!plan.kind) return 'Choose a place or event, or enter another place.';
  if (plan.kind === 'event' && !plan.eventName) return 'Name the event you want to attend.';
  if (!plan.destination) return 'Choose or enter where you want to go.';
  return '';
}

function timeMessage(plan) {
  if (!Number.isInteger(plan.day) || plan.day < 1 || plan.day > 8)
    return 'Choose one day from October 1 to 8.';
  if (!/^\d{2}:\d{2}$/.test(plan.time)) return 'Choose about what time you will go.';
  return '';
}

function validationMessage(plan, step) {
  if (step === 1) return placeMessage(plan);
  if (step === 2) return timeMessage(plan);
  if (step === 4 && plan.willingModes.length === 0)
    return 'Pick at least one way you would consider going.';
  return '';
}

function validStep(state, step) {
  const message = validationMessage(values(state.form), step);
  setText('[data-plan-error]', message);
  return !message;
}

function payload(plan) {
  return {
    day: plan.day,
    origin: plan.origin,
    destination: plan.destination,
    ...(plan.eventName ? { eventName: plan.eventName } : {}),
    startsAt: new Date(
      `2026-10-${String(plan.day).padStart(2, '0')}T${plan.time}:00-07:00`,
    ).toISOString(),
    availableModes: plan.availableModes,
    willingModes: plan.willingModes,
    ...(plan.reminderMinutesBefore ? { reminderMinutesBefore: plan.reminderMinutesBefore } : {}),
  };
}

async function save(state, event) {
  event.preventDefault();
  for (const step of [1, 2, 3, 4]) {
    if (!validStep(state, step)) {
      goToStep(state, step);
      return;
    }
  }
  const { form, api, showSignedOut } = state;
  const button = form.querySelector('[data-plan-save]');
  if (button instanceof HTMLButtonElement) button.disabled = true;
  const { ok, status } = await api.call('POST', '/api/plans', payload(values(form)));
  if (button instanceof HTMLButtonElement) button.disabled = false;
  if (status === 401) return showSignedOut();
  if (!ok) {
    setText(
      '[data-plan-error]',
      'Your plan isn’t saved yet. Your choices are still here. Try saving again.',
    );
    return;
  }
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* The saved plan is already on the server. */
  }
  window.location.assign('/my-week?plan=saved');
}

function bindEvents(state) {
  const { form } = state;
  const update = () => {
    showKindPanel(form);
    renderPreview(form);
    setText('[data-plan-error]', '');
    keepDraft(form);
  };
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.querySelector('[data-plan-next]')?.addEventListener('click', () => {
    if (validStep(state, state.step)) goToStep(state, Math.min(state.step + 1, 5));
  });
  form
    .querySelector('[data-plan-back]')
    ?.addEventListener('click', () => goToStep(state, Math.max(state.step - 1, 1)));
  form.addEventListener('submit', (event) => void save(state, event));
}

function applyComparisonDraft(form, dayField, today) {
  try {
    const raw = sessionStorage.getItem('wwd-compare-plan');
    if (!raw) return;
    const draft = JSON.parse(raw);
    const valid =
      typeof draft.destination === 'string' &&
      draft.destination.length <= 120 &&
      typeof draft.origin === 'string' &&
      draft.origin.length <= 120 &&
      Number.isInteger(draft.day) &&
      draft.day >= today &&
      draft.day <= 8 &&
      /^\d{2}:\d{2}$/.test(draft.time) &&
      ['bus', 'walk', 'bike', 'scooter'].includes(draft.mode);
    if (!valid) return;
    form.querySelector('input[name="planKind"][value="own"]').checked = true;
    form.elements.namedItem('origin').value = draft.origin;
    form.elements.namedItem('ownDestination').value = draft.destination;
    dayField.value = String(draft.day);
    form.elements.namedItem('time').value = draft.time;
    form.querySelector(`input[name="willingMode"][value="${draft.mode}"]`).checked = true;
    setText('[data-plan-status]', 'Your trip details are filled in. Check them before saving.');
    sessionStorage.removeItem('wwd-compare-plan');
    keepDraft(form);
  } catch {
    /* The planner still works when browser storage is unavailable. */
  }
}

function prepareDay(form, today) {
  const dayField = form.elements.namedItem('day');
  if (!(dayField instanceof HTMLSelectElement)) return null;
  for (const option of dayField.options) {
    if (Number(option.value) < today) option.disabled = true;
  }
  return dayField;
}

async function start() {
  const form = document.querySelector('[data-plan-form]');
  if (!(form instanceof HTMLFormElement)) return;
  const loading = document.querySelector('[data-plan-loading]');
  const { ok, status, data: me } = await api.call('GET', '/api/me');
  if (loading) loading.hidden = true;
  const showSignedOut = () => {
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* Sign-in instructions are still available without browser storage. */
    }
    document.querySelector('[data-plan-signed-out]')?.removeAttribute('hidden');
    form.hidden = true;
  };
  if (status === 401) return showSignedOut();
  if (!ok) {
    document.querySelector('[data-plan-offline]')?.removeAttribute('hidden');
    return;
  }
  if (me.today > 8) {
    document.querySelector('[data-plan-closed]')?.removeAttribute('hidden');
    return;
  }
  form.hidden = false;
  const dayField = prepareDay(form, me.today);
  restoreDraft(form, readDraft());
  if (dayField instanceof HTMLSelectElement && !dayField.value)
    dayField.value = String(me.today >= 1 ? me.today : 1);
  applyComparisonDraft(form, dayField, me.today);
  const current = STEPS.indexOf(window.location.pathname.split('/').at(-1));
  const state = { form, api, showSignedOut, step: current + 1 };
  bindEvents(state);
  showKindPanel(form);
  showStep(state, state.step);
  document
    .querySelector('[data-plan-event-reminder]')
    ?.toggleAttribute('hidden', me.eventRemindersEnabled !== true);
}

void start();
