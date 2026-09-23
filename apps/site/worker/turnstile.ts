import type { Env } from './env';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type BotCheck = 'pass' | 'fail' | 'unavailable';

/**
 * Asks Turnstile whether the token from the page's widget is real. A
 * missing secret or an unreachable Turnstile is "unavailable", not "pass":
 * the forms stay closed rather than open to bots.
 */
export async function checkTurnstile(env: Env, token: unknown, ip: string): Promise<BotCheck> {
  if (!env.TURNSTILE_SECRET) {
    console.error('TURNSTILE_SECRET is not set, so sign-ups and links are refused.');
    return 'unavailable';
  }
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) return 'fail';
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
  if (ip !== 'unknown') body.set('remoteip', ip);
  try {
    const response = await fetch(SITEVERIFY, { method: 'POST', body });
    if (!response.ok) return 'unavailable';
    const result: { success?: unknown } = await response.json();
    return result.success === true ? 'pass' : 'fail';
  } catch (error) {
    console.error('Turnstile siteverify failed', error);
    return 'unavailable';
  }
}
