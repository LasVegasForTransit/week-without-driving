import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  PRECACHE_LIMIT,
  buildManifest,
  bytesOf,
  injectBuild,
  referencedByCss,
  referencedByHtml,
  revisionOf,
  serviceWorker,
} from '../src/integrations/service-worker';

let dist = '';

function write(path: string, content: string | Uint8Array) {
  const file = join(dist, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function site() {
  dist = mkdtempSync(join(tmpdir(), 'lvwwd-precache-'));
  write(
    'offline/index.html',
    `<link rel="stylesheet" href="/_astro/site.css"><link rel="preload" href="/fonts/body.woff2" as="font">
     <script src="/scripts/app.js" defer></script>`,
  );
  write(
    'guides/index.html',
    `<link rel="stylesheet" href="/_astro/site.css"><img src="/icons/fare.svg" alt="">
     <img src="/photos/bus-960.webp" srcset="/photos/bus-480.webp 480w, /photos/bus-960.webp 960w" alt="">`,
  );
  write('go/index.html', '<script src="/scripts/finder.js"></script>');
  write(
    '_astro/site.css',
    '@font-face{src:url(/fonts/body.woff2)}@font-face{src:url("/fonts/head.woff2")}',
  );
  write('fonts/body.woff2', 'body font');
  write('fonts/head.woff2', 'heading font');
  write('scripts/app.js', 'console.log(1)');
  write('scripts/finder.js', 'console.log(2)');
  write('icons/fare.svg', '<svg/>');
  write('photos/bus-480.webp', 'small');
  write('photos/bus-960.webp', 'large');
  write('data/stops.json', '{"stops":[]}');
  write('data/routes.json', '{"routes":[]}');
  write('sw.js', 'const BUILD = /* __WWD_BUILD__ */ null;');
  write('_headers', '/*');
}

afterEach(() => {
  if (dist) rmSync(dist, { recursive: true, force: true });
  dist = '';
});

describe('download sizes', () => {
  it('counts pages and text files compressed, and images and fonts as they are', () => {
    const text = new TextEncoder().encode('a'.repeat(1000));
    expect(bytesOf('/guides', text)).toBeLessThan(100);
    expect(bytesOf('/scripts/app.js', text)).toBeLessThan(100);
    expect(bytesOf('/fonts/body.woff2', text)).toBe(1000);
  });
});

describe('what a page references', () => {
  it('finds scripts, styles, icons, preloads and single-source images, but not srcset photos', () => {
    const html = `
      <link rel="stylesheet" href="/_astro/a.css"><link rel="icon" href="/favicon.svg">
      <link rel="manifest" href="/manifest.webmanifest"><link rel="canonical" href="/guides">
      <link rel="preload" href="/fonts/a.woff2" as="font"><script src="/scripts/a.js?v=2"></script>
      <script src="https://challenges.cloudflare.com/x.js"></script><script src="//cdn.test/x.js"></script>
      <img src="/icons/a.png" alt=""><img src="/photos/b-960.webp" srcset="/photos/b-480.webp 480w" alt="">`;
    expect(referencedByHtml(html).sort()).toEqual([
      '/_astro/a.css',
      '/favicon.svg',
      '/fonts/a.woff2',
      '/icons/a.png',
      '/manifest.webmanifest',
      '/scripts/a.js',
    ]);
  });

  it('finds the fonts a stylesheet asks for', () => {
    expect(
      referencedByCss(
        `a{src:url(/fonts/a.woff2)} b{src:url('/fonts/b.woff2')} c{background:url(data:x)}`,
      ),
    ).toEqual(['/fonts/a.woff2', '/fonts/b.woff2']);
  });
});

describe('the precache manifest', () => {
  it('lists the pages and their files with revisions, and marks the offline page’s own files', () => {
    site();
    const { build, missing, total } = buildManifest(dist);
    const byUrl = Object.fromEntries(build.precache.map((entry) => [entry.url, entry]));

    expect(Object.keys(byUrl).sort()).toEqual([
      '/_astro/site.css',
      '/fonts/body.woff2',
      '/fonts/head.woff2',
      '/go',
      '/guides',
      '/icons/fare.svg',
      '/offline',
      '/scripts/app.js',
      '/scripts/finder.js',
    ]);
    expect(byUrl['/offline']?.core).toBe(true);
    expect(byUrl['/_astro/site.css']?.core).toBe(true);
    expect(byUrl['/fonts/body.woff2']?.core).toBe(true);
    expect(byUrl['/fonts/head.woff2']?.core).toBe(false);
    expect(byUrl['/guides']?.core).toBe(false);
    expect(byUrl['/scripts/app.js']?.revision).toBe(
      revisionOf(new TextEncoder().encode('console.log(1)')),
    );
    expect(byUrl['/fonts/head.woff2']?.bytes).toBe('heading font'.length);
    expect(byUrl['/offline']?.bytes).toBe(
      bytesOf('/offline.html', new Uint8Array(readFileSync(join(dist, 'offline/index.html')))),
    );

    expect(missing).toContain('/bingo');
    expect(missing).not.toContain('/guides');
    const precacheBytes = build.precache.reduce((sum, entry) => sum + entry.bytes, 0);
    expect(total).toBeGreaterThan(precacheBytes);
  });

  it('lists every static file the build made, and no pages, data or worker files', () => {
    site();
    const { files } = buildManifest(dist).build;
    expect(Object.keys(files)).toContain('/photos/bus-480.webp');
    expect(Object.keys(files)).toContain('/scripts/app.js');
    expect(
      Object.keys(files).filter((url) => /\.html$|^\/data\/|^\/sw\.js$|_headers/.test(url)),
    ).toEqual([]);
  });

  it('writes the list into the service worker, and refuses a worker without the marker', () => {
    const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
    const written = injectBuild(source, { precache: [], files: { '/a.js': 'abc' } });
    expect(written).toContain('const BUILD = {"precache":[],"files":{"/a.js":"abc"}};');
    expect(() => injectBuild('const BUILD = null;', { precache: [], files: {} })).toThrow(/marker/);
  });

  it('stops the build when the background save would pass 2,000,000 bytes', () => {
    site();
    write('photos/huge.png', randomBytes(PRECACHE_LIMIT));
    write('go/index.html', '<img src="/photos/huge.png" alt="">');
    const hook = serviceWorker().hooks['astro:build:done'] as unknown as (options: object) => void;
    const logger = { info: () => undefined, warn: () => undefined };
    expect(() => hook({ dir: pathToFileURL(`${dist}/`), logger })).toThrow(
      /over the 2,000,000-byte limit/,
    );
  });

  it('writes the list into dist/sw.js when the build fits', () => {
    site();
    const hook = serviceWorker().hooks['astro:build:done'] as unknown as (options: object) => void;
    const logger = { info: () => undefined, warn: () => undefined };
    hook({ dir: pathToFileURL(`${dist}/`), logger });
    expect(readFileSync(join(dist, 'sw.js'), 'utf8')).toMatch(/"url":"\/guides"/);
  });
});
