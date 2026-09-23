import { describe, expect, it } from 'vitest';

import { lasVegasDate, todayNumber, weekDayNumber } from '../worker/time';

describe('lasVegasDate', () => {
  it('follows Las Vegas across the November clock change', () => {
    // 1:30 am PDT, then 1:30 am PST an hour later: still November 1.
    expect(lasVegasDate(new Date('2026-11-01T08:30:00Z'))).toBe('2026-11-01');
    expect(lasVegasDate(new Date('2026-11-01T09:30:00Z'))).toBe('2026-11-01');
    // 11:30 pm PST on November 1. A fixed -07:00 offset would say November 2.
    expect(lasVegasDate(new Date('2026-11-02T07:30:00Z'))).toBe('2026-11-01');
  });

  it('follows Las Vegas across the March clock change', () => {
    // 11:30 pm PST on March 7; a fixed -07:00 offset would say March 8.
    expect(lasVegasDate(new Date('2026-03-08T07:30:00Z'))).toBe('2026-03-07');
    // 3:30 am PDT on March 8, just after the change.
    expect(lasVegasDate(new Date('2026-03-08T10:30:00Z'))).toBe('2026-03-08');
  });
});

describe('weekDayNumber', () => {
  it('is 0 until midnight on October 1 in Las Vegas', () => {
    expect(weekDayNumber(new Date('2026-10-01T06:59:59Z'))).toBe(0);
    expect(weekDayNumber(new Date('2026-10-01T07:00:00Z'))).toBe(1);
  });

  it('counts the days of the week in Las Vegas time', () => {
    expect(weekDayNumber(new Date('2026-10-04T06:59:59Z'))).toBe(3);
    expect(weekDayNumber(new Date('2026-10-04T07:00:00Z'))).toBe(4);
  });

  it('is 9 from midnight after October 8', () => {
    expect(weekDayNumber(new Date('2026-10-09T06:59:59Z'))).toBe(8);
    expect(weekDayNumber(new Date('2026-10-09T07:00:00Z'))).toBe(9);
    expect(weekDayNumber(new Date('2027-10-03T19:00:00Z'))).toBe(9);
  });
});

describe('todayNumber', () => {
  it('lets the preview pin the day, and ignores anything that isn’t a day number', () => {
    const september = new Date('2026-09-23T12:00:00Z');
    expect(todayNumber('3', september)).toBe(3);
    expect(todayNumber(undefined, september)).toBe(0);
    expect(todayNumber('', september)).toBe(0);
    expect(todayNumber('12', september)).toBe(0);
  });
});
