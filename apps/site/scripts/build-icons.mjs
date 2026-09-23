#!/usr/bin/env node
// Draws the home screen icons in public/icons from the site's logo,
// public/favicon.svg: the LVBT mark on the campaign's sand background.
// Run it again after the logo changes:
//
//   node scripts/build-icons.mjs
//
// icon-192.png and icon-512.png are the manifest's icons, and
// apple-touch-icon-180.png is the iPhone's; the logo fills 72% of each.
// icon-512-maskable.png is for Android, which cuts icons to its own shape:
// the logo stays inside the central circle of 80% diameter, and the sand
// reaches every edge. Every icon is opaque, as iOS requires.
//
// sharp comes with Astro, so the script borrows Astro's copy rather than
// adding a dependency for a file that rarely changes.

import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const sharp = createRequire(import.meta.resolve('astro'))('sharp');

const SAND = '#fbf4e6';
const site = new URL('../', import.meta.url);
const out = fileURLToPath(new URL('public/icons/', site));

// The light-mode logo only: the icon's background never changes with the
// phone's setting, so the dark colors must not apply.
const logo = readFileSync(new URL('public/favicon.svg', site), 'utf8').replace(
  /@media \(prefers-color-scheme: dark\) \{[\s\S]*?\}\s*\}/,
  '',
);

const icons = [
  { file: 'icon-192.png', size: 192, fill: 0.72 },
  { file: 'icon-512.png', size: 512, fill: 0.72 },
  { file: 'icon-512-maskable.png', size: 512, fill: 0.56 },
  { file: 'apple-touch-icon-180.png', size: 180, fill: 0.72 },
];

mkdirSync(out, { recursive: true });
for (const { file, size, fill } of icons) {
  const mark = Math.round(size * fill);
  const art = await sharp(Buffer.from(logo), { density: 600 }).resize(mark, mark).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 3, background: SAND } })
    .composite([{ input: art, gravity: 'center' }])
    .flatten({ background: SAND })
    .png({ compressionLevel: 9, palette: true })
    .toFile(`${out}${file}`);
  console.log(`public/icons/${file}`);
}
