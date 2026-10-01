#!/usr/bin/env node
// Render the site's social card with the supplied campaign mark and site fonts.
// Run from apps/site with: node scripts/build-social-card.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const site = new URL('../', import.meta.url);
const sharp = createRequire(import.meta.resolve('astro'))('sharp');
const asset = (path, type) =>
  `data:${type};base64,${readFileSync(new URL(path, site)).toString('base64')}`;

const mark = await sharp(fileURLToPath(new URL('src/assets/wwd-campaign-mark.png', site)))
  .extract({ left: 0, top: 158, width: 1080, height: 780 })
  .png()
  .toBuffer();
const markData = `data:image/png;base64,${mark.toString('base64')}`;
const html = `<!doctype html><html lang="en"><head><style>
  @font-face { font-family: Fraunces; src: url(${asset('src/fonts/fraunces-600.woff2', 'font/woff2')}); font-weight: 600; }
  @font-face { font-family: Atkinson; src: url(${asset('src/fonts/atkinson-next-400.woff2', 'font/woff2')}); font-weight: 400; }
  @font-face { font-family: Atkinson; src: url(${asset('src/fonts/atkinson-next-700.woff2', 'font/woff2')}); font-weight: 700; }
  * { box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; margin: 0; overflow: hidden; }
  body { background: #fff; color: #431a28; border-top: 10px solid #f75210; font-family: Atkinson, sans-serif; }
  main { display: grid; grid-template-columns: 380px 1px 1fr; gap: 48px; height: 620px; padding: 80px 76px 76px; align-items: center; }
  .mark { width: 380px; height: auto; display: block; }
  .site { margin: 36px 0 0; font-size: 26px; font-weight: 700; letter-spacing: .015em; }
  .rule { height: 435px; background: #d2c0b7; }
  .details { align-self: center; }
  h1 { font: 600 64px/1.07 Fraunces, Georgia, serif; letter-spacing: -.025em; margin: 0 0 48px; }
  .date { margin: 0 0 9px; color: #b93619; font-size: 29px; font-weight: 700; }
  .place { margin: 0; font-size: 28px; }
</style></head><body><main>
  <div><img class="mark" src="${markData}" alt="Week Without Driving" /><p class="site">lvwwd.org</p></div>
  <div class="rule" aria-hidden="true"></div>
  <div class="details"><h1>Try a week<br>without driving.</h1><p class="date">October 1–8, 2026</p><p class="place">Las Vegas, Nevada</p></div>
</main></body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  const screenshot = await page.screenshot({ type: 'png' });
  const png = await sharp(screenshot)
    .png({ palette: true, quality: 100, compressionLevel: 9 })
    .toBuffer();
  const output = fileURLToPath(new URL('public/og-wwd-2026-v2.png', site));
  writeFileSync(output, png);
  console.log(`${output}: 1200 × 630, ${png.length.toLocaleString()} bytes`);
} finally {
  await browser.close();
}
