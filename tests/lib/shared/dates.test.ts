/** lib/shared/dates.ts: day arithmetic on date keys and the latest/earliest key of a list. */

import { describe, expect, it } from 'vitest';

import { dayDiff, dayNumber, earliestDateKey, latestDateKey, shiftDateKey } from '@/lib/shared/dates';

describe('day arithmetic on date keys', () => {
  it('counts whole days, ignoring a time suffix', () => {
    expect(dayNumber('1970-01-02')).toBe(1);
    expect(dayNumber('2026-09-29T16:00:00')).toBe(dayNumber('2026-09-29'));
    expect(dayDiff('2026-09-30', '2026-10-01')).toBe(1);
    expect(dayDiff('2026-10-01', '2026-09-17')).toBe(-14);
  });

  it('shifts a key across month and year ends', () => {
    expect(shiftDateKey('2026-10-02', -14)).toBe('2026-09-18');
    expect(shiftDateKey('2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftDateKey('2027-01-01', -1)).toBe('2026-12-31');
  });
});

describe('shared dates: latestDateKey / earliestDateKey', () => {
  it('pick the lexicographic extreme of date keys and ISO instants, null for none', () => {
    expect(latestDateKey(['2026-10-02', '2026-11-01', '2026-09-30'])).toBe('2026-11-01');
    expect(earliestDateKey(['2026-10-02', '2026-11-01', '2026-09-30'])).toBe('2026-09-30');
    expect(latestDateKey(['2026-10-02T09:00:00Z', '2026-10-02T17:30:00Z'])).toBe('2026-10-02T17:30:00Z');
    expect(latestDateKey([])).toBeNull();
    expect(earliestDateKey([])).toBeNull();
  });
});
