/**
 * lib/queries/games.ts: games by id, date and team, against the committed v1 golden snapshot migrated to v2
 * (tests/support/golden-queries.ts).
 */

import { describe, expect, it } from 'vitest';

import { getTeamBySlug } from '@/lib/registry/teams';
import { goldenQueries } from '@/tests/support/golden-queries';

describe('lib/queries/games: games', () => {
  it('filters by team, league, division, league games, postseason, status and date', () => {
    const all = goldenQueries.data.getGames();
    expect(all.length).toBe(158);
    const la = goldenQueries.data.getGames({ teamId: 'los-altos' });
    expect(la.length).toBeGreaterThan(15);
    for (const g of la) expect([g.home.slug, g.away.slug]).toContain('los-altos');
    const leagueOnly = goldenQueries.data.getGames({ teamId: 'los-altos', leagueOnly: true });
    expect(leagueOnly.length).toBeLessThan(la.length);
    for (const g of leagueOnly) expect(g.countsFor).toBe('de-anza');

    expect(goldenQueries.data.getGames({ status: 'final' }).length).toBe(91);
    const oneDay = goldenQueries.data.getGames({ date: '2026-09-28' });
    expect(oneDay.length).toBeGreaterThan(0);
    for (const g of oneDay) expect(g.dateKey).toBe('2026-09-28');

    // Leigh's games are SCVAL non-league games: she is a side, so the BVAL filter finds them.
    const bval = goldenQueries.data.getGames({ league: 'bval' });
    expect(bval.length).toBeGreaterThan(0);
    expect(bval.every((g) => [g.home.slug, g.away.slug].some((s) => s && getTeamBySlug(s)?.league === 'bval'))).toBe(true);
    expect(goldenQueries.data.getGames({ league: 'bval', leagueOnly: true })).toEqual([]);
    expect(goldenQueries.data.getGames({ division: 'de-anza', leagueOnly: true }).every((g) => g.countsFor === 'de-anza')).toBe(true);
    expect(goldenQueries.data.getGames({ postseason: true })).toEqual([]);
    expect(goldenQueries.data.getGames({ postseason: false })).toHaveLength(158);
    expect(goldenQueries.data.getGames({ teamId: 'not-a-team' })).toEqual([]);
  });

  it('finds a game by id', () => {
    const one = goldenQueries.data.getGames({ status: 'final' })[0];
    expect(goldenQueries.data.getGameById(one.contestId)?.contestId).toBe(one.contestId);
    expect(goldenQueries.data.getGameById('nope')).toBeUndefined();
  });

  it('lists every date with a contest, ascending, overall and per league', () => {
    const dates = goldenQueries.data.getGameDates();
    expect(dates.length).toBeGreaterThan(20);
    expect([...dates]).toEqual([...dates].sort());
    expect(new Set(dates).size).toBe(dates.length);
    const mcal = goldenQueries.data.getGameDates({ league: 'mcal' });
    expect(mcal.length).toBeGreaterThan(0);
    expect(goldenQueries.data.getGamesByDate({ league: 'mcal' }).flatMap((d) => d.games).length).toBe(
      goldenQueries.data.getGames({ league: 'mcal' }).length,
    );
  });

  it('derives upcoming from the snapshot stamp', () => {
    const upcoming = goldenQueries.data.getUpcoming(5);
    expect(upcoming.length).toBe(5);
    for (const g of upcoming) {
      expect(g.dateKey >= goldenQueries.data.getToday()).toBe(true);
      expect(g.status).not.toBe('final');
    }
    const early = goldenQueries.data.getUpcoming(5, {}, '2026-09-10T15:00:00.000Z');
    expect(early.length).toBe(5);
    for (const g of early) expect(g.dateKey >= '2026-09-10').toBe(true);
    const pcal = goldenQueries.data.getUpcoming(5, { league: 'pcal' });
    expect(pcal.length).toBeGreaterThan(0);
    expect(pcal.every((g) =>
      [g.home.slug, g.away.slug].some((s) => s && getTeamBySlug(s)?.league === 'pcal'),
    )).toBe(true);
  });

  it('names the most recent day that actually has results', () => {
    expect(goldenQueries.data.getLatestResultsDate()).toMatch(/^2026-(09|10)-\d{2}$/);
    expect(goldenQueries.data.getLatestResultsDate({}, '2026-09-10T15:00:00.000Z')! <= '2026-09-10').toBe(true);
    expect(goldenQueries.data.getLastLeagueResultDate()).toMatch(/^2026-(09|10)-\d{2}$/);
    expect(goldenQueries.data.getLastLeagueResultDate({ division: 'de-anza' })).toMatch(/^2026-/);
    expect(goldenQueries.data.getLastLeagueResultDate({ league: 'scval' })).toBe(goldenQueries.data.getLastLeagueResultDate());
    expect(goldenQueries.data.getLastLeagueResultDate({ league: 'bval' })).toBeNull();
  });
});
