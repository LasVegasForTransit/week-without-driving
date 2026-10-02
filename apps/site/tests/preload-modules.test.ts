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
    expect(out).toContain(
      '<link rel="modulepreload" href="/modules/me.js">' +
        '<link rel="modulepreload" href="/modules/participant-api.js">' +
        '<link rel="modulepreload" href="/modules/turnstile.js"></head>',
    );
  });

  it('leaves a module loaded only with import() for later', () => {
    const html = '<head></head><script type="module" src="/modules/keep-going.js"></script>';
    expect(addModulePreloads(html, read)).toBe(
      '<head><link rel="modulepreload" href="/modules/me.js"></head><script type="module" src="/modules/keep-going.js"></script>',
    );
  });

  it('changes nothing on a page whose scripts import nothing', () => {
    const html = '<head></head><script type="module" src="/modules/me.js"></script>';
    expect(addModulePreloads(html, read)).toBe(html);
  });
});
