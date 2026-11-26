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
  clubs: typeof import('../lib/players/clubs');
  clubsSchema: typeof import('../lib/players/clubs-schema');
  commits: typeof import('../lib/players/commits');
  jvProfiles: typeof import('../lib/jv/jv-profiles');
  clubView: typeof import('../components/clubs/club-view');
  commitView: typeof import('../components/commits/commit-view');
  recruitingView: typeof import('../components/recruiting/recruiting-view');
  expectations: typeof import('../scripts/lib/prerender-expectations');
  copyRules: typeof import('../scripts/copy-rules');
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
    clubs: await import('../lib/players/clubs'),
    clubsSchema: await import('../lib/players/clubs-schema'),
    commits: await import('../lib/players/commits'),
    jvProfiles: await import('../lib/jv/jv-profiles'),
    clubView: await import('../components/clubs/club-view'),
    commitView: await import('../components/commits/commit-view'),
    recruitingView: await import('../components/recruiting/recruiting-view'),
    expectations: await import('../scripts/lib/prerender-expectations'),
    copyRules: await import('../scripts/copy-rules'),
  };
});

describe('the soccer sport switch', () => {
  it('is girls varsity soccer, winter 2026-27, with its data under data/soccer/', () => {
    const { SPORT, SPORT_SEASON, MAXPREPS_SPORT_SEASON, SPORT_AUDIENCE, DATA_DIR, IS_FIELD_HOCKEY, HAS_RECRUITING } = m.current;
    expect(SPORT.id).toBe('soccer');
    expect(MAXPREPS_SPORT_SEASON?.sportSeasonId).toBe('893e6888-5e0c-48eb-b952-16ac29e0ae0a');
    expect(SPORT_SEASON.label).toBe(
      `Girls ${SPORT_SEASON.level} ${SPORT.maxpreps.sportName} ${SPORT_SEASON.term} ${SPORT_SEASON.year}`,
    );
    expect(MAXPREPS_SPORT_SEASON?.genderSport).toBe('girls,soccer');
    expect(SPORT_AUDIENCE).toBe('girls varsity soccer');
    expect(DATA_DIR).toBe('data/soccer');
    expect([IS_FIELD_HOCKEY, HAS_RECRUITING]).toEqual([false, true]);
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
  it('covers every CCS league: SCVAL, BVAL, the WCAL, the WBAL, the PAL, the SCCAL, the PCAL and the PSAL, in one section and one region', () => {
    expect(m.leagues.LEAGUE_IDS).toEqual(['scval', 'bval', 'wcal', 'wbal', 'pal', 'sccal', 'pcal', 'psal']);
    expect(m.sections.SECTIONS.map((s) => s.id)).toEqual(['ccs']);
    expect(m.sections.REGIONS.map((r) => r.id)).toEqual(['norcal']);
  });

  it('aligns the 15 schools of the two official schedules', () => {
    const slugs = (division: string) => m.teams.teamsInDivision(division).map((t) => t.slug).sort();
    expect(slugs('de-anza')).toEqual(['gunn', 'homestead', 'los-altos', 'los-gatos', 'mountain-view', 'palo-alto', 'santa-clara']);
    expect(slugs('el-camino')).toEqual([
      'cupertino', 'fremont', 'lynbrook', 'macdonald', 'milpitas', 'monta-vista', 'saratoga', 'wilcox',
    ]);
    expect(m.teams.teamsInLeague('scval')).toHaveLength(15);
    expect(m.teams.TEAMS).toHaveLength(123);
  });

  it('aligns BVAL’s 26 schools as its three girls division schedules do', () => {
    const slugs = (division: string) => m.teams.teamsInDivision(division).map((t) => t.slug).sort();
    expect(slugs('mt-hamilton')).toEqual(['branham', 'gilroy', 'leigh', 'leland', 'piedmont-hills', 'pioneer', 'westmont', 'willow-glen']);
    expect(slugs('santa-teresa')).toEqual(['christopher', 'evergreen-valley', 'lincoln', 'live-oak', 'oak-grove', 'santa-teresa', 'silver-creek', 'sobrato']);
    expect(slugs('west-valley')).toEqual([
      'andrew-hill', 'del-mar', 'gunderson', 'independence', 'james-lick', 'mt-pleasant', 'overfelt', 'prospect', 'san-jose', 'yerba-buena',
    ]);
    const { rules, postseason } = m.leagues.getLeague('bval');
    expect(rules.points).toEqual({ win: 3, tie: 1, loss: 0 });
    expect(rules.leagueOvertime).toBe('none');
    expect(postseason.kind === 'ccs-ladder' && postseason.autoBerths).toBe(6);
  });

  it('aligns the WCAL’s six schools as its composite schedule does, with two automatic berths', () => {
    expect(m.teams.teamsInDivision('wcal').map((t) => t.slug).sort()).toEqual([
      'mitty', 'riordan', 'sacred-heart-cathedral', 'saint-francis', 'st-ignatius', 'valley-christian',
    ]);
    const { rules, postseason, divisions } = m.leagues.getLeague('wcal');
    expect(rules.points).toEqual({ win: 3, tie: 1, loss: 0 });
    expect(rules.leagueOvertime).toBe('none');
    expect(rules.classification).toBe('membership');
    expect(divisions.map((d) => [d.expectedTeams, d.gamesPerTeam, d.leaguePlay])).toEqual([
      [6, 10, { first: '2027-01-06', last: '2027-02-17' }],
    ]);
    expect(postseason.kind === 'ccs-ladder' && postseason.autoBerths).toBe(2);
  });

  it('aligns the WBAL’s 13 schools as its two division tables do, with a playoff for the fourth berth', () => {
    const slugs = (division: string) => m.teams.teamsInDivision(division).map((t) => t.slug).sort();
    expect(slugs('foothill')).toEqual([
      'castilleja', 'crystal-springs', 'kings-academy', 'menlo', 'notre-dame-belmont', 'presentation', 'sacred-heart-prep',
    ]);
    expect(slugs('skyline')).toEqual(['eastside', 'harker', 'mercy-burlingame', 'notre-dame-san-jose', 'pinewood', 'priory']);
    const wbal = m.leagues.getLeague('wbal');
    expect(wbal.rules.points).toEqual({ win: 3, tie: 1, loss: 0 });
    expect(wbal.rules.leagueOvertime).toBe('none');
    expect(wbal.divisions.map((d) => [d.id, d.gamesPerTeam])).toEqual([['foothill', 12], ['skyline', 10]]);
    expect(wbal.postseason.kind).toBe('ccs-ladder');
    if (wbal.postseason.kind !== 'ccs-ladder') return;
    expect(wbal.postseason.autoBerths).toBe(4);
    expect(wbal.postseason.ladder.filter((r) => r.status !== 'no-aq-route').map((r) => [r.divisions, r.places, r.status])).toEqual([
      [['foothill'], [1, 3], 'aq'], [['foothill'], [4, 4], 'play-in'], [['skyline'], [1, 1], 'play-in'],
    ]);
  });

  it('aligns the PAL’s 16 schools as its Bay and Ocean schedules do, with four automatic berths (Bylaws §8.1)', () => {
    const slugs = (division: string) => m.teams.teamsInDivision(division).map((t) => t.slug).sort();
    expect(slugs('bay')).toEqual(['aragon', 'burlingame', 'carlmont', 'hillsdale', 'menlo-atherton', 'sequoia', 'woodside']);
    expect(slugs('ocean')).toEqual([
      'capuchino', 'el-camino-ssf', 'half-moon-bay', 'jefferson', 'mills', 'san-mateo', 'south-san-francisco', 'terra-nova', 'westmoor',
    ]);
    const pal = m.leagues.getLeague('pal');
    expect(pal.rules.points).toEqual({ win: 3, tie: 1, loss: 0 });
    expect(pal.rules.leagueOvertime).toBe('none');
    expect(pal.rules.classification).toBe('membership');
    expect(pal.rules.tiebreaks.default).toEqual(['head-to-head', 'record-vs-placed', 'ccs-points']);
    expect(pal.divisions.map((d) => [d.id, d.expectedTeams, d.gamesPerTeam, d.leaguePlay])).toEqual([
      ['bay', 7, 12, { first: '2026-12-08', last: '2027-02-11' }],
      ['ocean', 9, 16, { first: '2026-12-01', last: '2027-02-11' }],
    ]);
    if (pal.postseason.kind !== 'ccs-ladder') throw new Error('PAL: not a CCS ladder');
    expect(pal.postseason.autoBerths).toBe(4);
    expect(pal.postseason.ladder.filter((r) => r.status === 'aq').map((r) => [r.divisions, r.places])).toEqual([
      [['bay'], [1, 3]], [['ocean'], [1, 1]],
    ]);
  });

  it('aligns the SCCAL’s six schools as its schedule does, with its champion the league’s #1 CCS seed', () => {
    expect(m.teams.teamsInDivision('sccal').map((t) => t.slug).sort()).toEqual([
      'aptos', 'harbor', 'san-lorenzo-valley', 'santa-cruz', 'scotts-valley', 'soquel',
    ]);
    const sccal = m.leagues.getLeague('sccal');
    expect(sccal.rules.points).toEqual({ win: 3, tie: 1, loss: 0 });
    expect(sccal.rules.leagueOvertime).toBe('none');
    expect(sccal.divisions.map((d) => [d.expectedTeams, d.gamesPerTeam, d.leaguePlay])).toEqual([
      [6, 10, { first: '2027-01-12', last: '2027-02-11' }],
    ]);
    expect(sccal.postseason.kind === 'ccs-ladder' && sccal.postseason.autoBerths).toBe(1);
  });

  it('aligns the PCAL’s 27 schools as its four girls division schedules do, with seven CCS berths and a play-in', () => {
    const slugs = (division: string) => m.teams.teamsInDivision(division).map((t) => t.slug).sort();
    expect(slugs('gabilan')).toEqual([
      'everett-alvarez', 'hollister', 'monterey', 'pacific-collegiate', 'rancho-san-juan', 'salinas', 'watsonville',
    ]);
    expect(slugs('mission')).toEqual(['alisal', 'carmel', 'gonzales', 'monte-vista-christian', 'pajaro-valley', 'soledad', 'stevenson']);
    expect(slugs('cypress')).toEqual(['greenfield', 'king-city', 'north-monterey-county', 'north-salinas', 'palma', 'seaside']);
    expect(slugs('santa-lucia')).toEqual([
      'anzar', 'marina-mariners', 'monterey-bay-academy', 'pacific-grove', 'santa-catalina', 'st-francis-watsonville', 'york',
    ]);
    const pcal = m.leagues.getLeague('pcal');
    expect(pcal.rules.points).toEqual({ win: 3, tie: 1, loss: 0 });
    expect(pcal.rules.leagueOvertime).toBe('none');
    expect(pcal.rules.classification).toBe('membership');
    expect(pcal.rules.postseasonFrom).toBe('2027-02-16');
    expect(pcal.divisions.map((d) => [d.id, d.expectedTeams, d.gamesPerTeam, d.leaguePlay])).toEqual([
      ['gabilan', 7, 12, { first: '2027-01-05', last: '2027-02-12' }],
      ['mission', 7, 12, { first: '2027-01-05', last: '2027-02-12' }],
      ['cypress', 6, 10, { first: '2027-01-04', last: '2027-02-11' }],
      ['santa-lucia', 7, 12, { first: '2027-01-04', last: '2027-02-11' }],
    ]);
    if (pcal.postseason.kind !== 'ccs-ladder') throw new Error('PCAL: not a CCS ladder');
    expect(pcal.postseason.autoBerths).toBe(7);
    expect(pcal.postseason.ladder.filter((r) => r.status !== 'no-aq-route').map((r) => [r.divisions, r.places, r.status])).toEqual([
      [['gabilan'], [1, 4], 'aq'], [['mission'], [1, 1], 'aq'], [['mission'], [2, 2], 'play-in'],
      [['cypress'], [1, 1], 'aq'], [['santa-lucia'], [1, 1], 'play-in'],
    ]);
  });

  it('aligns the PSAL’s 14 schools as its girls schedule does, with the Bay champion and a play-in for two berths', () => {
    const slugs = (division: string) => m.teams.teamsInDivision(division).map((t) => t.slug).sort();
    expect(slugs('psal-bay')).toEqual([
      'cristo-rey-san-jose', 'design-tech', 'kipp-san-jose', 'latino-college-prep', 'nueva', 'oceana', 'thomas-more',
    ]);
    expect(slugs('psal-central')).toEqual([
      'ace-charter', 'cindy-avitia', 'kipp-esperanza', 'kipp-navigate', 'summit-prep', 'summit-shasta', 'summit-tahoma',
    ]);
    const psal = m.leagues.getLeague('psal');
    expect(psal.rules.points).toEqual({ win: 3, tie: 1, loss: 0 });
    expect(psal.rules.leagueOvertime).toBe('none');
    expect(psal.divisions.map((d) => [d.id, d.label, d.expectedTeams, d.gamesPerTeam, d.leaguePlay])).toEqual([
      ['psal-bay', 'Bay', 7, 12, { first: '2027-01-06', last: '2027-02-12' }],
      ['psal-central', 'Central', 7, 12, { first: '2027-01-06', last: '2027-02-12' }],
    ]);
    if (psal.postseason.kind !== 'ccs-ladder') throw new Error('PSAL: not a CCS ladder');
    expect(psal.postseason.autoBerths).toBe(2);
    expect(psal.postseason.ladder.filter((r) => r.status !== 'no-aq-route').map((r) => [r.divisions, r.places, r.status])).toEqual([
      [['psal-bay'], [1, 1], 'aq'], [['psal-bay'], [2, 2], 'play-in'], [['psal-central'], [1, 1], 'play-in'],
    ]);
  });

  it('tells Watsonville’s St. Francis from the WCAL’s Saint Francis', () => {
    expect(m.teams.resolveTeam('St. Francis')?.slug).toBe('st-francis-watsonville');
    expect(m.teams.resolveTeam('Saint Francis')?.slug).toBe('saint-francis');
    expect(m.teams.resolveTeam('St. Francis (Mountain View)')?.slug).toBe('saint-francis');
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
    const { requireCcs, ccsRoundDays, ccsLastDay } = m.sections;
    expect(requireCcs().autoQualifiers).toEqual({
      scval: 4, bval: 6, wcal: 2, wbal: 4, pal: 4, sccal: 1, pcal: 7, psal: 2, atLarge: null, total: null,
    });
    expect(requireCcs().keyDates).toMatchObject({
      seedingMeeting: '2027-02-18T15:00:00',
      quarterfinals: '2027-02-20',
      semifinals: '2027-02-23',
      semifinalsLast: '2027-02-24',
      finals: '2027-02-26',
      finalsLast: '2027-02-27',
      evaluationMeeting: '2027-03-10T16:00:00',
    });
    expect(ccsRoundDays(requireCcs().keyDates, 'semifinals', (d) => d)).toBe('2027-02-23 to 2027-02-24');
    expect(ccsLastDay(requireCcs().keyDates)).toBe('2027-02-27');
    expect(requireCcs().highSeedHostsThrough).toBeNull();
    expect(requireCcs().tournament).toBeNull();
  });
});

describe('the soccer data files', () => {
  it('bundles a soccer snapshot of the registry’s teams', () => {
    const snapshot = m.data.getSnapshot();
    expect(snapshot.season.genderSport).toBe('girls,soccer');
    expect(snapshot.season.sportSeasonId).toBe(m.current.MAXPREPS_SPORT_SEASON?.sportSeasonId);
    expect(snapshot.teams.map((t) => t.slug)).toEqual(m.teams.TEAMS.map((t) => t.slug));
  });

  it('loads the player stats, JV games and rosters of the same teams', () => {
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

describe('the soccer recruiting pages (data/soccer/{clubs,commits,rosters-enrichment,jv-profiles}.json; switched on 2026-11-21)', () => {
  // Written to hold both while the files are placeholders and after the 2026-11-21 round fills them: no counts.
  it('has the recruiting pages and no club calendar', () => {
    expect([m.current.HAS_RECRUITING, m.current.HAS_CLUB_CALENDAR]).toEqual([true, false]);
    expect(m.expectations.FIXED_PAGES).toEqual(expect.arrayContaining(['clubs', 'commits', 'recruiting']));
    expect(m.expectations.FIXED_PAGES).not.toContain('club-calendar');
    expect(m.expectations.SKIPPED_ROUTES).toContain('/club-calendar');
    expect(m.expectations.SKIPPED_ROUTES).not.toContain('/clubs');
    expect(m.expectations.SKIPPED_ROUTES).not.toContain('/clubs/:slug');
  });

  it('loads the clubs through the validating loader: every tie joins its row (varsity, or the JV list) of a club in the file', () => {
    const file = m.clubs.getClubsFile();
    expect(file.season).toBe(m.rosters.getRosters().season);
    for (const a of [...file.affiliations, ...file.jvAffiliations]) {
      expect(m.clubs.getClub(a.club), a.club).toBeDefined();
      expect(m.clubs.getAffiliatedPlayer(a).fullName).toBe(a.fullName);
    }
    // A JV tie joins the school's MaxPreps JV roster (lib/players/clubs.ts withJvListRows): none is left out as drift.
    const raw = JSON.parse(readFileSync('data/soccer/clubs.json', 'utf8')) as { jvAffiliations: unknown[] };
    expect(raw.jvAffiliations.length).toBeGreaterThan(0);
    expect(file.jvAffiliations).toHaveLength(raw.jvAffiliations.length);
    // Shown: the JV roster's club line (found by name) and the club page, each JV player marked JV.
    const line = (team: string, name: string) =>
      m.clubView.jvPlayerClubGroups(team as never, name).flatMap((g) => g.clubs.map((c) => `${g.label}: ${c.name}`));
    expect(line('branham', 'Samantha Erickson')).toEqual(['Club: Force']);
    expect(line('willow-glen', 'Lelie Vatton Raclot')).toEqual(['Club: Bay Area Surf']);
    expect(line('branham', 'Nobody Here')).toEqual([]);
    // Her own Hudl profile lists the club's team (2026-11-25); the league rosters give her no class year.
    expect(line('mountain-view', 'Noa Goldberg')).toEqual(['Club: Force']);
    const force = m.clubView.buildClubPageView('de-anza-force')!;
    const jvRows = force.groups.flatMap((g) => g.rows).filter((r) => r.facts[0] === 'JV');
    expect(jvRows.map((r) => r.name).sort()).toEqual([
      'Caroline Zhang',
      'Isabel Ramirez-Ortega',
      'Kaia Gurdak',
      'Mari Madalen Jan',
      'Noa Goldberg',
      'Reagan Connors',
      'Samantha Bonar',
      'Samantha Erickson',
      'Shea Murphy',
      'Taylor Laughter',
      'Yuli Arbel',
    ]);
    for (const r of jvRows) expect(r.school.href).toMatch(/#jv-roster$/);
    expect(m.clubView.rostersWords()).toBe('varsity rosters and JV lists');
    // The areas searched for every club in the 2026-11-21 round (lib/players/clubs.ts): not the Central Coast.
    expect(m.clubs.SEARCHED_REGIONS).toEqual(['san-francisco', 'peninsula', 'south-bay']);
    for (const r of m.clubs.SEARCHED_REGIONS) expect(m.clubsSchema.CLUB_REGIONS).toContain(r);
  });

  it('names no area as searched, and dates nothing, while the clubs file is a placeholder', () => {
    const view = m.clubView.buildClubsIndexView();
    expect(view.researched).toBe(m.clubs.getClubsFile().notes.length > 0 || view.clubCount > 0);
    if (!view.researched) {
      expect(view.regionsWithoutClubsSentence).toBeNull();
      expect(view.regionsNotSearchedSentence).toBeNull();
      expect(view.lede).toMatch(/No club is listed yet\.$/);
    }
    if (view.clubCount === 0) expect(view.regions).toEqual([]);
  });

  it('names a sport on a commitment or a profile only when it is not soccer', () => {
    expect(m.commitView.ledeWords(41, [])).toContain('soccer or any other');
    for (const c of m.commits.getCommitments()) {
      expect(m.commitView.playerCommitLine(c.teamSlug, c.athleteId)!.sport).toBe(c.sport === 'soccer' ? null : m.commitView.SPORT_WORDS[c.sport]);
    }
    const profiles = [
      ...m.rosters.getAllEnrichedRosters().flatMap((t) => t.players.flatMap((p) => p.profiles)),
      ...m.jvProfiles.getJvProfilesFile().teams.flatMap((t) => t.players.flatMap((p) => p.profiles)),
    ];
    expect(profiles.every((p) => p.sport !== 'soccer')).toBe(true);
  });

  it('lists only players the files tie to a club, a commitment or a profile on /recruiting', () => {
    const view = m.recruitingView.buildRecruitingView();
    for (const region of view.regions) {
      for (const league of region.leagues) for (const school of league.schools) expect(school.rows.length).toBeGreaterThan(0);
      if (region.leagues.length === 0) expect(region.summary).toMatch(/no player is listed yet\.$/);
    }
  });
});
