import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import type { AstroIntegration } from 'astro';

/**
 * Writes the precache list into dist/sw.js after every build (see
 * public/sw.js). The list holds the pages below and every script, style,
 * font and image they reference, each with a revision (the first 12
 * hexadecimal characters of the SHA-256 of its content) and its download
 * size. The build stops if the background save would pass 2,000,000 bytes.
 */

/** Pages saved on the phone after one visit. My week and Sign up never are. */
export const PRECACHE_PAGES = [
  '/offline',
  '/guides',
  '/guides/pay-your-fare',
  '/guides/accessible-riding',
  '/guides/heat',
  '/guides/bike-rack',
  '/guides/sidewalk-audit',
  '/go',
  '/bingo',
  '/giveaway',
] as const;

/** Find a bus's stop data; the service worker keeps it in its own cache. */
export const DATA_FILES = ['/data/stops.json', '/data/routes.json'] as const;

/** The most the service worker may download in the background, in bytes. */
export const PRECACHE_LIMIT = 2_000_000;

/** Files sent compressed, so their download size is their gzip size. */
const COMPRESSED = /\.(?:html|js|mjs|css|json|svg|webmanifest|txt|xml)$/;

/** Files in dist that are not static files a page can ask for. */
const NOT_STATIC =
  /^\/(?:_headers|_redirects|_routes\.json|sw\.js|robots\.txt|sitemap[^/]*\.xml)$|\.html$|^\/data\//;

export interface PrecacheEntry {
  url: string;
  revision: string;
  bytes: number;
  /** Part of the offline page, so saved even when the phone asks to save data. */
  core: boolean;
}

export interface Build {
  precache: PrecacheEntry[];
  files: Record<string, string>;
}

export interface Manifest {
  build: Build;
  /** Bytes the service worker downloads in the background: precache plus stop data. */
  total: number;
  /** Precache pages the build did not make. */
  missing: string[];
}

export function revisionOf(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 12);
}

/** Download size: gzip size for pages (addresses without an extension) and text files. */
export function bytesOf(url: string, content: Uint8Array): number {
  const compressed = COMPRESSED.test(url) || !/\.[a-z0-9]+$/i.test(url);
  return compressed ? gzipSync(content).length : content.length;
}

function attribute(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag)?.slice(1).find(Boolean);
}

/** A root-relative address, without its query or fragment, or undefined. */
function localPath(href: string | undefined): string | undefined {
  if (!href?.startsWith('/') || href.startsWith('//')) return undefined;
  return href.split(/[?#]/)[0];
}

const LINK_RELS = new Set([
  'stylesheet',
  'icon',
  'apple-touch-icon',
  'manifest',
  'preload',
  'modulepreload',
]);

/**
 * The files a page's HTML asks for: scripts, stylesheets, icons, the
 * manifest, preloads, and images with a single source. An image with a
 * srcset is left to be saved when it is shown, because only the phone
 * knows which of its sizes it will use.
 */
export function referencedByHtml(html: string): string[] {
  const found = new Set<string>();
  for (const [tag] of html.matchAll(/<script\b[^>]*>/gi)) {
    const path = localPath(attribute(tag, 'src'));
    if (path) found.add(path);
  }
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const rels = (attribute(tag, 'rel') ?? '').toLowerCase().split(/\s+/);
    const path = localPath(attribute(tag, 'href'));
    if (path && rels.some((rel) => LINK_RELS.has(rel))) found.add(path);
  }
  for (const [tag] of html.matchAll(/<img\b[^>]*>/gi)) {
    if (attribute(tag, 'srcset')) continue;
    const path = localPath(attribute(tag, 'src'));
    if (path) found.add(path);
  }
  return [...found];
}

/** The files a stylesheet asks for with url(), such as its fonts. */
export function referencedByCss(css: string): string[] {
  const found = new Set<string>();
  for (const match of css.matchAll(/url\(\s*(?:"([^"]+)"|'([^']+)'|([^)\s]+))\s*\)/g)) {
    const path = localPath(match.slice(1).find(Boolean));
    if (path) found.add(path);
  }
  return [...found];
}

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** The HTML file that answers a page's address, if the build made one. */
function pageFile(dist: string, url: string): string | undefined {
  const trimmed = url.replace(/^\/|\/$/g, '');
  const candidates =
    trimmed === ''
      ? [join(dist, 'index.html')]
      : [join(dist, trimmed, 'index.html'), join(dist, `${trimmed}.html`)];
  return candidates.find((path) => existsSync(path));
}

const text = (content: Uint8Array) => new TextDecoder().decode(content);

/** Every static file in the build, with its revision. */
function staticFiles(dist: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const path of walk(dist)) {
    const url = `/${relative(dist, path).split(sep).join('/')}`;
    if (!NOT_STATIC.test(url)) files[url] = revisionOf(readFileSync(path));
  }
  return files;
}

/** The precache list as it grows: one entry per address. */
class PrecacheList {
  readonly entries = new Map<string, PrecacheEntry>();

  constructor(private readonly dist: string) {}

  exists(url: string): boolean {
    return existsSync(join(this.dist, url));
  }

  read(url: string): Uint8Array {
    return readFileSync(join(this.dist, url));
  }

  add(url: string, content: Uint8Array, core: boolean): void {
    const existing = this.entries.get(url);
    if (existing) existing.core ||= core;
    else
      this.entries.set(url, {
        url,
        revision: revisionOf(content),
        bytes: bytesOf(url, content),
        core,
      });
  }

  /**
   * Adds a page and the files its HTML asks for. The offline page's own
   * files are saved even under Save-Data; the fonts its stylesheets ask
   * for are saved only without it.
   */
  addPage(url: string, html: Uint8Array): void {
    const core = url === '/offline';
    this.add(url, html, core);
    for (const file of referencedByHtml(text(html)).filter((f) => this.exists(f))) {
      const content = this.read(file);
      this.add(file, content, core);
      if (!file.endsWith('.css')) continue;
      for (const asset of referencedByCss(text(content))) {
        if (this.exists(asset)) this.add(asset, this.read(asset), false);
      }
    }
  }
}

export function buildManifest(dist: string): Manifest {
  const list = new PrecacheList(dist);
  const missing: string[] = [];
  for (const page of PRECACHE_PAGES) {
    const file = pageFile(dist, page);
    if (file) list.addPage(page, readFileSync(file));
    else missing.push(page);
  }
  const precache = [...list.entries.values()];
  const dataBytes = DATA_FILES.filter((url) => list.exists(url)).reduce(
    (sum, url) => sum + bytesOf(url, list.read(url)),
    0,
  );
  const total = precache.reduce((sum, entry) => sum + entry.bytes, 0) + dataBytes;
  return { build: { precache, files: staticFiles(dist) }, total, missing };
}

const MARKER = '/* __WWD_BUILD__ */ null';

/** The service worker's source with the build's list written in. */
export function injectBuild(source: string, build: Build): string {
  if (!source.includes(MARKER)) {
    throw new Error(`sw.js has no ${MARKER} marker for the precache list.`);
  }
  return source.replace(MARKER, JSON.stringify(build));
}

export function serviceWorker(): AstroIntegration {
  return {
    name: 'lvwwd-service-worker',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const dist = fileURLToPath(dir);
        const { build, total, missing } = buildManifest(dist);
        for (const page of missing) {
          logger.warn(`${page} is in the precache list but the build did not make it.`);
        }
        logger.info(
          `Precache: ${build.precache.length} files and the stop data, ${total.toLocaleString('en-US')} bytes.`,
        );
        if (total > PRECACHE_LIMIT) {
          throw new Error(
            `The precache is ${total.toLocaleString('en-US')} bytes, over the ${PRECACHE_LIMIT.toLocaleString('en-US')}-byte limit.`,
          );
        }
        const sw = join(dist, 'sw.js');
        writeFileSync(sw, injectBuild(readFileSync(sw, 'utf8'), build));
      },
    },
  };
}
