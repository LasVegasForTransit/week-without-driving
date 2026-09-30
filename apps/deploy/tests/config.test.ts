import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

import cloudflare from '../cloudflare.config.ts';
import wranglerBuild from '../wrangler.config.ts';

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
    cloudflare.worker.triggers
      .filter((trigger) => trigger.type === 'scheduled')
      .map((trigger) => trigger.schedule),
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
    Object.entries(cloudflare.worker.env).flatMap(([name, binding]) =>
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
    Object.entries(cloudflare.worker.env)
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
  const configured = Object.entries(cloudflare.worker.env).flatMap(([name, binding]) =>
    binding.type === 'text' ? [name] : [],
  );
  assert.deepEqual(configured.sort(), inventory.vars.map((variable) => variable.name).sort());
  assert.deepEqual(Object.keys(wrangler.vars).sort(), configured.sort());
  const siteKey = wrangler.vars.TURNSTILE_SITE_KEY;
  assert.ok(siteKey, 'the public Turnstile site key must be configured');
  assert.match(siteKey, /^0x[A-Za-z0-9_-]+$/);
});
