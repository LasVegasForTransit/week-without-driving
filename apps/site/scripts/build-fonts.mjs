#!/usr/bin/env node
// Splits each of the site's text fonts into two files, so a phone downloads
// only the letters a page uses:
//
//   public/fonts/<name>-core.woff2   plain English text: A to Z, digits,
//                                    punctuation, curly quotes, dashes, ·
//   public/fonts/<name>-rest.woff2   everything else in the font, such as
//                                    accented letters
//
// and writes src/styles/fonts.css, whose unicode-range tells the browser
// which file holds which letters. Nearly every page needs only the core
// files, which are about 40% smaller than the whole fonts.
//
// The whole fonts in src/fonts are the masters (each already cut to Latin
// letters). Run this after changing one, or the ranges below:
//
//   pnpm fonts
//
// It needs uv (https://docs.astral.sh/uv/), which runs fontTools'
// pyftsubset without installing anything else.

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import * as prettier from 'prettier';

const site = new URL('../', import.meta.url);
const path = (relative) => fileURLToPath(new URL(relative, site));

const FONTS = [
  { family: 'Atkinson Hyperlegible Next', weight: 400, name: 'atkinson-next-400' },
  { family: 'Atkinson Hyperlegible Next', weight: 700, name: 'atkinson-next-700' },
  { family: 'Fraunces', weight: 600, name: 'fraunces-600' },
];

// What the site's own text uses: printable ASCII, no-break space, °, ·, º,
// ×, thin space, en and em dashes, curly quotes, •, …, ‹ ›, and €. A
// character the font lacks (the thin space) still belongs here, so using
// it never makes a page download the rest file for nothing.
const CORE = [
  'U+0020-007E',
  'U+00A0',
  'U+00B0',
  'U+00B7',
  'U+00BA',
  'U+00D7',
  'U+2009',
  'U+2013-2014',
  'U+2018-201A',
  'U+201C-201E',
  'U+2022',
  'U+2026',
  'U+2039-203A',
  'U+20AC',
];

// The rest of Latin, combining marks, punctuation and currency, with the
// core's characters left out so each character belongs to one file.
const REST = [
  'U+00A1-00AF',
  'U+00B1-00B6',
  'U+00B8-00B9',
  'U+00BB-00D6',
  'U+00D8-024F',
  'U+02B0-036F',
  'U+2000-2008',
  'U+200A-2012',
  'U+2015-2017',
  'U+201B',
  'U+201F-2021',
  'U+2023-2025',
  'U+2027-2038',
  'U+203B-206F',
  'U+20A0-20AB',
  'U+20AD-20CF',
  'U+2100-214F',
];

function subset(master, output, ranges) {
  execFileSync(
    'uvx',
    [
      '--from',
      'fonttools[woff]',
      'pyftsubset',
      master,
      `--unicodes=${ranges.join(',')}`,
      '--layout-features=*',
      '--flavor=woff2',
      `--output-file=${output}`,
    ],
    { stdio: 'inherit' },
  );
}

const rules = [];
for (const font of FONTS) {
  const master = path(`src/fonts/${font.name}.woff2`);
  for (const [part, ranges] of [
    ['core', CORE],
    ['rest', REST],
  ]) {
    const file = `${font.name}-${part}.woff2`;
    subset(master, path(`public/fonts/${file}`), ranges);
    rules.push(`@font-face {
  font-family: '${font.family}';
  src: url('/fonts/${file}') format('woff2');
  font-weight: ${font.weight};
  font-display: swap;
  unicode-range: ${ranges.join(', ')};
}`);
    console.log(`public/fonts/${file}`);
  }
}

const css = path('src/styles/fonts.css');
const source = `/* Written by scripts/build-fonts.mjs; run \`pnpm fonts\` rather than editing
   it. Each font is split in two: the core file has the letters the site's
   own text uses, and the rest file, which a page downloads only when it
   needs one of its letters, has everything else. */

${rules.join('\n\n')}
`;
const options = { ...(await prettier.resolveConfig(css)), filepath: css };
writeFileSync(css, await prettier.format(source, options));
console.log('src/styles/fonts.css');
