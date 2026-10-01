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
const lvbtLogo = asset('src/assets/lvbt-logo-dark.svg', 'image/svg+xml');
const html = `<!doctype html><html lang="en"><head><style>
  @font-face { font-family: Fraunces; src: url(${asset('src/fonts/fraunces-600.woff2', 'font/woff2')}); font-weight: 600; }
  * { box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; margin: 0; overflow: hidden; }
  body { background: #fff; color: #431a28; font-family: Fraunces, Georgia, serif; }
  main { display: grid; grid-template-columns: 560px 1fr; height: 530px; }
  .brand { display: flex; align-items: center; padding: 48px; }
  .mark { width: 450px; height: auto; display: block; }
  .details { display: flex; flex-direction: column; justify-content: center; padding: 0 52px; background: #f4ece7; }
  h1 { font: 600 58px/1.07 Fraunces, Georgia, serif; letter-spacing: -.025em; margin: 0 0 22px; white-space: nowrap; }
  .place { margin: 0; font-size: 40px; font-weight: 600; }
  footer { height: 100px; padding: 0 48px; display: flex; align-items: center; justify-content: space-between; background: #431a28; color: #f7f4ec; }
  .url { font-size: 30px; font-weight: 600; }
  .owner { width: 72px; height: 72px; }
</style></head><body><main>
  <div class="brand"><img class="mark" src="${markData}" alt="Week Without Driving" /></div>
  <div class="details"><h1>October 1–8, 2026</h1><p class="place">Las Vegas, Nevada</p></div>
</main><footer><span class="url">lvwwd.org</span><img class="owner" src="${lvbtLogo}" alt="LVBT" /></footer></body></html>`;

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
  const output = fileURLToPath(new URL('public/og-wwd-2026-v6.png', site));
  writeFileSync(output, png);
  console.log(`${output}: 1200 × 630, ${png.length.toLocaleString()} bytes`);
} finally {
  await browser.close();
}
