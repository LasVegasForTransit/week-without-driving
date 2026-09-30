import { bindings, defineConfig, triggers } from 'cf/config';

// The production Worker. The site package holds the Astro build and a Wrangler
// fallback mirror. This deploy package has no Astro dependency so cf uses its
// Wrangler bundler for the Worker and static assets.
export default defineConfig({
  accountId: '2557b5c2e166292ded0f8425b73075e9',
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
        schedule: '1-59/2 15 1-8 10 *',
      }),
    ],
    env: {
      VAPID_SUBJECT: bindings.text('mailto:wwd@lasvegasfortransit.org'),
      RESEND_API_KEY: bindings.secret(),
      TURNSTILE_SECRET: bindings.secret(),
      ACCESS_TEAM_DOMAIN: bindings.secret(),
      ACCESS_AUD: bindings.secret(),
      VAPID_PRIVATE_KEY: bindings.secret(),
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
