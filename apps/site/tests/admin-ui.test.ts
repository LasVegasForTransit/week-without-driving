import { describe, expect, it } from 'vitest';

import type { AdminContext } from '../worker/admin/common';
import type { PageData } from '../worker/admin/queries';
import { adminPage } from '../worker/admin/view';

const data: PageData = {
  stats: [],
  totals: {
    participants: 2,
    to_check: 0,
    checked: 0,
    removed: 0,
    entrants: 0,
    eligible_entries: 0,
    eligible_entrants: 0,
  },
  entries: [],
  more: false,
  draws: [],
  volunteers: ['sam@lvbt.test'],
  partners: [],
  pushes: { rows: [], total: 0 },
};
const filters = { view: 'check' as const, day: 0, page: 0 };
function context(query = ''): AdminContext {
  return {
    url: new URL(`https://lvwwd.test/admin${query}`),
    volunteer: 'sam@lvbt.test',
    now: new Date('2026-10-01T18:00:00Z'),
    env: {},
  } as AdminContext;
}

describe('admin task navigation', () => {
  it('preserves the rejected tag draft and confirmation while showing its error', async () => {
    const values = new FormData();
    values.set('handle', 'rosa.rides');
    values.set('day', '3');
    values.set('link', 'https://instagram.com/p/test/');
    values.set('trip-confirmed', 'yes');
    const response = adminPage(context(), filters, data, {
      prefill: { form: 'tag', values },
      notice: { text: 'That handle is not registered.', problem: true },
      status: 400,
    });
    const body = await response.text();
    expect(response.status).toBe(400);
    expect(body).toContain('role="alert"');
    expect(body).toContain('value="rosa.rides"');
    expect(body).toMatch(/value="3"\s+selected/);
    expect(body).toContain('value="https://instagram.com/p/test/"');
    expect(body).toMatch(/name="trip-confirmed"[\s\S]*?checked/);
    expect(body).not.toContain('id="queue"');
  });
  it('keeps day and status while paging and provides a way out of empty filters', async () => {
    const body = await adminPage(
      context(),
      { view: 'removed', day: 3, page: 1 },
      { ...data, more: true },
    ).text();
    expect(body).toContain('view=removed&amp;day=3');
    expect(body).toContain('page=2');
    expect(body).toContain('View all days');
    expect(body).toContain('No removed entries for Oct 3.');
  });
});
