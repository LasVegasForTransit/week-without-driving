import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/** The web app manifest that makes lvwwd.org installable, and its icons. */

const publicDir = new URL('../public/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.webmanifest', publicDir), 'utf8')) as {
  [key: string]: unknown;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
};

/** A PNG's width, height and whether it can be transparent, from its header. */
function png(path: string) {
  const file = new Uint8Array(readFileSync(new URL(path.replace(/^\//, ''), publicDir)));
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const text = new TextDecoder('latin1').decode(file);
  expect(text.slice(1, 4)).toBe('PNG');
  const colorType = view.getUint8(25);
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
    // Color types 4 and 6 carry alpha; a palette image can too, with tRNS.
    transparent: colorType === 4 || colorType === 6 || text.includes('tRNS'),
  };
}

function token(name: string): string {
  const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');
  const value = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(css)?.[1];
  if (!value) throw new Error(`global.css has no --${name} color`);
  return value.toLowerCase();
}

describe('the web app manifest', () => {
  it('names the site and opens it at home, full screen', () => {
    expect(manifest).toMatchObject({
      id: '/',
      name: 'Week Without Driving Las Vegas',
      short_name: 'WWD Las Vegas',
      start_url: '/',
      scope: '/',
      display: 'standalone',
    });
  });

  it('uses the desert colors: sand behind the app, teal for its bar', () => {
    expect(manifest.background_color).toBe(token('sand'));
    expect(manifest.theme_color).toBe(token('teal'));
  });

  it('has 192 and 512 pixel icons and a maskable 512, each the size it says', () => {
    const icons = manifest.icons.map((icon) => `${icon.sizes} ${icon.purpose ?? 'any'}`);
    expect(icons).toEqual(
      expect.arrayContaining(['192x192 any', '512x512 any', '512x512 maskable']),
    );
    for (const icon of manifest.icons) {
      const { width, height, transparent } = png(icon.src);
      expect(`${width}x${height}`).toBe(icon.sizes);
      expect(icon.type).toBe('image/png');
      expect(transparent).toBe(false);
    }
  });

  it('has an opaque 180 pixel Apple touch icon', () => {
    expect(png('/icons/apple-touch-icon-180.png')).toEqual({
      width: 180,
      height: 180,
      transparent: false,
    });
  });
});
