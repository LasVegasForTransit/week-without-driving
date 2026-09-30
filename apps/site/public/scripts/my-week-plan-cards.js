/** Saved plans appear inside their day, and can be used when logging today's trip. */
(() => {
  function planTime(plan) {
    if (!plan.startsAt) return '';
    const date = new Date(plan.startsAt);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Los_Angeles',
    }).format(date);
  }

  function directionsUrl(plan) {
    if (!plan.origin) return null;
    const mode = plan.willingModes.includes('bus')
      ? 'transit'
      : plan.willingModes.includes('bike')
        ? 'bicycling'
        : plan.willingModes.includes('ride')
          ? 'driving'
          : 'walking';
    return `https://www.google.com/maps/dir/?${new URLSearchParams({
      api: '1',
      origin: plan.origin,
      destination: plan.destination,
      travelmode: mode,
    })}`;
  }

  function usePlanForEntry(plan) {
    const form = document.querySelector('[data-trip-form]');
    const id = form?.querySelector('[data-trip-plan-id]');
    if (!(form instanceof HTMLFormElement) || !(id instanceof HTMLInputElement) || form.hidden)
      return;
    id.value = String(plan.id);
    id.disabled = false;
    const line = form.querySelector('[data-trip-plan-selected]');
    if (line) {
      line.textContent = `Using your plan for ${plan.eventName || plan.destination}. Tell us what you actually did below.`;
      line.hidden = false;
    }
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    form.querySelector('input[name="mode"]')?.focus();
  }

  function planItem(plan, canUse, removePlan) {
    const item = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'entries__plan-name';
    name.textContent = plan.eventName || plan.destination;
    item.append(name);
    const meta = document.createElement('span');
    meta.className = 'entries__plan-meta';
    meta.textContent = [
      plan.origin ? `From ${plan.origin}` : '',
      plan.eventName ? plan.destination : '',
      planTime(plan),
      plan.loggedEntryId ? 'Trip entered' : 'Planned',
    ]
      .filter(Boolean)
      .join(' · ');
    item.append(meta);
    const route = directionsUrl(plan);
    if (route) {
      const link = document.createElement('a');
      link.href = route;
      link.className = 'entries__plan-use';
      link.textContent = 'Directions in Google Maps ↗';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      item.append(link);
    }
    if (canUse && !plan.loggedEntryId) {
      const use = document.createElement('button');
      use.type = 'button';
      use.className = 'entries__plan-use body-link';
      use.textContent = 'Use this plan for today’s entry';
      use.addEventListener('click', () => usePlanForEntry(plan));
      item.append(use);
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'entries__plan-use body-link';
    remove.textContent = 'Remove plan';
    remove.addEventListener('click', () => void removePlan(plan));
    item.append(remove);
    return item;
  }

  window.lvwwdPlanCards = ({ api, showSignedOut, renderEntries }) => {
    let me;

    async function removePlan(plan) {
      if (!window.confirm(`Remove your plan for ${plan.eventName || plan.destination}?`)) return;
      const { ok, status, data } = await api.call('DELETE', '/api/plans', { id: plan.id });
      if (status === 401) return showSignedOut();
      if (!ok) {
        const line = document.querySelector('[data-plan-status]');
        if (line) line.textContent = data.message;
        return undefined;
      }
      me.plans = (me.plans ?? []).filter((saved) => saved.id !== plan.id);
      const form = document.querySelector('[data-trip-form]');
      const selectedId = form?.querySelector('[data-trip-plan-id]');
      if (selectedId instanceof HTMLInputElement && String(selectedId.value) === String(plan.id)) {
        selectedId.value = '';
        selectedId.disabled = true;
        const selected = form.querySelector('[data-trip-plan-selected]');
        if (selected) {
          selected.textContent = '';
          selected.hidden = true;
        }
      }
      renderEntries();
      const line = document.querySelector('[data-plan-status]');
      if (line) line.textContent = 'Plan removed. Your logged trips are unchanged.';
      return undefined;
    }

    function render(currentMe, done) {
      me = currentMe;
      document.querySelectorAll('[data-day]').forEach((box) => {
        const day = Number(box.getAttribute('data-day'));
        const list = box.querySelector('[data-day-plans]');
        if (!list) return;
        const plans = (me.plans ?? []).filter((plan) => plan.day === day);
        list.replaceChildren(
          ...plans.map((plan) => planItem(plan, day === me.today && !done.has(day), removePlan)),
        );
        list.hidden = plans.length === 0;
      });
    }

    return { render };
  };
})();
