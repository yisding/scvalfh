/** The site-facing read API, against a snapshot built from the offline fixtures. */

import { beforeAll, describe, expect, it } from 'vitest';

import { buildFixtureSnapshot } from './helpers';

type DataModule = typeof import('../lib/data');
let data: DataModule;

beforeAll(async () => {
  process.env.SCVAL_SNAPSHOT = buildFixtureSnapshot();
  data = await import('../lib/data');
});

describe('data: identity and freshness', () => {
  it('loads the snapshot once and exposes it', () => {
    expect(data.getSnapshot().teams.length).toBe(16);
    expect(data.getFetchedAt()).toBe('2026-09-29T15:00:00.000Z');
  });

  it('derives today from the snapshot stamp in America/Los_Angeles', () => {
    // 2026-09-29T15:00Z is 8:00 AM PDT on the 29th.
    expect(data.getToday()).toBe('2026-09-29');
  });

  it('measures snapshot age against an instant you pass in', () => {
    expect(data.getSnapshotAgeHours('2026-09-30T15:00:00.000Z')).toBeCloseTo(24, 3);
    expect(data.getSnapshotAgeHours()).toBe(0);
  });
});

describe('data: teams', () => {
  it('returns all 16, or one division', () => {
    expect(data.getTeams().length).toBe(16);
    expect(data.getTeams('de-anza').length).toBe(8);
    expect(data.getTeams('el-camino').length).toBe(8);
  });

  it('looks a team up by slug or GUID', () => {
    const team = data.getTeamBySlug('los-altos');
    expect(team?.name).toBe('Los Altos');
    expect(data.getTeamById(team!.id)?.slug).toBe('los-altos');
    expect(data.resolveTeamRef(team!.id)?.slug).toBe('los-altos');
    expect(data.getTeamBySlug('nope')).toBeUndefined();
  });
});

describe('data: games', () => {
  it('filters by team, division, league, status and date', () => {
    const all = data.getGames();
    expect(all.length).toBe(158);
    const la = data.getGames({ teamId: 'los-altos' });
    expect(la.length).toBeGreaterThan(15);
    for (const g of la) {
      expect([g.home.slug, g.away.slug]).toContain('los-altos');
    }
    const leagueOnly = data.getGames({ teamId: 'los-altos', leagueOnly: true });
    expect(leagueOnly.length).toBeLessThan(la.length);
    for (const g of leagueOnly) expect(g.isLeague).toBe(true);

    const finals = data.getGames({ status: 'final' });
    expect(finals.length).toBe(80);
    const oneDay = data.getGames({ date: '2026-09-28' });
    expect(oneDay.length).toBeGreaterThan(0);
    for (const g of oneDay) expect(g.dateKey).toBe('2026-09-28');

    const deAnza = data.getGames({ division: 'de-anza', leagueOnly: true });
    for (const g of deAnza) expect(g.leagueDivision).toBe('de-anza');

    expect(data.getGames({ teamId: 'not-a-team' })).toEqual([]);
  });

  it('finds a game by id', () => {
    const one = data.getGames({ status: 'final' })[0];
    expect(data.getGameById(one.contestId)?.contestId).toBe(one.contestId);
    expect(data.getGameById('nope')).toBeUndefined();
  });

  it('lists every date with a contest, ascending', () => {
    const dates = data.getGameDates();
    expect(dates.length).toBeGreaterThan(20);
    expect([...dates]).toEqual([...dates].sort());
    expect(new Set(dates).size).toBe(dates.length);
  });

  it('derives upcoming and recent from the snapshot stamp', () => {
    const upcoming = data.getUpcoming(5);
    expect(upcoming.length).toBe(5);
    for (const g of upcoming) {
      expect(g.dateKey >= data.getToday()).toBe(true);
      expect(g.status).not.toBe('final');
    }
    const recent = data.getRecentResults(5);
    expect(recent.length).toBe(5);
    for (const g of recent) {
      expect(g.status).toBe('final');
      expect(g.dateKey <= data.getToday()).toBe(true);
    }
    // Newest first.
    expect(recent[0].dateLocal >= recent[1].dateLocal).toBe(true);
    // An explicit asOf wins over the snapshot stamp.
    const early = data.getRecentResults(3, '2026-09-10T15:00:00.000Z');
    for (const g of early) expect(g.dateKey <= '2026-09-10').toBe(true);
  });

  it('names the most recent day that actually has results', () => {
    const latest = data.getLatestResultsDate();
    expect(latest).toMatch(/^2026-09-2\d$/);
  });
});

describe('data: standings and projections', () => {
  it('returns a division table in finishing order', () => {
    const table = data.getStandings('de-anza');
    expect(table.length).toBe(8);
    expect(table.at(-1)!.slug).toBe('wilcox');
    for (let i = 1; i < table.length; i += 1) {
      expect(table[i].computed.place).toBeGreaterThanOrEqual(table[i - 1].computed.place);
    }
  });

  it('exposes a per-division goal-differential domain', () => {
    expect(data.getGoalDiffDomain('de-anza')).toBeGreaterThan(0);
    expect(data.getGoalDiffDomain('el-camino')).toBeGreaterThanOrEqual(
      data.getGoalDiffDomain('de-anza'),
    );
  });

  it('projects playoff status with written labels', () => {
    const projection = data.getPlayoffProjection();
    expect(projection.berths).toEqual({ auto: 7, total: 16 });
    expect(projection.crossover.date).toBe('2026-10-30');
    expect(projection.crossover.pairings.length).toBe(4);
    const deAnza = projection.byDivision['de-anza'];
    expect(deAnza.length).toBe(8);
    expect(deAnza[0].status).toBe('aq');
    expect(deAnza.at(-1)!.label).toBe('No results reported');
  });

  it('reports the season phase from the snapshot stamp', () => {
    expect(data.getSeasonPhase()).toBe('regular');
    expect(data.getSeasonPhase('2026-08-01T15:00:00.000Z')).toBe('preseason');
    expect(data.getSeasonPhase('2026-10-30T15:00:00.000Z')).toBe('crossover');
    expect(data.getSeasonPhase('2026-11-10T15:00:00.000Z')).toBe('playoffs');
    expect(data.getSeasonPhase('2026-12-25T15:00:00.000Z')).toBe('complete');
  });
});

describe('data: head-to-head and form', () => {
  it('summarises a meeting between two teams', () => {
    const h2h = data.getHeadToHead('los-altos', 'saint-francis');
    expect(h2h).toBeDefined();
    expect(h2h!.games.length).toBeGreaterThan(0);
    expect(h2h!.aRecord.w + h2h!.aRecord.l + h2h!.aRecord.t).toBeLessThanOrEqual(
      h2h!.games.length,
    );
    expect(data.getHeadToHead('los-altos', 'los-altos')).toBeUndefined();
  });

  it('returns a team form strip and margin series', () => {
    const form = data.getTeamForm('homestead');
    expect(form).toBeDefined();
    expect(form!.last5.length).toBeGreaterThan(0);
    expect(form!.leagueGames.length).toBeGreaterThan(form!.last5.length);
    for (const g of form!.leagueGames) {
      expect(g.isLeague).toBe(true);
      if (g.status !== 'final') expect(g.margin).toBeNull();
    }
    expect(form!.nonLeagueCount).toBeGreaterThan(0);
  });

  it('gives a no-data team a complete, empty form', () => {
    const form = data.getTeamForm('wilcox');
    expect(form).toBeDefined();
    expect(form!.last5).toEqual([]);
    expect(form!.leagueGames).toEqual([]);
    expect(form!.standing?.hasReportedResults).toBe(false);
  });
});

describe('data: the secondary-source read API', () => {
  it('returns nothing for a snapshot built with the secondary sources skipped', () => {
    // The fixture snapshot is offline, so every optional field is absent — and the accessors must
    // still be safe to call from a page.
    expect(data.getSbliveCrossCheck()).toBeUndefined();
    expect(data.getOfficialFixtures()).toEqual([]);
    expect(data.getOfficialFixtures({ division: 'de-anza' })).toEqual([]);
    expect(data.getOfficialFixtures({ slug: 'wilcox' })).toEqual([]);
    expect(data.getOfficialStandingsPdfUrl()).toBeUndefined();
    expect(data.getCcsCalendar()).toBeUndefined();
    expect(data.areKeyDatesConfirmed()).toBeUndefined();
  });

  it('returns no score conflict for a game that has none, and undefined for an unknown id', () => {
    const [game] = data.getGames({ status: 'final' });
    expect(data.getScoreConflict(game.contestId)).toBeUndefined();
    expect(data.getScoreConflict('no-such-contest')).toBeUndefined();
  });

  it('keeps the MaxPreps standings cross-check separate from the SBLive score one', () => {
    // snapshot.crossCheck is the STANDINGS log (DESIGN §9); scores live in sbliveCrossCheck.
    for (const row of data.getCrossCheck()) {
      expect(row).toHaveProperty('field');
      expect(row).toHaveProperty('ours');
      expect(row).toHaveProperty('theirs');
    }
  });
});
