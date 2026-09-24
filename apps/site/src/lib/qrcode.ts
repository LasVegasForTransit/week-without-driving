// A small QR Code encoder (ISO/IEC 18004) used only when the site is built,
// so no QR library ships to phones. It makes the printed bingo card's code
// and every partner's link code as vector paths, and the partner PNG files.
//
// Scope: byte mode, versions 1 to 10, any error correction level. The
// caller names the level, and every code the site prints uses level M (it
// still scans with about 15 percent of it damaged or covered), so a longer
// link gets a bigger code rather than a weaker one. Codewords are split into
// blocks and interleaved as the standard says, and the mask with the lowest
// penalty score is chosen, like any other encoder.
//
// tests/qrcode.test.ts reads every code back with its own small decoder and
// checks the error correction, so a change here that breaks a code fails
// the tests.

export type EcLevel = 'L' | 'M' | 'Q' | 'H';

export interface QrCode {
  /** Modules along one side, without the quiet zone. */
  size: number;
  /** `matrix[row][column]` is true for a dark module. */
  matrix: boolean[][];
  version: number;
  level: EcLevel;
  mask: number;
}

/** The white border every code needs around it, in modules. */
export const QUIET_ZONE = 4;

const MAX_VERSION = 10;

// Per version (index 1 to 10): error correction codewords in each block, and
// the number of blocks, for each level. From the standard's table 9.
const ECC_PER_BLOCK: Record<EcLevel, readonly number[]> = {
  L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
  M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
  Q: [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
  H: [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28],
};
const BLOCKS: Record<EcLevel, readonly number[]> = {
  L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
  M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
  Q: [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
  H: [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8],
};
const FORMAT_LEVEL_BITS: Record<EcLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };

/** Reads `list[i]`, which the tables above guarantee exists. */
function at(list: readonly number[], i: number): number {
  const value = list[i];
  if (value === undefined) throw new Error(`qrcode: no table entry ${i}`);
  return value;
}

// ---- Reed-Solomon over GF(256) with the polynomial 0x11d ----------------

const EXP: number[] = [];
const LOG: number[] = new Array<number>(256).fill(0);
for (let i = 0, x = 1; i < 255; i++) {
  EXP.push(x);
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}

function gfMultiply(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : at(EXP, (at(LOG, a) + at(LOG, b)) % 255);
}

/** The generator polynomial's coefficients, highest power first, without the leading 1. */
function generator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    poly.forEach((c, j) => {
      next[j] = at(next, j) ^ c;
      next[j + 1] = at(next, j + 1) ^ gfMultiply(c, at(EXP, i));
    });
    poly = next;
  }
  return poly.slice(1);
}

function remainder(data: readonly number[], degree: number): number[] {
  const gen = generator(degree);
  const result = new Array<number>(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ at(result, 0);
    result.shift();
    result.push(0);
    gen.forEach((c, i) => {
      result[i] = at(result, i) ^ gfMultiply(c, factor);
    });
  }
  return result;
}

// ---- Sizes ----------------------------------------------------------------

function alignmentCenters(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const size = version * 4 + 17;
  const step = Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const centers = [6];
  for (let pos = size - 7; centers.length < count; pos -= step) centers.splice(1, 0, pos);
  return centers;
}

/** Modules left for codewords once the patterns are drawn. */
function rawDataModules(version: number): number {
  let modules = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const count = Math.floor(version / 7) + 2;
    modules -= (25 * count - 10) * count - 55;
    if (version >= 7) modules -= 36;
  }
  return modules;
}

function dataCodewords(version: number, level: EcLevel): number {
  return (
    Math.floor(rawDataModules(version) / 8) -
    at(ECC_PER_BLOCK[level], version) * at(BLOCKS[level], version)
  );
}

const countBits = (version: number) => (version <= 9 ? 8 : 16);

/** The smallest version that holds `bytes` bytes at `level`. */
function chooseVersion(bytes: number, level: EcLevel): number {
  for (let version = 1; version <= MAX_VERSION; version++) {
    if (4 + countBits(version) + bytes * 8 <= dataCodewords(version, level) * 8) return version;
  }
  throw new Error(`qrcode: ${bytes} bytes is too long for a version ${MAX_VERSION} code`);
}

// ---- Codewords ------------------------------------------------------------

function encodeData(bytes: readonly number[], version: number, level: EcLevel): number[] {
  const bits: number[] = [];
  const put = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, countBits(version));
  bytes.forEach((byte) => put(byte, 8));
  const capacity = dataCodewords(version, level) * 8;
  put(0, Math.min(4, capacity - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) put(pad, 8);

  const words: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    words.push(bits.slice(i, i + 8).reduce((byte, bit) => (byte << 1) | bit, 0));
  }
  return words;
}

/** Splits the data into blocks, adds each block's error correction, and interleaves them. */
function interleave(data: readonly number[], version: number, level: EcLevel): number[] {
  const blockCount = at(BLOCKS[level], version);
  const eccLength = at(ECC_PER_BLOCK[level], version);
  const shortLength = Math.floor(data.length / blockCount);
  const longBlocks = data.length % blockCount;
  const blocks: number[][] = [];
  let offset = 0;
  for (let b = 0; b < blockCount; b++) {
    const length = shortLength + (b >= blockCount - longBlocks ? 1 : 0);
    blocks.push(data.slice(offset, offset + length));
    offset += length;
  }
  const eccs = blocks.map((block) => remainder(block, eccLength));

  const result: number[] = [];
  for (let i = 0; i <= shortLength; i++) {
    for (const block of blocks) if (i < block.length) result.push(at(block, i));
  }
  for (let i = 0; i < eccLength; i++) {
    for (const ecc of eccs) result.push(at(ecc, i));
  }
  return result;
}

// ---- The matrix -----------------------------------------------------------

class Grid {
  readonly size: number;
  readonly modules: boolean[][];
  readonly reserved: boolean[][];

  constructor(size: number) {
    this.size = size;
    this.modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    this.reserved = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  }

  dark(row: number, col: number): boolean {
    return this.modules[row]?.[col] ?? false;
  }

  isReserved(row: number, col: number): boolean {
    return this.reserved[row]?.[col] ?? false;
  }

  set(row: number, col: number, dark: boolean): void {
    const line = this.modules[row];
    if (line && col >= 0 && col < this.size) line[col] = dark;
  }

  /** Sets a pattern module, which the data and the mask never touch. */
  fix(row: number, col: number, dark: boolean): void {
    if (row < 0 || row >= this.size || col < 0 || col >= this.size) return;
    this.set(row, col, dark);
    const line = this.reserved[row];
    if (line) line[col] = true;
  }
}

function drawPatterns(grid: Grid, version: number): void {
  const { size } = grid;
  for (let i = 0; i < size; i++) {
    grid.fix(6, i, i % 2 === 0);
    grid.fix(i, 6, i % 2 === 0);
  }
  for (const [top, left] of [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ] as const) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
        grid.fix(top + r, left + c, ring !== 2 && ring !== 4);
      }
    }
  }
  const centers = alignmentCenters(version);
  const last = centers.length - 1;
  centers.forEach((row, i) => {
    centers.forEach((col, j) => {
      const nearFinder = (i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0);
      if (nearFinder) return;
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++)
          grid.fix(row + r, col + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
      }
    });
  });
  drawFormat(grid, 'M', 0); // reserves the format areas; redrawn with the real values later
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      grid.fix(b, a, dark);
      grid.fix(a, b, dark);
    }
  }
}

function formatBits(level: EcLevel, mask: number): number {
  const data = (FORMAT_LEVEL_BITS[level] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function drawFormat(grid: Grid, level: EcLevel, mask: number): void {
  const { size } = grid;
  const bits = formatBits(level, mask);
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) grid.fix(i, 8, bit(i));
  grid.fix(7, 8, bit(6));
  grid.fix(8, 8, bit(7));
  grid.fix(8, 7, bit(8));
  for (let i = 9; i < 15; i++) grid.fix(8, 14 - i, bit(i));
  for (let i = 0; i < 8; i++) grid.fix(8, size - 1 - i, bit(i));
  for (let i = 8; i < 15; i++) grid.fix(size - 15 + i, 8, bit(i));
  grid.fix(size - 8, 8, true);
}

/** Every module the codewords fill, in the standard's two-column zigzag order. */
function dataModuleOrder(size: number, reserved: (row: number, col: number) => boolean) {
  const order: Array<[number, number]> = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let step = 0; step < size; step++) {
      const row = upward ? size - 1 - step : step;
      for (const col of [right, right - 1]) if (!reserved(row, col)) order.push([row, col]);
    }
  }
  return order;
}

const MASKS: ReadonlyArray<(row: number, col: number) => boolean> = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function applyMask(grid: Grid, mask: number): void {
  const flip = MASKS[mask];
  if (!flip) return;
  for (let r = 0; r < grid.size; r++) {
    for (let c = 0; c < grid.size; c++) {
      if (!grid.isReserved(r, c) && flip(r, c)) grid.set(r, c, !grid.dark(r, c));
    }
  }
}

const FINDER_LIKE = [true, false, true, true, true, false, true];

/** Rows and columns of the grid, each as a list of dark or light modules. */
function linesOf(grid: Grid): boolean[][] {
  const lines: boolean[][] = [];
  for (let i = 0; i < grid.size; i++) {
    lines.push(Array.from({ length: grid.size }, (_, j) => grid.dark(i, j)));
    lines.push(Array.from({ length: grid.size }, (_, j) => grid.dark(j, i)));
  }
  return lines;
}

/** Runs of five or more modules of one color in a line. */
function runPenalty(line: readonly boolean[]): number {
  let score = 0;
  let run = 1;
  for (let i = 1; i <= line.length; i++) {
    if (i < line.length && line[i] === line[i - 1]) {
      run++;
    } else {
      if (run >= 5) score += 3 + (run - 5);
      run = 1;
    }
  }
  return score;
}

/** Patterns in a line that look like a finder, with light space on one side. */
function finderPenalty(line: readonly boolean[]): number {
  const light = new Array<boolean>(4).fill(false);
  const padded = [...light, ...line, ...light];
  let score = 0;
  for (let i = 4; i + 11 <= padded.length; i++) {
    if (!FINDER_LIKE.every((dark, k) => padded[i + k] === dark)) continue;
    const clearBefore = padded.slice(i - 4, i).every((dark) => !dark);
    const clearAfter = padded.slice(i + 7, i + 11).every((dark) => !dark);
    if (clearBefore || clearAfter) score += 40;
  }
  return score;
}

/** Two-by-two blocks of one color. */
function blockPenalty(grid: Grid): number {
  let score = 0;
  for (let r = 0; r + 1 < grid.size; r++) {
    for (let c = 0; c + 1 < grid.size; c++) {
      const color = grid.dark(r, c);
      const same =
        grid.dark(r, c + 1) === color &&
        grid.dark(r + 1, c) === color &&
        grid.dark(r + 1, c + 1) === color;
      if (same) score += 3;
    }
  }
  return score;
}

/** How far the share of dark modules is from half. */
function balancePenalty(grid: Grid): number {
  const total = grid.size * grid.size;
  const dark = grid.modules.flat().filter(Boolean).length;
  return (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
}

/** The standard's penalty score; the mask with the lowest one is used. */
function penalty(grid: Grid): number {
  const lines = linesOf(grid);
  const perLine = lines.reduce((sum, line) => sum + runPenalty(line) + finderPenalty(line), 0);
  return perLine + blockPenalty(grid) + balancePenalty(grid);
}

/** Encodes `text` as a QR code at the given error correction level (M unless told otherwise). */
export function encodeQr(text: string, level: EcLevel = 'M'): QrCode {
  const bytes = Array.from(new TextEncoder().encode(text));
  const version = chooseVersion(bytes.length, level);
  const codewords = interleave(encodeData(bytes, version, level), version, level);
  const size = version * 4 + 17;

  const build = (mask: number) => {
    const grid = new Grid(size);
    drawPatterns(grid, version);
    const order = dataModuleOrder(size, (r, c) => grid.isReserved(r, c));
    order.forEach(([row, col], i) => {
      const byte = codewords[i >>> 3];
      if (byte !== undefined) grid.set(row, col, ((byte >>> (7 - (i & 7))) & 1) === 1);
    });
    applyMask(grid, mask);
    drawFormat(grid, level, mask);
    return grid;
  };

  let best = { grid: build(0), mask: 0 };
  let bestScore = penalty(best.grid);
  for (let mask = 1; mask < 8; mask++) {
    const grid = build(mask);
    const score = penalty(grid);
    if (score < bestScore) {
      best = { grid, mask };
      bestScore = score;
    }
  }
  return { size, matrix: best.grid.modules, version, level, mask: best.mask };
}

/** One SVG path `d` for every dark module, one unit per module, offset by the quiet zone. */
export function qrPathData(qr: QrCode, offset = 0): string {
  let d = '';
  qr.matrix.forEach((row, r) => {
    row.forEach((dark, c) => {
      if (dark) d += `M${c + offset} ${r + offset}h1v1h-1z`;
    });
  });
  return d;
}

/** A standalone SVG file of the code: black on white, with its quiet zone. */
export function qrSvg(qr: QrCode, title: string): string {
  const side = qr.size + QUIET_ZONE * 2;
  const escaped = title.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" width="${side * 8}" height="${side * 8}" shape-rendering="crispEdges" role="img">`,
    `<title>${escaped}</title>`,
    `<rect width="${side}" height="${side}" fill="#ffffff"/>`,
    `<path fill="#000000" d="${qrPathData(qr, QUIET_ZONE)}"/>`,
    '</svg>',
    '',
  ].join('\n');
}
