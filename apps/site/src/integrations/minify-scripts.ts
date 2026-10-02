import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AstroIntegration } from 'astro';
import { minify } from 'vite';

/**
 * Minifies the page scripts after every build. They are written by hand,
 * with the comments that explain them, and would otherwise be served as
 * they are. Minifying the built copies cuts what a phone downloads by about
 * 40% while the source stays readable, and keeps every public page well
 * under its budget of 12 KB of JavaScript, gzipped.
 *
 * public/modules holds the ES modules, so names inside a file may be
 * shortened while its imports and exports keep theirs. public/scripts holds
 * the one classic script, old-links.js, which runs in the head before the
 * page shows, so its names are left alone. The service worker (sw.js) is
 * not minified.
 */
export const SCRIPT_FOLDERS = [
  { folder: 'modules', module: true },
  { folder: 'scripts', module: false },
] as const;

export async function minifyScript(name: string, source: string, module = true): Promise<string> {
  const result = await minify(name, source, { module, compress: true, mangle: true });
  if (result.errors.length > 0) {
    throw new Error(`Couldn’t minify ${name}: ${result.errors.map((e) => e.message).join('; ')}`);
  }
  return result.code;
}

export function minifyScripts(): AstroIntegration {
  return {
    name: 'lvwwd-minify-scripts',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        let before = 0;
        let after = 0;
        for (const { folder, module } of SCRIPT_FOLDERS) {
          const scripts = join(fileURLToPath(dir), folder);
          for (const name of readdirSync(scripts).filter((file) => file.endsWith('.js'))) {
            const path = join(scripts, name);
            const source = readFileSync(path, 'utf8');
            const code = await minifyScript(name, source, module);
            writeFileSync(path, code);
            before += source.length;
            after += code.length;
          }
        }
        logger.info(
          `Minified dist/modules and dist/scripts from ${before.toLocaleString('en-US')} to ${after.toLocaleString('en-US')} bytes.`,
        );
      },
    },
  };
}
