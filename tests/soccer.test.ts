/**
 * The soccer build (SCVAL_SPORT=soccer; docs/MULTI-SPORT.md): its sport, its one league and registry, its data
 * files and its CCS block, read through the same modules a soccer build loads. Every other test file runs on
 * field hockey (the default); this one sets the switch before importing anything that reads it, and vitest
 * runs each test file in its own module graph, so field hockey's tests never see it.
 */
import { readFileSync } from 'node:fs';

import { beforeAll, describe, expect, it, vi } from 'vitest';

type Modules = {
  current: typeof import('../lib/sports/current');
  season: typeof import('../lib/season');
  leagues: typeof import('../lib/leagues');
  teams: typeof import('../lib/teams');
  sections: typeof import('../lib/league-config/sections');
  data: typeof import('../lib/data');
  official: typeof import('../lib/official/schema');
  playerStats: typeof import('../lib/players/player-stats');
  jv: typeof import('../lib/jv/jv');
  rosters: typeof import('../lib/players/rosters');
};

let m: Modules;

beforeAll(async () => {
  vi.stubEnv('SCVAL_SPORT', 'soccer');
  vi.resetModules();
  m = {
    current: await import('../lib/sports/current'),
    season: await import('../lib/season'),
    leagues: await import('../lib/leagues'),
    teams: await import('../lib/teams'),
    sections: await import('../lib/league-config/sections'),
    data: await import('../lib/data'),
    official: await import('../lib/official/schema'),
    // Each validates its bundled data/soccer/ file at import (update-data-soccer.yml runs this file on what it fetched).
    playerStats: await import('../lib/players/player-stats'),
    jv: await import('../lib/jv/jv'),
    rosters: await import('../lib/players/rosters'),
  };
});

describe('the soccer sport switch', () => {
  it('is girls varsity soccer, winter 2026-27, with its data under data/soccer/', () => {
    const { SPORT, SPORT_SEASON, SPORT_AUDIENCE, DATA_DIR, IS_FIELD_HOCKEY, HAS_RECRUITING } = m.current;
    expect(SPORT.id).toBe('soccer');
    expect(SPORT_SEASON.sportSeasonId).toBe('893e6888-5e0c-48eb-b952-16ac29e0ae0a');
    expect(SPORT_SEASON.label).toBe(
      `Girls ${SPORT_SEASON.level} ${SPORT.maxpreps.sportName} ${SPORT_SEASON.term} ${SPORT_SEASON.year}`,
    );
    expect(SPORT_SEASON.genderSport).toBe('girls,soccer');
    expect(SPORT_AUDIENCE).toBe('girls varsity soccer');
    expect(DATA_DIR).toBe('data/soccer');
    expect([IS_FIELD_HOCKEY, HAS_RECRUITING]).toEqual([false, false]);
  });

  it('derives the season words and source links from the soccer definition', () => {
    expect(m.season.SEASON_DISPLAY).toBe('Winter 2026-27');
    expect(m.season.SEASON_YEARS_DISPLAY).toBe('2026-27');
    expect(m.season.BOOTSTRAP_URL).toBe('https://www.maxpreps.com/ca/soccer/girls/');
    expect(m.season.HUB_SPORT_SEASON_ID).toBe('cf0a49ca-ee08-43c3-b26d-050cdcbd1b8e');
    expect(m.season.CCS_BRACKET_URL).toBeNull();
    expect(m.season.SOURCE_LINKS.ccs).toBe('https://cifccs.org/sports/soccer/index');
    expect(m.season.SOURCE_LINKS.ccsCalendar).toBe('https://cifccs.org/calendar/Soccer?print=ical');
  });
});

describe('SCVAL girls soccer', () => {
  it('is the only league, in one section and one region', () => {
    expect(m.leagues.LEAGUE_IDS).toEqual(['scval']);
    expect(m.sections.SECTIONS.map((s) => s.id)).toEqual(['ccs']);
    expect(m.sections.REGIONS.map((r) => r.id)).toEqual(['norcal']);
  });

  it('aligns the 15 schools of the two official schedules', () => {
    const slugs = (division: string) => m.teams.teamsInDivision(division).map((t) => t.slug).sort();
    expect(slugs('de-anza')).toEqual(['gunn', 'homestead', 'los-altos', 'los-gatos', 'mountain-view', 'palo-alto', 'santa-clara']);
    expect(slugs('el-camino')).toEqual([
      'cupertino', 'fremont', 'lynbrook', 'macdonald', 'milpitas', 'monta-vista', 'saratoga', 'wilcox',
    ]);
    expect(m.teams.TEAMS).toHaveLength(15);
  });

  it('gives De Anza three automatic CCS berths and El Camino one (By-Laws Article V §2)', () => {
    const scval = m.leagues.getLeague('scval');
    expect(scval.postseason.kind).toBe('ccs-ladder');
    if (scval.postseason.kind !== 'ccs-ladder') return;
    expect(scval.postseason.autoBerths).toBe(4);
    const aq = scval.postseason.ladder.filter((r) => r.status === 'aq');
    expect(aq.map((r) => [r.divisions, r.places])).toEqual([[['de-anza'], [1, 3]], [['el-camino'], [1, 1]]]);
    expect(scval.rules.points).toEqual({ win: 3, tie: 1, loss: 0 });
  });

  it('dates the CCS rounds from the CCS calendar, and leaves the field size and hosting null', () => {
    const { CCS, ccsRoundDays, ccsLastDay } = m.sections;
    expect(CCS.autoQualifiers).toEqual({ scval: 4, atLarge: null, total: null });
    expect(CCS.keyDates).toMatchObject({
      seedingMeeting: '2027-02-18T15:00:00',
      quarterfinals: '2027-02-20',
      semifinals: '2027-02-23',
      semifinalsLast: '2027-02-24',
      finals: '2027-02-26',
      finalsLast: '2027-02-27',
      evaluationMeeting: '2027-03-10T16:00:00',
    });
    expect(ccsRoundDays(CCS.keyDates, 'semifinals', (d) => d)).toBe('2027-02-23 to 2027-02-24');
    expect(ccsLastDay(CCS.keyDates)).toBe('2027-02-27');
    expect(CCS.highSeedHostsThrough).toBeNull();
    expect(CCS.tournament).toBeNull();
  });
});

describe('the soccer data files', () => {
  it('bundles a soccer snapshot of the 15 teams', () => {
    const snapshot = m.data.getSnapshot();
    expect(snapshot.season.genderSport).toBe('girls,soccer');
    expect(snapshot.season.sportSeasonId).toBe(m.current.SPORT_SEASON.sportSeasonId);
    expect(snapshot.teams.map((t) => t.slug)).toEqual(m.teams.TEAMS.map((t) => t.slug));
  });

  it('loads the player stats, JV games and rosters of the same 15 teams', () => {
    const slugs = m.teams.TEAMS.map((t) => t.slug).sort();
    expect(m.playerStats.getPlayerStats().teams.map((t) => t.slug).sort()).toEqual(slugs);
    expect(m.jv.getJvFile().teams.map((t) => t.slug).sort()).toEqual(slugs);
    expect(m.rosters.getRosters().teams.map((t) => t.slug).sort()).toEqual(slugs);
  });

  it('transcribes each official schedule as a double round robin inside its league-play window', () => {
    const bundle = m.official.OfficialBundleSchema.parse(
      JSON.parse(readFileSync('data/soccer/official/scval-2026.json', 'utf8')),
    );
    for (const division of m.leagues.getLeague('scval').divisions) {
      const fixtures = bundle.fixtures.filter((f) => f.division === division.id);
      const n = division.expectedTeams;
      expect(fixtures).toHaveLength(n * (n - 1));
      const pairs = new Set(fixtures.map((f) => `${f.away}@${f.home}`));
      expect(pairs.size).toBe(n * (n - 1));
      for (const f of fixtures) {
        expect(f.date >= division.leaguePlay.first && f.date <= division.leaguePlay.last).toBe(true);
        expect(Object.hasOwn(m.leagues.getLeague('scval').officialCodes, f.away)).toBe(true);
        expect(Object.hasOwn(m.leagues.getLeague('scval').officialCodes, f.home)).toBe(true);
      }
      if (division.official.mode === 'bundled') {
        expect(bundle.documents.find((d) => d.division === division.id)?.sha256).toBe(division.official.bundledSha256);
      }
    }
  });
});
