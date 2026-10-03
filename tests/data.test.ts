/**
 * The site-facing read API (SPEC §13.3), against the committed v1 golden snapshot migrated to v2
 * and written to a temp file in SCVAL_SNAPSHOT. SCVAL has its real 2026-10-02 results; BVAL, PCAL
 * and MCAL are registry teams with no results and a degraded health row.
 */

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadSnapshot } from '../lib/snapshot-schema';

type DataModule = typeof import('../lib/data');
let data: DataModule;

const priorEnv = process.env.SCVAL_SNAPSHOT;

beforeAll(async () => {
  const raw = JSON.parse(
    readFileSync(path.join(import.meta.dirname, 'golden', 'snapshot-2026-10-02.v1.json'), 'utf8'),
  ) as unknown;
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'scvalfh-data-')), 'snapshot.json');
  writeFileSync(file, JSON.stringify(loadSnapshot(raw)));
  process.env.SCVAL_SNAPSHOT = file;
  data = await import('../lib/data');
});

afterAll(() => {
  if (priorEnv === undefined) delete process.env.SCVAL_SNAPSHOT;
  else process.env.SCVAL_SNAPSHOT = priorEnv;
});

describe('data: identity and freshness', () => {
  it('loads the snapshot once and exposes it', () => {
    expect(data.getSnapshot().schemaVersion).toBe(2);
    expect(data.getSnapshot().teams.length).toBe(43);
    expect(data.getFetchedAt()).toBe('2026-10-02T10:48:51.206Z');
    expect(data.getCounts().teams).toBe(43);
  });

  it('derives today from the snapshot stamp in America/Los_Angeles', () => {
    // 2026-10-02T10:48Z is 3:48 AM PDT on the 2nd.
    expect(data.getToday()).toBe('2026-10-02');
  });

  it('measures snapshot age against an instant you pass in', () => {
    expect(data.getSnapshotAgeHours('2026-10-03T10:48:51.206Z')).toBeCloseTo(24, 3);
    expect(data.getSnapshotAgeHours()).toBe(0);
  });
});

describe('data: sections and leagues', () => {
  it('summarises the four leagues in config order', () => {
    const leagues = data.getLeagueSummaries();
    expect(leagues.map((l) => l.id)).toEqual(['scval', 'bval', 'pcal', 'mcal']);
    expect(leagues.map((l) => l.teamCount)).toEqual([15, 12, 7, 9]);
    const bval = data.getLeagueSummary('bval')!;
    expect(bval.section).toEqual({ id: 'ccs', name: 'Central Coast Section', shortName: 'CCS' });
    expect(bval.singleDivision).toBe(false);
    expect(bval.divisions.map((d) => [d.id, d.heading, d.teamCount])).toEqual([
      ['mt-hamilton', 'Mt. Hamilton', 6],
      ['santa-teresa', 'Santa Teresa', 6],
    ]);
    const mcal = data.getLeagueSummary('mcal')!;
    expect(mcal.section.shortName).toBe('NCS');
    expect(mcal.singleDivision).toBe(true);
    expect(mcal.divisions[0].heading).toBeNull();
    expect(data.getLeagueSummary('nope')).toBeUndefined();
  });

  it('lists route params', () => {
    expect(data.getLeagueIds()).toEqual(['scval', 'bval', 'pcal', 'mcal']);
    expect(data.getTournamentLeagueIds()).toEqual(['mcal']);
    expect(data.getSections().map((s) => s.id)).toEqual(['ccs', 'ncs']);
  });

  it('exposes league health', () => {
    expect(data.getAllLeagueHealth()).toHaveLength(4);
    expect(data.getLeagueHealth('scval').state).toBe('fresh');
    expect(data.getLeagueHealth('mcal').state).toBe('degraded');
    expect(() => data.getLeagueHealth('nope')).toThrow();
  });
});

describe('data: teams', () => {
  it('returns all 43, one division, or one league', () => {
    expect(data.getTeams().length).toBe(43);
    expect(data.getTeams('de-anza').length).toBe(7);
    expect(data.getTeams({ division: 'el-camino' }).length).toBe(8);
    expect(data.getTeams({ league: 'bval' }).length).toBe(12);
    expect(data.getTeams({ league: 'pcal' }).map((t) => t.division)).toEqual(Array(7).fill('pcal'));
    expect(data.getTeams({ league: 'bval', division: 'santa-teresa' }).length).toBe(6);
  });

  it('groups section → league → division', () => {
    const grouped = data.getTeamsGrouped();
    expect(grouped.map((g) => g.section.id)).toEqual(['ccs', 'ncs']);
    expect(grouped[0].leagues.map((l) => l.league.id)).toEqual(['scval', 'bval', 'pcal']);
    expect(grouped[1].leagues[0].divisions).toHaveLength(1);
    expect(grouped[1].leagues[0].divisions[0].heading).toBeNull();
    expect(grouped.flatMap((g) => g.leagues.flatMap((l) => l.divisions.flatMap((d) => d.teams)))).toHaveLength(43);
  });

  it('looks a team up by slug or GUID, and names its league', () => {
    const team = data.getTeamBySlug('los-altos');
    expect(team?.name).toBe('Los Altos');
    expect(data.getTeamById(team!.id)?.slug).toBe('los-altos');
    expect(data.resolveTeamRef(team!.id)?.slug).toBe('los-altos');
    expect(data.getTeamBySlug('nope')).toBeUndefined();
    expect(data.getLeagueOfTeam('tamalpais')?.id).toBe('mcal');
    expect(data.getLeagueOfTeam('nope')).toBeUndefined();
    expect(data.getTeamSlugs()).toHaveLength(43);
  });

  it('builds the search index in LEAGUES then registry order', () => {
    const index = data.getTeamSearchIndex();
    expect(index.teams).toHaveLength(43);
    expect(index.teams.map((t) => t.slug)).toEqual(data.getTeams().map((t) => t.slug));
    expect(data.getTeamSearchIndex()).toBe(index);
  });
});

describe('data: games', () => {
  it('filters by team, league, division, league games, postseason, status and date', () => {
    const all = data.getGames();
    expect(all.length).toBe(158);
    const la = data.getGames({ teamId: 'los-altos' });
    expect(la.length).toBeGreaterThan(15);
    for (const g of la) expect([g.home.slug, g.away.slug]).toContain('los-altos');
    const leagueOnly = data.getGames({ teamId: 'los-altos', leagueOnly: true });
    expect(leagueOnly.length).toBeLessThan(la.length);
    for (const g of leagueOnly) expect(g.countsFor).toBe('de-anza');

    expect(data.getGames({ status: 'final' }).length).toBe(91);
    const oneDay = data.getGames({ date: '2026-09-28' });
    expect(oneDay.length).toBeGreaterThan(0);
    for (const g of oneDay) expect(g.dateKey).toBe('2026-09-28');

    // Leigh's games are SCVAL non-league games: she is a side, so the BVAL filter finds them.
    const bval = data.getGames({ league: 'bval' });
    expect(bval.length).toBeGreaterThan(0);
    expect(bval.every((g) => [g.home.slug, g.away.slug].some((s) => s && data.getTeamBySlug(s)?.league === 'bval'))).toBe(true);
    expect(data.getGames({ league: 'bval', leagueOnly: true })).toEqual([]);
    expect(data.getGames({ division: 'de-anza', leagueOnly: true }).every((g) => g.countsFor === 'de-anza')).toBe(true);
    expect(data.getGames({ postseason: true })).toEqual([]);
    expect(data.getGames({ postseason: false })).toHaveLength(158);
    expect(data.getGames({ teamId: 'not-a-team' })).toEqual([]);
  });

  it('finds a game by id', () => {
    const one = data.getGames({ status: 'final' })[0];
    expect(data.getGameById(one.contestId)?.contestId).toBe(one.contestId);
    expect(data.getGameById('nope')).toBeUndefined();
  });

  it('lists every date with a contest, ascending, overall and per league', () => {
    const dates = data.getGameDates();
    expect(dates.length).toBeGreaterThan(20);
    expect([...dates]).toEqual([...dates].sort());
    expect(new Set(dates).size).toBe(dates.length);
    const mcal = data.getGameDates({ league: 'mcal' });
    expect(mcal.length).toBeGreaterThan(0);
    expect(data.getGamesByDate({ league: 'mcal' }).flatMap((d) => d.games).length).toBe(
      data.getGames({ league: 'mcal' }).length,
    );
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
    expect(recent[0].dateLocal >= recent[1].dateLocal).toBe(true);
    const early = data.getRecentResults(3, '2026-09-10T15:00:00.000Z');
    for (const g of early) expect(g.dateKey <= '2026-09-10').toBe(true);
    expect(data.getRecentResults(5, undefined, { league: 'pcal' }).every((g) =>
      [g.home.slug, g.away.slug].some((s) => s && data.getTeamBySlug(s)?.league === 'pcal'),
    )).toBe(true);
  });

  it('names the most recent day that actually has results', () => {
    expect(data.getLatestResultsDate()).toMatch(/^2026-(09|10)-\d{2}$/);
    expect(data.getLastLeagueResultDate()).toMatch(/^2026-(09|10)-\d{2}$/);
    expect(data.getLastLeagueResultDate({ division: 'de-anza' })).toMatch(/^2026-/);
    expect(data.getLastLeagueResultDate({ league: 'scval' })).toBe(data.getLastLeagueResultDate());
    expect(data.getLastLeagueResultDate({ league: 'bval' })).toBeNull();
  });
});

describe('data: standings and derived facts', () => {
  it('returns a division table in finishing order, and a league’s tables', () => {
    const table = data.getStandings('de-anza');
    expect(table.length).toBe(7);
    for (let i = 1; i < table.length; i += 1) {
      expect(table[i].computed.place).toBeGreaterThanOrEqual(table[i - 1].computed.place);
    }
    expect(data.getLeagueStandings('bval').map((d) => [d.division, d.heading, d.rows.length])).toEqual([
      ['mt-hamilton', 'Mt. Hamilton', 6],
      ['santa-teresa', 'Santa Teresa', 6],
    ]);
    expect(data.getLeagueStandings('pcal')[0].heading).toBeNull();
    expect(Object.keys(data.getAllStandings())).toEqual([
      'de-anza', 'el-camino', 'mt-hamilton', 'santa-teresa', 'pcal', 'marin-county',
    ]);
    expect(data.getStandingFor('leigh')?.hasReportedResults).toBe(false);
  });

  it('exposes a per-division goal-differential domain', () => {
    expect(data.getGoalDiffDomain('de-anza')).toBeGreaterThan(0);
    expect(data.getGoalDiffDomain('marin-county')).toBe(1);
  });

  it('derives GP, games left, max points and missing results per row', () => {
    const ctx = data.getStandingContext('de-anza');
    expect(ctx.size).toBe(7);
    for (const row of data.getStandings('de-anza')) {
      const c = ctx.get(row.teamId)!;
      expect(c.scheduled).toBe(12);
      expect(c.counted).toBe(row.computed.gp);
      expect(c.remaining).toBe(Math.max(0, 12 - row.computed.gp));
      expect(c.maxPts).toBe(row.computed.pts + 3 * c.remaining);
      expect(c.backfilled).toBe(0);
    }
    // The Sep 9 Homestead–Cupertino fixture MaxPreps never published is past and missing.
    const cupertino = data.getTeamBySlug('cupertino')!;
    const homestead = data.getTeamBySlug('homestead')!;
    expect(ctx.get(cupertino.id)!.missingPast).toBeGreaterThanOrEqual(1);
    expect(ctx.get(homestead.id)!.missingPast).toBeGreaterThanOrEqual(1);
    const mcal = data.getStandingContext('marin-county');
    for (const c of mcal.values()) {
      expect([c.scheduled, c.counted, c.remaining, c.maxPts]).toEqual([16, 0, 16, 48]);
    }
  });

  it('lists missing official results with the si.com note slot', () => {
    const missing = data.getMissingOfficialResults('de-anza');
    expect(missing.length).toBeGreaterThanOrEqual(1);
    expect(missing[0].dateKey).toBe('2026-09-09');
    expect(missing[0].kind).toBe('missing');
    expect(missing[0].game).toBeNull();
    for (const m of missing) expect(m).toHaveProperty('sblive');
    // Before Sep 9 nothing is missing yet.
    expect(data.getMissingOfficialResults('de-anza', '2026-09-05T19:00:00.000Z')).toEqual([]);
    expect(data.getMissingOfficialResults('pcal')).toEqual([]);
  });

  it('reports co-leaders only when two teams are level at the top', () => {
    for (const d of ['de-anza', 'el-camino', 'mt-hamilton', 'marin-county']) {
      const co = data.getCoLeaders(d);
      if (co === null) continue;
      expect(co.teams.length).toBeGreaterThanOrEqual(2);
      expect(co.final).toBe(false);
      expect(co.label).toBe('Level on points at the top');
    }
    expect(data.getCoLeaders('marin-county')).toBeNull();
  });

  it('measures the games-played spread', () => {
    const spread = data.getGamesPlayedSpread('el-camino');
    expect(spread.scheduled).toBe(14);
    expect(spread.max).toBeGreaterThanOrEqual(spread.min);
    expect(data.getGamesPlayedSpread('pcal')).toEqual({ min: 0, max: 0, scheduled: 12 });
  });
});

describe('data: season phase per league', () => {
  it('SCVAL follows its data window; the others are preseason until they have games', () => {
    expect(data.getSeasonPhase('scval')).toBe('regular');
    expect(data.getSeasonPhase('scval', '2026-08-01T15:00:00.000Z')).toBe('preseason');
    expect(data.getSeasonPhase('scval', '2026-10-30T15:00:00.000Z')).toBe('crossover');
    expect(data.getSeasonPhase('scval', '2026-11-10T15:00:00.000Z')).toBe('playoffs');
    expect(data.getSeasonPhase('scval', '2026-12-25T15:00:00.000Z')).toBe('complete');
  });

  it('BVAL, PCAL and MCAL walk their configured phases', () => {
    // Their teams appear in SCVAL non-league games, so their windows have a first game.
    expect(data.getSeasonPhase('bval', '2026-10-30T19:00:00.000Z')).toBe('regular');
    expect(data.getSeasonPhase('bval', '2026-10-31T19:00:00.000Z')).toBe('play-in');
    expect(data.getSeasonPhase('bval', '2026-11-14T19:00:00.000Z')).toBe('playoffs');
    expect(data.getSeasonPhase('pcal', '2026-10-30T19:00:00.000Z')).toBe('playoffs');
    expect(data.getSeasonPhase('mcal', '2026-10-22T19:00:00.000Z')).toBe('regular');
    expect(data.getSeasonPhase('mcal', '2026-10-26T19:00:00.000Z')).toBe('tournament');
    expect(data.getSeasonPhase('mcal', '2026-10-31T19:00:00.000Z')).toBe('complete');
  });

  it('the site phase is the least advanced league', () => {
    expect(data.getSitePhase('2026-10-26T19:00:00.000Z')).toBe('regular');
    expect(data.getSitePhase('2026-12-25T19:00:00.000Z')).toBe('complete');
  });
});

describe('data: postseason', () => {
  it('projects SCVAL with written labels and the four crossover pairings', () => {
    const projection = data.getPlayoffProjection('scval');
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
    const bval = data.getPlayoffProjection('bval');
    expect(bval.berths).toEqual({ auto: 4, total: 16 });
    expect(Object.keys(bval.byDivision)).toEqual(['mt-hamilton', 'santa-teresa']);
    for (const r of bval.byDivision['mt-hamilton']) expect(r.label).toBe('No results reported');
    expect(bval.pairings).toHaveLength(1);
    expect(bval.pairings[0].seats).toEqual([[], []]);
    expect(data.getLeaguePairings('pcal')).toEqual([]);
  });

  it('refuses a CCS projection for MCAL and a tournament for a CCS league', () => {
    expect(() => data.getPlayoffProjection('mcal')).toThrow(/no CCS ladder/);
    expect(() => data.getLeagueTournament('scval')).toThrow(/runs no league tournament/);
  });

  it('builds the MCAL tournament on an empty table', () => {
    const t = data.getLeagueTournament('mcal');
    expect(t.leagueId).toBe('mcal');
    expect(t.status).toBe('projected');
    expect(t.games.map((g) => g.id)).toEqual(['qf-1', 'qf-2', 'sf-1', 'sf-2', 'final']);
  });

  it('describes the CCS field in numbers only', () => {
    expect(data.getCcsField()).toEqual({
      byLeague: [
        { leagueId: 'scval', shortName: 'SCVAL', auto: 7 },
        { leagueId: 'bval', shortName: 'BVAL', auto: 4 },
        { leagueId: 'pcal', shortName: 'PCAL', auto: 2 },
      ],
      atLarge: 3,
      total: 16,
    });
    expect(data.BRACKET_URL).toMatch(/^https:\/\/www\.maxpreps\.com\/tournament\//);
    expect(data.getPlayoffs().format.autoQualifiers.total).toBe(16);
  });

  it('writes a team postseason line, and none for a team without results', () => {
    const sf = data.getTeamPostseasonLine('saint-francis')!;
    expect(sf.label).toBe('Automatic qualifier');
    expect(sf.sentence).toBe('The SCVAL crossover and the 4th-place play-in are Fri Oct 30.');
    expect(sf.href).toBe('/playoffs#scval');
    expect(sf.linkText).toBe('CCS playoffs →');
    expect(data.getTeamPostseasonLine('leigh')).toBeNull();
    expect(data.getTeamPostseasonLine('tamalpais')).toBeNull();
    expect(data.getTeamPostseasonLine('nope')).toBeNull();
  });
});

describe('data: head-to-head and form', () => {
  it('summarises a meeting between two teams', () => {
    const h2h = data.getHeadToHead('los-altos', 'saint-francis');
    expect(h2h).toBeDefined();
    expect(h2h!.games.length).toBeGreaterThan(0);
    expect(h2h!.aRecord.w + h2h!.aRecord.l + h2h!.aRecord.t).toBeLessThanOrEqual(h2h!.games.length);
    expect(data.getHeadToHead('los-altos', 'los-altos')).toBeUndefined();
  });

  it('returns a team form strip over counted games only', () => {
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

  it('knows nothing of a school that is not fielding a team', () => {
    expect(data.getTeamBySlug('wilcox')).toBeUndefined();
    expect(data.getTeamForm('wilcox')).toBeUndefined();
  });
});

describe('data: the secondary-source read API', () => {
  it('returns what the snapshot carries, and is safe to call when it carries nothing', () => {
    expect(data.getDropped()).toEqual([]);
    expect(data.getSupersededGames()).toEqual({});
    expect(data.getOfficialFixtures()).toHaveLength(2);
    expect(data.getOfficialFixtures({ league: 'scval' })).toHaveLength(2);
    expect(data.getOfficialFixtures({ league: 'bval' })).toEqual([]);
    expect(data.getOfficialFixtures({ division: 'de-anza', slug: 'cupertino' })).toHaveLength(2);
    expect(data.getOfficialFixtures({ slug: 'wilcox' })).toEqual([]);
    expect(data.getSources().length).toBeGreaterThan(20);
    expect(data.getSources({ league: 'mcal' })).toEqual([]);
  });

  it('returns no score conflict for a game that has none, and undefined for an unknown id', () => {
    const [game] = data.getGames({ status: 'final' });
    expect(data.getScoreConflict(game.contestId)).toBeUndefined();
    expect(data.getScoreConflict('no-such-contest')).toBeUndefined();
  });

  it('keeps the MaxPreps standings cross-check separate from the si.com score one', () => {
    for (const row of data.getCrossCheck()) {
      expect(row).toHaveProperty('field');
      expect(row).toHaveProperty('ours');
      expect(row).toHaveProperty('theirs');
    }
    expect(data.getCrossCheck({ league: 'scval' })).toEqual(data.getCrossCheck());
    expect(data.getCrossCheck({ league: 'bval' })).toEqual([]);
  });
});
