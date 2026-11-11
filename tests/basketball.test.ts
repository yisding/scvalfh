/**
 * The basketball build (SCVAL_SPORT=basketball; docs/MULTI-SPORT.md): its sport, its one league and registry,
 * its data files, its CCS block and its JV schedule, read through the same modules a basketball build loads.
 * Like tests/soccer.test.ts, this file sets the switch before importing anything that reads it; vitest runs
 * each test file in its own module graph, so field hockey's tests never see it. update-data-basketball.yml
 * runs this file on what it fetched.
 */
import { readFileSync } from 'node:fs';

import { beforeAll, describe, expect, it, vi } from 'vitest';

type Modules = {
  current: typeof import('../lib/sports/current');
  season: typeof import('../lib/season');
  format: typeof import('../lib/format');
  leagues: typeof import('../lib/leagues');
  teams: typeof import('../lib/teams');
  sections: typeof import('../lib/league-config/sections');
  data: typeof import('../lib/data');
  official: typeof import('../lib/official/schema');
  validate: typeof import('../lib/official/validate');
  fixtures: typeof import('../scripts/build-scval-basketball-fixtures');
  playerStats: typeof import('../lib/players/player-stats');
  jv: typeof import('../lib/jv/jv');
  jvOfficial: typeof import('../lib/jv/jv-official');
  rosters: typeof import('../lib/players/rosters');
  order: typeof import('../lib/standings/order');
};

let m: Modules;

beforeAll(async () => {
  vi.stubEnv('SCVAL_SPORT', 'basketball');
  vi.resetModules();
  m = {
    current: await import('../lib/sports/current'),
    season: await import('../lib/season'),
    format: await import('../lib/format'),
    leagues: await import('../lib/leagues'),
    teams: await import('../lib/teams'),
    sections: await import('../lib/league-config/sections'),
    data: await import('../lib/data'),
    official: await import('../lib/official/schema'),
    validate: await import('../lib/official/validate'),
    fixtures: await import('../scripts/build-scval-basketball-fixtures'),
    // Each validates its bundled data/basketball/ file at import.
    playerStats: await import('../lib/players/player-stats'),
    jv: await import('../lib/jv/jv'),
    jvOfficial: await import('../lib/jv/jv-official'),
    rosters: await import('../lib/players/rosters'),
    order: await import('../lib/standings/order'),
  };
});

describe('the basketball sport switch', () => {
  it('is boys varsity basketball, winter 2026-27, with its data under data/basketball/', () => {
    const { SPORT, SPORT_SEASON, SPORT_AUDIENCE, DATA_DIR, IS_FIELD_HOCKEY, IS_BASKETBALL, HAS_RECRUITING } = m.current;
    expect(SPORT.id).toBe('basketball');
    expect(SPORT_SEASON.sportSeasonId).toBe('a5dadf08-21fb-4889-bd84-1d0c6816e29a');
    expect(SPORT_SEASON.jvSportSeasonId).toBe('d0f0932b-e598-4b10-ba5a-f790f3fff4c3');
    expect(SPORT_SEASON.genderSport).toBe('boys,basketball');
    expect(SPORT_AUDIENCE).toBe('boys varsity basketball');
    expect(DATA_DIR).toBe('data/basketball');
    expect([IS_FIELD_HOCKEY, IS_BASKETBALL, HAS_RECRUITING]).toEqual([false, true, false]);
  });

  it('scores points, never ends level, and prints a record as W-L', () => {
    const { SPORT } = m.current;
    expect(SPORT.scoring).toMatchObject({ allowsTies: false, unit: 'point', forAbbr: 'PF', againstAbbr: 'PA', diffAbbr: 'PD' });
    // lib/format reads the inlined SCVAL_SPORT, not the sport definition: the two must agree.
    expect(m.format.SPORT_HAS_NO_TIES).toBe(!SPORT.scoring.allowsTies);
    expect(m.format.recordString({ w: 4, l: 1, t: 0 })).toBe('4-1');
    expect(m.format.recordWords({ w: 4, l: 1, t: 0 })).toBe('4 wins, 1 loss');
    // A tie a source records anyway is never hidden.
    expect(m.format.recordString({ w: 4, l: 1, t: 1 })).toBe('4-1-1');
  });

  it('derives the season words and source links from the basketball definition', () => {
    expect(m.season.SEASON_DISPLAY).toBe('Winter 2026-27');
    expect(m.season.BOOTSTRAP_URL).toBe('https://www.maxpreps.com/ca/basketball/');
    expect(m.season.HUB_SPORT_SEASON_ID).toBe(m.current.SPORT_SEASON.sportSeasonId);
    expect(m.season.CCS_BRACKET_URL).toBeNull();
    // cifccs.org's sport pages were never read (405 to scripts): the section link is the calendar page.
    expect(m.season.SOURCE_LINKS.ccs).toBe('https://cifccs.org/calendar/Basketball');
    expect(m.season.SOURCE_LINKS.ccsCalendar).toBe('https://cifccs.org/calendar/Basketball?print=ical');
    expect(m.season.maxprepsJvTeamUrl('https://www.maxpreps.com/ca/palo-alto/gunn-titans/basketball/')).toBe(
      'https://www.maxpreps.com/ca/palo-alto/gunn-titans/basketball/jv/',
    );
  });
});

describe('SCVAL boys basketball', () => {
  it('is the only league, in one section and one region', () => {
    expect(m.leagues.LEAGUE_IDS).toEqual(['scval']);
    expect(m.sections.SECTIONS.map((s) => s.id)).toEqual(['ccs']);
    expect(m.sections.REGIONS.map((r) => r.id)).toEqual(['norcal']);
  });

  it('aligns the 15 schools of the two official schedules', () => {
    const slugs = (division: string) => m.teams.teamsInDivision(division).map((t) => t.slug).sort();
    expect(slugs('de-anza')).toEqual(['gunn', 'homestead', 'los-gatos', 'lynbrook', 'milpitas', 'mountain-view', 'palo-alto']);
    expect(slugs('el-camino')).toEqual([
      'cupertino', 'fremont', 'los-altos', 'macdonald', 'monta-vista', 'santa-clara', 'saratoga', 'wilcox',
    ]);
    expect(m.teams.TEAMS).toHaveLength(15);
    for (const team of m.teams.TEAMS) expect(team.external.maxprepsTeamUrl).toMatch(/\/basketball\/$/);
  });

  it('orders its tables on the league record, with the by-laws tiebreak chain (Article VI §1, §1.1)', () => {
    const { rules } = m.leagues.getLeague('scval');
    expect(rules.orderBy).toBe('win-pct');
    expect(rules.points).toEqual({ win: 1, tie: 0, loss: 0 });
    expect(rules.tiebreaks.default).toEqual(['head-to-head', 'record-vs-placed', 'coaches-vote']);
    expect(rules.leagueOvertime).toBe('until-decided');
    expect(m.order.orderHead(rules)).toBe('PCT');
    expect(m.order.orderValue(rules, { pts: 3, winPct: 0.75, gp: 4 })).toBe('.750');
    // 3-0 is ahead of 3-1 on the league record, where points (wins) alone would call them level.
    expect(m.order.compareInOrder(rules, { pts: 3, winPct: 1, gp: 3 }, { pts: 3, winPct: 0.75, gp: 4 })).toBeLessThan(0);
  });

  it('gives De Anza three automatic CCS berths and El Camino one (By-Laws Article VI §2.1)', () => {
    const scval = m.leagues.getLeague('scval');
    expect(scval.postseason.kind).toBe('ccs-ladder');
    if (scval.postseason.kind !== 'ccs-ladder') return;
    expect(scval.postseason.autoBerths).toBe(4);
    const aq = scval.postseason.ladder.filter((r) => r.status === 'aq');
    expect(aq.map((r) => [r.divisions, r.places])).toEqual([[['de-anza'], [1, 3]], [['el-camino'], [1, 1]]]);
  });

  it('dates the CCS rounds from the CCS calendar: a first round before the quarterfinals, the Open final a day early', () => {
    const { CCS, ccsFirstDay, ccsLastDay, ccsRoundDays } = m.sections;
    expect(CCS.autoQualifiers).toEqual({ scval: 4, atLarge: null, total: null });
    expect(CCS.keyDates).toMatchObject({
      entriesDue: '2027-02-17T10:00:00',
      seedingMeeting: '2027-02-17T12:00:00',
      firstRound: '2027-02-19',
      quarterfinals: '2027-02-23',
      semifinals: '2027-02-25',
      finals: '2027-02-26',
      finalsLast: '2027-02-27',
      evaluationMeeting: '2027-03-11T16:00:00',
    });
    expect(ccsFirstDay(CCS.keyDates)).toBe('2027-02-19');
    expect(ccsLastDay(CCS.keyDates)).toBe('2027-02-27');
    expect(ccsRoundDays(CCS.keyDates, 'finals', (d) => d)).toBe('2027-02-26 to 2027-02-27');
    expect(CCS.highSeedHostsThrough).toBe('semifinals');
    expect(CCS.tournament).toBeNull();
  });
});

describe('the SCVAL boys basketball official schedules', () => {
  it('builds the committed bundle from the two schedule texts, byte for byte', () => {
    const built = m.official.serializeBundle(m.fixtures.buildBundle());
    expect(readFileSync('data/basketball/official/scval-2026.json', 'utf8')).toBe(built);
  });

  it('is a double round robin per division, each fixture with its JV game', () => {
    const bundle = m.official.readOfficialBundle('scval');
    const rows = m.official.bundleToFixtures(bundle);
    for (const division of m.leagues.getLeague('scval').divisions) {
      const fixtures = rows.filter((f) => f.division === division.id);
      const n = division.expectedTeams;
      expect(fixtures).toHaveLength(n * (n - 1));
      m.validate.assertDoubleRoundRobin(fixtures, division.id);
      expect(fixtures.every((f) => f.jv !== undefined)).toBe(true);
    }
  });

  it('reads the starting times the schedules give: night games, quad days and the Monday JV round', () => {
    const { fixtures } = m.official.readOfficialBundle('scval');
    const of = (id: string) => fixtures.find((f) => f.id === id)!;
    // A Wednesday night: JV 5:30, varsity 7:00.
    expect(of('de-anza:2027-01-06:homestead@los-gatos')).toMatchObject({ time: '19:00', jv: { date: '2027-01-06', time: '17:30' } });
    // A quad day marked B: boys JV at 3:00, boys varsity at 7:45.
    expect(of('de-anza:2027-01-02:gunn@lynbrook')).toMatchObject({ time: '19:45', jv: { date: '2027-01-02', time: '15:00' } });
    // A quad day marked G: girls JV at 3:00, so the boys JV at 4:30.
    expect(of('el-camino:2027-01-08:los-altos@wilcox')).toMatchObject({ time: '19:45', jv: { date: '2027-01-08', time: '16:30' } });
    // The last round: varsity Tue Feb 16 at 7:00, its JV round Mon Feb 15 at 7:00.
    expect(of('el-camino:2027-02-16:cupertino@los-altos')).toMatchObject({ time: '19:00', jv: { date: '2027-02-15', time: '19:00' } });
  });

  it('reads the column both documents head "FRIDAY, FEBRUARY 7" as Friday, February 5 (the 7th is a Sunday)', () => {
    const { fixtures } = m.official.readOfficialBundle('scval');
    expect(m.fixtures.DATE_CORRECTIONS).toEqual({ 'FRIDAY, FEBRUARY 7': '2027-02-05' });
    expect(new Date('2027-02-07T12:00:00Z').getUTCDay()).toBe(0);
    expect(fixtures.filter((f) => f.date === '2027-02-07')).toHaveLength(0);
    expect(fixtures.filter((f) => f.date === '2027-02-05')).toHaveLength(7);
  });

  it('refuses a column head whose weekday is not its date', () => {
    expect(() => m.fixtures.parseGrid('  SUNDAY, JANUARY 2\nGUNN @ LYNBROOK\n')).toThrow(/2027-01-02 is a SATURDAY/);
  });
});

describe('the basketball data files', () => {
  it('bundles a basketball snapshot of the 15 teams', () => {
    const snapshot = m.data.getSnapshot();
    expect(snapshot.season.genderSport).toBe('boys,basketball');
    expect(snapshot.season.sportSeasonId).toBe(m.current.SPORT_SEASON.sportSeasonId);
    expect(snapshot.teams.map((t) => t.slug)).toEqual(m.teams.TEAMS.map((t) => t.slug));
  });

  it('loads the player stats, JV games and rosters of the same 15 teams', () => {
    const slugs = m.teams.TEAMS.map((t) => t.slug).sort();
    expect(m.playerStats.getPlayerStats().teams.map((t) => t.slug).sort()).toEqual(slugs);
    expect(m.jv.getJvFile().teams.map((t) => t.slug).sort()).toEqual(slugs);
    expect(m.rosters.getRosters().teams.map((t) => t.slug).sort()).toEqual(slugs);
    expect(m.jv.getJvFile().sportSeasonId).toBe(m.current.SPORT_SEASON.jvSportSeasonId);
  });
});

describe('the basketball JV schedule (lib/jv/jv-official.ts over the bundled files)', () => {
  it('gives every league fixture a JV slot, and every slot exactly one JV game', () => {
    const merge = m.jv.getJvOfficialMerge();
    expect(merge.slots).toBe(98);
    expect(merge.matched + merge.moved + merge.added.length).toBe(merge.slots);
    for (const division of m.leagues.getLeague('scval').divisions) {
      expect(m.jv.isJvScheduledDivision(division.id)).toBe(true);
      expect(m.jv.getJvTable(division.id)?.gamesPerTeam).toBe(division.gamesPerTeam);
    }
  });

  it('lists a full JV league round for every school: 12 games in De Anza, 14 in El Camino', () => {
    for (const team of m.teams.TEAMS) {
      const league = m.jv.getJvGamesForTeam(team.slug).filter((g) => g.countsFor !== null);
      const expected = m.leagues.getDivision(team.division).gamesPerTeam;
      // A coach may list a league game twice or on a day no slot claims; never fewer than the schedule's.
      expect(league.length, team.slug).toBeGreaterThanOrEqual(expected ?? 0);
      expect(league.every((g) => g.countsFor === team.division), team.slug).toBe(true);
    }
  });

  it('marks a game listed from the schedule, classifies it a league game and gives it no score', () => {
    const added = m.jv.getJvGames().filter((g) => m.jvOfficial.isOfficialJvContestId(g.contestId));
    expect(added).toHaveLength(m.jv.getJvOfficialMerge().added.length);
    for (const g of added) {
      expect(g.status).toBe('scheduled');
      expect([g.home.score, g.away.score]).toEqual([null, null]);
      expect(g.countsFor).toBe(g.leagueDivision);
      expect(g.provenance.schedule).toBe('scval-pdf');
      expect(m.jv.getJvClassification(g.contestId)).toMatchObject({ kind: 'league', via: 'official-fixture' });
    }
  });
});
