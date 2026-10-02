/**
 * The timeline rail's re-aiming under a filter (components/schedule/rail-targets.ts, F-21).
 *
 * The rule: while groups are hidden, every chip that stays visible must jump to a group that is
 * still shown — `up` to the first, `down` to the last, a month to its first shown day, `Today` to
 * the first shown day on or after it — and a chip with nothing to jump to is hidden (`null`).
 */

import { describe, expect, it } from 'vitest';

import {
  railLabel,
  railMonthDay,
  railShortDate,
  railSr,
  railTargets,
  type RailMarker,
} from '../../components/schedule/rail-targets';
import { getGameDates } from '../../lib/data';
import { monthDay, shortDate } from '../../lib/format';

const MARKERS: RailMarker[] = [
  { date: '2026-08-24', kind: 'up' },
  { date: '2026-09-01', kind: 'month' },
  { date: '2026-10-01', kind: 'month' },
  { date: '2026-10-02', kind: 'today' },
  { date: '2026-10-28', kind: 'down' },
];

describe('railTargets', () => {
  it('maps every marker to itself when every date is shown', () => {
    const all = ['2026-08-24', '2026-09-01', '2026-09-15', '2026-10-01', '2026-10-02', '2026-10-28'];
    expect(railTargets(all, MARKERS)).toEqual(MARKERS.map((m) => m.date));
  });

  it('aims up/down at the first/last shown date, months at their first shown day', () => {
    const shown = ['2026-08-27', '2026-09-03', '2026-09-24', '2026-10-05', '2026-10-22'];
    expect(railTargets(shown, MARKERS)).toEqual([
      '2026-08-27',
      '2026-09-03',
      '2026-10-05',
      '2026-10-05',
      '2026-10-22',
    ]);
  });

  it('keeps today on today when that day is shown', () => {
    expect(railTargets(['2026-09-30', '2026-10-02', '2026-10-07'], MARKERS)[3]).toBe('2026-10-02');
  });

  it('returns null for a month with no shown day and for a today with nothing after it', () => {
    const shown = ['2026-08-27', '2026-08-31'];
    expect(railTargets(shown, MARKERS)).toEqual([
      '2026-08-27',
      null,
      null,
      null,
      '2026-08-31',
    ]);
  });

  it('returns null for everything when nothing is shown', () => {
    expect(railTargets([], MARKERS)).toEqual([null, null, null, null, null]);
  });

  it('does not depend on the order the shown dates arrive in', () => {
    const shown = ['2026-10-22', '2026-08-27', '2026-10-05'];
    expect(railTargets(shown, MARKERS)).toEqual([
      '2026-08-27',
      null,
      '2026-10-05',
      '2026-10-05',
      '2026-10-22',
    ]);
  });
});

describe('rail text', () => {
  it('formats exactly as lib/format does, for every date in the snapshot', () => {
    const dates = getGameDates();
    expect(dates.length).toBeGreaterThan(0);
    for (const date of [...dates, '2024-02-29', '2027-01-01', '2026-03-01']) {
      expect(railShortDate(date), date).toBe(shortDate(date));
      expect(railMonthDay(date), date).toBe(monthDay(date));
    }
  });

  it('names what a re-aimed chip now jumps to', () => {
    expect(railSr({ date: '2026-08-24', kind: 'up' }, '2026-08-27')).toBe(
      'First shown contest, Thu Aug 27',
    );
    expect(railSr({ date: '2026-10-28', kind: 'down' }, '2026-10-22')).toBe(
      'Last shown contest, Thu Oct 22',
    );
    expect(railSr({ date: '2026-09-01', kind: 'month' }, '2026-09-03')).toBe(
      'First shown contest in September, Thu Sep 3',
    );
    expect(railSr({ date: '2026-10-02', kind: 'today' }, '2026-10-07')).toBe(
      'Next shown contest, Wed Oct 7',
    );
    expect(railSr({ date: '2026-10-02', kind: 'today' }, '2026-10-02')).toBe('Today, Fri Oct 2');
  });

  it('rewrites only the season-end labels', () => {
    expect(railLabel({ date: '2026-08-24', kind: 'up' }, '2026-08-27')).toBe('Aug 27');
    expect(railLabel({ date: '2026-10-28', kind: 'down' }, '2026-10-22')).toBe('Oct 22');
    expect(railLabel({ date: '2026-09-01', kind: 'month' }, '2026-09-03')).toBeNull();
    expect(railLabel({ date: '2026-10-02', kind: 'today' }, '2026-10-07')).toBeNull();
  });
});
