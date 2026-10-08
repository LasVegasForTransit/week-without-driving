import { bindings, defineConfig, triggers } from 'cf/config';
import {
  isolatedPreviewBindings,
  type WorkerBindings,
} from '@lasvegasfortransit/web-platform/release';

// The production Worker. The site package holds the Astro build and a Wrangler
// fallback mirror. This deploy package has no Astro dependency so cf uses its
// Wrangler bundler for the Worker and static assets.
const production = defineConfig({
  worker: {
    name: 'lvwwd',
    unsafe: { metadata: { keep_bindings: ['secret_text', 'secret_key'] } },
    compatibilityDate: '2026-08-31',
    entrypoint: '../site/worker/index.ts',
    observability: {
      enabled: true,
      redactQueryString: true,
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
      GOOGLE_ROUTES_API_KEY: bindings.secret(),
      LVBT_BEEHIIV_API_KEY: bindings.secret(),
      LVBT_BEEHIIV_PUBLICATION_ID: bindings.secret(),
      TWILIO_ACCOUNT_SID: bindings.secret(),
      TWILIO_AUTH_TOKEN: bindings.secret(),
      TWILIO_MESSAGING_SERVICE_SID: bindings.secret(),
      TWILIO_VERIFY_SERVICE_SID: bindings.secret(),
      TURNSTILE_SECRET: bindings.secret(),
      ACCESS_TEAM_DOMAIN: bindings.secret(),
      ACCESS_AUD: bindings.secret(),
      VAPID_PRIVATE_KEY: bindings.secret(),
      // A release switch, not a credential. Keep event-specific reminders off
      // until a real production phone has received and opened a test push.
      EVENT_REMINDERS_ENABLED: bindings.text('false'),
      SMS_REMINDERS_ENABLED: bindings.text('false'),
      SMS_ORIGIN: bindings.text('https://lvwwd.org'),
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

export default defineConfig((context) => {
  if (context.mode !== 'preview') return production;
  const origin = process.env.LVBT_PREVIEW_URL;
  const declarations = process.env.LVBT_PREVIEW_BINDINGS;
  if (!origin || !declarations)
    throw new Error(
      'Configure LVBT_PREVIEW_URL and LVBT_PREVIEW_BINDINGS for the isolated preview before building or publishing it.',
    );
  const url = new URL(origin);
  if (
    url.protocol !== 'https:' ||
    url.origin !== origin ||
    ['lvwwd.org', 'www.lvwwd.org'].includes(url.hostname)
  )
    throw new Error('The preview requires its own HTTPS origin, separate from production.');
  const preview = isolatedPreviewBindings(
    production.worker.env as WorkerBindings,
    JSON.parse(declarations),
  );
  validatePreview(preview, origin);
  return {
    worker: {
      ...production.worker,
      name: 'lvwwd-preview',
      triggers: [],
      domains: [url.hostname],
      workersDev: false,
      previewUrls: true,
      env: preview,
    },
  };
});

function validatePreview(preview: WorkerBindings, origin: string): void {
  validatePreviewResources(preview);
  for (const name of ['EVENT_REMINDERS_ENABLED', 'SMS_REMINDERS_ENABLED']) {
    const binding = preview[name];
    if (binding?.type !== 'text' || binding.value !== 'false')
      throw new Error('Protected staging must keep participant reminders disabled.');
  }
  if (preview.SMS_ORIGIN?.type !== 'text' || preview.SMS_ORIGIN.value !== origin)
    throw new Error('Preview communication links must use the preview origin.');
  if (
    preview.TURNSTILE_SITE_KEY?.type !== 'text' ||
    preview.TURNSTILE_SITE_KEY.value === production.worker.env.TURNSTILE_SITE_KEY.value
  )
    throw new Error('Use a preview Turnstile site key, separate from production.');
}

function validatePreviewResources(preview: WorkerBindings): void {
  if (
    preview.DB?.type !== 'd1' ||
    preview.DB.name !== 'lvwwd-preview' ||
    preview.PHOTOS?.type !== 'r2' ||
    preview.PHOTOS.name !== 'lvwwd-preview-photos'
  )
    throw new Error('Preview data must use the resources declared in platform.json.');
}
