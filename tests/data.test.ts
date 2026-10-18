/**
 * The site-facing read API (SPEC §13.3), against the committed v1 golden snapshot migrated to v2
 * and written to a temp file that lib/data is loaded against (useSnapshotModules). SCVAL has its real 2026-10-02 results; BVAL, PCAL
 * and MCAL are registry teams with no results and a degraded health row, and the EAL (which the v1
 * file predates) is added by loadSnapshot's league upgrade. A second snapshot, the same file plus a
 * few synthetic EAL league games, drives the EAL cases at the end (a fresh module instance).
 */

import { writeFileSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import { getLeague } from '@/lib/leagues';
import { buildSeason } from '@/lib/season-build';
import { countsOf } from '@/lib/snapshot-migrate';
import { loadSnapshot } from '@/lib/snapshot-schema';
import { computeStandings } from '@/lib/standings';
import type { Game, Snapshot } from '@/lib/types';
import { useSnapshotModules, withSnapshotModules } from './support/corpus-modules';
import { game } from './support/game-builder';
import { tempFile, goldenPath, readJson } from './support/repo';

const m = useSnapshotModules(
  () => {
    const raw = readJson(goldenPath('snapshot-2026-10-02.v1.json')) as unknown;
    const file = tempFile('data', 'snapshot.json');
    writeFileSync(file, JSON.stringify(loadSnapshot(raw)));
    return file;
  },
  { data: () => import('@/lib/data') },
);

describe('data: identity and freshness', () => {
  it('loads the snapshot once and exposes it', () => {
    expect(m.data.getSnapshot().schemaVersion).toBe(2);
    expect(m.data.getSnapshot().teams.length).toBe(102);
    expect(m.data.getFetchedAt()).toBe('2026-10-02T10:48:51.206Z');
    expect(m.data.getCounts().teams).toBe(102);
  });

  it('derives today from the snapshot stamp in America/Los_Angeles', () => {
    // 2026-10-02T10:48Z is 3:48 AM PDT on the 2nd.
    expect(m.data.getToday()).toBe('2026-10-02');
  });
});

describe('data: sections and leagues', () => {
  it('summarises the nine leagues and the independents in config order, each with its region and its cities', () => {
    const leagues = m.data.getLeagueSummaries();
    expect(leagues.map((l) => l.id)).toEqual(['scval', 'bval', 'pcal', 'mcal', 'eal', 'sunset', 'city', 'north-county', 'metro', 'independents']);
    expect(leagues.map((l) => l.teamCount)).toEqual([15, 12, 7, 9, 6, 8, 12, 19, 9, 5]);
    // `region` is NorCal/SoCal (from the section); the card's place words moved to `cities`, unchanged for NorCal.
    expect(leagues.map((l) => l.region)).toEqual([...Array(5).fill('norcal'), ...Array(5).fill('socal')]);
    expect(leagues.map((l) => l.cities)).toEqual([
      'Santa Clara County and San Francisco', 'San Jose, Campbell, Saratoga, Morgan Hill and Gilroy',
      'Monterey County and Hollister', 'Marin County, San Francisco and Berkeley', 'Chico, Corning, Susanville, Davis and Fair Oaks',
      'Huntington Beach, Newport Beach, Fountain Valley and Temecula', 'San Diego and La Jolla',
      'Carlsbad, Encinitas, Escondido, Fallbrook, Oceanside, Poway, San Marcos, Valley Center, Vista and north San Diego',
      'Chula Vista, La Mesa, Lakeside, El Cajon and San Diego', 'Glendora, La Verne, Studio City, Thousand Oaks and West Hills',
    ]);
    expect(m.data.getLeagueSummary('sunset')!.section).toEqual({ id: 'ss', name: 'Southern Section', shortName: 'SS' });
    expect(m.data.getLeagueSummary('north-county')!.divisions.map((d) => [d.id, d.heading, d.teamCount])).toEqual([
      ['avocado', 'Avocado', 6], ['palomar', 'Palomar', 7], ['valley', 'Valley', 6],
    ]);
    expect(m.data.getLeagueSummary('sunset')!.singleDivision).toBe(true);
    const bval = m.data.getLeagueSummary('bval')!;
    expect(bval.section).toEqual({ id: 'ccs', name: 'Central Coast Section', shortName: 'CCS' });
    expect(bval.singleDivision).toBe(false);
    expect(bval.divisions.map((d) => [d.id, d.heading, d.teamCount])).toEqual([
      ['mt-hamilton', 'Mt. Hamilton', 6],
      ['santa-teresa', 'Santa Teresa', 6],
    ]);
    const mcal = m.data.getLeagueSummary('mcal')!;
    expect(mcal.section.shortName).toBe('NCS');
    expect(mcal.singleDivision).toBe(true);
    expect(mcal.divisions[0].heading).toBeNull();
    const eal = m.data.getLeagueSummary('eal')!;
    expect(eal.section).toEqual({ id: 'ns', name: 'Northern Section', shortName: 'NS' });
    expect(eal.singleDivision).toBe(true);
    expect(eal.divisions.map((d) => [d.id, d.heading, d.teamCount])).toEqual([['eal', null, 6]]);
    expect(m.data.getLeagueSummary('nope')).toBeUndefined();
  });

  it('lists route params', () => {
    expect(m.data.getLeagueIds()).toEqual(['scval', 'bval', 'pcal', 'mcal', 'eal', 'sunset', 'city', 'north-county', 'metro', 'independents']);
    expect(m.data.getTournamentLeagueIds()).toEqual(['mcal']);
    expect(m.data.getSections().map((s) => s.id)).toEqual(['ccs', 'ncs', 'ns', 'ss', 'sds']);
  });

  it('summarises each region: its sections, their leagues, its team count', () => {
    const regions = m.data.getRegionSummaries();
    expect(regions.map((r) => [r.region.id, r.region.shortName, r.teamCount])).toEqual([
      ['norcal', 'NorCal', 49],
      ['socal', 'SoCal', 53],
    ]);
    expect(regions.map((r) => r.sections.map((s) => [s.section.id, s.leagues.map((l) => l.id)]))).toEqual([
      [['ccs', ['scval', 'bval', 'pcal']], ['ncs', ['mcal']], ['ns', ['eal']]],
      [['ss', ['sunset', 'independents']], ['sds', ['city', 'north-county', 'metro']]],
    ]);
    expect(m.data.getLeagueSummaries('socal').map((l) => l.id)).toEqual(['sunset', 'city', 'north-county', 'metro', 'independents']);
    expect(m.data.getLeagueSummaries('norcal').map((l) => l.id)).toEqual(['scval', 'bval', 'pcal', 'mcal', 'eal']);
    expect(m.data.getLeagueSummaries()).toHaveLength(10);
  });

  it('exposes league health', () => {
    expect(m.data.getLeagueHealth('scval').state).toBe('fresh');
    expect(m.data.getLeagueHealth('mcal').state).toBe('degraded');
    expect(m.data.getLeagueHealth('eal').state).toBe('degraded');
    expect(() => m.data.getLeagueHealth('nope')).toThrow();
  });
});

describe('data: teams', () => {
  it('returns all 102, one division, or one league', () => {
    expect(m.data.getTeams().length).toBe(102);
    expect(m.data.getTeams('de-anza').length).toBe(7);
    expect(m.data.getTeams({ division: 'el-camino' }).length).toBe(8);
    expect(m.data.getTeams({ league: 'bval' }).length).toBe(12);
    expect(m.data.getTeams({ league: 'pcal' }).map((t) => t.division)).toEqual(Array(7).fill('pcal'));
    expect(m.data.getTeams({ league: 'bval', division: 'santa-teresa' }).length).toBe(6);
    expect(m.data.getTeams({ league: 'eal' }).map((t) => t.slug)).toEqual([
      'bella-vista', 'chico', 'corning', 'davis', 'lassen', 'pleasant-valley',
    ]);
    expect(m.data.getTeams({ league: 'sunset' })).toHaveLength(8);
    expect(m.data.getTeams({ league: 'north-county' })).toHaveLength(19);
    expect(m.data.getTeams('valley')).toHaveLength(6);
    expect(m.data.getTeams({ league: 'independents' }).map((t) => t.slug)).toEqual(['bonita', 'chaminade', 'glendora', 'harvard-westlake', 'thousand-oaks']);
  });

  it('groups section → league → division', () => {
    const grouped = m.data.getTeamsGrouped();
    expect(grouped.map((g) => g.section.id)).toEqual(['ccs', 'ncs', 'ns', 'ss', 'sds']);
    expect(grouped[0].leagues.map((l) => l.league.id)).toEqual(['scval', 'bval', 'pcal']);
    expect(grouped[1].leagues[0].divisions).toHaveLength(1);
    expect(grouped[1].leagues[0].divisions[0].heading).toBeNull();
    expect(grouped[2].leagues.map((l) => l.league.id)).toEqual(['eal']);
    expect(grouped[2].leagues[0].divisions.map((d) => [d.id, d.heading, d.teams.length])).toEqual([['eal', null, 6]]);
    expect(grouped.flatMap((g) => g.leagues.flatMap((l) => l.divisions.flatMap((d) => d.teams)))).toHaveLength(102);
    // One region's sections only.
    const norcal = m.data.getTeamsGrouped('norcal');
    expect(norcal.map((g) => g.section.id)).toEqual(['ccs', 'ncs', 'ns']);
    expect(norcal.flatMap((g) => g.leagues.flatMap((l) => l.divisions.flatMap((d) => d.teams)))).toHaveLength(49);
    const socal = m.data.getTeamsGrouped('socal');
    expect(socal.map((g) => g.section.id)).toEqual(['ss', 'sds']);
    expect(socal[0].leagues.map((l) => [l.league.id, l.divisions.map((d) => [d.id, d.heading, d.teams.length])])).toEqual([
      ['sunset', [['sunset', null, 8]]],
      ['independents', [['independents', null, 5]]],
    ]);
    expect(socal[1].leagues.map((l) => [l.league.id, l.divisions.map((d) => [d.id, d.heading, d.teams.length])])).toEqual([
      ['city', [['city-western', 'City Western', 6], ['city-eastern', 'City Eastern', 6]]],
      ['north-county', [['avocado', 'Avocado', 6], ['palomar', 'Palomar', 7], ['valley', 'Valley', 6]]],
      ['metro', [['metro-mesa', 'Metro Mesa', 5], ['metro-south-bay', 'Metro South Bay', 4]]],
    ]);
  });

  it('looks a team up by slug or GUID', () => {
    const team = m.data.getTeamBySlug('los-altos');
    expect(team?.name).toBe('Los Altos');
    expect(m.data.getTeamById(team!.id)?.slug).toBe('los-altos');
    expect(m.data.getTeamForm(team!.id)).toBeDefined(); // a GUID resolves as well as a slug
    expect(m.data.getTeamBySlug('nope')).toBeUndefined();
    expect(m.data.getTeamSlugs()).toHaveLength(102);
  });

  it('builds the search index in LEAGUES then registry order', () => {
    const index = m.data.getTeamSearchIndex();
    expect(index.teams).toHaveLength(102);
    expect(index.teams.map((t) => t.slug)).toEqual(m.data.getTeams().map((t) => t.slug));
    expect(m.data.getTeamSearchIndex()).toBe(index);
  });
});

describe('data: games', () => {
  it('filters by team, league, division, league games, postseason, status and date', () => {
    const all = m.data.getGames();
    expect(all.length).toBe(158);
    const la = m.data.getGames({ teamId: 'los-altos' });
    expect(la.length).toBeGreaterThan(15);
    for (const g of la) expect([g.home.slug, g.away.slug]).toContain('los-altos');
    const leagueOnly = m.data.getGames({ teamId: 'los-altos', leagueOnly: true });
    expect(leagueOnly.length).toBeLessThan(la.length);
    for (const g of leagueOnly) expect(g.countsFor).toBe('de-anza');

    expect(m.data.getGames({ status: 'final' }).length).toBe(91);
    const oneDay = m.data.getGames({ date: '2026-09-28' });
    expect(oneDay.length).toBeGreaterThan(0);
    for (const g of oneDay) expect(g.dateKey).toBe('2026-09-28');

    // Leigh's games are SCVAL non-league games: she is a side, so the BVAL filter finds them.
    const bval = m.data.getGames({ league: 'bval' });
    expect(bval.length).toBeGreaterThan(0);
    expect(bval.every((g) => [g.home.slug, g.away.slug].some((s) => s && m.data.getTeamBySlug(s)?.league === 'bval'))).toBe(true);
    expect(m.data.getGames({ league: 'bval', leagueOnly: true })).toEqual([]);
    expect(m.data.getGames({ division: 'de-anza', leagueOnly: true }).every((g) => g.countsFor === 'de-anza')).toBe(true);
    expect(m.data.getGames({ postseason: true })).toEqual([]);
    expect(m.data.getGames({ postseason: false })).toHaveLength(158);
    expect(m.data.getGames({ teamId: 'not-a-team' })).toEqual([]);
  });

  it('finds a game by id', () => {
    const one = m.data.getGames({ status: 'final' })[0];
    expect(m.data.getGameById(one.contestId)?.contestId).toBe(one.contestId);
    expect(m.data.getGameById('nope')).toBeUndefined();
  });

  it('lists every date with a contest, ascending, overall and per league', () => {
    const dates = m.data.getGameDates();
    expect(dates.length).toBeGreaterThan(20);
    expect([...dates]).toEqual([...dates].sort());
    expect(new Set(dates).size).toBe(dates.length);
    const mcal = m.data.getGameDates({ league: 'mcal' });
    expect(mcal.length).toBeGreaterThan(0);
    expect(m.data.getGamesByDate({ league: 'mcal' }).flatMap((d) => d.games).length).toBe(
      m.data.getGames({ league: 'mcal' }).length,
    );
  });

  it('derives upcoming from the snapshot stamp', () => {
    const upcoming = m.data.getUpcoming(5);
    expect(upcoming.length).toBe(5);
    for (const g of upcoming) {
      expect(g.dateKey >= m.data.getToday()).toBe(true);
      expect(g.status).not.toBe('final');
    }
    const early = m.data.getUpcoming(5, {}, '2026-09-10T15:00:00.000Z');
    expect(early.length).toBe(5);
    for (const g of early) expect(g.dateKey >= '2026-09-10').toBe(true);
    const pcal = m.data.getUpcoming(5, { league: 'pcal' });
    expect(pcal.length).toBeGreaterThan(0);
    expect(pcal.every((g) =>
      [g.home.slug, g.away.slug].some((s) => s && m.data.getTeamBySlug(s)?.league === 'pcal'),
    )).toBe(true);
  });

  it('names the most recent day that actually has results', () => {
    expect(m.data.getLatestResultsDate()).toMatch(/^2026-(09|10)-\d{2}$/);
    expect(m.data.getLatestResultsDate({}, '2026-09-10T15:00:00.000Z')! <= '2026-09-10').toBe(true);
    expect(m.data.getLastLeagueResultDate()).toMatch(/^2026-(09|10)-\d{2}$/);
    expect(m.data.getLastLeagueResultDate({ division: 'de-anza' })).toMatch(/^2026-/);
    expect(m.data.getLastLeagueResultDate({ league: 'scval' })).toBe(m.data.getLastLeagueResultDate());
    expect(m.data.getLastLeagueResultDate({ league: 'bval' })).toBeNull();
  });
});

describe('data: standings and derived facts', () => {
  it('returns a division table in finishing order', () => {
    const table = m.data.getStandings('de-anza');
    expect(table.length).toBe(7);
    for (let i = 1; i < table.length; i += 1) {
      expect(table[i].computed.place).toBeGreaterThanOrEqual(table[i - 1].computed.place);
    }
    expect(Object.keys(m.data.getAllStandings())).toEqual([
      'de-anza', 'el-camino', 'mt-hamilton', 'santa-teresa', 'pcal', 'marin-county', 'eal',
      'sunset', 'city-western', 'city-eastern', 'avocado', 'palomar', 'valley', 'metro-mesa', 'metro-south-bay',
      'independents',
    ]);
    expect(m.data.getStandingFor('leigh')?.hasReportedResults).toBe(false);
  });

  it('exposes a per-division goal-differential domain', () => {
    expect(m.data.getGoalDiffDomain('de-anza')).toBeGreaterThan(0);
    expect(m.data.getGoalDiffDomain('marin-county')).toBe(1);
  });

  it('derives GP, games left, max points and missing results per row', () => {
    const ctx = m.data.getStandingContext('de-anza');
    expect(ctx.size).toBe(7);
    for (const row of m.data.getStandings('de-anza')) {
      const c = ctx.get(row.teamId)!;
      expect(c.scheduled).toBe(12);
      expect(c.counted).toBe(row.computed.gp);
      expect(c.remaining).toBe(Math.max(0, 12 - row.computed.gp));
      expect(c.maxPts).toBe(row.computed.pts + 3 * c.remaining!);
      expect(c.backfilled).toBe(0);
    }
    // The Sep 9 Homestead–Cupertino fixture MaxPreps never published is past and missing.
    const cupertino = m.data.getTeamBySlug('cupertino')!;
    const homestead = m.data.getTeamBySlug('homestead')!;
    expect(ctx.get(cupertino.id)!.missingPast).toBeGreaterThanOrEqual(1);
    expect(ctx.get(homestead.id)!.missingPast).toBeGreaterThanOrEqual(1);
    const mcal = m.data.getStandingContext('marin-county');
    for (const c of mcal.values()) {
      expect([c.scheduled, c.counted, c.remaining, c.maxPts]).toEqual([16, 0, 16, 48]);
    }
    // The Sunset has no fixed schedule (gamesPerTeam null): no "of N", no LEFT, no MAX.
    const sunset = m.data.getStandingContext('sunset');
    expect(sunset.size).toBe(8);
    for (const c of sunset.values()) expect([c.scheduled, c.counted, c.remaining, c.maxPts]).toEqual([null, 0, null, null]);
    // A San Diego division plays a double round robin: Palomar's seven teams play 12 each.
    for (const c of m.data.getStandingContext('palomar').values()) {
      expect([c.scheduled, c.counted, c.remaining, c.maxPts]).toEqual([12, 0, 12, 36]);
    }
  });

  it('lists missing official results with the si.com note slot', () => {
    const missing = m.data.getMissingOfficialResults('de-anza');
    expect(missing.length).toBeGreaterThanOrEqual(1);
    expect(missing[0].dateKey).toBe('2026-09-09');
    expect(missing[0].kind).toBe('missing');
    expect(missing[0].game).toBeNull();
    for (const m of missing) expect(m).toHaveProperty('sblive');
    // Before Sep 9 nothing is missing yet.
    expect(m.data.getMissingOfficialResults('de-anza', '2026-09-05T19:00:00.000Z')).toEqual([]);
    expect(m.data.getMissingOfficialResults('pcal')).toEqual([]);
  });

  it('reports co-leaders only when two teams are level at the top', () => {
    for (const d of ['de-anza', 'el-camino', 'mt-hamilton', 'marin-county']) {
      const co = m.data.getCoLeaders(d);
      if (co === null) continue;
      expect(co.teams.length).toBeGreaterThanOrEqual(2);
      expect(co.final).toBe(false);
      expect(co.label).toBe('Level on points at the top');
    }
    expect(m.data.getCoLeaders('marin-county')).toBeNull();
  });

  it('measures the games-played spread', () => {
    const spread = m.data.getGamesPlayedSpread('el-camino');
    expect(spread.scheduled).toBe(14);
    expect(spread.max).toBeGreaterThanOrEqual(spread.min);
    expect(m.data.getGamesPlayedSpread('pcal')).toEqual({ min: 0, max: 0, scheduled: 12 });
    expect(m.data.getGamesPlayedSpread('sunset')).toEqual({ min: 0, max: 0, scheduled: null });
  });
});

describe('data: season phase per league', () => {
  it('SCVAL follows its data window; the others are preseason until they have games', () => {
    expect(m.data.getSeasonPhase('scval')).toBe('regular');
    expect(m.data.getSeasonPhase('scval', '2026-08-01T15:00:00.000Z')).toBe('preseason');
    expect(m.data.getSeasonPhase('scval', '2026-10-30T15:00:00.000Z')).toBe('crossover');
    expect(m.data.getSeasonPhase('scval', '2026-11-10T15:00:00.000Z')).toBe('playoffs');
    expect(m.data.getSeasonPhase('scval', '2026-12-25T15:00:00.000Z')).toBe('complete');
  });

  it('BVAL, PCAL and MCAL walk their configured phases', () => {
    // Their teams appear in SCVAL non-league games, so their windows have a first game.
    expect(m.data.getSeasonPhase('bval', '2026-10-30T19:00:00.000Z')).toBe('regular');
    expect(m.data.getSeasonPhase('bval', '2026-10-31T19:00:00.000Z')).toBe('play-in');
    expect(m.data.getSeasonPhase('bval', '2026-11-14T19:00:00.000Z')).toBe('playoffs');
    expect(m.data.getSeasonPhase('pcal', '2026-10-30T19:00:00.000Z')).toBe('playoffs');
    expect(m.data.getSeasonPhase('mcal', '2026-10-22T19:00:00.000Z')).toBe('regular');
    expect(m.data.getSeasonPhase('mcal', '2026-10-26T19:00:00.000Z')).toBe('tournament');
    expect(m.data.getSeasonPhase('mcal', '2026-10-31T19:00:00.000Z')).toBe('complete');
  });

  it('EAL: regular through its last league games, then the Super Regional window', () => {
    // Bella Vista's non-league games give the EAL window a first game (Sep 24).
    expect(m.data.getSeasonPhase('eal', '2026-09-01T19:00:00.000Z')).toBe('preseason');
    expect(m.data.getSeasonPhase('eal')).toBe('regular');
    expect(m.data.getSeasonPhase('eal', '2026-10-28T19:00:00.000Z')).toBe('regular');
    expect(m.data.getSeasonPhase('eal', '2026-10-29T19:00:00.000Z')).toBe('tournament');
    expect(m.data.getSeasonPhase('eal', '2026-10-31T19:00:00.000Z')).toBe('tournament');
    expect(m.data.getSeasonPhase('eal', '2026-11-01T19:00:00.000Z')).toBe('complete');
  });

  it('the site phase is the least advanced of the leagues that have started; complete only when all are', () => {
    // This snapshot predates the Southern California leagues: only their games against NorCal teams are
    // in it (City's first is Oct 2, North County's Sep 4), and the Sunset and Metro have none, so those
    // two stay preseason; the rule no longer lets that hold the whole site in its preseason.
    for (const id of ['sunset', 'metro']) {
      expect(m.data.getSeasonPhase(id, '2026-10-26T19:00:00.000Z'), id).toBe('preseason');
    }
    expect(m.data.getSeasonPhase('city', '2026-10-26T19:00:00.000Z')).toBe('regular');
    expect(m.data.getSitePhase('2026-10-26T19:00:00.000Z')).toBe('regular');
    expect(m.data.getSitePhase()).toBe('regular');
    expect(m.data.getSitePhase('2026-08-01T19:00:00.000Z')).toBe('preseason');
    // NorCal is over by Christmas; the Sunset and Metro never started here, so neither SoCal nor the site
    // is complete: every started league is, so the next thing to happen is a league's first game.
    expect(m.data.getRegionPhase('norcal', '2026-12-25T19:00:00.000Z')).toBe('complete');
    expect(m.data.getRegionPhase('socal', '2026-12-25T19:00:00.000Z')).toBe('preseason');
    expect(m.data.getSitePhase('2026-12-25T19:00:00.000Z')).toBe('preseason');
    expect(m.data.getRegionPhase('norcal', '2026-10-30T19:00:00.000Z')).toBe('regular');
  });
});

describe('data: postseason', () => {
  it('projects SCVAL with written labels and the four crossover pairings', () => {
    const projection = m.data.getPlayoffProjection('scval');
    expect(projection.leagueId).toBe('scval');
    expect(projection.berths).toEqual({ auto: 7, total: 16 });
    expect(projection.pairings.map((p) => p.id)).toEqual([
      'scval-crossover-1', 'scval-crossover-2', 'scval-crossover-3', 'scval-crossover-4',
    ]);
    const deAnza = projection.byDivision['de-anza'];
    expect(deAnza.length).toBe(7);
    expect(deAnza[0].status).toBe('aq');
    expect(deAnza.map((r) => r.label)).not.toContain('No results reported');
  });

  it('projects BVAL with every team unplaced, and its play-in pairing with empty seats', () => {
    const bval = m.data.getPlayoffProjection('bval');
    expect(bval.berths).toEqual({ auto: 4, total: 16 });
    expect(Object.keys(bval.byDivision)).toEqual(['mt-hamilton', 'santa-teresa']);
    for (const r of bval.byDivision['mt-hamilton']) expect(r.label).toBe('No results reported');
    expect(bval.pairings).toHaveLength(1);
    expect(bval.pairings[0].seats).toEqual([[], []]);
    expect(m.data.getLeaguePairings('pcal')).toEqual([]);
  });

  it('refuses a CCS projection for MCAL and a tournament for a CCS league', () => {
    expect(() => m.data.getPlayoffProjection('mcal')).toThrow(/no CCS ladder/);
    expect(() => m.data.getLeagueTournament('scval')).toThrow(/runs no league tournament/);
  });

  it('draws neither a CCS projection nor a bracket for the EAL', () => {
    expect(() => m.data.getPlayoffProjection('eal')).toThrow(/no CCS ladder/);
    expect(() => m.data.getLeagueTournament('eal')).toThrow(/runs no league tournament/);
    expect(m.data.getLeaguePairings('eal')).toEqual([]);
  });

  it('builds the MCAL tournament on an empty table', () => {
    const t = m.data.getLeagueTournament('mcal');
    expect(t.leagueId).toBe('mcal');
    expect(t.status).toBe('projected');
    expect(t.games.map((g) => g.id)).toEqual(['qf-1', 'qf-2', 'sf-1', 'sf-2', 'final']);
  });

  it('describes the CCS field in numbers only', () => {
    expect(m.data.getCcsField()).toEqual({
      byLeague: [
        { leagueId: 'scval', shortName: 'SCVAL', auto: 7 },
        { leagueId: 'bval', shortName: 'BVAL', auto: 4 },
        { leagueId: 'pcal', shortName: 'PCAL', auto: 2 },
      ],
      atLarge: 3,
      total: 16,
    });
    expect(m.data.getPlayoffs().format.autoQualifiers.total).toBe(16);
  });

  it('writes a team postseason line, and none for a team without results', () => {
    const sf = m.data.getTeamPostseasonLine('saint-francis')!;
    expect(sf.label).toBe('Automatic qualifier');
    expect(sf.sentence).toBe('The SCVAL crossover and the 4th-place play-in are Fri Oct 30.');
    expect(sf.href).toBe('/playoffs#scval');
    expect(sf.linkText).toBe('CCS playoffs');
    expect(m.data.getTeamPostseasonLine('leigh')).toBeNull();
    expect(m.data.getTeamPostseasonLine('tamalpais')).toBeNull();
    expect(m.data.getTeamPostseasonLine('chico')).toBeNull();
    expect(m.data.getTeamPostseasonLine('nope')).toBeNull();
    // A San Diego team with no league game yet: no place, no line (never placed by merit).
    expect(m.data.getTeamPostseasonLine('la-jolla')).toBeNull();
  });

  it('writes the Sunset’s no-postseason note for every Sunset team, played or not', () => {
    const sunset = getLeague('sunset');
    if (sunset.postseason.kind !== 'no-postseason') throw new Error('the Sunset has no postseason');
    expect(m.data.getTeamPostseasonLine('edison')).toEqual({
      label: 'No section playoffs',
      sentence: sunset.postseason.note,
      href: '/playoffs#sunset',
      linkText: 'Postseason',
    });
    expect(m.data.getTeamPostseasonLine('edison')!.sentence).not.toMatch(/\btop\b/i);
  });

  it('draws neither a projection nor a bracket for the Sunset or a San Diego league', () => {
    for (const id of ['sunset', 'city', 'north-county', 'metro']) {
      expect(() => m.data.getPlayoffProjection(id), id).toThrow(/no CCS ladder/);
      expect(() => m.data.getLeagueTournament(id), id).toThrow(/runs no league tournament/);
      expect(m.data.getLeaguePairings(id)).toEqual([]);
    }
  });

  it('writes the play-in clause from the config, its berth ordinal from autoBerths', () => {
    const bval = getLeague('bval');
    if (bval.postseason.kind !== 'ccs-ladder') throw new Error('BVAL is a CCS ladder league');
    const ps = bval.postseason;
    const playIn = ps.pairings.find((p) => p.tag === 'bval-play-in')!;
    expect(m.data.playInClause(bval, ps, playIn)).toBe(
      'Mt. Hamilton #4 plays at the Santa Teresa champion Sat Oct 31, 11 AM, for BVAL’s fourth automatic CCS berth',
    );
    expect(m.data.playInClause(bval, { ...ps, autoBerths: 5 }, playIn)).toMatch(/for BVAL’s fifth automatic CCS berth$/);
  });
});

describe('data: head-to-head and form', () => {
  it('summarises a meeting between two teams', () => {
    const h2h = m.data.getHeadToHead('los-altos', 'saint-francis');
    expect(h2h).toBeDefined();
    expect(h2h!.games.length).toBeGreaterThan(0);
    expect(h2h!.aRecord.w + h2h!.aRecord.l + h2h!.aRecord.t).toBeLessThanOrEqual(h2h!.games.length);
    expect(m.data.getHeadToHead('los-altos', 'los-altos')).toBeUndefined();
  });

  it('returns a team form strip over counted games only', () => {
    const form = m.data.getTeamForm('homestead');
    expect(form).toBeDefined();
    const last5 = m.data.getStandingFor('homestead')!.computed.last5;
    expect(last5.length).toBeGreaterThan(0);
    expect(form!.leagueGames.length).toBeGreaterThan(last5.length);
    for (const g of form!.leagueGames) {
      expect(m.data.getGameById(g.contestId)!.countsFor).not.toBeNull();
      if (g.status !== 'final') expect(g.margin).toBeNull();
    }
  });

  it('knows nothing of a school that is not fielding a team', () => {
    expect(m.data.getTeamBySlug('wilcox')).toBeUndefined();
    expect(m.data.getTeamForm('wilcox')).toBeUndefined();
  });
});

describe('data: the secondary-source read API', () => {
  it('returns what the snapshot carries, and is safe to call when it carries nothing', () => {
    expect(m.data.getDropped()).toEqual([]);
    expect(m.data.getSupersededGames()).toEqual({});
    expect(m.data.getOfficialFixtures()).toHaveLength(2);
    expect(m.data.getOfficialFixtures({ league: 'scval' })).toHaveLength(2);
    expect(m.data.getOfficialFixtures({ league: 'bval' })).toEqual([]);
    expect(m.data.getOfficialFixtures({ division: 'de-anza', slug: 'cupertino' })).toHaveLength(2);
    expect(m.data.getOfficialFixtures({ slug: 'wilcox' })).toEqual([]);
    expect(m.data.getSources().length).toBeGreaterThan(20);
    expect(m.data.getSources({ league: 'mcal' })).toEqual([]);
  });

  it('keeps the MaxPreps standings cross-check separate from the si.com score one', () => {
    for (const row of m.data.getCrossCheck()) {
      expect(row).toHaveProperty('field');
      expect(row).toHaveProperty('ours');
      expect(row).toHaveProperty('theirs');
    }
    expect(m.data.getCrossCheck({ league: 'scval' })).toEqual(m.data.getCrossCheck());
    expect(m.data.getCrossCheck({ league: 'bval' })).toEqual([]);
  });
});

// ---------------------------------------------------------------- EAL with results

/**
 * The same golden snapshot plus a few synthetic EAL league games (dated around the snapshot's
 * 2026-10-02 stamp), with the EAL standings, window and counts recomputed and the whole file
 * re-validated by loadSnapshot. Chico beat Davis on 1 v 1s (1-1, flagged W/L) and Pleasant Valley
 * beat Lassen, so the two are level on 3 points at the top; Pleasant Valley at Corning (Sep 29) is
 * past with no score, and Davis–Pleasant Valley (Oct 28) is still to come.
 */
describe('data: an EAL table with results', () => {
  let eal: typeof m.data;
  let pending: Game;

  beforeAll(async () => {
    const raw = readJson(goldenPath('snapshot-2026-10-02.v1.json')) as unknown;
    const base = loadSnapshot(raw);
    pending = game({ home: 'corning', away: 'pleasant-valley', date: '2026-09-29', status: 'score-pending' });
    const added = [
      game({ home: 'chico', away: 'davis', hs: 1, as: 1, date: '2026-09-28', results: { home: 'W', away: 'L' } }),
      game({ home: 'pleasant-valley', away: 'lassen', hs: 2, as: 0, date: '2026-09-21' }),
      pending,
      game({ home: 'davis', away: 'pleasant-valley', date: '2026-10-28' }),
    ];
    const games = [...base.games, ...added];
    const ealRows = new Map(
      computeStandings(games, { reported: new Map() })
        .filter((r) => r.division === 'eal')
        .map((r) => [r.teamId, r]),
    );
    const standings = base.standings.map((r) => ealRows.get(r.teamId) ?? r);
    const season = buildSeason(games);
    const next: Snapshot = {
      ...base,
      games,
      standings,
      season: {
        ...base.season,
        leagues: base.season.leagues.map((l) => (l.id === 'eal' ? season.leagues.find((x) => x.id === 'eal')! : l)),
        window: season.window,
      },
      counts: countsOf(games, standings),
    };
    const file = tempFile('data-eal', 'snapshot.json');
    writeFileSync(file, JSON.stringify(loadSnapshot(next)));
    eal = (await withSnapshotModules(file, { data: () => import('@/lib/data') })).modules.data;
  });

  it('counts the 1 v 1 win for Chico in the table and in both forms', () => {
    const table = eal.getStandings('eal');
    const rec = (slug: string) => {
      const c = table.find((r) => r.slug === slug)!.computed;
      return [c.w, c.l, c.t, c.pts, c.gf, c.ga];
    };
    expect(rec('chico')).toEqual([1, 0, 0, 3, 1, 1]);
    expect(rec('davis')).toEqual([0, 1, 0, 0, 1, 1]);
    expect(eal.getTeamForm('chico')!.leagueGames.find((g) => g.status === 'final')?.outcome).toBe('W');
    const davis = eal.getTeamForm('davis')!.leagueGames.find((g) => g.status === 'final')!;
    expect([davis.outcome, davis.margin]).toEqual(['L', 0]);
    const h2h = eal.getHeadToHead('chico', 'davis')!;
    expect([h2h.aRecord, h2h.bRecord]).toEqual([{ w: 1, l: 0, t: 0 }, { w: 0, l: 1, t: 0 }]);
  });

  it('lists the past EAL game with no score as a missing league result', () => {
    const missing = eal.getMissingOfficialResults('eal');
    expect(missing.map((m) => [m.kind, m.dateKey, m.game?.contestId, m.homeSlug, m.awaySlug])).toEqual([
      ['missing', '2026-09-29', pending.contestId, 'corning', 'pleasant-valley'],
    ]);
    expect(missing[0].sblive).toBeNull();
    const ctx = eal.getStandingContext('eal');
    expect(ctx.get(eal.getTeamBySlug('corning')!.id)!.missingPast).toBe(1);
    expect(ctx.get(eal.getTeamBySlug('chico')!.id)!.missingPast).toBe(0);
    // Once Oct 28 has passed, the unplayed Davis–Pleasant Valley game is missing too.
    expect(eal.getMissingOfficialResults('eal', '2026-10-29T19:00:00.000Z').map((m) => m.dateKey)).toEqual([
      '2026-09-29', '2026-10-28',
    ]);
  });

  it('never calls co-leaders final while an EAL league result is missing', () => {
    const now = eal.getCoLeaders('eal')!;
    expect(now.teams.map((t) => t.slug)).toEqual(['chico', 'pleasant-valley']);
    expect(now.final).toBe(false);
    // After league play the phase allows it; the missing results still hold it back.
    expect(eal.getSeasonPhase('eal', '2026-10-29T19:00:00.000Z')).toBe('tournament');
    const later = eal.getCoLeaders('eal', '2026-10-29T19:00:00.000Z')!;
    expect(later.final).toBe(false);
    expect(later.label).toBe('Level on points at the top');
  });

  it('writes the Super Regional line for a placed EAL team, and none for one without results', () => {
    expect(eal.getTeamPostseasonLine('chico')).toEqual({
      label: 'Super Regional place',
      sentence: 'The top six schools play the Super Regional, Oct 30–31; its format and site are not published yet.',
      href: '/playoffs#eal',
      linkText: 'Postseason',
    });
    expect(eal.getTeamPostseasonLine('bella-vista')).toBeNull();
  });
});

// ---------------------------------------------------------------- Southern California with results

/**
 * The same golden snapshot plus synthetic Southern California games, the SoCal standings, windows and
 * counts recomputed and the file re-validated by loadSnapshot (DESIGN-socal §2.1.7). City Western:
 * La Jolla beat Scripps Ranch (flagged) and Bishop's beat Canyon Hills in a shootout (0-0 flagged W/L,
 * NOT flagged a league game: membership counts it anyway). City Eastern: Patrick Henry–Point Loma (Sep 29,
 * unflagged, no score) is a missing league result. Mission Bay–Clairemont is flagged between two City
 * divisions: neither table. North County: Mt. Carmel–Poway is an Avocado–Palomar game, no table. Metro South
 * Bay plays its first game Oct 7. The Sunset: Temecula Valley has played three of the eight, Marina, Edison and
 * Chaparral one each, so the spread is 0 to 3 with no fixed schedule. The independents (DESIGN §24.10): Bonita
 * at Great Oak is flagged by MaxPreps but counts for neither table; Harvard-Westlake–Glendora counts for the
 * group's table though MaxPreps marks it non-league.
 */
describe('data: Southern California tables with results', () => {
  let socal: typeof m.data;
  let henry: Game;
  let crossDivision: Game;

  beforeAll(async () => {
    const raw = readJson(goldenPath('snapshot-2026-10-02.v1.json')) as unknown;
    const base = loadSnapshot(raw);
    henry = game({ home: 'patrick-henry', away: 'point-loma', date: '2026-09-29', status: 'score-pending', league: false });
    crossDivision = game({ home: 'mission-bay', away: 'clairemont', hs: 1, as: 2, date: '2026-09-16' });
    const added = [
      game({ home: 'la-jolla', away: 'scripps-ranch', hs: 2, as: 1, date: '2026-09-15' }),
      game({ home: 'bishops', away: 'canyon-hills', hs: 0, as: 0, date: '2026-09-22', league: false, results: { home: 'W', away: 'L' } }),
      henry,
      crossDivision,
      game({ home: 'mt-carmel', away: 'poway', hs: 0, as: 0, date: '2026-09-11', results: { home: 'W', away: 'L' } }),
      game({ home: 'hilltop', away: 'southwest', date: '2026-10-07' }),
      game({ home: 'temecula-valley', away: 'marina', hs: 9, as: 0, date: '2026-09-28' }),
      game({ home: 'edison', away: 'temecula-valley', hs: 0, as: 2, date: '2026-10-01' }),
      game({ home: 'temecula-valley', away: 'chaparral', hs: 7, as: 0, date: '2026-10-05' }),
      // The LA independents (DESIGN §24.10): a game between two of the five counts for the group's
      // table whatever MaxPreps' flag says; a flagged game against a Sunset team counts for neither.
      game({ home: 'harvard-westlake', away: 'glendora', hs: 5, as: 0, date: '2026-09-08', league: false }),
      game({ home: 'great-oak', away: 'bonita', hs: 1, as: 0, date: '2026-08-27' }),
    ];
    const games = [...base.games, ...added];
    const socalLeagues = new Set(['sunset', 'city', 'north-county', 'metro', 'independents']);
    const socalDivisions = new Set(
      [...socalLeagues].flatMap((id) => getLeague(id).divisions.map((d) => d.id)),
    );
    const rows = new Map(
      computeStandings(games, { reported: new Map() })
        .filter((r) => socalDivisions.has(r.division))
        .map((r) => [r.teamId, r]),
    );
    const standings = base.standings.map((r) => rows.get(r.teamId) ?? r);
    const season = buildSeason(games);
    const next: Snapshot = {
      ...base,
      games,
      standings,
      season: {
        ...base.season,
        leagues: base.season.leagues.map((l) => (socalLeagues.has(l.id) ? season.leagues.find((x) => x.id === l.id)! : l)),
        window: season.window,
      },
      counts: countsOf(games, standings),
    };
    const file = tempFile('data-socal', 'snapshot.json');
    writeFileSync(file, JSON.stringify(loadSnapshot(next)));
    socal = (await withSnapshotModules(file, { data: () => import('@/lib/data') })).modules.data;
  });

  it('counts both City Western games, flagged or not, and the shootout win as a win', () => {
    const table = socal.getStandings('city-western');
    const rec = (slug: string) => {
      const c = table.find((r) => r.slug === slug)!.computed;
      return [c.gp, c.w, c.l, c.t, c.pts];
    };
    expect(rec('la-jolla')).toEqual([1, 1, 0, 0, 3]);
    expect(rec('bishops')).toEqual([1, 1, 0, 0, 3]);
    expect(rec('canyon-hills')).toEqual([1, 0, 1, 0, 0]);
    expect(rec('mission-bay')).toEqual([0, 0, 0, 0, 0]);
    expect(socal.getGameById(crossDivision.contestId)!.provenance.classificationNote).toBe(
      'MaxPreps marks this as a league game; it is between two divisions of the City Conference, so it counts in neither table.',
    );
    // Avocado v Palomar: two divisions of North County, so neither table.
    expect(socal.getStandings('avocado').find((r) => r.slug === 'mt-carmel')!.computed.gp).toBe(0);
  });

  it('lists an unflagged past San Diego game with no score as a missing league result', () => {
    const missing = socal.getMissingOfficialResults('city-eastern');
    expect(missing.map((m) => [m.kind, m.dateKey, m.game?.contestId])).toEqual([['missing', '2026-09-29', henry.contestId]]);
    const ctx = socal.getStandingContext('city-eastern');
    expect(ctx.get(socal.getTeamBySlug('patrick-henry')!.id)!.missingPast).toBe(1);
    expect(socal.getMissingOfficialResults('city-western')).toEqual([]);
  });

  it('keeps the Sunset free of LEFT and MAX, and measures its spread with no "of N"', () => {
    for (const c of socal.getStandingContext('sunset').values()) {
      expect(c.scheduled).toBeNull();
      expect(c.remaining).toBeNull();
      expect(c.maxPts).toBeNull();
    }
    expect(socal.getStandingContext('sunset').get(socal.getTeamBySlug('temecula-valley')!.id)!.counted).toBe(3);
    // Every member is in the spread, a team with no counted game at 0: the table lists it with GP 0, so a
    // sentence starting from the lowest team with a result ('between 1 and …') would be false under it.
    expect(socal.getStandings('sunset').some((r) => r.computed.gp === 0)).toBe(true);
    expect(socal.getGamesPlayedSpread('sunset')).toEqual({ min: 0, max: 3, scheduled: null });
  });

  it('writes the San Diego postseason line from the qualification line, never a "top N"', () => {
    const city = getLeague('city');
    if (city.postseason.kind !== 'section-playoffs') throw new Error('City plays the San Diego Section playoffs');
    const first = socal.getTeamPostseasonLine('la-jolla')!;
    // Two teams are level on 3 points at the top, so the first place spans 1st and 2nd.
    expect(first.label).toBe('1st: at least a play-in if named league champion or no league route into the playoffs');
    expect(first.sentence).toBe(
      `${city.postseason.qualificationLine} The Section lists La Jolla in Division I; Open Division teams are drawn from Division I at the end of the regular season.`,
    );
    expect(first.href).toBe('/playoffs#city');
    expect(first.linkText).toBe('San Diego Section playoffs');
    const below = socal.getTeamPostseasonLine('canyon-hills')!;
    expect(below.label).toBe('No league route');
    expect(below.sentence).not.toMatch(/\btop (six|\d)/i);
    expect(socal.getTeamPostseasonLine('mission-bay')).toBeNull();
    expect(socal.getTeamPostseasonLine('marina')!.label).toBe('No section playoffs');
  });

  it('holds the site in its regular season while Metro has not started, and completes once every league has', () => {
    // Metro's first game is Oct 7 (Metro South Bay): on Oct 2 Metro is preseason and the rest are not.
    expect(socal.getSeasonPhase('metro', '2026-10-02T19:00:00.000Z')).toBe('preseason');
    expect(socal.getSitePhase('2026-10-02T19:00:00.000Z')).toBe('regular');
    expect(socal.getRegionPhase('socal', '2026-10-02T19:00:00.000Z')).toBe('regular');
    // The San Diego Section playoffs (Nov 2-14) are its leagues' tournament phase; the Sunset is done Oct 31.
    expect(socal.getSeasonPhase('city', '2026-11-05T19:00:00.000Z')).toBe('tournament');
    expect(socal.getSeasonPhase('sunset', '2026-11-05T19:00:00.000Z')).toBe('complete');
    expect(socal.getRegionPhase('socal', '2026-11-05T19:00:00.000Z')).toBe('tournament');
    expect(socal.getSitePhase('2026-12-25T19:00:00.000Z')).toBe('complete');
  });
});
