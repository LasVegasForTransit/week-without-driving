import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));

void test('the actual required Turbo graph includes uncached security gates with the original audit budget', async () => {
  const { scripts } = JSON.parse(
    await readFile(new URL('../../../package.json', import.meta.url), 'utf8'),
  ) as {
    scripts: Record<string, string>;
  };
  assert.equal(scripts['security:dependencies'], 'pnpm audit --audit-level=high');
  assert.equal(scripts['security:secrets'], 'lvbt check secrets');
  const result = spawnSync(
    'pnpm',
    ['exec', 'turbo', 'run', 'lint', 'check-types', 'test', 'validate', '--dry=json'],
    {
      cwd: root,
      env: { ...process.env, pnpm_config_verify_deps_before_run: 'error' },
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  const graph = JSON.parse(result.stdout) as {
    tasks: { taskId: string; dependencies: string[]; resolvedTaskDefinition: { cache: boolean } }[];
  };
  const validation = graph.tasks.find(
    (task) => task.taskId === '@lasvegasfortransit/site#validate',
  );
  assert.ok(validation);
  for (const name of ['security:dependencies', 'security:secrets']) {
    const id = `//#${name}`;
    const task = graph.tasks.find((task) => task.taskId === id);
    assert.ok(task, `${id} must run through pnpm check`);
    assert.equal(task.resolvedTaskDefinition.cache, false);
    assert.ok(validation.dependencies.includes(id));
  }
});

void test('CI runs one required full-history gate instead of duplicate security commands', async () => {
  const ci = await readFile(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(ci, /name: Validate/);
  assert.match(ci, /fetch-depth: 0/);
  assert.match(ci, /run: pnpm check/);
  assert.doesNotMatch(ci, /name: Dependency audit|name: Secret scan|docker run|run: pnpm audit/);
});
