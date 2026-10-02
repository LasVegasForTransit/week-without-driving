import { readFileSync, readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { minifyScript } from '../src/integrations/minify-scripts';

describe('minifying the page scripts', () => {
  it('drops comments and keeps the names a module exports and imports', async () => {
    const code = await minifyScript(
      'shared.js',
      "// Explains the helper.\nimport { api } from './participant-api.js';\nexport function printLinkParts(value) {\n  return api.trim(value);\n}\n",
    );
    expect(code).not.toContain('Explains');
    expect(code).toContain('printLinkParts');
    expect(code).toContain('./participant-api.js');
    expect(code).toMatch(/import\s*\{\s*api\b/);
  });

  it('leaves the classic head script parsed as a script', async () => {
    const code = await minifyScript('old-links.js', '{\n  const to = 1;\n  window.x = to;\n}\n');
    expect(code).toContain('window.x');
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
