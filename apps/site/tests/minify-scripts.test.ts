import { readFileSync, readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { minifyScript } from '../src/integrations/minify-scripts';

describe('minifying the page scripts', () => {
  it('drops comments and keeps top-level names, since the scripts share a page', async () => {
    const code = await minifyScript(
      'shared.js',
      '// Explains the helper.\nfunction printLinkParts(value) {\n  return value.trim();\n}\nprintLinkParts(" a ");\n',
    );
    expect(code).not.toContain('Explains');
    expect(code).toContain('function printLinkParts(');
  });

  it('minifies every script in public/scripts without errors', async () => {
    const directory = new URL('../public/scripts/', import.meta.url);
    for (const name of readdirSync(directory).filter((file) => file.endsWith('.js'))) {
      const source = readFileSync(new URL(name, directory), 'utf8');
      const code = await minifyScript(name, source);
      expect(code.length, name).toBeGreaterThan(0);
      expect(code.length, name).toBeLessThan(source.length);
    }
  });

  it('reports a script that does not parse', async () => {
    await expect(minifyScript('broken.js', 'function (')).rejects.toThrow(/broken\.js/);
  });
});
