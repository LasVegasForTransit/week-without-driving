import type { Env } from './env';

/**
 * The site key differs between preview and production, so the Worker writes
 * it into the built pages. Without both Turnstile values, sign-up shows its
 * unavailable state. Link recovery also needs email delivery (or preview
 * links) before its form appears. These states reach the browser as HTML.
 * My week and Home ('' once the trailing slash is dropped) also hold a
 * widget for the optional newsletter card.
 */
export const TURNSTILE_PAGES = new Set(['/sign-up', '/my-week/link', '/my-week', '']);

function canShowForm(path: string, env: Env, key: string | undefined): boolean {
  if (!key || !env.TURNSTILE_SECRET?.trim()) return false;
  if (path !== '/my-week/link') return true;
  return Boolean(env.RESEND_API_KEY?.trim()) || env.PREVIEW_SHOW_LINKS === 'true';
}

export async function withSiteKey(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  const privateForm = path === '/sign-up' || path === '/my-week/link';
  const assetRequest = privateForm
    ? new Request(request, { headers: new Headers(request.headers) })
    : request;
  if (privateForm) {
    assetRequest.headers.delete('If-None-Match');
    assetRequest.headers.delete('If-Modified-Since');
  }
  const response = await env.ASSETS.fetch(assetRequest);
  if (!response.headers.get('Content-Type')?.includes('text/html')) return response;

  const headers = new Headers(response.headers);
  if (privateForm) {
    headers.set('Cache-Control', 'no-store');
    headers.delete('ETag');
  }
  const page = privateForm
    ? new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    : response;

  const key = env.TURNSTILE_SITE_KEY?.trim();
  const available = canShowForm(path, env, key);
  if (!available) {
    if (!privateForm) return page;
    return new HTMLRewriter()
      .on('[data-signup-form]', {
        element(element) {
          element.setAttribute('hidden', '');
          element.setAttribute('data-turnstile-unavailable', '');
        },
      })
      .on('[data-link-form]', {
        element(element) {
          element.setAttribute('hidden', '');
          element.setAttribute('data-turnstile-unavailable', '');
        },
      })
      .on('[data-signup-unavailable]', {
        element(element) {
          element.removeAttribute('hidden');
        },
      })
      .on('[data-link-unavailable]', {
        element(element) {
          element.removeAttribute('hidden');
        },
      })
      .on('[data-link-instructions]', {
        element(element) {
          element.setAttribute('hidden', '');
        },
      })
      .transform(page);
  }

  return new HTMLRewriter()
    .on('[data-turnstile]', {
      element(element) {
        element.setAttribute('data-sitekey', key ?? '');
      },
    })
    .transform(page);
}
