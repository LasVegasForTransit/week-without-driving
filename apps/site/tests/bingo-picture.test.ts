import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

import { BINGO_SQUARES } from '../src/lib/bingo';

/**
 * Runs the real public/scripts/bingo-picture.js in a sandbox and checks the
 * picture definition, the count line, the image description, how labels
 * fit their tiles, and the contrast of every text color. The drawing itself
 * is checked in a real browser by tests/e2e/bingo-share.spec.ts.
 */

interface Fit {
  size: number;
  lines: string[];
  lineHeight: number;
}
interface Picture {
  make(
    marks: boolean[],
    squares: Array<{ label: string }>,
  ): {
    heading: string;
    fileName: string;
    width: number;
    height: number;
    choices: unknown;
    note: string;
    describe(): string;
  };
  countLine(marks: boolean[]): string;
  fitLabel(measure: (text: string, size: number) => number, text: string, top?: number): Fit;
  tileBox(i: number): { x: number; y: number; size: number };
  TEXT_PAIRS: Array<[string, string, string]>;
  FREE_LABEL_TOP: number;
}

function load(): Picture {
  const source = readFileSync(
    new URL('../public/scripts/bingo-picture.js', import.meta.url),
    'utf8',
  );
  const window: { lvwwdBingoPicture?: Picture } = {};
  vm.runInNewContext(source, { window });
  if (!window.lvwwdBingoPicture) throw new Error('The script did not set window.lvwwdBingoPicture');
  return window.lvwwdBingoPicture;
}

const picture = load();
// The test's own copy of a square list in the documented shape: the real
// labels, so the example description reads exactly as written.
const squares = BINGO_SQUARES.map((square) => ({
  label: square.label,
  free: Boolean(square.free),
}));

function marks(indexes: number[]): boolean[] {
  return Array.from({ length: 25 }, (_, i) => i === 12 || indexes.includes(i));
}

const ROW_THREE = [10, 11, 13, 14];
const ALL = Array.from({ length: 25 }, (_, i) => i);

describe('the bingo card picture', () => {
  it('is a 1080 by 1920 picture with the share screen texts and no headline choices', () => {
    const definition = picture.make(marks(ROW_THREE), squares);
    expect(definition).toMatchObject({
      heading: 'Share your card',
      fileName: 'lvwwd-bingo.png',
      width: 1080,
      height: 1920,
      note: "A bingo card doesn't count as a trip. To enter, share a trip on My week.",
    });
    expect(definition.choices).toBeFalsy();
  });

  it('describes the four row-3 squares exactly as written', () => {
    expect(picture.make(marks(ROW_THREE), squares).describe()).toBe(
      "Graphic: my Digital Transit Bingo card for Week Without Driving Las Vegas, October 1 to 8, 2026. 4 squares marked and 1 bingo. Marked: Worked from home, Found my nearest stop, Asked a nondriver, One fix I'd make. Bingo lines: row 3. lvwwd.org. #WeekWithoutDriving",
    );
    expect(picture.countLine(marks(ROW_THREE))).toBe('4 squares · 1 bingo');
  });

  it('says "Ready to play" with only the free square', () => {
    expect(picture.countLine(marks([]))).toBe('Ready to play');
    expect(picture.make(marks([]), squares).describe()).toBe(
      'Graphic: my Digital Transit Bingo card for Week Without Driving Las Vegas, October 1 to 8, 2026. No squares marked yet; the middle square is free. lvwwd.org. #WeekWithoutDriving',
    );
  });

  it('counts one square in the singular', () => {
    expect(picture.countLine(marks([0]))).toBe('1 square');
    expect(picture.make(marks([0]), squares).describe()).toContain(
      '1 square marked, no bingo yet.',
    );
  });

  it('counts several squares with no bingo', () => {
    expect(picture.countLine(marks([0, 1, 2]))).toBe('3 squares');
    expect(picture.make(marks([0, 1, 2]), squares).describe()).toContain(
      '3 squares marked, no bingo yet.',
    );
  });

  it('never counts the free square, even when it is passed in as unmarked', () => {
    const withoutFree = marks([0]);
    withoutFree[12] = false;
    expect(picture.countLine(withoutFree)).toBe('1 square');
  });

  it('describes a full card with no marked or bingo sentence', () => {
    const full = marks(ALL);
    expect(picture.countLine(full)).toBe('All 24 squares · 12 bingos');
    const text = picture.make(full, squares).describe();
    expect(text).toContain('All 24 squares marked and 12 bingos.');
    expect(text).not.toContain('Marked:');
    expect(text).not.toContain('Bingo lines:');
  });

  it('names finished lines rows first, then columns, then diagonals, with a final "and"', () => {
    const rowOneColumnOneDiagonal = marks([0, 1, 2, 3, 4, 5, 10, 15, 20, 6, 18, 24]);
    const text = picture.make(rowOneColumnOneDiagonal, squares).describe();
    expect(text).toContain('Bingo lines: row 1, column 1 and the diagonal from top left.');
    expect(picture.countLine(rowOneColumnOneDiagonal)).toBe('12 squares · 3 bingos');
  });

  it('lists marked squares in card order, whatever order they were marked in', () => {
    const text = picture.make(marks([24, 0, 7]), squares).describe();
    expect(text).toContain('Marked: Bus instead of driving, New bus route, Helped plan a trip.');
  });

  it('lays out 25 tiles of 188 pixels with 5-pixel gaps, from x 60 to 1020 and y 480 to 1440', () => {
    const first = picture.tileBox(0);
    const last = picture.tileBox(24);
    expect(first).toEqual({ x: 60, y: 480, size: 188 });
    expect(last.x + last.size).toBe(1020);
    expect(last.y + last.size).toBe(1440);
    expect(picture.tileBox(1).x - (first.x + first.size)).toBe(5);
  });

  it('fits every label inside its tile, shrinking long ones but never below 20 pixels', () => {
    // A generous stand-in for a real font: every character as wide as 0.6 of the size.
    const measure = (text: string, size: number) => text.length * size * 0.6;
    for (const square of squares) {
      const top = square.free ? picture.FREE_LABEL_TOP : 56;
      const fit = picture.fitLabel(measure, square.label, top);
      expect(fit.size, square.label).toBeGreaterThanOrEqual(20);
      expect(fit.size, square.label).toBeLessThanOrEqual(28);
      expect(fit.lines.length, square.label).toBeLessThanOrEqual(4);
      expect(fit.lines.join(' '), square.label).toBe(square.label);
      for (const line of fit.lines) expect(measure(line, fit.size), line).toBeLessThanOrEqual(164);
      expect(top + fit.lines.length * fit.lineHeight, square.label).toBeLessThanOrEqual(188);
    }
  });

  it('keeps every text color at 4.5 to 1 or more against its background', () => {
    const channel = (value: number) => {
      const c = value / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
      return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
    };
    expect(picture.TEXT_PAIRS.length).toBeGreaterThanOrEqual(5);
    for (const [name, text, background] of picture.TEXT_PAIRS) {
      const [light, dark] = [luminance(text), luminance(background)].sort((a, b) => b - a);
      const ratio = ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
      expect(ratio, name).toBeGreaterThanOrEqual(4.5);
    }
  });
});
