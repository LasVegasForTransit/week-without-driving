import { describe, expect, it } from 'vitest';

import { encodeQr, qrSvg, QUIET_ZONE, type QrCode } from '../src/lib/qrcode';

/**
 * Reads a code back the way a phone camera would, written apart from the
 * encoder so the two cannot share a mistake: it reads the format bits,
 * removes the mask, collects the codewords in the standard's zigzag order,
 * undoes the block interleaving, checks every block's error correction,
 * and decodes the byte-mode text.
 */

const FORMAT_MASK = 0x5412;
const LEVELS = { 1: 'L', 0: 'M', 3: 'Q', 2: 'H' } as const;
const BLOCK_TABLE: Record<string, [ecc: number, blocks: number]> = {
  '1M': [10, 1],
  '2M': [16, 1],
  '3M': [26, 1],
  '4M': [18, 2],
  '5M': [24, 2],
  '6M': [16, 4],
  '7M': [18, 4],
  '1L': [7, 1],
  '2L': [10, 1],
};

function dark(qr: QrCode, row: number, col: number): boolean {
  return qr.matrix[row]?.[col] === true;
}

function readFormat(qr: QrCode): { level: string; mask: number } {
  let bits = 0;
  const cells: Array<[number, number]> = [
    [8, 0],
    [8, 1],
    [8, 2],
    [8, 3],
    [8, 4],
    [8, 5],
    [8, 7],
    [8, 8],
    [7, 8],
    [5, 8],
    [4, 8],
    [3, 8],
    [2, 8],
    [1, 8],
    [0, 8],
  ];
  // Bit 14 is read first; the list above runs from bit 14 down to bit 0.
  cells.forEach(([row, col]) => {
    bits = (bits << 1) | (dark(qr, row, col) ? 1 : 0);
  });
  const data = (bits ^ FORMAT_MASK) >>> 10;
  return { level: LEVELS[(data >>> 3) as 0 | 1 | 2 | 3], mask: data & 7 };
}

/** The finders with their separators, and the format bits beside them. */
function inFinderArea(size: number, row: number, col: number): boolean {
  const topLeft = row <= 8 && col <= 8;
  const topRight = row <= 8 && col >= size - 8;
  const bottomLeft = row >= size - 8 && col <= 8;
  return topLeft || topRight || bottomLeft;
}

function alignmentCenters(version: number, size: number): number[] {
  if (version < 2) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const centers = [6];
  for (let pos = size - 7; centers.length < count; pos -= step) centers.splice(1, 0, pos);
  return centers;
}

function inAlignment(version: number, size: number, row: number, col: number): boolean {
  const centers = alignmentCenters(version, size);
  const last = size - 7;
  return centers.some((r) =>
    centers.some((c) => {
      const corner = (r === 6 && c === 6) || (r === 6 && c === last) || (r === last && c === 6);
      return !corner && Math.abs(row - r) <= 2 && Math.abs(col - c) <= 2;
    }),
  );
}

function isPattern(size: number, version: number, row: number, col: number): boolean {
  if (inFinderArea(size, row, col) || row === 6 || col === 6) return true;
  const versionInfo = (row < 6 && col >= size - 11) || (col < 6 && row >= size - 11);
  if (version >= 7 && versionInfo) return true;
  return inAlignment(version, size, row, col);
}

const MASK_TEST = [
  (r: number, c: number) => (r + c) % 2 === 0,
  (r: number) => r % 2 === 0,
  (_r: number, c: number) => c % 3 === 0,
  (r: number, c: number) => (r + c) % 3 === 0,
  (r: number, c: number) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r: number, c: number) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r: number, c: number) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r: number, c: number) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function gfMul(a: number, b: number): number {
  let product = 0;
  for (let x = a, y = b; y > 0; y >>= 1) {
    if (y & 1) product ^= x;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  return product;
}

/** True when the block, read as a polynomial, is zero at α^0 … α^(ecc-1). */
function blockIsValid(block: number[], ecc: number): boolean {
  let alpha = 1;
  for (let i = 0; i < ecc; i++) {
    let value = 0;
    for (const byte of block) value = gfMul(value, alpha) ^ byte;
    if (value !== 0) return false;
    alpha = gfMul(alpha, 2);
  }
  return true;
}

/** Every module in the standard's reading order: two columns at a time, up then down. */
function zigzag(size: number): Array<[number, number]> {
  const order: Array<[number, number]> = [];
  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step++) {
      const row = upward ? size - 1 - step : step;
      order.push([row, right], [row, right - 1]);
    }
    upward = !upward;
  }
  return order;
}

/** The codewords in the order the zigzag reads them, with the mask removed. */
function readCodewords(qr: QrCode, version: number, mask: number): number[] {
  const flip = MASK_TEST[mask] ?? (() => false);
  const bits = zigzag(qr.size)
    .filter(([row, col]) => !isPattern(qr.size, version, row, col))
    .map(([row, col]) => (dark(qr, row, col) !== flip(row, col) ? 1 : 0));
  const words: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    words.push(bits.slice(i, i + 8).reduce((byte: number, bit) => (byte << 1) | bit, 0));
  }
  return words;
}

/** Undoes the interleaving: each block's data codewords, then its error correction. */
function deinterleave(words: number[], ecc: number, blockCount: number) {
  const dataTotal = words.length - ecc * blockCount;
  const shortLength = Math.floor(dataTotal / blockCount);
  const longBlocks = dataTotal % blockCount;
  const lengths = Array.from(
    { length: blockCount },
    (_, b) => shortLength + (b >= blockCount - longBlocks ? 1 : 0),
  );
  const blocks: number[][] = lengths.map(() => []);
  let cursor = 0;
  for (let i = 0; i <= shortLength; i++) {
    blocks.forEach((block, b) => {
      if (i < (lengths[b] ?? 0)) block.push(words[cursor++] ?? 0);
    });
  }
  for (let i = 0; i < ecc; i++) blocks.forEach((block) => block.push(words[cursor++] ?? 0));
  return { blocks, lengths };
}

/** The text in byte-mode data codewords. */
function readText(data: number[], version: number): string {
  const bits = data.flatMap((byte) => Array.from({ length: 8 }, (_, i) => (byte >>> (7 - i)) & 1));
  const read = (from: number, length: number) =>
    bits.slice(from, from + length).reduce((value, bit) => (value << 1) | bit, 0);
  expect(read(0, 4)).toBe(0b0100);
  const countLength = version <= 9 ? 8 : 16;
  const count = read(4, countLength);
  const bytes = Array.from({ length: count }, (_, i) => read(4 + countLength + i * 8, 8));
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function decode(qr: QrCode): { text: string; level: string; blocksValid: boolean } {
  const version = (qr.size - 17) / 4;
  const { level, mask } = readFormat(qr);
  const entry = BLOCK_TABLE[`${version}${level}`];
  if (!entry) throw new Error(`No block table entry for version ${version} level ${level}`);
  const [ecc, blockCount] = entry;
  const { blocks, lengths } = deinterleave(readCodewords(qr, version, mask), ecc, blockCount);
  const blocksValid = blocks.every((block) => blockIsValid(block, ecc));
  const data = blocks.flatMap((block, b) => block.slice(0, lengths[b]));
  return { text: readText(data, version), level, blocksValid };
}

describe('the QR code encoder', () => {
  const links = [
    'https://lvwwd.org/bingo',
    'https://lvwwd.org/giveaway',
    'https://lvwwd.org/giveaway?ref=example-club',
    `https://lvwwd.org/giveaway?ref=${'a-'.repeat(19)}ab`,
  ];

  it.each(links)('reads back %s exactly, at level M, with valid error correction', (link) => {
    const qr = encodeQr(link);
    const result = decode(qr);
    expect(result.text).toBe(link);
    expect(result.level).toBe('M');
    expect(result.blocksValid).toBe(true);
    expect(qr.level).toBe('M');
  });

  it('uses a bigger code, not a weaker one, for a longer link', () => {
    const short = encodeQr('https://lvwwd.org/bingo');
    const long = encodeQr(links[3] ?? '');
    expect(long.size).toBeGreaterThan(short.size);
    expect(long.level).toBe('M');
  });

  it('still honors another level when a caller asks for one', () => {
    const qr = encodeQr('https://lvwwd.org/bingo', 'L');
    expect(decode(qr)).toMatchObject({ text: 'https://lvwwd.org/bingo', level: 'L' });
  });

  it('draws the three finder patterns in their corners', () => {
    const qr = encodeQr('https://lvwwd.org/bingo');
    const last = qr.size - 1;
    for (const [row, col] of [
      [0, 0],
      [0, last - 6],
      [last - 6, 0],
    ] as const) {
      expect(dark(qr, row, col)).toBe(true);
      expect(dark(qr, row + 1, col + 1)).toBe(false);
      expect(dark(qr, row + 3, col + 3)).toBe(true);
    }
  });

  it('makes an SVG file with a white quiet zone of four modules', () => {
    const qr = encodeQr('https://lvwwd.org/giveaway');
    const svg = qrSvg(qr, 'QR code for lvwwd.org/giveaway');
    const side = qr.size + QUIET_ZONE * 2;
    expect(svg).toContain(`viewBox="0 0 ${side} ${side}"`);
    expect(svg).toContain('<title>QR code for lvwwd.org/giveaway</title>');
    expect(svg).toContain('fill="#ffffff"');
    const xs = [...svg.matchAll(/M(\d+) (\d+)/g)].flatMap((m) => [Number(m[1]), Number(m[2])]);
    expect(Math.min(...xs)).toBe(QUIET_ZONE);
    expect(Math.max(...xs)).toBe(QUIET_ZONE + qr.size - 1);
  });
});
