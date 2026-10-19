/** lib/sources/maxpreps/schedule.ts — the feed-routing guard and the empty-feed blip guard, and lib/pipeline/season-window.ts's line. */

import { describe, expect, it } from 'vitest';

import { outOfSeasonLine, inSeasonWindow } from '@/lib/pipeline/season-window';
import { assertFeedHasTeam, emptyFeedBlip } from '@/lib/sources/maxpreps/schedule';
import type { ScheduleRow } from '@/lib/sources/maxpreps/schemas';

const rowOf = (...teamIds: string[]) =>
  ({ contest: { teams: teamIds.map((teamId) => ({ teamId })) } }) as unknown as ScheduleRow;

describe('assertFeedHasTeam', () => {
  it('passes an empty feed and a feed that holds the team on either side', () => {
    expect(() => assertFeedHasTeam([], 't1', { message: 'm' })).not.toThrow();
    expect(() => assertFeedHasTeam([rowOf('t2', 't1')], 't1', { message: 'm' })).not.toThrow();
  });

  it("throws the caller's exact message for a non-empty feed without the team", () => {
    expect(() => assertFeedHasTeam([rowOf('t2', 't3')], 't1', { message: 'JV feed for t1 contains no row for that teamId' })).toThrow(
      new Error('JV feed for t1 contains no row for that teamId'),
    );
  });
});

describe('emptyFeedBlip', () => {
  it('throws only for an empty feed on a team that had games', () => {
    expect(() => emptyFeedBlip([], true, 'blip')).toThrow(new Error('blip'));
    expect(() => emptyFeedBlip([], false, 'blip')).not.toThrow();
    expect(() => emptyFeedBlip([rowOf('t1')], true, 'blip')).not.toThrow();
  });
});

describe('the season window', () => {
  it('outOfSeasonLine names the day and the window in the words every run prints', () => {
    expect(outOfSeasonLine('2026-07-15')).toBe(
      'out of season: 2026-07-15 is outside Aug 1 – Nov 30 Pacific. Nothing fetched, nothing written. Re-run with --force to override.',
    );
    expect(inSeasonWindow('2026-07-15')).toBe(false);
    expect(inSeasonWindow('2026-08-01')).toBe(true);
    expect(inSeasonWindow('2026-11-30')).toBe(true);
    expect(inSeasonWindow('2026-12-01')).toBe(false);
  });
});
