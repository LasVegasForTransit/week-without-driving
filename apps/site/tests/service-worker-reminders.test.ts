import { describe, expect, it, vi } from 'vitest';

import { REMINDERS } from '../src/lib/reminders';
import { BUILD, ORIGIN, load, openWindow } from './support/service-worker';

// The service worker's part in the daily reminders: showing each push as a
// notification, and opening My week when one is tapped.
describe('daily reminders', () => {
  /** A push message carrying a reminder, as the browser hands it over once decrypted. */
  const pushData = (value: unknown) => ({ json: () => value });

  it('shows the reminder the Worker sent, replacing the one before, and stores nothing', async () => {
    const { self, extendable, caches } = load(BUILD);
    const [first] = REMINDERS.messages;
    await extendable('push', { data: pushData({ title: first?.title, body: first?.body }) });
    expect(self.registration.showNotification).toHaveBeenCalledWith(first?.title, {
      body: first?.body,
      icon: '/icons/icon-192.png',
      tag: 'wwd-reminder',
      renotify: true,
      data: { url: '/my-week' },
    });
    expect(caches.everything()).toEqual([]);
  });

  it('still shows a reminder when a push arrives without one', async () => {
    const { self, extendable } = load(BUILD);
    await extendable('push', { data: null });
    await extendable('push', { data: { json: () => JSON.parse('not json') as unknown } });
    const calls = self.registration.showNotification.mock.calls;
    expect(calls).toHaveLength(2);
    for (const [title, options] of calls) {
      expect(title).toBe('Week Without Driving Las Vegas');
      const shown = options as { tag: string; body: string };
      expect(shown.tag).toBe('wwd-reminder');
      expect(shown.body).toContain('My week');
    }
  });

  it.each(REMINDERS.messages.map((message) => [message.day, message]))(
    'opens My week in the open window when day %i’s reminder is tapped',
    async (_, message) => {
      const open = openWindow(`${ORIGIN}/guides`);
      const { extendable, self } = load(BUILD, { windows: [open] });
      await extendable('push', { data: pushData({ title: message.title, body: message.body }) });
      const notification = { close: vi.fn(), data: { url: '/my-week' } };
      await extendable('notificationclick', { notification });
      expect(notification.close).toHaveBeenCalled();
      expect(open.focus).toHaveBeenCalled();
      expect(open.navigate).toHaveBeenCalledWith('/my-week');
      expect(self.clients.openWindow).not.toHaveBeenCalled();
    },
  );

  it.each(REMINDERS.messages.map((message) => [message.day]))(
    'opens a new window at My week when day %i’s reminder is tapped and none is open',
    async () => {
      const elsewhere = openWindow('https://example.com/');
      const { extendable, self } = load(BUILD, { windows: [elsewhere] });
      await extendable('notificationclick', { notification: { close: vi.fn() } });
      expect(self.clients.openWindow).toHaveBeenCalledWith('/my-week');
      expect(elsewhere.navigate).not.toHaveBeenCalled();
    },
  );

  it('opens a new window when the open one can’t be sent to My week', async () => {
    const stuck = openWindow(`${ORIGIN}/`);
    stuck.navigate.mockRejectedValue(new TypeError('not controlled'));
    const { extendable, self } = load(null, { windows: [stuck] });
    await extendable('notificationclick', { notification: { close: vi.fn() } });
    expect(self.clients.openWindow).toHaveBeenCalledWith('/my-week');
  });
});
