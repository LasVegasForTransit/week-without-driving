import { describe, expect, it } from 'vitest';

import { BINGO_SQUARES } from '../src/lib/bingo';
interface Picture {
  make(
    marks: boolean[],
    squares: Array<{ label: string }>,
  ): {
    describe(): string;
  };
  countLine(marks: boolean[]): string;
}

const picture = (await import('../public/modules/bingo-picture.js')) as unknown as Picture;
const squares = BINGO_SQUARES.map((square) => ({
  label: square.label,
  free: Boolean(square.free),
}));

function marks(indexes: number[]): boolean[] {
  return Array.from({ length: 25 }, (_, i) => i === 12 || indexes.includes(i));
}
const ALL = Array.from({ length: 25 }, (_, i) => i);

describe('the bingo card picture', () => {
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
});
