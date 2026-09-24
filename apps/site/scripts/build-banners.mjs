#!/usr/bin/env node
// Draws the four partner banners in public/partners/banners from the site's
// own fonts and colors, at their exact pixel sizes. Run it again after the
// banners in src/lib/banners.ts or the drawing below change:
//
//   node scripts/build-banners.mjs
//
// Each banner shows "Week Without Driving Las Vegas", "October 1 to 8,
// 2026" and "Sign up to win at lvwwd.org", with the four ways of getting
// around as icons. Partners' websites show these files by their fixed
// addresses, so a new design keeps the same file names. LVBT's media
// committee can also replace any file with its own design of the same size.
//
// Chromium comes with the Playwright the tests already use, and sharp with
// Astro, so the script adds no dependency. Node reads the TypeScript list
// directly.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { BANNER_COLORS as COLORS, BANNER_LINES as LINES, BANNERS } from '../src/lib/banners.ts';

const site = new URL('../', import.meta.url);
const require = createRequire(import.meta.url);
const sharp = createRequire(import.meta.resolve('astro'))('sharp');
const icons = require('@iconify-json/mdi/icons.json');

const font = (file) =>
  `url(data:font/woff2;base64,${readFileSync(new URL(`public/fonts/${file}`, site)).toString('base64')}) format('woff2')`;
const icon = (name) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${/ d="([^"]+)"/.exec(icons.icons[name].body)[1]}"/></svg>`;

// Sizes in each banner's own pixels: [date, headline, button, icon, padding].
const SCALE = {
  '1080x1080': { date: 44, headline: 128, button: 52, icon: 84, pad: 96 },
  '1080x1920': { date: 60, headline: 172, button: 64, icon: 120, pad: 110 },
  '300x250': { date: 14, headline: 31, button: 15, icon: 22, pad: 18 },
  '728x90': { date: 15, headline: 25, button: 17, icon: 0, pad: 20 },
};

function page(banner) {
  const s = SCALE[`${banner.width}x${banner.height}`];
  const ways = ['bus', 'walk', 'bike', 'car'].map((name) => icon(name)).join('');
  const body =
    banner.layout === 'strip'
      ? `<div class="strip">
           <div><p class="headline">${LINES.name}</p><p class="date">${LINES.dates}</p></div>
           <p class="button">${LINES.signUp}</p>
         </div>`
      : `<div class="stack">
           <p class="date">${LINES.dates}</p>
           <p class="headline">Week Without Driving<br />Las Vegas</p>
           <p class="ways">${ways}</p>
           <p class="button">${LINES.signUp}</p>
         </div>`;
  return `<!doctype html><html><head><style>
    @font-face { font-family: Fraunces; src: ${font('fraunces-600.woff2')}; font-weight: 600; }
    @font-face { font-family: Atkinson; src: ${font('atkinson-next-400.woff2')}; font-weight: 400; }
    @font-face { font-family: Atkinson; src: ${font('atkinson-next-700.woff2')}; font-weight: 700; }
    * { margin: 0; box-sizing: border-box; }
    html, body { width: ${banner.width}px; height: ${banner.height}px; overflow: hidden; }
    body { background: ${COLORS.background}; color: ${COLORS.text}; font-family: Atkinson, sans-serif; }
    .stack { height: 100%; padding: ${s.pad}px; display: flex; flex-direction: column;
      justify-content: center; gap: ${Math.round(s.pad * 0.42)}px; }
    .strip { height: 100%; padding: 0 ${s.pad}px; display: flex; align-items: center;
      justify-content: space-between; gap: ${s.pad}px; }
    .date { color: ${COLORS.quiet}; font-weight: 700; font-size: ${s.date}px; line-height: 1.2; }
    .headline { font-family: Fraunces, serif; font-weight: 600; font-size: ${s.headline}px;
      line-height: 1.02; letter-spacing: -0.01em; }
    .strip .date { margin-top: 4px; }
    .strip .button { align-self: center; }
    .ways { display: flex; gap: ${Math.round(s.icon * 0.35)}px; color: ${COLORS.quiet}; }
    .ways svg { width: ${s.icon}px; height: ${s.icon}px; }
    .button { align-self: flex-start; background: ${COLORS.button}; color: ${COLORS.onButton};
      font-weight: 700; font-size: ${s.button}px; line-height: 1.1; white-space: nowrap;
      padding: ${Math.round(s.button * 0.55)}px ${Math.round(s.button * 0.9)}px;
      border-radius: 999px; }
  </style></head><body>${body}</body></html>`;
}

const out = fileURLToPath(new URL('public/partners/banners/', site));
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
try {
  for (const banner of BANNERS) {
    const context = await browser.newContext({
      viewport: { width: banner.width, height: banner.height },
      deviceScaleFactor: 1,
    });
    const tab = await context.newPage();
    await tab.setContent(page(banner));
    await tab.evaluate(() => document.fonts.ready);
    const shot = await tab.screenshot({ type: 'png' });
    const png = await sharp(shot)
      .png({ palette: true, quality: 100, compressionLevel: 9 })
      .toBuffer();
    writeFileSync(`${out}${banner.file}`, png);
    console.log(
      `${banner.file}: ${banner.width} × ${banner.height}, ${png.length.toLocaleString()} bytes`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
