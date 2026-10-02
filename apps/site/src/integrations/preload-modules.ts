import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AstroIntegration } from 'astro';

import { referencedByScript } from './service-worker';

/**
 * Lets a phone ask for all of a page's modules at once. A page names only
 * its own scripts; the modules they import would otherwise be found one
 * round trip later, after each script arrives. For every module a page's
 * scripts import (and those modules import), this adds
 * <link rel="modulepreload"> to the page's head. Modules loaded only when
 * needed, with import(), are left to load then.
 *
 * Runs after minifyScripts() and before serviceWorker(), so the precache
 * list fingerprints the finished pages.
 */
export function addModulePreloads(html: string, read: (path: string) => string | null): string {
  const scripts = [
    ...html.matchAll(/<script\b[^>]*\btype="module"[^>]*\bsrc="(\/modules\/[^"?#]+)"/g),
  ]
    .map((match) => match[1] ?? '')
    .filter(Boolean);
  const named = new Set(scripts);
  const preload = new Set<string>();
  const visit = (path: string) => {
    const source = read(path);
    if (source === null) return;
    for (const module of referencedByScript(source, path, { dynamic: false })) {
      if (named.has(module) || preload.has(module)) continue;
      preload.add(module);
      visit(module);
    }
  };
  scripts.forEach(visit);
  if (preload.size === 0) return html;
  const links = [...preload]
    .sort()
    .map((path) => `<link rel="modulepreload" href="${path}">`)
    .join('');
  return html.replace('</head>', `${links}</head>`);
}

function htmlFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return htmlFiles(path);
    return name.endsWith('.html') ? [path] : [];
  });
}

export function preloadModules(): AstroIntegration {
  return {
    name: 'lvwwd-preload-modules',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const dist = fileURLToPath(dir);
        const read = (path: string) => {
          try {
            return readFileSync(join(dist, path), 'utf8');
          } catch {
            return null;
          }
        };
        let pages = 0;
        for (const file of htmlFiles(dist)) {
          const html = readFileSync(file, 'utf8');
          const next = addModulePreloads(html, read);
          if (next === html) continue;
          writeFileSync(file, next);
          pages += 1;
        }
        logger.info(`Added module preloads to ${pages} pages.`);
      },
    },
  };
}
