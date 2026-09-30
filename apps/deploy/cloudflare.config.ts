import { bindings, defineConfig, triggers } from 'cf/config';

// The production Worker. The site package holds the Astro build and a Wrangler
// fallback mirror. This deploy package has no Astro dependency so cf uses its
// Wrangler bundler for the Worker and static assets.
export default defineConfig({
  worker: {
    name: 'lvwwd',
    compatibilityDate: '2026-08-31',
    entrypoint: '../site/worker/index.ts',
    observability: {
      enabled: true,
    },
    assets: {
      htmlHandling: 'drop-trailing-slash',
      notFoundHandling: '404-page',
      runWorkerFirst: true,
    },
    triggers: [
      triggers.fetch({
        pattern: 'lvwwd.org/*',
        zone: 'lvwwd.org',
      }),
      triggers.fetch({
        pattern: 'www.lvwwd.org/*',
        zone: 'lvwwd.org',
      }),
      triggers.scheduled({
        schedule: '0 13 * * *',
      }),
      triggers.scheduled({
        schedule: '2-59/5 * * * *',
      }),
    ],
    env: {
      VAPID_SUBJECT: bindings.text('mailto:wwd@lasvegasfortransit.org'),
      TURNSTILE_SITE_KEY: bindings.text('0x4AAAAAAFJwyZWXSScAitjH'),
      RESEND_API_KEY: bindings.secret(),
      TURNSTILE_SECRET: bindings.secret(),
      ACCESS_TEAM_DOMAIN: bindings.secret(),
      ACCESS_AUD: bindings.secret(),
      VAPID_PRIVATE_KEY: bindings.secret(),
      GOOGLE_ROUTES_API_KEY: bindings.secret(),
      // A release switch, not a credential. Keep event-specific reminders off
      // until a real production phone has received and opened a test push.
      EVENT_REMINDERS_ENABLED: bindings.text('false'),
      DB: bindings.d1({
        name: 'lvwwd',
        id: 'a3a6c177-f000-4a64-8bc8-a4aad6d07cf1',
      }),
      PHOTOS: bindings.r2({
        name: 'lvwwd-photos',
      }),
      ASSETS: bindings.assets(),
    },
  },
});
