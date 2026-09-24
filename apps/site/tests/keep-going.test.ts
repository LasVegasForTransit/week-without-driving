import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

/**
 * Runs the real public/scripts/keep-going.js in a sandbox and checks the
 * email rule and the message for every reply of POST /api/newsletter. The
 * card itself is checked in a browser by tests/e2e/keep-going.spec.ts.
 */

interface KeepGoing {
  checkEmail(value: string): string;
  messageFor(status: number, error?: string): string;
  CLOSES: number;
}

function load(): KeepGoing {
  const source = readFileSync(new URL('../public/scripts/keep-going.js', import.meta.url), 'utf8');
  const window: { lvwwdKeepGoing?: KeepGoing } = {};
  vm.runInNewContext(source, { window });
  if (!window.lvwwdKeepGoing) throw new Error('The script did not set window.lvwwdKeepGoing');
  return window.lvwwdKeepGoing;
}

const card = load();
const WRONG = 'Something went wrong. Please try again.';

describe('the keep-going card', () => {
  it('asks for an address when the field is empty, and a full one when it is not', () => {
    expect(card.checkEmail('   ')).toBe('Enter your email address.');
    for (const bad of [
      'name',
      'name@',
      'name@example',
      'na me@example.com',
      `${'a'.repeat(250)}@x.org`,
    ]) {
      expect(card.checkEmail(bad), bad).toBe('Enter a full email address, like name@example.com.');
    }
    expect(card.checkEmail(' Name@Example.COM ')).toBe('');
  });

  it.each([
    [
      200,
      undefined,
      "Almost done! Check your email for a message from Las Vegans for Better Transit, and tap Confirm my subscription. Already subscribed? You're all set.",
    ],
    [400, 'invalid_email', 'Enter a full email address, like name@example.com.'],
    [429, 'rate_limited', 'Too many tries. Wait a minute, then try again.'],
    [
      403,
      'verification_failed',
      "We couldn't confirm you're a person. Reload the page and try again.",
    ],
    [
      502,
      'newsletter_unavailable',
      "LVBT's newsletter service isn't answering right now. Please try again in a few minutes.",
    ],
    [405, 'method_not_allowed', WRONG],
    [400, 'invalid_json', WRONG],
    [400, 'invalid_request', WRONG],
    [400, 'invalid_source', WRONG],
    [503, 'bot_check_unavailable', WRONG],
    [500, 'internal', WRONG],
    [502, undefined, WRONG],
    [
      0,
      undefined,
      "We couldn't reach the server. Check your connection and tap Join the newsletter again.",
    ],
  ])('shows the right message for a %i %s reply', (status, error, message) => {
    expect(card.messageFor(status, error)).toBe(message);
  });

  it('switches Home at 12:00 am October 9, 2026, Las Vegas time', () => {
    expect(new Date(card.CLOSES).toISOString()).toBe('2026-10-09T07:00:00.000Z');
  });
});
