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
  it('opens review as a focused page with navigation and a useful empty state', async () => {
    const response = adminPage(context(), filters, data);
    const body = await response.text();
    expect(body).toContain('Skip to main content');
    expect(body).toContain('aria-label="Admin tasks"');
    expect(body).toContain('No entries awaiting review');
    expect(body).not.toContain('action="/admin/tags"');
    expect(body).not.toContain('action="/admin/draw"');
    expect(body.match(/<h1>/g)).toHaveLength(1);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
  it('opens each task directly without rendering the other forms', async () => {
    const tags = await adminPage(context('?section=tag'), filters, data).text();
    expect(tags).toContain('action="/admin/tags"');
    expect(tags).not.toContain('id="queue"');
    const draw = await adminPage(context('?section=draw'), filters, data).text();
    expect(draw).toContain('The draw opens October 14, 2026.');
    expect(draw).not.toContain('action="/admin/tags"');
    const activity = await adminPage(context('?section=counts'), filters, data).text();
    expect(activity).toContain('scope="col"');
    expect(activity).toContain('scope="row"');
    expect(activity).not.toContain('action="/admin/tags"');
  });
  it('returns action notices to the task that produced them', async () => {
    const tag = await adminPage(context('?notice=tag-entered'), filters, data).text();
    expect(tag).toContain('action="/admin/tags"');
    const push = await adminPage(context('?notice=push-failed'), filters, data).text();
    expect(push).toContain('id="reminders"');
    const draw = await adminPage(context('?notice=draw-stale'), filters, data).text();
    expect(draw).toContain('id="draw"');
  });
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
  it('does not offer an empty prize draw after the draw date', async () => {
    const c = context('?section=draw');
    c.now = new Date('2026-10-14T18:00:00Z');
    const body = await adminPage(c, filters, data).text();
    expect(body).toContain('No eligible entries are available');
    expect(body).not.toContain('action="/admin/draw"');
  });
});
