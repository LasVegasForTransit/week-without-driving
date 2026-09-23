/**
 * Small helpers for API responses and requests. Every API answer is JSON
 * with no caching, and every error carries a plain-language `message` the
 * page can show as it is.
 */

// Bingo's 4 KB is the largest thing anyone sends as JSON; this leaves room.
const MAX_JSON_BYTES = 16 * 1024;

export const MESSAGES = {
  serverError: 'Something went wrong on our side. Try again in a minute.',
  notSignedIn: 'You’re not signed in on this phone.',
  forbidden: 'That request didn’t come from lvwwd.org, so we ignored it.',
  badRequest: 'That request didn’t make sense. Reload the page and try again.',
  notFound: 'There’s nothing here.',
  notOpen: 'Sign-up isn’t open yet. Try again soon.',
} as const;

export function json(body: unknown, status = 200, cookies: string[] = []): Response {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

export function problem(status: number, message: string, extra: object = {}): Response {
  return json({ ...extra, message }, status);
}

/**
 * Writes must come from our own pages: the Origin header has to be this
 * site, and the body has to be JSON (or a multipart photo). A form on
 * another site can send neither, so this stops cross-site requests riding
 * on the session cookie.
 */
export function isSameOriginWrite(request: Request, url: URL, multipart: boolean): boolean {
  if (request.headers.get('Origin') !== url.origin) return false;
  const type = (request.headers.get('Content-Type') ?? '').toLowerCase();
  return multipart ? type.startsWith('multipart/form-data') : type.startsWith('application/json');
}

/** The visitor's IP address, as Cloudflare reports it. */
export function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'unknown';
}

/** The request body as a JSON object, or null when it is too big or isn't one. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (declared > MAX_JSON_BYTES) return null;
  const text = await request.text();
  if (text.length > MAX_JSON_BYTES) return null;
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
