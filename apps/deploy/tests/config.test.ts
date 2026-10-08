import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
import type {
  ReleaseConfiguration,
  WorkerBindings,
} from '@lasvegasfortransit/web-platform/release';

import cloudflareFactory from '../cloudflare.config.ts';
const cloudflare =
  typeof cloudflareFactory === 'function'
    ? cloudflareFactory({ mode: 'production', isPreview: false })
    : cloudflareFactory;
import wranglerBuild from '../wrangler.config.ts';
const productionBindings = cloudflare.worker.env as WorkerBindings;

interface WranglerMirror {
  name: string;
  compatibility_date: string;
  main: string;
  observability: { enabled: boolean };
  assets: {
    directory: string;
    binding: string;
    html_handling: string;
    not_found_handling: string;
    run_worker_first: boolean;
  };
  routes: { pattern: string; zone_name: string }[];
  triggers: { crons: string[] };
  d1_databases: {
    binding: string;
    database_name: string;
    database_id: string;
  }[];
  r2_buckets: { binding: string; bucket_name: string }[];
  vars: Record<string, string>;
}

interface SetupInventory {
  cloudflare: { worker: string };
  secrets: { name: string; targets?: string[]; use?: 'live' | 'future' }[];
  vars: { name: string }[];
}

const deployDir = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const siteDir = path.resolve(deployDir, '../site');
const wranglerSource = await readFile(path.join(siteDir, 'wrangler.jsonc'), 'utf8');
const parsed = ts.parseConfigFileTextToJson('wrangler.jsonc', wranglerSource);
assert.equal(parsed.error, undefined, 'Wrangler mirror must remain valid JSONC');
const wrangler = parsed.config as WranglerMirror;
const wranglerBuildConfig = wranglerBuild as { assetsDirectory: string };

void test('production cf config and Wrangler fallback target the same Worker', () => {
  assert.equal(cloudflare.worker.name, wrangler.name);
  assert.equal(cloudflare.worker.compatibilityDate, wrangler.compatibility_date);
  assert.equal(cloudflare.worker.observability.enabled, wrangler.observability.enabled);
  assert.equal(
    path.resolve(deployDir, cloudflare.worker.entrypoint),
    path.resolve(siteDir, wrangler.main),
  );
  assert.equal(
    path.resolve(deployDir, wranglerBuildConfig.assetsDirectory),
    path.resolve(siteDir, wrangler.assets.directory),
  );
  assert.deepEqual(cloudflare.worker.assets, {
    htmlHandling: wrangler.assets.html_handling,
    notFoundHandling: wrangler.assets.not_found_handling,
    runWorkerFirst: wrangler.assets.run_worker_first,
  });
  assert.equal(cloudflare.worker.env.ASSETS.type, 'assets');
  assert.equal(wrangler.assets.binding, 'ASSETS');
});

void test('both production configs publish the same routes, schedules, and resources', () => {
  const mirrorD1 = wrangler.d1_databases.at(0);
  const mirrorR2 = wrangler.r2_buckets.at(0);
  assert.ok(mirrorD1, 'Wrangler mirror needs the participant database');
  assert.ok(mirrorR2, 'Wrangler mirror needs the screenshot bucket');
  assert.deepEqual(
    cloudflare.worker.triggers.filter((trigger) => trigger.type === 'fetch'),
    wrangler.routes.map((route) => ({
      type: 'fetch',
      pattern: route.pattern,
      zone: route.zone_name,
    })),
  );
  assert.deepEqual(
    cloudflare.worker.triggers.flatMap((trigger) =>
      trigger.type === 'scheduled' ? [trigger.schedule] : [],
    ),
    wrangler.triggers.crons,
  );
  assert.deepEqual(cloudflare.worker.env.DB, {
    type: 'd1',
    name: mirrorD1.database_name,
    id: mirrorD1.database_id,
  });
  assert.equal(mirrorD1.binding, 'DB');
  assert.deepEqual(cloudflare.worker.env.PHOTOS, {
    type: 'r2',
    name: mirrorR2.bucket_name,
  });
  assert.equal(mirrorR2.binding, 'PHOTOS');
  assert.deepEqual(
    Object.entries(productionBindings).flatMap(([name, binding]) =>
      binding.type === 'text' ? [[name, binding.value]] : [],
    ),
    Object.entries(wrangler.vars),
  );
});

void test('production secret declarations cover the Worker secrets in the setup inventory', async () => {
  const inventory = JSON.parse(
    await readFile(path.join(siteDir, 'platform.json'), 'utf8'),
  ) as SetupInventory;
  assert.equal('accountId' in cloudflare, false);
  assert.equal(cloudflare.worker.name, inventory.cloudflare.worker);
  assert.deepEqual(
    Object.entries(productionBindings)
      .filter(([, binding]) => binding.type === 'secret')
      .map(([name]) => name)
      .sort(),
    inventory.secrets
      .filter((secret) => !secret.targets && secret.use !== 'future')
      .map((secret) => secret.name)
      .sort(),
  );
});

void test('both deploy configs include every production var from the setup inventory', async () => {
  const inventory = JSON.parse(
    await readFile(path.join(siteDir, 'platform.json'), 'utf8'),
  ) as SetupInventory;
  const configured = Object.entries(productionBindings).flatMap(([name, binding]) =>
    binding.type === 'text' ? [name] : [],
  );
  assert.deepEqual(configured.sort(), inventory.vars.map((variable) => variable.name).sort());
  assert.deepEqual(Object.keys(wrangler.vars).sort(), configured.sort());
  const siteKey = wrangler.vars.TURNSTILE_SITE_KEY;
  assert.ok(siteKey, 'the public Turnstile site key must be configured');
  assert.match(siteKey, /^0x[A-Za-z0-9_-]+$/);
});

void test('release declarations retain canonical SQL and require explicit isolated preview inputs', async () => {
  const tooling = JSON.parse(
    await readFile(path.resolve(deployDir, '../../.lvbt/tooling.json'), 'utf8'),
  ) as { release: ReleaseConfiguration & { previewUrlEnv: string; previewBindingsEnv: string } };
  assert.equal(tooling.release.appDirectory, 'apps/deploy');
  assert.equal(tooling.release.artifactSource, 'typed-worker');
  assert.equal(tooling.release.previewBindingsEnv, 'LVBT_PREVIEW_BINDINGS');
  assert.equal(tooling.release.previewUrlEnv, 'LVBT_PREVIEW_URL');
  assert.equal(tooling.release.workersDevSubdomain, 'las-vegas-for-better-transit');
  assert.deepEqual(tooling.release.migrations, [
    { binding: 'DB', directory: '../site/migrations' },
  ]);
});
void test('staging release replaces automatic production deployment and preserves the existing production credential environment', async () => {
  const staging = await readFile(
    path.resolve(deployDir, '../../.github/workflows/deploy.yml'),
    'utf8',
  );
  const promotion = await readFile(
    path.resolve(deployDir, '../../.github/workflows/promote.yml'),
    'utf8',
  );
  assert.match(staging, /name: Deploy staging/);
  assert.match(staging, /release-build\.yml@[a-f0-9]{40}/);
  assert.match(staging, /artifact-source: typed-worker/);
  assert.match(staging, /target: preview/);
  assert.doesNotMatch(staging, /wrangler deploy|target: production/);
  assert.match(promotion, /workflow_dispatch:/);
  assert.match(promotion, /production-environment: production/);
  assert.match(promotion, /target: production/);
  assert.match(promotion, /release-source\.yml@[a-f0-9]{40}/);
  assert.match(promotion, /release-publish\.yml@[a-f0-9]{40}/);
  assert.doesNotMatch(promotion, /pnpm build|wrangler deploy/);
});

function previewConfiguration(bindings: unknown = previewBindings()) {
  const previousUrl = process.env.LVBT_PREVIEW_URL;
  const previousBindings = process.env.LVBT_PREVIEW_BINDINGS;
  process.env.LVBT_PREVIEW_URL = 'https://preview.example.test';
  process.env.LVBT_PREVIEW_BINDINGS = JSON.stringify(bindings);
  try {
    assert.equal(typeof cloudflareFactory, 'function');
    return cloudflareFactory({ mode: 'preview', isPreview: true });
  } finally {
    if (previousUrl === undefined) delete process.env.LVBT_PREVIEW_URL;
    else process.env.LVBT_PREVIEW_URL = previousUrl;
    if (previousBindings === undefined) delete process.env.LVBT_PREVIEW_BINDINGS;
    else process.env.LVBT_PREVIEW_BINDINGS = previousBindings;
  }
}
function previewBindings() {
  return {
    ...cloudflare.worker.env,
    DB: { type: 'd1', name: 'lvwwd-preview', id: 'fixture-isolated-database' },
    PHOTOS: { type: 'r2', name: 'lvwwd-preview-photos' },
    SMS_ORIGIN: { type: 'text', value: 'https://preview.example.test' },
    TURNSTILE_SITE_KEY: { type: 'text', value: '1x00000000000000000000AA' },
  };
}
void test('preview preserves declared secrets and asset behavior while isolating data and disabling schedules', () => {
  const preview = previewConfiguration();
  assert.equal(preview.worker.name, 'lvwwd-preview');
  assert.deepEqual(preview.worker.domains, ['preview.example.test']);
  assert.deepEqual(preview.worker.triggers, []);
  assert.deepEqual(preview.worker.assets, cloudflare.worker.assets);
  assert.deepEqual(preview.worker.unsafe, cloudflare.worker.unsafe);
  assert.deepEqual(preview.worker.env, previewBindings());
  assert.throws(() => previewConfiguration(cloudflare.worker.env), /isolated resources/);
});
void test('preview refuses undeclared data resources and production communication settings', () => {
  const candidates = [
    {
      ...previewBindings(),
      DB: { type: 'd1', name: 'other-preview', id: 'fixture-isolated-database' },
    },
    { ...previewBindings(), PHOTOS: { type: 'r2', name: 'other-preview-photos' } },
    { ...previewBindings(), SMS_ORIGIN: cloudflare.worker.env.SMS_ORIGIN },
    { ...previewBindings(), SMS_REMINDERS_ENABLED: { type: 'text', value: 'true' } },
    { ...previewBindings(), EVENT_REMINDERS_ENABLED: { type: 'text', value: 'true' } },
    { ...previewBindings(), TURNSTILE_SITE_KEY: cloudflare.worker.env.TURNSTILE_SITE_KEY },
  ];
  for (const candidate of candidates) assert.throws(() => previewConfiguration(candidate));
});
