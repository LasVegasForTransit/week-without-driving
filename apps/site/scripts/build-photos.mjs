#!/usr/bin/env node
// Makes every size of every photo in src/lib/photos.ts, in AVIF and WebP,
// from its master copy: the largest WebP in public/photos. Run it after
// adding or replacing a photo:
//
//   pnpm photos            make any file that is missing
//   pnpm photos --force    remake every file except the masters
//
// A photo with a `phone` crop also gets name-phone-<width>.avif and .webp:
// the middle of the master, cut to the crop's width-to-height ratio, for
// phones held upright (see src/components/PhotoSlot.astro).
//
// sharp comes with Astro, so the script borrows Astro's copy rather than
// adding a dependency for files that rarely change.

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { photos } from '../src/lib/photos.ts';

const sharp = createRequire(import.meta.resolve('astro'))('sharp');

const dir = fileURLToPath(new URL('../public/photos/', import.meta.url));
const force = process.argv.includes('--force');

// WebP is only the fallback for browsers without AVIF, so it stays close to
// the quality the site has always used.
const WEBP_QUALITY = 78;

async function write(image, path, format, quality) {
  if (existsSync(path) && !force) return;
  const encoded =
    format === 'avif' ? image.avif({ quality, effort: 9 }) : image.webp({ quality: WEBP_QUALITY });
  const { size } = await encoded.toFile(path);
  console.log(`${path.slice(dir.length)}: ${size.toLocaleString('en-US')} bytes`);
}

for (const photo of Object.values(photos)) {
  const largest = Math.max(...photo.widths);
  const master = `${dir}${photo.name}-${largest}.webp`;
  if (!existsSync(master)) throw new Error(`${photo.name} has no master copy at ${master}`);

  for (const width of photo.widths) {
    const resized = () => sharp(master).resize({ width });
    await write(resized(), `${dir}${photo.name}-${width}.avif`, 'avif', photo.quality);
    if (width !== largest) {
      await write(resized(), `${dir}${photo.name}-${width}.webp`, 'webp', photo.quality);
    }
  }

  if ('phone' in photo) {
    const cropWidth = Math.round(photo.height * photo.phone.aspect);
    const crop = {
      left: Math.round((photo.width - cropWidth) / 2),
      top: 0,
      width: cropWidth,
      height: photo.height,
    };
    for (const width of photo.phone.widths) {
      const cropped = () => sharp(master).extract(crop).resize({ width });
      const stem = `${dir}${photo.name}-phone-${width}`;
      await write(cropped(), `${stem}.avif`, 'avif', photo.quality);
      await write(cropped(), `${stem}.webp`, 'webp', photo.quality);
    }
  }
}
