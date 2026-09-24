import type { Env } from './env';

/**
 * The partner banners under /partners/banners/ are shown on other
 * organizations' websites, so they go out with headers that let any site
 * show them, including sites with strict isolation settings, and that let
 * browsers keep a copy for a day. Everything else about the files comes
 * from the static assets.
 */
export const BANNER_PATH = '/partners/banners/';

export const BANNER_HEADERS = {
  'Content-Type': 'image/png',
  'Access-Control-Allow-Origin': '*',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'Cache-Control': 'public, max-age=86400',
} as const;

export async function serveBanner(request: Request, env: Env): Promise<Response> {
  const response = await env.ASSETS.fetch(request);
  if (response.status >= 400) return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(BANNER_HEADERS)) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
