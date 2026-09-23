import { readCookie } from '../cookies';
import type { Env } from '../env';
import { sha256 } from '../tokens';
import { accessEmail } from './access';
import { messagePage } from './html';

/**
 * Who may open the admin views. On lvwwd.org, only a volunteer that
 * Cloudflare Access signed in, as checked in access.ts.
 *
 * The workers.dev preview has no Access in front of it, so it has one
 * other way in: when the secret PREVIEW_ADMIN_KEY is set, opening
 * /admin/preview-login?key=<the key> sets a cookie holding the key for 8
 * hours, and a request with that cookie is the volunteer
 * preview@lvwwd.org. Production must never set PREVIEW_ADMIN_KEY: with it
 * unset, this way in does not exist.
 */

export const PREVIEW_COOKIE = 'lvwwd_admin_preview';
export const PREVIEW_VOLUNTEER = 'preview@lvwwd.org';

const PREVIEW_SECONDS = 8 * 60 * 60;
// A key shorter than this is treated as unset, so a weak key can't open the door.
const MIN_KEY_LENGTH = 32;

function usableKey(env: Env): string | null {
  const key = env.PREVIEW_ADMIN_KEY;
  return key && key.length >= MIN_KEY_LENGTH ? key : null;
}

/** Compares two secrets in time that doesn't depend on where they differ. */
async function sameSecret(given: string, key: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(given), sha256(key)]);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

/** The volunteer making this request, by email, or null when they may not. */
export async function volunteerFor(request: Request, env: Env, now: Date): Promise<string | null> {
  const email = await accessEmail(request, env, now);
  if (email) return email;
  const key = usableKey(env);
  const cookie = readCookie(request, PREVIEW_COOKIE);
  return key && cookie && (await sameSecret(cookie, key)) ? PREVIEW_VOLUNTEER : null;
}

export function forbiddenPage(): Response {
  return messagePage(
    403,
    'Volunteers only',
    'This page is for Week Without Driving volunteers. Sign in through the volunteer sign-in, then open it again.',
  );
}

/**
 * GET /admin/preview-login?key=…: on the preview only, lets a tester in
 * without Access. The key leaves the address bar straight away.
 */
export async function previewLogin(url: URL, env: Env): Promise<Response> {
  const key = usableKey(env);
  const given = url.searchParams.get('key') ?? '';
  if (!key || !(await sameSecret(given, key))) return forbiddenPage();
  const attributes = `Max-Age=${PREVIEW_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
  const headers = new Headers({
    Location: '/admin',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  });
  headers.append('Set-Cookie', `${PREVIEW_COOKIE}=${key}; Path=/admin; ${attributes}`);
  // The screenshots and the CSV file are under /api/admin, which a cookie
  // for /admin doesn't reach.
  headers.append('Set-Cookie', `${PREVIEW_COOKIE}=${key}; Path=/api/admin; ${attributes}`);
  return new Response(null, { status: 303, headers });
}
