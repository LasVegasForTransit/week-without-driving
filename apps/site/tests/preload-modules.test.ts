import { describe, expect, it } from 'vitest';

import { addModulePreloads } from '../src/integrations/preload-modules';

const modules: Record<string, string> = {
  '/modules/my-week.js': 'import{api as e}from"./participant-api.js";import"./me.js";',
  '/modules/participant-api.js': 'import"./turnstile.js";export const api={};',
  '/modules/turnstile.js': 'export const t=1;',
  '/modules/me.js': 'export const m=1;',
  '/modules/keep-going.js': 'import"./me.js";const l=()=>import("./participant-api.js");',
};
const read = (path: string) => modules[path] ?? null;

describe('module preloads', () => {
  it('lists every module a page’s scripts import, and theirs, once', () => {
    const html =
      '<html><head><title>x</title></head><body>' +
      '<script type="module" src="/modules/my-week.js"></script>' +
      '<script type="module" src="/modules/keep-going.js"></script></body></html>';
    const out = addModulePreloads(html, read);
    expect(
      [...out.matchAll(/rel="modulepreload" href="([^"]+)"/g)].map((match) => match[1]).sort(),
    ).toEqual(['/modules/me.js', '/modules/participant-api.js', '/modules/turnstile.js']);
  });

  it('leaves a module loaded only with import() for later', () => {
    const html = '<head></head><script type="module" src="/modules/keep-going.js"></script>';
    const out = addModulePreloads(html, read);
    expect(out).toContain('href="/modules/me.js"');
    expect(out).not.toContain('href="/modules/participant-api.js"');
  });
});
