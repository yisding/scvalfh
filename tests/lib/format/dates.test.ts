/**
 * lib/format/dates.ts: dates and times as the site prints them, every one America/Los_Angeles
 * (DESIGN §10.11).
 */

import { describe, expect, it } from 'vitest';

import {
  dateSpan, dateWithYear, gameWhen, leagueClock, leagueClockPT, longDate, monthDay, partialDate,
  requirePartialDateKind, shortDate, timeOfDay, timeOfDayPT,
} from '@/lib/format/dates';
import { EN_DASH } from '@/lib/format/words';
import { hoursBetween, isoDateKey, localDateKey, toLocalTimestamp } from '@/lib/shared/dates';

describe('format: dates and times are America/Los_Angeles', () => {
  it('formats a short date, a month-day and a long date', () => {
    expect(shortDate('2026-09-29T16:00:00')).toBe('Tue Sep 29');
    expect(monthDay('2026-09-29T16:00:00')).toBe('Sep 29');
    expect(longDate('2026-09-29T16:00:00')).toBe('Tuesday, September 29');
    expect(dateWithYear('2026-10-30T15:30:00')).toBe('Oct 30, 2026');
  });

  it('formats a time in 12-hour clock with a PT label', () => {
    expect(timeOfDay('2026-09-29T16:00:00')).toBe('4:00 PM');
    expect(timeOfDay('2026-09-12T11:00:00')).toBe('11:00 AM');
    expect(timeOfDay('2026-10-12T15:30:00')).toBe('3:30 PM');
    expect(timeOfDay('2026-09-26T00:00:00')).toBe('12:00 AM');
    expect(timeOfDay('2026-09-26T12:05:00')).toBe('12:05 PM');
    expect(timeOfDayPT('2026-09-29T16:00:00')).toBe('4:00 PM PT');
  });

  it('derives an ISO date key without touching the machine time zone', () => {
    expect(isoDateKey('2026-09-29T16:00:00')).toBe('2026-09-29');
    expect(isoDateKey('2026-09-29')).toBe('2026-09-29');
  });

  it('converts a UTC instant to the local date and stamp', () => {
    // 15:00Z on Sep 29 is 08:00 PDT the same day; 03:00Z on Sep 29 is 20:00 PDT on Sep 28.
    expect(localDateKey('2026-09-29T15:00:00.000Z')).toBe('2026-09-29');
    expect(localDateKey('2026-09-29T03:00:00.000Z')).toBe('2026-09-28');
    expect(toLocalTimestamp('2026-09-29T15:00:00.000Z')).toBe('2026-09-29T08:00:00');
    // And across the PST boundary in November.
    expect(localDateKey('2026-11-14T07:30:00.000Z')).toBe('2026-11-13');
  });

  it('measures hours between two instants', () => {
    expect(hoursBetween('2026-09-29T00:00:00Z', '2026-09-30T12:00:00Z')).toBe(36);
  });

  it('describes when a game is played, including TBA', () => {
    expect(gameWhen({ dateLocal: '2026-09-29T16:00:00', isTimeTba: false, isDateTba: false })).toBe(
      'Tue Sep 29, 4:00 PM PT',
    );
    expect(gameWhen({ dateLocal: '2026-09-29T16:00:00', isTimeTba: true, isDateTba: false })).toBe(
      'Tue Sep 29, time TBA',
    );
    expect(gameWhen({ dateLocal: '2026-09-29T16:00:00', isTimeTba: true, isDateTba: true })).toBe(
      'Date TBA',
    );
  });

  it('rejects a value that is not a local timestamp', () => {
    expect(() => shortDate('yesterday')).toThrow();
  });
});

describe('dateSpan', () => {
  it('spans two dates with an en dash, naming the month once within a month', () => {
    expect(dateSpan('2026-10-30', '2026-10-31')).toBe('Oct 30–31');
    expect(dateSpan('2026-10-30', '2026-11-01')).toBe('Oct 30–Nov 1');
    expect(dateSpan('2026-10-30', '2026-10-30')).toBe('Oct 30');
    expect(dateSpan('2026-10-30', '2026-10-31')).toContain(EN_DASH);
  });
});

describe('leagueClock', () => {
  it('reads a config HH:MM, dropping :00 from a whole hour', () => {
    expect(leagueClock('11:00')).toBe('11 AM');
    expect(leagueClock('16:30')).toBe('4:30 PM');
    expect(leagueClock('12:05')).toBe('12:05 PM');
    expect(leagueClock('00:00')).toBe('12 AM');
    expect(leagueClockPT('11:00')).toBe('11 AM PT');
  });
});

describe('partialDate: the five shapes of a hand-researched date (data/clubs.json asOf)', () => {
  it('words a day, a month, a year, a season and a range', () => {
    expect(partialDate('2026-07-08')).toBe('Jul 8, 2026');
    expect(partialDate('2025-10')).toBe('Oct 2025');
    expect(partialDate('2025')).toBe('2025');
    expect(partialDate('2025-26')).toBe('2025-26 season');
    expect(partialDate('2015-2018')).toBe(`2015${EN_DASH}2018`);
    expect(['2026-07-08', '2025-10', '2025', '2025-26', '2015-2018'].map(requirePartialDateKind)).toEqual([
      'day',
      'month',
      'year',
      'season',
      'range',
    ]);
  });

  it('reads YYYY-MM as a month when MM is 01-12 (isAsOf’s order), a season only by the +1 rule', () => {
    expect(requirePartialDateKind('2025-12')).toBe('month');
    expect(requirePartialDateKind('1999-00')).toBe('season');
    expect(partialDate('2099-00')).toBe('2099-00 season');
  });

  it('throws on anything else, rather than printing a guess', () => {
    for (const bad of ['2025-27', '2025-13', '2025/26', '2018-2015', '2026-02-31x', '2026-13-01', 'Fall 2025', '']) {
      expect(() => partialDate(bad), bad).toThrow(/not a partial date/);
    }
  });
});
