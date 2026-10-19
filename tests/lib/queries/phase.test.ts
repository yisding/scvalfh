/**
 * lib/queries/phase.ts: the season phase per league and per region, against the committed v1 golden snapshot
 * migrated to v2 (tests/support/golden-queries.ts).
 */

import { describe, expect, it } from 'vitest';

import { goldenQueries, regionPhase } from '@/tests/support/golden-queries';

describe('lib/queries/phase: season phase per league', () => {
  it('SCVAL follows its data window; the others are preseason until they have games', () => {
    expect(goldenQueries.data.getSeasonPhase('scval')).toBe('regular');
    expect(goldenQueries.data.getSeasonPhase('scval', '2026-08-01T15:00:00.000Z')).toBe('preseason');
    expect(goldenQueries.data.getSeasonPhase('scval', '2026-10-30T15:00:00.000Z')).toBe('crossover');
    expect(goldenQueries.data.getSeasonPhase('scval', '2026-11-10T15:00:00.000Z')).toBe('playoffs');
    expect(goldenQueries.data.getSeasonPhase('scval', '2026-12-25T15:00:00.000Z')).toBe('complete');
  });

  it('BVAL, PCAL and MCAL walk their configured phases', () => {
    // Their teams appear in SCVAL non-league games, so their windows have a first game.
    expect(goldenQueries.data.getSeasonPhase('bval', '2026-10-30T19:00:00.000Z')).toBe('regular');
    expect(goldenQueries.data.getSeasonPhase('bval', '2026-10-31T19:00:00.000Z')).toBe('play-in');
    expect(goldenQueries.data.getSeasonPhase('bval', '2026-11-14T19:00:00.000Z')).toBe('playoffs');
    expect(goldenQueries.data.getSeasonPhase('pcal', '2026-10-30T19:00:00.000Z')).toBe('playoffs');
    expect(goldenQueries.data.getSeasonPhase('mcal', '2026-10-22T19:00:00.000Z')).toBe('regular');
    expect(goldenQueries.data.getSeasonPhase('mcal', '2026-10-26T19:00:00.000Z')).toBe('tournament');
    expect(goldenQueries.data.getSeasonPhase('mcal', '2026-10-31T19:00:00.000Z')).toBe('complete');
  });

  it('EAL: regular through its last league games, then the Super Regional window', () => {
    // Bella Vista's non-league games give the EAL window a first game (Sep 24).
    expect(goldenQueries.data.getSeasonPhase('eal', '2026-09-01T19:00:00.000Z')).toBe('preseason');
    expect(goldenQueries.data.getSeasonPhase('eal')).toBe('regular');
    expect(goldenQueries.data.getSeasonPhase('eal', '2026-10-28T19:00:00.000Z')).toBe('regular');
    expect(goldenQueries.data.getSeasonPhase('eal', '2026-10-29T19:00:00.000Z')).toBe('tournament');
    expect(goldenQueries.data.getSeasonPhase('eal', '2026-10-31T19:00:00.000Z')).toBe('tournament');
    expect(goldenQueries.data.getSeasonPhase('eal', '2026-11-01T19:00:00.000Z')).toBe('complete');
  });

  it('the site phase is the least advanced of the leagues that have started; complete only when all are', () => {
    // This snapshot predates the Southern California leagues: only their games against NorCal teams are
    // in it (City's first is Oct 2, North County's Sep 4), and the Sunset and Metro have none, so those
    // two stay preseason; the rule no longer lets that hold the whole site in its preseason.
    for (const id of ['sunset', 'metro']) {
      expect(goldenQueries.data.getSeasonPhase(id, '2026-10-26T19:00:00.000Z'), id).toBe('preseason');
    }
    expect(goldenQueries.data.getSeasonPhase('city', '2026-10-26T19:00:00.000Z')).toBe('regular');
    expect(goldenQueries.data.getSitePhase('2026-10-26T19:00:00.000Z')).toBe('regular');
    expect(goldenQueries.data.getSitePhase()).toBe('regular');
    expect(goldenQueries.data.getSitePhase('2026-08-01T19:00:00.000Z')).toBe('preseason');
    // NorCal is over by Christmas; the Sunset and Metro never started here, so neither SoCal nor the site
    // is complete: every started league is, so the next thing to happen is a league's first game.
    expect(regionPhase(goldenQueries.data, 'norcal', '2026-12-25T19:00:00.000Z')).toBe('complete');
    expect(regionPhase(goldenQueries.data, 'socal', '2026-12-25T19:00:00.000Z')).toBe('preseason');
    expect(goldenQueries.data.getSitePhase('2026-12-25T19:00:00.000Z')).toBe('preseason');
    expect(regionPhase(goldenQueries.data, 'norcal', '2026-10-30T19:00:00.000Z')).toBe('regular');
  });
});
