// A from-scratch, dependency-free QR Code encoder (ISO/IEC 18004), used only
// at build time (Astro's static render) to produce an inline SVG path — no
// client-side JavaScript, no npm dependency. There is no QR library in the
// pnpm catalog (see pnpm-workspace.yaml), and adding one there would touch a
// file every worktree shares, so this file is the "pre-render the code as an
// SVG at build time" fallback named in the partners build brief.
//
// Scope: byte mode only, versions 1-5, and only the (version, error
// correction level) combinations that use a single Reed-Solomon block, so no
// codeword interleaving is needed. That covers every string this site draws
// a QR code for: lvwwd.org links, with or without a `?ref=<slug>` partner
// slug up to the roster's 40-character limit. A fixed mask pattern (0) is
// used instead of evaluating all eight masks for the lowest penalty score;
// any valid mask produces a fully scannable code, so this trades a little
// theoretical robustness for a much smaller, easier-to-verify implementation.
//
// Verified against the `jsQR` decoder for several lvwwd.org URL lengths
// during development (see the build report for how); re-run that check if
// this file changes.

type EcLevel = 'L' | 'M' | 'Q' | 'H';

/** Reads `arr[i]`, narrowing away `undefined`. Throws only on a real bug. */
function idx<T>(arr: readonly T[], i: number): T {
  const value = arr[i];
  if (value === undefined) throw new Error(`qrcode: index ${i} out of range`);
  return value;
}

function idx2<T>(arr: readonly (readonly T[])[], row: number, col: number): T {
  return idx(idx(arr, row), col);
}

const GF_EXP: number[] = new Array<number>(256).fill(0);
const GF_LOG: number[] = new Array<number>(256).fill(0);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  GF_EXP[255] = idx(GF_EXP, 0);
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return idx(GF_EXP, (idx(GF_LOG, a) + idx(GF_LOG, b)) % 255);
}

function multiplyPolys(a: number[], b: number[]): number[] {
  const result: number[] = new Array<number>(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      result[i + j] = idx(result, i + j) ^ gfMul(idx(a, i), idx(b, j));
    }
  }
  return result;
}

function generatorPoly(degree: number): number[] {
  let g = [1];
  for (let i = 0; i < degree; i++) {
    g = multiplyPolys(g, [1, idx(GF_EXP, i)]);
  }
  return g;
}

function rsEncode(dataCodewords: number[], eccCount: number): number[] {
  const gen = generatorPoly(eccCount);
  const remainder: number[] = new Array<number>(eccCount).fill(0);
  for (const d of dataCodewords) {
    const factor = d ^ idx(remainder, 0);
    remainder.shift();
    remainder.push(0);
    if (factor !== 0) {
      for (let i = 0; i < gen.length - 1; i++) {
        remainder[i] = idx(remainder, i) ^ gfMul(idx(gen, i + 1), factor);
      }
    }
  }
  return remainder;
}

interface VersionInfo {
  size: number;
  total: number;
  align: number | null;
}

// Versions 1-5 only. `align` is the single alignment pattern's center
// (versions 2-6 have exactly one, at (size-7, size-7)); version 1 has none.
const VERSION_INFO: Record<number, VersionInfo> = {
  1: { size: 21, total: 26, align: null },
  2: { size: 25, total: 44, align: 18 },
  3: { size: 29, total: 70, align: 22 },
  4: { size: 33, total: 100, align: 26 },
  5: { size: 37, total: 134, align: 30 },
};

// Error-correction codeword counts for the (version, level) pairs that use
// exactly one Reed-Solomon block. Versions/levels that split into multiple
// blocks (e.g. V3-Q, V4-M) are intentionally left out.
const ECC_COUNT: Record<number, Partial<Record<EcLevel, number>>> = {
  1: { L: 7, M: 10, Q: 13, H: 17 },
  2: { L: 10, M: 16, Q: 22, H: 28 },
  3: { L: 15, M: 26 },
  4: { L: 20 },
  5: { L: 26 },
};

const EC_LEVEL_BITS: Record<EcLevel, number> = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 };

function getVersionInfo(version: number): VersionInfo {
  const info = VERSION_INFO[version];
  if (!info) throw new Error(`qrcode: unsupported version ${version}`);
  return info;
}

// Tried smallest-and-strongest first: for each byte length we want the
// smallest code that still uses a good error correction level.
const CANDIDATES: Array<[number, EcLevel]> = [
  [1, 'M'],
  [1, 'L'],
  [2, 'M'],
  [2, 'L'],
  [3, 'M'],
  [3, 'L'],
  [4, 'L'],
  [5, 'L'],
];

class BitBuffer {
  bits: number[] = [];
  put(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i--) {
      this.bits.push((value >>> i) & 1);
    }
  }
}

interface VersionChoice {
  version: number;
  level: EcLevel;
  dataCodewords: number;
  ecc: number;
}

function chooseVersionLevel(byteLength: number): VersionChoice {
  for (const [version, level] of CANDIDATES) {
    const ecc = ECC_COUNT[version]?.[level];
    if (ecc == null) continue;
    const dataCodewords = getVersionInfo(version).total - ecc;
    // Byte mode overhead for versions 1-9: 4-bit mode indicator + 8-bit
    // character count indicator = 12 bits, i.e. 1.5 bytes.
    const capacity = Math.floor((dataCodewords * 8 - 12) / 8);
    if (byteLength <= capacity) {
      return { version, level, dataCodewords, ecc };
    }
  }
  throw new Error(`QR text too long for the supported versions (1-5): ${byteLength} bytes`);
}

function getFormatBits(level: EcLevel, mask: number): number {
  const data = (EC_LEVEL_BITS[level] << 3) | mask; // 5 bits
  let d = data << 10;
  const gen = 0b10100110111; // BCH(15,5) generator, degree 10
  for (let i = 4; i >= 0; i--) {
    if ((d >> (10 + i)) & 1) {
      d ^= gen << i;
    }
  }
  const bch = d & 0x3ff;
  return ((data << 10) | bch) ^ 0b101010000010010;
}

function buildDataCodewords(text: string, dataCodewords: number, ecc: number): number[] {
  const bytes = Array.from(new TextEncoder().encode(text));
  const bb = new BitBuffer();
  bb.put(0b0100, 4); // byte mode indicator
  bb.put(bytes.length, 8); // character count indicator (versions 1-9)
  for (const byte of bytes) bb.put(byte, 8);

  const totalDataBits = dataCodewords * 8;
  const termLen = Math.max(0, Math.min(4, totalDataBits - bb.bits.length));
  bb.put(0, termLen);
  while (bb.bits.length % 8 !== 0) bb.bits.push(0);

  const padBytes = [0xec, 0x11];
  let padIndex = 0;
  while (bb.bits.length < totalDataBits) {
    bb.put(idx(padBytes, padIndex % 2), 8);
    padIndex++;
  }

  const dataCw: number[] = [];
  for (let i = 0; i < bb.bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | idx(bb.bits, i + j);
    dataCw.push(byte);
  }

  return dataCw.concat(rsEncode(dataCw, ecc));
}

function buildFinalBits(allCodewords: number[], version: number): BitBuffer {
  // Remainder bits after the codewords: 0 for version 1, 7 for versions 2-6.
  const remainderBits = version === 1 ? 0 : 7;
  const finalBits = new BitBuffer();
  for (const cw of allCodewords) finalBits.put(cw, 8);
  finalBits.put(0, remainderBits);
  return finalBits;
}

type SetModule = (row: number, col: number, dark: boolean) => void;

function createGrids(size: number): { matrix: boolean[][]; isFn: boolean[][] } {
  const matrix: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );
  const isFn: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );
  return { matrix, isFn };
}

function isFinderDark(r: number, c: number): boolean {
  return (
    (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
    (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
    (r >= 2 && r <= 4 && c >= 2 && c <= 4)
  );
}

function drawFinder(size: number, setFn: SetModule, row: number, col: number): void {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
      setFn(rr, cc, isFinderDark(r, c));
    }
  }
}

function drawTimingPatterns(size: number, setFn: SetModule): void {
  for (let i = 8; i <= size - 9; i++) {
    const dark = i % 2 === 0;
    setFn(6, i, dark);
    setFn(i, 6, dark);
  }
}

function drawAlignmentPattern(align: number | null, setFn: SetModule): void {
  if (align == null) return;
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      setFn(align + r, align + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
    }
  }
}

function drawFunctionPatterns(size: number, align: number | null, setFn: SetModule): void {
  drawFinder(size, setFn, 0, 0);
  drawFinder(size, setFn, size - 7, 0);
  drawFinder(size, setFn, 0, size - 7);
  drawTimingPatterns(size, setFn);
  drawAlignmentPattern(align, setFn);
  setFn(size - 8, 8, true); // dark module, fixed position
}

function drawFormatInfo(size: number, level: EcLevel, mask: number, setFn: SetModule): void {
  const fmt = getFormatBits(level, mask);
  const bit = (i: number): boolean => ((fmt >> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) setFn(i, 8, bit(i));
  setFn(7, 8, bit(6));
  setFn(8, 8, bit(7));
  setFn(8, 7, bit(8));
  for (let i = 9; i <= 14; i++) setFn(8, 14 - i, bit(i));
  for (let i = 0; i <= 7; i++) setFn(8, size - 1 - i, bit(i));
  for (let i = 8; i <= 14; i++) setFn(size - 15 + i, 8, bit(i));
}

interface Grid {
  matrix: boolean[][];
  isFn: boolean[][];
  size: number;
}

interface PlacementCursor {
  bitIndex: number;
  col: number;
  upward: boolean;
}

function placeDataColumn(grid: Grid, bits: number[], cursor: PlacementCursor): void {
  const { matrix, isFn, size } = grid;
  const { col, upward } = cursor;
  for (let i = 0; i < size; i++) {
    const row = upward ? size - 1 - i : i;
    for (const c of [col, col - 1]) {
      if (idx2(isFn, row, c)) continue;
      const b = cursor.bitIndex < bits.length ? idx(bits, cursor.bitIndex) : 0;
      cursor.bitIndex++;
      const invert = (row + c) % 2 === 0; // mask 0
      idx(matrix, row)[c] = invert ? b === 0 : b === 1;
    }
  }
}

function placeDataBits(grid: Grid, bits: number[]): void {
  const cursor: PlacementCursor = { bitIndex: 0, col: grid.size - 1, upward: true };
  while (cursor.col > 0) {
    if (cursor.col === 6) cursor.col--; // skip the vertical timing column
    placeDataColumn(grid, bits, cursor);
    cursor.upward = !cursor.upward;
    cursor.col -= 2;
  }
}

export interface QrCode {
  size: number;
  matrix: boolean[][];
  version: number;
  level: EcLevel;
}

/** Encodes `text` (byte mode) into a QR code matrix, ready to render as SVG. */
export function encodeQr(text: string): QrCode {
  const bytes = Array.from(new TextEncoder().encode(text));
  const { version, level, dataCodewords, ecc } = chooseVersionLevel(bytes.length);
  const { size, align } = getVersionInfo(version);

  const allCw = buildDataCodewords(text, dataCodewords, ecc);
  const finalBits = buildFinalBits(allCw, version);

  const { matrix, isFn } = createGrids(size);
  const setFn: SetModule = (row, col, dark) => {
    if (row < 0 || row >= size || col < 0 || col >= size) return;
    idx(matrix, row)[col] = dark;
    idx(isFn, row)[col] = true;
  };

  drawFunctionPatterns(size, align, setFn);
  drawFormatInfo(size, level, 0, setFn);
  placeDataBits({ matrix, isFn, size }, finalBits.bits);

  return { size, matrix, version, level };
}

/** Builds a single SVG `<path>` `d` attribute for every dark module, one unit per module. */
export function qrPathData(qr: QrCode): string {
  let d = '';
  for (let r = 0; r < qr.size; r++) {
    const row = idx(qr.matrix, r);
    for (let c = 0; c < qr.size; c++) {
      if (idx(row, c)) d += `M${c} ${r}h1v1h-1z`;
    }
  }
  return d;
}
