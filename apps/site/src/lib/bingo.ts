// Digital Transit Bingo's one fixed card. Every visitor plays the same 25
// squares, so this list is the single source of truth for the card on
// screen, the paper card printed from the Bingo page, and the share
// picture's short labels. Keep the wording exactly as it is: players on
// paper and on phones compare cards square by square.
//
// Squares are listed row-major, row 1 column 1 first, so `BINGO_SQUARES[i]`
// sits at row `Math.floor(i / 5) + 1`, column `(i % 5) + 1`. The free
// middle square is index 12 (row 3, column 3).
export interface BingoSquare {
  row: number;
  col: number;
  label: string;
  fullText: string;
  kind: string;
  free?: true;
}

export const BINGO_SQUARES: BingoSquare[] = [
  {
    row: 1,
    col: 1,
    label: 'Bus instead of driving',
    fullText: "Took the bus somewhere you'd usually drive.",
    kind: 'Bus',
  },
  {
    row: 1,
    col: 2,
    label: 'Walk or roll an errand',
    fullText: 'Walked or rolled to an errand.',
    kind: 'Walk or roll',
  },
  {
    row: 1,
    col: 3,
    label: 'A whole day',
    fullText: 'Went a whole day without driving.',
    kind: 'Bigger step',
  },
  {
    row: 1,
    col: 4,
    label: 'Got a ride',
    fullText: 'Got a ride from a friend, family member or neighbor instead of driving yourself.',
    kind: 'Ride from others',
  },
  {
    row: 1,
    col: 5,
    label: 'Planned a transit trip',
    fullText: 'Planned a trip with transit directions in a map app or the RTC trip planner.',
    kind: 'At home',
  },
  {
    row: 2,
    col: 1,
    label: 'Stop with no shade',
    fullText: 'Noticed a bus stop with no shade, bench or shelter.',
    kind: 'Noticing',
  },
  {
    row: 2,
    col: 2,
    label: 'Library, park or rec center',
    fullText: 'Went to a library, park or community center without driving.',
    kind: 'Any trip',
  },
  {
    row: 2,
    col: 3,
    label: 'New bus route',
    fullText: "Rode a bus route you'd never taken before.",
    kind: 'Bus',
  },
  {
    row: 2,
    col: 4,
    label: 'Bike or scooter',
    fullText: 'Biked or scooted for part of a trip.',
    kind: 'Bike or scooter',
  },
  {
    row: 2,
    col: 5,
    label: 'Told someone why',
    fullText: "Told someone why you're taking part in Week Without Driving.",
    kind: 'At home',
  },
  {
    row: 3,
    col: 1,
    label: 'Worked from home',
    fullText: 'Worked or studied from home instead of driving.',
    kind: 'At home',
  },
  {
    row: 3,
    col: 2,
    label: 'Found my nearest stop',
    fullText: 'Found your nearest bus stop on lvwwd.org/go.',
    kind: 'At home',
  },
  {
    row: 3,
    col: 3,
    label: 'Week Without Driving',
    fullText: 'Free square.',
    kind: 'Free',
    free: true,
  },
  {
    row: 3,
    col: 4,
    label: 'Asked a nondriver',
    fullText: "Asked someone who doesn't drive how they get around.",
    kind: 'At home',
  },
  {
    row: 3,
    col: 5,
    label: "One fix I'd make",
    fullText: 'Wrote down one thing that would make getting around easier.',
    kind: 'At home',
  },
  {
    row: 4,
    col: 1,
    label: 'Timed a trip',
    fullText: 'Timed a trip and compared it with how long driving takes.',
    kind: 'Noticing',
  },
  {
    row: 4,
    col: 2,
    label: 'Sidewalk problem',
    fullText: 'Found a broken sidewalk, missing curb ramp or blocked path.',
    kind: 'Noticing',
  },
  {
    row: 4,
    col: 3,
    label: 'Groceries, no car',
    fullText: 'Got groceries or a prescription without driving.',
    kind: 'Any trip',
  },
  {
    row: 4,
    col: 4,
    label: 'Paratransit or shuttle',
    fullText: 'Rode RTC Paratransit, a senior shuttle or a community ride service.',
    kind: 'Ride service',
  },
  {
    row: 4,
    col: 5,
    label: 'New neighborhood',
    fullText: "Explored a neighborhood you don't usually visit, without driving.",
    kind: 'Any trip',
  },
  {
    row: 5,
    col: 1,
    label: 'Shared how it went',
    fullText: 'Told a friend or posted online how a trip went, including what was hard.',
    kind: 'Community',
  },
  {
    row: 5,
    col: 2,
    label: 'Sidewalk audit',
    fullText: 'Did a sidewalk audit with the guide on lvwwd.org/guides.',
    kind: 'Noticing',
  },
  {
    row: 5,
    col: 3,
    label: 'School or work, no car',
    fullText: 'Got to school or work without driving.',
    kind: 'Any trip',
  },
  {
    row: 5,
    col: 4,
    label: 'Rode with someone',
    fullText: 'Took a trip with a friend, family member or coworker.',
    kind: 'Any trip',
  },
  {
    row: 5,
    col: 5,
    label: 'Helped plan a trip',
    fullText: 'Helped someone else plan a trip without driving.',
    kind: 'At home',
  },
];

// Line names in the order the copy table lists them, used for the "Bingo!"
// message. Index matches the order BINGO_LINES below is built in: rows 0-4,
// columns 5-9, then both diagonals.
export const BINGO_LINE_NAMES = [
  'row 1',
  'row 2',
  'row 3',
  'row 4',
  'row 5',
  'column 1',
  'column 2',
  'column 3',
  'column 4',
  'column 5',
  'the diagonal from top left',
  'the diagonal from top right',
];

// The 12 possible lines, each a list of the five square indexes (0-24) that
// make it up. Built from BINGO_SQUARES' row-major order so the free square
// (index 12) naturally lands in row 3, column 3, and both diagonals.
// Built from index arithmetic (row = floor(i / 5) + 1, column = (i % 5) + 1)
// rather than by reading BINGO_SQUARES, so it can't disagree with the
// row-major layout above.
function buildLines(): number[][] {
  const indexes = BINGO_SQUARES.map((_, i) => i);
  const rowOf = (i: number) => Math.floor(i / 5) + 1;
  const colOf = (i: number) => (i % 5) + 1;
  const rows = Array.from({ length: 5 }, (_, r) => indexes.filter((i) => rowOf(i) === r + 1));
  const cols = Array.from({ length: 5 }, (_, c) => indexes.filter((i) => colOf(i) === c + 1));
  const diagTopLeft = indexes.filter((i) => rowOf(i) === colOf(i));
  const diagTopRight = indexes.filter((i) => rowOf(i) + colOf(i) === 6);
  return [...rows, ...cols, diagTopLeft, diagTopRight];
}

export const BINGO_LINES = buildLines();

export const BINGO_FREE_INDEX = BINGO_SQUARES.findIndex((s) => s.free);
