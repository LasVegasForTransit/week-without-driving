import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { BANNER_HEADERS, serveBanner } from '../worker/banners';
import type { Env } from '../worker/env';
import { BANNER_TEXT_PAIRS, BANNERS } from '../src/lib/banners';
import {
  checkRoster,
  GENERAL,
  PARTNER_TYPES,
  partnerLink,
  qrFiles,
  sortPartners,
  type RosterItem,
  type UncheckedItem,
} from '../src/lib/partners';
import { qrPng } from '../src/lib/png';
import { encodeQr, QUIET_ZONE } from '../src/lib/qrcode';

const example: RosterItem = {
  slug: 'example-club',
  name: 'Example Club',
  url: 'https://example.org',
  type: 'Student groups',
  sentence: 'Our members are taking the bus to class together on October 6.',
};

function problemsFor(item: UncheckedItem, others: RosterItem[] = []): string {
  try {
    checkRoster([...others, item]);
    return '';
  } catch (error) {
    return (error as Error).message;
  }
}

describe('the partner roster', () => {
  it('accepts a correct item, and an item with no website', () => {
    const { url: _url, ...noWebsite } = example;
    expect(checkRoster([example, { ...noWebsite, slug: 'no-site', name: 'No Site' }])).toHaveLength(
      2,
    );
  });

  const cases: Array<[string, UncheckedItem, string]> = [
    ['a missing name', { name: '' }, 'item 1: it has no name'],
    ['a missing sentence', { sentence: undefined }, 'it has no sentence'],
    ['capitals in the slug', { slug: 'Example-Club' }, 'its slug "Example-Club" must be lowercase'],
    ['a double hyphen', { slug: 'example--club' }, 'must be lowercase letters and digits'],
    ['a slug over 40 characters', { slug: 'a'.repeat(41) }, 'longer than 40 characters'],
    ['the slug general', { slug: GENERAL }, 'is kept for LVBT'],
    ['a website without https', { url: 'http://example.org' }, 'must start with https://'],
    ['a type spelled differently', { type: 'Student Groups' }, 'its type "Student Groups"'],
    ['a sentence over 200 characters', { sentence: 'a'.repeat(201) }, 'more than 200'],
  ];
  it.each(cases)('stops the build, naming the partner, for %s', (_case, change, problem) => {
    const message = problemsFor({ ...example, ...change });
    expect(message).toContain(problem);
    if (change.name !== '') expect(message).toContain('"Example Club"');
  });

  it('stops the build when two partners share a slug', () => {
    const message = problemsFor({ ...example, name: 'Example Club Two' }, [example]);
    expect(message).toContain(
      '"Example Club Two": its slug "example-club" is already used by "Example Club"',
    );
  });

  it('knows exactly the six types', () => {
    expect(PARTNER_TYPES).toEqual([
      'Community and neighborhood groups',
      'Student groups',
      'Environmental and justice groups',
      'Disability and senior advocates',
      'Employers and businesses',
      'Public agencies',
    ]);
  });

  it('sorts by name, ignoring capitals and a leading "The "', () => {
    const names = ['Zeta Riders', 'The Example Club', 'alpha walkers', 'Bus Buddies'];
    const sorted = sortPartners(names.map((name, i) => ({ ...example, slug: `p${i}`, name })));
    expect(sorted.map((p) => p.name)).toEqual([
      'alpha walkers',
      'Bus Buddies',
      'The Example Club',
      'Zeta Riders',
    ]);
  });

  it('gives each partner a giveaway link and QR files, and LVBT a general pair', () => {
    expect(partnerLink('example-club')).toBe('https://lvwwd.org/giveaway?ref=example-club');
    expect(partnerLink(GENERAL)).toBe('https://lvwwd.org/giveaway');
    expect(qrFiles('example-club')).toEqual({
      png: '/partners/qr/example-club.png',
      svg: '/partners/qr/example-club.svg',
    });
  });
});

/** Reads a one-bit grayscale PNG back into rows of dark (true) and light pixels. */
function readPng(file: Uint8Array) {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const idat: Uint8Array[] = [];
  for (let offset = 8; offset < file.length;) {
    const length = view.getUint32(offset);
    const type = new TextDecoder().decode(file.subarray(offset + 4, offset + 8));
    if (type === 'IDAT') idat.push(file.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const joined = new Uint8Array(idat.reduce((sum, part) => sum + part.length, 0));
  idat.reduce((offset, part) => {
    joined.set(part, offset);
    return offset + part.length;
  }, 0);
  const raw = inflateSync(joined);
  const rowBytes = Math.ceil(width / 8) + 1;
  const darkAt = (x: number, y: number) =>
    ((raw[y * rowBytes + 1 + (x >> 3)] ?? 0) & (0x80 >> (x & 7))) === 0;
  return { width, height, bitDepth: file[24], darkAt };
}

describe('the QR code PNG files', () => {
  it('are 1024 pixels square, black modules on white with the quiet zone, matching the code', () => {
    const qr = encodeQr(partnerLink('example-club'));
    const png = readPng(qrPng(qr));
    expect([png.width, png.height, png.bitDepth]).toEqual([1024, 1024, 1]);
    const modules = qr.size + QUIET_ZONE * 2;
    const center = (module: number) => Math.floor(((module + 0.5) * 1024) / modules);
    for (let r = -QUIET_ZONE; r < qr.size + QUIET_ZONE; r++) {
      for (let c = -QUIET_ZONE; c < qr.size + QUIET_ZONE; c++) {
        const expected = qr.matrix[r]?.[c] === true;
        expect(png.darkAt(center(c + QUIET_ZONE), center(r + QUIET_ZONE)), `module ${r},${c}`).toBe(
          expected,
        );
      }
    }
  });
});

describe('the partner banners', () => {
  it.each(BANNERS)('$file is a PNG of exactly its size, within its file size', (banner) => {
    const file = readFileSync(
      new URL(`../public/partners/banners/${banner.file}`, import.meta.url),
    );
    const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
    expect(new TextDecoder().decode(file.subarray(1, 4))).toBe('PNG');
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([banner.width, banner.height]);
    expect(file.length).toBeLessThanOrEqual(banner.maxBytes);
  });

  it('keeps every text color at 4.5 to 1 or more against its background', () => {
    const channel = (value: number) => {
      const c = value / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (hex: string) => {
      const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) =>
        channel(parseInt(hex.slice(i, i + 2), 16)),
      );
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    for (const [name, text, background] of BANNER_TEXT_PAIRS) {
      const [light = 0, dark = 0] = [luminance(text), luminance(background)].sort((a, b) => b - a);
      expect((light + 0.05) / (dark + 0.05), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('go out with headers that let any website show them', async () => {
    const env = {
      ASSETS: {
        fetch: () =>
          Promise.resolve(
            new Response(new Uint8Array([137, 80, 78, 71]), {
              headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=60' },
            }),
          ),
      },
    } as unknown as Env;
    const response = await serveBanner(
      new Request('https://lvwwd.org/partners/banners/300x250.png'),
      env,
    );
    expect(response.status).toBe(200);
    for (const [name, value] of Object.entries(BANNER_HEADERS)) {
      expect(response.headers.get(name), name).toBe(value);
    }
    expect(BANNER_HEADERS).toEqual({
      'Content-Type': 'image/png',
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Cache-Control': 'public, max-age=86400',
    });
  });

  it('leave a missing banner as the not-found page', async () => {
    const env = {
      ASSETS: { fetch: () => Promise.resolve(new Response('Not found', { status: 404 })) },
    } as unknown as Env;
    const response = await serveBanner(
      new Request('https://lvwwd.org/partners/banners/9x9.png'),
      env,
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
