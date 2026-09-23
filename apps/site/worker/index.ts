import { handleApi } from './api/index';
import { dailyCleanup } from './cleanup';
import type { Env } from './env';
import { openLink } from './links';
import { TURNSTILE_PAGES, withSiteKey } from './pages';
import { redirectFor } from './redirect';

/**
 * lvwwd.org's Worker. The site is static pages; the Worker adds the
 * participant API under /api/, opens "Open my week" links, writes the
 * Turnstile site key into the two pages with a bot check, and sends www to
 * the apex. wrangler.jsonc's run_worker_first lists the page paths it has
 * to see before the assets do.
 */

// Only the default export: the runtime reads every named export of the entry
// module as another entrypoint.
export default {
  async fetch(request, env, ctx): Promise<Response> {
    const redirect = redirectFor(request);
    if (redirect) return redirect;
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env, ctx);

    const page = url.pathname.replace(/\/$/, '');
    if (page === '/my-week' && request.method === 'GET' && url.searchParams.has('t')) {
      return openLink(request, env, new Date());
    }
    if (TURNSTILE_PAGES.has(page)) return withSiteKey(request, env);
    return env.ASSETS.fetch(request);
  },

  async scheduled(controller, env): Promise<void> {
    await dailyCleanup(env, new Date(controller.scheduledTime));
  },
} satisfies ExportedHandler<Env>;
