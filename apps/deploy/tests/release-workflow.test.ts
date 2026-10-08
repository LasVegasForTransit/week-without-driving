import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
void test('main only builds and publishes protected staging; production uses explicit saved-release promotion', async () => {
  const staging = await readFile(
    new URL('../../../.github/workflows/deploy.yml', import.meta.url),
    'utf8',
  );
  assert.match(staging, /name: Deploy staging/);
  assert.match(staging, /release-build\.yml@[a-f0-9]{40}/);
  assert.match(staging, /target: preview/);
  assert.match(staging, /needs: \[build, attest\]/);
  assert.match(staging, /release-attest\.yml@[a-f0-9]{40}/);
  assert.match(staging, /attestation-prefix: attestation-lvwwd-release/);
  assert.doesNotMatch(staging, /wrangler deploy|target: production/);
  const promotion = await readFile(
    new URL('../../../.github/workflows/promote.yml', import.meta.url),
    'utf8',
  );
  assert.match(promotion, /workflow_dispatch:/);
  assert.match(
    promotion,
    /expected_version:\s+description:\s+[^\n]+\s+type: string\s+required: false/,
  );
  assert.match(promotion, /expected-version: \$\{\{ inputs.expected_version \}\}/);
  assert.match(promotion, /production-environment: production/);
  assert.match(promotion, /release-source\.yml@[a-f0-9]{40}/);
  assert.match(promotion, /release-publish\.yml@[a-f0-9]{40}/);
  assert.match(promotion, /target: production/);
  assert.match(promotion, /attestation-prefix: attestation-lvwwd-release/);
  assert.doesNotMatch(promotion, /pnpm build|wrangler deploy/);
});
