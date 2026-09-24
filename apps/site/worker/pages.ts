import type { Env } from './env';

/**
 * The static pages that hold a Turnstile widget. The site key differs
 * between the preview and production Workers while the built pages are the
 * same, so the Worker writes the key into the widget's data-sitekey as the
 * page goes out. My week and Home ('' once the trailing slash is dropped)
 * hold the newsletter card's widget.
 */
export const TURNSTILE_PAGES = new Set(['/sign-up', '/my-week/link', '/my-week', '']);

export async function withSiteKey(request: Request, env: Env): Promise<Response> {
  const response = await env.ASSETS.fetch(request);
  const key = env.TURNSTILE_SITE_KEY;
  if (!key || !response.headers.get('Content-Type')?.includes('text/html')) return response;
  return new HTMLRewriter()
    .on('[data-turnstile]', {
      element(element) {
        element.setAttribute('data-sitekey', key);
      },
    })
    .transform(response);
}
