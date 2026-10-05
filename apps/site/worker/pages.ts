import type { Env } from './env';
import { newsletterConfigured } from './api/newsletter';

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
  // Availability comes from current Worker bindings, not the static asset's ETag.
  const assetRequest = new Request(request, { headers: new Headers(request.headers) });
  assetRequest.headers.delete('If-None-Match');
  assetRequest.headers.delete('If-Modified-Since');
  const response = await env.ASSETS.fetch(assetRequest);
  if (!response.headers.get('Content-Type')?.includes('text/html')) return response;

  const headers = new Headers(response.headers);
  headers.delete('ETag');
  if (privateForm) {
    headers.set('Cache-Control', 'no-store');
  }
  const page = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });

  const key = env.TURNSTILE_SITE_KEY?.trim();
  const available = canShowForm(path, env, key);
  if (!available) {
    if (!privateForm) return page;
    return new HTMLRewriter()
      .on('[data-signup-form]', {
        element(element) {
          element.setAttribute('hidden', '');
          element.setAttribute('data-turnstile-unavailable', '');
          // A cached script can clear `hidden`. Keep the unavailable form
          // visually and interactively blocked until current code confirms
          // this person is signed in and editing their details.
          element.setAttribute('style', 'display: none !important');
          element.setAttribute('inert', '');
        },
      })
      .on('[data-link-form]', {
        element(element) {
          element.setAttribute('hidden', '');
          element.setAttribute('data-turnstile-unavailable', '');
          element.setAttribute('style', 'display: none !important');
          element.setAttribute('inert', '');
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

  const rewriter = new HTMLRewriter().on('[data-turnstile]', {
    element(element) {
      element.setAttribute('data-sitekey', key ?? '');
    },
  });
  rewriter.on('[data-keep-going]', {
    element(element) {
      if (env.DB && newsletterConfigured(env)) element.setAttribute('data-one-tap', 'on');
      else element.removeAttribute('data-one-tap');
    },
  });
  if (path === '/sign-up' && !env.RESEND_API_KEY?.trim()) {
    rewriter.on('[data-email-unavailable]', {
      element(element) {
        element.removeAttribute('hidden');
      },
    });
  }
  return rewriter.transform(page);
}
