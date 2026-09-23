import { SIGNED_IN_UNTIL } from './time';

/**
 * The two cookies that sign a phone in. The session cookie carries the
 * token and is HttpOnly, so page scripts can never read it. The flag cookie
 * says only "this phone is signed in", so site-nav.js can switch the header
 * button to "My week" without asking the server.
 */
export const SESSION_COOKIE = '__Host-lvwwd_session';
export const FLAG_COOKIE = 'lvwwd_signed_in';

const UNTIL = SIGNED_IN_UNTIL.toUTCString();
const GONE = 'Thu, 01 Jan 1970 00:00:00 GMT';

export function signInCookies(token: string): string[] {
  return [
    `${SESSION_COOKIE}=${token}; Path=/; Expires=${UNTIL}; HttpOnly; Secure; SameSite=Lax`,
    `${FLAG_COOKIE}=1; Path=/; Expires=${UNTIL}; Secure; SameSite=Lax`,
  ];
}

export function signOutCookies(): string[] {
  return [
    `${SESSION_COOKIE}=; Path=/; Expires=${GONE}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
    `${FLAG_COOKIE}=; Path=/; Expires=${GONE}; Max-Age=0; Secure; SameSite=Lax`,
  ];
}

/** One cookie's value from the request, or null. */
export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const pair of header.split(';')) {
    const at = pair.indexOf('=');
    if (at > 0 && pair.slice(0, at).trim() === name) return pair.slice(at + 1).trim();
  }
  return null;
}
