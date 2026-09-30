/** A saved trip plan is preparation; describing a completed trip creates an entry. */
(() => {
  const MODE_LABELS = {
    bus: 'bus',
    walk: 'walk or roll',
    bike: 'bike',
    scooter: 'scooter',
    ride: 'ride',
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
      destination,
      eventName: kind === 'event' ? fieldValue(form, 'eventName') : '',
      day: Number(fieldValue(form, 'day')),
      time: fieldValue(form, 'time'),
      outingAnchor: kind === 'outing' ? (option?.value ?? '') : '',
      availableModes: selected(form, 'availableMode'),
      willingModes: selected(form, 'willingMode'),
    };
  }

  function showKindPanel(form) {
    const kind = selected(form, 'planKind')[0] ?? '';
    form.querySelectorAll('[data-plan-kind-panel]').forEach((panel) => {
      panel.hidden = panel.getAttribute('data-plan-kind-panel') !== kind;
    });
  }

  function suggestionItems(plan) {
    const items = [];
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
      ? `${plan.eventName} at ${plan.destination || 'a place to choose'}`
      : plan.destination || 'a place to choose';
    setText(
      '[data-plan-summary]',
      `${where}, ${dayLabel || 'on a day to choose'}${plan.time ? ` around ${displayTime(plan.time)}` : ''}. ${chosen.length ? `You’d consider ${chosen.join(', ')}.` : 'Choose how you might go.'}`,
    );
    renderSuggestions(form, suggestionItems(plan));
  }

  function showStep(state, next) {
    state.step = next;
    const { form, step } = state;
    form.querySelectorAll('[data-plan-step]').forEach((panel) => {
      panel.hidden = Number(panel.getAttribute('data-plan-step')) !== step;
    });
    setText('[data-plan-progress]', `Step ${step} of 4`);
    const back = form.querySelector('[data-plan-back]');
    const forward = form.querySelector('[data-plan-next]');
    const save = form.querySelector('[data-plan-save]');
    if (back) back.hidden = step === 1;
    if (forward) forward.hidden = step === 4;
    if (save) save.hidden = step !== 4;
    setText('[data-plan-error]', '');
    renderPreview(form);
    form.querySelector(`[data-plan-step="${step}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  function validationMessage(plan, step) {
    if (step === 1) {
      if (!plan.kind) return 'Choose an outing, an event, or your own destination.';
      if (plan.kind === 'event' && !plan.eventName) return 'Name the event you want to attend.';
      if (!plan.destination) return 'Choose or enter where you want to go.';
    }
    if (step === 2) {
      if (!Number.isInteger(plan.day) || plan.day < 1 || plan.day > 8)
        return 'Choose one day from October 1 to 8.';
      if (!/^\d{2}:\d{2}$/.test(plan.time)) return 'Choose about what time you will go.';
    }
    if (step === 3 && plan.willingModes.length === 0)
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
      destination: plan.destination,
      ...(plan.eventName ? { eventName: plan.eventName } : {}),
      startsAt: new Date(
        `2026-10-${String(plan.day).padStart(2, '0')}T${plan.time}:00-07:00`,
      ).toISOString(),
      availableModes: plan.availableModes,
      willingModes: plan.willingModes,
    };
  }

  async function save(state, event) {
    event.preventDefault();
    for (const step of [1, 2, 3]) {
      if (!validStep(state, step)) {
        showStep(state, step);
        validStep(state, step);
        return;
      }
    }
    const { form, api, me, showSignedOut, renderEntries, dayField } = state;
    const button = form.querySelector('[data-plan-save]');
    if (button instanceof HTMLButtonElement) button.disabled = true;
    const { ok, status, data } = await api.call('POST', '/api/plans', payload(values(form)));
    if (button instanceof HTMLButtonElement) button.disabled = false;
    if (status === 401) return showSignedOut();
    if (!ok) {
      setText('[data-plan-error]', data.message);
      return;
    }
    me.plans = [...(me.plans ?? []), data.plan];
    renderEntries();
    const date =
      dayField instanceof HTMLSelectElement ? dayField.selectedOptions[0]?.textContent : '';
    setText(
      '[data-plan-status]',
      `Saved for ${date?.trim() || 'your day'}. Come back after your trip to describe it for an entry.`,
    );
    form.reset();
    if (dayField instanceof HTMLSelectElement)
      dayField.value = String(me.today >= 1 ? me.today : 1);
    showKindPanel(form);
    showStep(state, 1);
    document.querySelector('[data-plan-status]')?.focus();
  }

  function bindEvents(state) {
    const { form } = state;
    const update = () => {
      showKindPanel(form);
      renderPreview(form);
      setText('[data-plan-error]', '');
    };
    form.addEventListener('input', update);
    form.addEventListener('change', update);
    form.querySelector('[data-plan-next]')?.addEventListener('click', () => {
      if (validStep(state, state.step)) showStep(state, Math.min(state.step + 1, 4));
    });
    form
      .querySelector('[data-plan-back]')
      ?.addEventListener('click', () => showStep(state, Math.max(state.step - 1, 1)));
    form.addEventListener('submit', (event) => void save(state, event));
  }

  window.lvwwdPlanner = ({ api, me, showSignedOut, renderEntries }) => {
    const form = document.querySelector('[data-plan-form]');
    if (!(form instanceof HTMLFormElement)) return;
    if (me.today > 8) {
      setText('[data-plan-status]', 'The week has ended. Your saved plans are still shown above.');
      return;
    }
    form.hidden = false;
    const dayField = form.elements.namedItem('day');
    if (dayField instanceof HTMLSelectElement) {
      for (const option of dayField.options) {
        if (Number(option.value) < me.today) option.disabled = true;
      }
      dayField.value = String(me.today >= 1 ? me.today : 1);
    }
    const state = { form, api, me, showSignedOut, renderEntries, dayField, step: 1 };
    bindEvents(state);
    showStep(state, 1);
  };
})();
