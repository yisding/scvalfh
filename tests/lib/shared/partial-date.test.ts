/**
 * The one partial-date grammar (lib/shared/partial-date.ts) and the three readers of it: the
 * clubs contract's `isAsOf`, the commits contract's `isCommitDate` and the formatter's throwing
 * `requirePartialDateKind`. The table was checked against the three hand-written grammars they
 * replaced (the formatter's regexes, `isAsOf` and `isCommitDate`) string by string before those
 * were deleted.
 */

import { describe, expect, it } from 'vitest';

import { requirePartialDateKind as formatKind } from '@/lib/format/dates';
import { isAsOf } from '@/lib/schema/clubs';
import { isCommitDate } from '@/lib/schema/commits';
import { type PartialDateKind, partialDateKind } from '@/lib/shared/partial-date';

/** [string, kind, isAsOf, isCommitDate] */
const TABLE: ReadonlyArray<readonly [string, PartialDateKind | null, boolean, boolean]> = [
  // a day: the shape alone is a 'day', a calendar check separates the two readers' verdicts
  ['2026-07-08', 'day', true, true],
  ['2024-02-29', 'day', true, true],
  ['2026-12-31', 'day', true, true],
  ['2026-02-30', 'day', false, false],
  ['2023-02-29', 'day', false, false],
  ['2026-04-31', 'day', false, false],
  ['2026-00-10', null, false, false],
  ['2026-12-32', null, false, false],
  ['2026-1-1', null, false, false],
  ['2026-07-8', null, false, false],
  ['20260708', null, false, false],
  ['2026-07-08 ', null, false, false],
  ['2026-07-08T00:00', null, false, false],
  // a month, 01-12
  ['2025-10', 'month', true, true],
  ['2025-12', 'month', true, true],
  ['2026-01', 'month', true, true],
  ['2011-12', 'month', true, true],
  // a year
  ['2026', 'year', true, true],
  ['0000', 'year', true, true],
  // a season: the second year is the first + 1; never a commitment date
  ['2025-26', 'season', true, false],
  ['2099-00', 'season', true, false],
  ['1999-00', 'season', true, false],
  ['2025-27', null, false, false],
  ['2025-13', null, false, false],
  ['2026-00', null, false, false],
  ['2026-13', null, false, false],
  // a range of years, start <= end; never a commitment date
  ['2015-2018', 'range', true, false],
  ['2015-2015', 'range', true, false],
  ['2025-2026', 'range', true, false],
  ['2099-2100', 'range', true, false],
  ['2018-2015', null, false, false],
  // not a partial date at all
  ['', null, false, false],
  ['  ', null, false, false],
  ['abc', null, false, false],
  ['26', null, false, false],
  ['12345', null, false, false],
  ['2025/26', null, false, false],
  ['2025–26', null, false, false],
  ['2026-6', null, false, false],
  ['2025-1', null, false, false],
];

describe('the partial-date grammar', () => {
  it('holds the 40-string table', () => {
    expect(TABLE).toHaveLength(40);
  });

  it.each(TABLE)('%j reads as kind %s', (value, kind) => {
    expect(partialDateKind(value)).toBe(kind);
  });

  it.each(TABLE)('%j is an asOf (clubs) %s', (value, _kind, asOf) => {
    expect(isAsOf(value)).toBe(asOf);
  });

  it.each(TABLE)('%j is a commit date %s', (value, _kind, _asOf, commit) => {
    expect(isCommitDate(value)).toBe(commit);
  });

  it('the formatter throws where the grammar says null, and names the string', () => {
    for (const [value, kind] of TABLE) {
      if (kind === null) expect(() => formatKind(value), value).toThrow(`format: not a partial date: ${value}`);
      else expect(formatKind(value), value).toBe(kind);
    }
  });
});
