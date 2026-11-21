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
  classify: typeof import('../lib/classify');
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
    classify: await import('../lib/classify'),
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
  it('covers SCVAL, BVAL, the WCAL, the WBAL, the PAL and the SCCAL, in one section and one region', () => {
    expect(m.leagues.LEAGUE_IDS).toEqual(['scval', 'bval', 'wcal', 'wbal', 'pal', 'sccal']);
    expect(m.sections.SECTIONS.map((s) => s.id)).toEqual(['ccs']);
    expect(m.sections.REGIONS.map((r) => r.id)).toEqual(['norcal']);
  });

  it('aligns the 15 schools of the two official schedules', () => {
    const slugs = (division: string) => m.teams.teamsInDivision(division).map((t) => t.slug).sort();
    expect(slugs('de-anza')).toEqual(['gunn', 'homestead', 'los-gatos', 'lynbrook', 'milpitas', 'mountain-view', 'palo-alto']);
    expect(slugs('el-camino')).toEqual([
      'cupertino', 'fremont', 'los-altos', 'macdonald', 'monta-vista', 'santa-clara', 'saratoga', 'wilcox',
    ]);
    expect(m.teams.teamsInLeague('scval')).toHaveLength(15);
    expect(m.teams.TEAMS).toHaveLength(79);
    for (const team of m.teams.TEAMS) expect(team.external.maxprepsTeamUrl).toMatch(/\/basketball\/$/);
  });

  it('aligns BVAL’s 26 schools as its four boys division schedules do', () => {
    const slugs = (division: string) => m.teams.teamsInDivision(division).map((t) => t.slug).sort();
    expect(slugs('mt-hamilton')).toEqual(['christopher', 'evergreen-valley', 'leigh', 'pioneer', 'santa-teresa', 'westmont', 'willow-glen']);
    expect(slugs('santa-teresa')).toEqual(['branham', 'independence', 'leland', 'live-oak', 'silver-creek', 'sobrato']);
    expect(slugs('almaden-valley')).toEqual(['gilroy', 'lincoln', 'oak-grove', 'overfelt', 'piedmont-hills', 'prospect']);
    expect(slugs('west-valley')).toEqual(['andrew-hill', 'del-mar', 'gunderson', 'james-lick', 'mt-pleasant', 'san-jose', 'yerba-buena']);
    expect(m.teams.teamsInLeague('bval')).toHaveLength(26);
  });

  it('aligns the WCAL’s eight schools as its composite schedule does, its champion the league’s #1 CCS seed', () => {
    expect(m.teams.teamsInDivision('wcal').map((t) => t.slug)).toEqual([
      'mitty', 'riordan', 'bellarmine', 'serra', 'sacred-heart-cathedral', 'saint-francis', 'st-ignatius', 'valley-christian',
    ]);
    const { rules, postseason, divisions } = m.leagues.getLeague('wcal');
    expect([rules.orderBy, rules.classification, rules.leagueOvertime]).toEqual(['win-pct', 'membership', 'until-decided']);
    expect(divisions.map((d) => [d.expectedTeams, d.gamesPerTeam, d.leaguePlay])).toEqual([
      [8, 14, { first: '2027-01-05', last: '2027-02-16' }],
    ]);
    expect(postseason.kind === 'ccs-ladder' && postseason.autoBerths).toBe(1);
  });

  it('aligns the WBAL’s eight schools as its standings do, with two automatic berths (By-Laws §108.2)', () => {
    expect(m.teams.teamsInDivision('wbal').map((t) => t.slug)).toEqual([
      'crystal-springs', 'eastside', 'harker', 'kings-academy', 'menlo', 'pinewood', 'priory', 'sacred-heart-prep',
    ]);
    const { rules, postseason, divisions } = m.leagues.getLeague('wbal');
    expect([rules.orderBy, rules.classification, rules.leagueOvertime]).toEqual(['win-pct', 'membership', 'until-decided']);
    // Ten games a team, not a double round robin: no fixed count.
    expect(divisions.map((d) => [d.expectedTeams, d.gamesPerTeam, d.leaguePlay])).toEqual([
      [8, null, { first: '2027-01-12', last: '2027-02-16' }],
    ]);
    expect(postseason.kind === 'ccs-ladder' && postseason.autoBerths).toBe(2);
  });

  it('aligns the PAL’s 16 schools as its Bay and Ocean schedules do, with four automatic berths (Bylaws §10.3)', () => {
    const slugs = (division: string) => m.teams.teamsInDivision(division).map((t) => t.slug).sort();
    expect(slugs('bay')).toEqual([
      'aragon', 'burlingame', 'carlmont', 'half-moon-bay', 'hillsdale', 'menlo-atherton', 'sequoia', 'woodside',
    ]);
    expect(slugs('ocean')).toEqual([
      'capuchino', 'el-camino-ssf', 'jefferson', 'mills', 'san-mateo', 'south-san-francisco', 'terra-nova', 'westmoor',
    ]);
    const pal = m.leagues.getLeague('pal');
    expect(pal.rules.tiebreaks.default).toEqual(['head-to-head', 'record-vs-placed', 'coin-flip']);
    expect(pal.divisions.map((d) => [d.id, d.expectedTeams, d.gamesPerTeam])).toEqual([['bay', 8, 14], ['ocean', 8, 14]]);
    // MaxPreps lists Woodside in its Ocean table.
    expect(pal.divisions.map((d) => [d.maxprepsTeamCount, d.maxprepsMissing])).toEqual([[7, ['woodside']], [9, []]]);
    if (pal.postseason.kind !== 'ccs-ladder') throw new Error('PAL: not a CCS ladder');
    expect(pal.postseason.autoBerths).toBe(4);
  });

  it('aligns the SCCAL’s six schools, its champion the #1 seed and its tournament deciding the #2', () => {
    expect(m.teams.teamsInDivision('sccal').map((t) => t.slug).sort()).toEqual([
      'aptos', 'harbor', 'san-lorenzo-valley', 'santa-cruz', 'scotts-valley', 'soquel',
    ]);
    const sccal = m.leagues.getLeague('sccal');
    expect(sccal.divisions.map((d) => [d.expectedTeams, d.gamesPerTeam, d.leaguePlay])).toEqual([
      [6, 10, { first: '2027-01-08', last: '2027-02-05' }],
    ]);
    if (sccal.postseason.kind !== 'ccs-ladder') throw new Error('SCCAL: not a CCS ladder');
    expect(sccal.postseason.autoBerths).toBe(2);
    expect(sccal.postseason.ladder.map((r) => [r.places, r.status])).toEqual([[[1, 1], 'aq'], [[2, 99], 'play-in']]);
    // The SCCAL tournament (week of Feb 8) is the league's postseason, not non-league play.
    expect(sccal.rules.postseasonFrom).toBe('2027-02-08');
    const [aptos, harbor] = ['aptos', 'harbor'].map((slug) => m.teams.getTeamBySlug(slug)!);
    const side = (t: typeof aptos) => ({ teamId: t.id, slug: t.slug, name: t.name });
    const tournamentGame = { home: side(aptos), away: side(harbor), dateKey: '2027-02-10', contestId: 'sccal-tournament-test',
      contestTypes: { home: 1, away: 1 } } as unknown as Parameters<typeof m.classify.postseasonTag>[0];
    expect(m.classify.postseasonTag(tournamentGame)).toMatchObject({ kind: 'league-postseason', leagueId: 'sccal' });
  });

  it('gives each school the soccer registry also holds its soccer seed, on its MaxPreps basketball page', () => {
    // The paths are each team's teamCanonicalUrl on its league's MaxPreps boys basketball standings (2026-11-21).
    const path = (slug: string) => m.teams.getTeamBySlug(slug)?.external.maxprepsTeamUrl?.replace('https://www.maxpreps.com', '');
    expect(['sacred-heart-cathedral', 'st-ignatius', 'kings-academy', 'menlo', 'priory', 'menlo-atherton', 'el-camino-ssf'].map(path)).toEqual([
      '/ca/san-francisco/sacred-heart-cathedral-preparatory-fighting-irish/basketball/',
      '/ca/san-francisco/st-ignatius-college-preparatory-wildcats/basketball/',
      '/ca/sunnyvale/kings-academy-knights/basketball/',
      '/ca/atherton/menlo-school-knights/basketball/',
      '/ca/portola-valley/priory-panthers/basketball/',
      '/ca/atherton/menlo-atherton-m-a-bears/basketball/',
      '/ca/south-san-francisco/el-camino-colts/basketball/',
    ]);
  });

  it('orders BVAL’s tables on wins, with its automatic-berth tiebreak, and gives it six berths (By-Laws §9, §10)', () => {
    const { rules, postseason } = m.leagues.getLeague('bval');
    expect(rules.orderBy).toBe('win-pct');
    expect(rules.tiebreaks.default).toEqual(['head-to-head', 'record-vs-placed', 'h2h-goal-diff', 'coin-flip']);
    expect(rules.classification).toBe('official-fixtures');
    expect(postseason.kind === 'ccs-ladder' && postseason.autoBerths).toBe(6);
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
    expect(CCS.autoQualifiers).toEqual({ scval: 4, bval: 6, wcal: 1, wbal: 2, pal: 4, sccal: 2, atLarge: null, total: null });
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
  it('bundles a basketball snapshot of the registry’s teams', () => {
    const snapshot = m.data.getSnapshot();
    expect(snapshot.season.genderSport).toBe('boys,basketball');
    expect(snapshot.season.sportSeasonId).toBe(m.current.SPORT_SEASON.sportSeasonId);
    expect(snapshot.teams.map((t) => t.slug)).toEqual(m.teams.TEAMS.map((t) => t.slug));
  });

  it('loads the player stats, JV games and rosters of the same teams', () => {
    const slugs = m.teams.TEAMS.map((t) => t.slug).sort();
    expect(m.playerStats.getPlayerStats().teams.map((t) => t.slug).sort()).toEqual(slugs);
    expect(m.jv.getJvFile().teams.map((t) => t.slug).sort()).toEqual(slugs);
    expect(m.rosters.getRosters().teams.map((t) => t.slug).sort()).toEqual(slugs);
    expect(m.jv.getJvFile().sportSeasonId).toBe(m.current.SPORT_SEASON.jvSportSeasonId);
  });
});

describe('the basketball JV schedule (lib/jv/jv-official.ts over the bundled files)', () => {
  /**
   * The bundled fixtures, and the ones whose schedule lists a JV game: a fixture with no JV slot is a school the
   * league marks "(NO JV)" (BVAL's West Valley schedule revised 11/16/26: James Lick, so its twelve games), never a
   * parse gap. The counts are read from the bundles, so a revised schedule changes them without touching this test.
   */
  const bundled = () =>
    [...new Set(m.leagues.ALL_DIVISIONS.filter((d) => d.official.mode !== 'none').map((d) => d.leagueId))].flatMap((id) =>
      m.official.loadBundledFixtures(id),
    );

  it('reads every bundled fixture a JV slot unless its league marks a school "(NO JV)": James Lick in West Valley', () => {
    const fixtures = bundled();
    // SCVAL's 98 fixtures and BVAL's 144.
    expect(fixtures).toHaveLength(98 + 144);
    const noJv = fixtures.filter((f) => !f.jv);
    expect(noJv).toHaveLength(12);
    for (const f of noJv) {
      expect(f.division, f.id).toBe('west-valley');
      expect([f.homeSlug, f.awaySlug], f.id).toContain('james-lick');
    }
    expect(fixtures.filter((f) => f.homeSlug === 'james-lick' || f.awaySlug === 'james-lick').every((f) => !f.jv)).toBe(true);
  });

  it('gives every bundled fixture with a JV slot one, and every slot exactly one JV game', () => {
    const merge = m.jv.getJvOfficialMerge();
    expect(merge.slots).toBe(bundled().filter((f) => f.jv).length);
    expect(merge.matched + merge.moved + merge.added.length).toBe(merge.slots);
    // No JV game is added for a fixture the schedule lists without one.
    const withoutJv = new Set(bundled().filter((f) => !f.jv).map((f) => f.id));
    for (const id of merge.added) expect(withoutJv.has(m.jvOfficial.officialJvFixtureId(id) ?? ''), id).toBe(false);
    for (const slot of merge.claims.values()) expect(withoutJv.has(slot.fixtureId), slot.fixtureId).toBe(false);
    // The WCAL, WBAL, PAL and SCCAL divisions (2026-11-21) are read by membership: no schedule is bundled, so none
    // has a JV slot or a JV table.
    for (const division of m.leagues.ALL_DIVISIONS) {
      const bundled = division.official.mode !== 'none';
      expect(m.jv.isJvScheduledDivision(division.id), division.id).toBe(bundled);
      if (bundled) expect(m.jv.getJvTable(division.id)?.gamesPerTeam).toBe(division.gamesPerTeam);
    }
  });

  it('lists every JV league game the schedule gives a school: 12 in De Anza, 14 in El Camino, fewer against a "(NO JV)" school', () => {
    const fixtures = bundled().filter((f) => f.jv);
    for (const team of m.teams.TEAMS.filter((t) => m.jv.isJvScheduledDivision(t.division))) {
      const league = m.jv.getJvGamesForTeam(team.slug).filter((g) => g.countsFor !== null);
      const expected = fixtures.filter((f) => f.homeSlug === team.slug || f.awaySlug === team.slug).length;
      // Every school but a "(NO JV)" one plays a JV game at every varsity league game but those against one.
      const full = m.leagues.getDivision(team.division).gamesPerTeam ?? 0;
      if (team.slug === 'james-lick') expect(expected).toBe(0);
      else if (team.division === 'west-valley') expect(expected, team.slug).toBe(full - 2);
      else expect(expected, team.slug).toBe(full);
      // A coach may list a league game twice or on a day no slot claims; never fewer than the schedule's. A school
      // with no JV slot has none: within a scheduled division only a slot's game counts (lib/jv/jv-standings.ts rule 0).
      if (expected === 0) expect(league.map((g) => g.contestId), team.slug).toEqual([]);
      else expect(league.length, team.slug).toBeGreaterThanOrEqual(expected);
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
      expect(['scval-pdf', 'bval-docx']).toContain(g.provenance.schedule);
      expect(m.jv.getJvClassification(g.contestId)).toMatchObject({ kind: 'league', via: 'official-fixture' });
    }
  });
});

/**
 * The ledger lists a game reported before its day only until a feed lists it: then the feed's contest is the game
 * (lib/pipeline/steps/assemble.ts for the varsity game, lib/jv/jv-added.ts rule 2 for its JV game) and carries the
 * score. The refresh workflows run these tests on each day's data, so they hold in both states: one game of the two
 * schools that day, non-league, and, while it is still the listing, at the reported start with no score.
 */
describe('a game the owner reported before its day (the fixture ledger’s listings, lib/fixtures/, reportedOn)', () => {
  // The pair's game within the window MaxPreps may move it in (lib/jv/jv-added.ts rule 2's JV_OFFICIAL_WINDOW_DAYS), with
  // either school at home: a game MaxPreps lists a day early or the other way round is still this one.
  const isThePair = (x: { dateKey: string; home: { slug: string | null }; away: { slug: string | null } }) =>
    [x.home.slug, x.away.slug].sort().join('~') === 'cupertino~santa-teresa' &&
    Math.abs(m.format.dayDiff(x.dateKey, '2026-11-24')) <= m.jvOfficial.JV_OFFICIAL_WINDOW_DAYS;

  it('lists Santa Teresa at Cupertino, Tue Nov 24, once and non-league: until MaxPreps lists it, at 7:00 with no score', () => {
    const [g, ...more] = m.data.getGames().filter(isThePair);
    expect(more).toEqual([]);
    expect(g, 'no game of Santa Teresa and Cupertino near Nov 24').toBeDefined();
    expect([g.isLeague, g.countsFor]).toEqual([false, null]);
    if (g.contestId.startsWith('official:')) {
      expect([g.contestId, g.dateLocal]).toEqual(['official:2026-11-24-santa-teresa-at-cupertino', '2026-11-24T19:00:00']);
      expect(['scheduled', 'score-pending']).toContain(g.status);
      expect([g.home.score, g.away.score]).toEqual([null, null]);
    } else {
      // MaxPreps lists it now: its contest replaced the listing (no second row, above).
      expect(g.contestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    }
  });

  it('lists its JV game once and non-league: until MaxPreps lists it, at 5:30 with no score', () => {
    const jv = m.jv.getJvGames().filter(isThePair);
    expect(jv.map((x) => [x.isLeague, x.countsFor])).toEqual([[false, null]]);
    expect(m.jv.getJvClassification(jv[0].contestId)?.kind).toBe('non-league');
    if (jv[0].contestId.startsWith('added-jv:')) {
      expect([jv[0].contestId, jv[0].dateLocal]).toEqual(['added-jv:2026-11-24-santa-teresa-at-cupertino', '2026-11-24T17:30:00']);
      expect(['scheduled', 'score-pending']).toContain(jv[0].status);
      expect([jv[0].home.score, jv[0].away.score]).toEqual([null, null]);
    } else {
      // MaxPreps lists it now (the 2026-11-21 refresh: 86337580-…, at 5:30): its contest is the game.
      expect(jv[0].contestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    }
  });
});
