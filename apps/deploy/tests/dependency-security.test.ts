import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const lintRequire = createRequire(require.resolve('markdownlint-cli2'));
const matchRequire = createRequire(lintRequire.resolve('micromatch'));
const braces = matchRequire('braces') as {
  (pattern: string): string[];
  expand: (pattern: string) => string[];
};

void test('reviewed shared brace walkers reject hostile nesting while ordinary globs still work', () => {
  for (const evaluate of [braces, braces.expand]) {
    for (const [open, close] of [
      ['{', '}'],
      ['(', ')'],
    ] as const) {
      const pattern = open.repeat(4000) + 'x,y' + close.repeat(4000);
      assert.throws(() => evaluate(pattern), {
        name: 'SyntaxError',
        message: 'Input depth (101), exceeds max depth (100)',
      });
    }
  }
  assert.deepEqual(braces.expand('docs/{guides,operations}/**/*.md'), [
    'docs/guides/**/*.md',
    'docs/operations/**/*.md',
  ]);
});
