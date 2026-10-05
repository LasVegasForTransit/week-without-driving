import { handleAdmin, isAdminPath } from './admin/index';
import { handleApi } from './api/index';
import { BANNER_PATH, serveBanner } from './banners';
import { CLEANUP_CRON, dailyCleanup } from './cleanup';
import type { Env } from './env';
import { openLink } from './links';
import { smsWebhook } from './sms/webhook';
import { sendSmsReminders } from './sms/daily';
import { PUSHES_PER_RUN } from './push/batch';
import { TURNSTILE_PAGES, withSiteKey } from './pages';
import { PLAN_PUSH_CRONS, sendPlanReminders } from './push/plans';
import { redirectFor } from './redirect';

/**
 * lvwwd.org's Worker. The site is static pages; the Worker adds the
 * participant API under /api/, the volunteer admin views under /admin and
 * /api/admin/ (behind Cloudflare Access), opens "Open my week" links, writes the
 * Turnstile site key into the two pages with a bot check, lets other sites
 * show the partner banners, and answers old addresses (www, /wwd, a slash
 * at the end) with one redirect each (redirect.ts). wrangler.jsonc's
 * run_worker_first sends it every request before the assets see it.
 *
 * Cron Triggers run daily cleanup or the shared saved-plan and text reminder job.
 */

// Only the default export: the runtime reads every named export of the entry
// module as another entrypoint.
export default {
  async fetch(request, env, ctx): Promise<Response> {
    const redirect = redirectFor(request);
    if (redirect) return redirect;
    const url = new URL(request.url);
    if (isAdminPath(url.pathname)) return handleAdmin(request, env, ctx);
    if (url.pathname === '/api/sms/webhook') return smsWebhook(request, env);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env, ctx);
    if (url.pathname.startsWith(BANNER_PATH)) return serveBanner(request, env);

    const page = url.pathname.replace(/\/$/, '');
    if (page === '/my-week' && request.method === 'GET' && url.searchParams.has('t')) {
      return openLink(request, env, new Date());
    }
    if (TURNSTILE_PAGES.has(page)) return withSiteKey(request, env);
    return env.ASSETS.fetch(request);
  },

  async scheduled(controller, env): Promise<void> {
    const now = new Date(controller.scheduledTime);
    if (controller.cron === CLEANUP_CRON) return dailyCleanup(env, now);
    if (PLAN_PUSH_CRONS.some((cron) => cron === controller.cron)) {
      const attempted = await sendPlanReminders(
        env,
        new Date(Math.max(controller.scheduledTime, Date.now())),
      );
      return sendSmsReminders(
        env,
        new Date(Math.max(controller.scheduledTime, Date.now())),
        PUSHES_PER_RUN - attempted,
      );
    }
    console.warn('No job runs on this Cron Trigger', controller.cron);
    return undefined;
  },
} satisfies ExportedHandler<Env>;
