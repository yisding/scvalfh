/**
 * The volleyball build (SCVAL_SPORT=volleyball; docs/MULTI-SPORT.md): its sport, its two leagues and registry,
 * its data files, its CCS block, its tiebreak stages and its stat line, read through the same modules a
 * volleyball build loads. Like tests/basketball.test.ts, this file sets the switch before importing anything
 * that reads it; vitest runs each test file in its own module graph, so field hockey's tests never see it.
 * update-data-volleyball.yml runs this file on what it fetched.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { Game } from '../lib/types';

import { REPO } from './helpers';

type Modules = {
  current: typeof import('../lib/sports/current');
  season: typeof import('../lib/season');
  format: typeof import('../lib/format');
  leagues: typeof import('../lib/leagues');
  teams: typeof import('../lib/teams');
  sections: typeof import('../lib/league-config/sections');
  data: typeof import('../lib/data');
  official: typeof import('../lib/official/schema');
  scvalFixtures: typeof import('../scripts/build-scval-volleyball-fixtures');
  bvalFixtures: typeof import('../scripts/build-bval-winter-fixtures');
  playerStats: typeof import('../lib/players/player-stats');
  statsSource: typeof import('../lib/sources/maxpreps-player-stats');
  statsView: typeof import('../components/teams/player-stats-view');
  jv: typeof import('../lib/jv/jv');
  jvRosters: typeof import('../lib/jv/jv-rosters');
  rosters: typeof import('../lib/players/rosters');
  history: typeof import('../lib/history/history');
  order: typeof import('../lib/standings/order');
  classify: typeof import('../lib/classify');
  ccs: typeof import('../lib/sources/ccs');
  positions: typeof import('../components/words/position-words');
  describeGame: typeof import('../components/ui/describe-game');
  bracketsView: typeof import('../components/playoffs/tournament-brackets-view');
  bracketLink: typeof import('../components/playoffs/bracket-link');
};

let m: Modules;

beforeAll(async () => {
  vi.stubEnv('SCVAL_SPORT', 'volleyball');
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
    scvalFixtures: await import('../scripts/build-scval-volleyball-fixtures'),
    bvalFixtures: await import('../scripts/build-bval-winter-fixtures'),
    // Each validates its bundled data/volleyball/ file at import.
    playerStats: await import('../lib/players/player-stats'),
    statsSource: await import('../lib/sources/maxpreps-player-stats'),
    statsView: await import('../components/teams/player-stats-view'),
    jv: await import('../lib/jv/jv'),
    jvRosters: await import('../lib/jv/jv-rosters'),
    rosters: await import('../lib/players/rosters'),
    history: await import('../lib/history/history'),
    order: await import('../lib/standings/order'),
    classify: await import('../lib/classify'),
    ccs: await import('../lib/sources/ccs'),
    positions: await import('../components/words/position-words'),
    describeGame: await import('../components/ui/describe-game'),
    bracketsView: await import('../components/playoffs/tournament-brackets-view'),
    bracketLink: await import('../components/playoffs/bracket-link'),
  };
});

describe('the volleyball sport switch', () => {
  it('is girls varsity volleyball, fall 2026, with its data under data/volleyball/', () => {
    const { SPORT, SPORT_SEASON, SPORT_AUDIENCE, DATA_DIR, IS_FIELD_HOCKEY, IS_BASKETBALL, IS_VOLLEYBALL, HAS_RECRUITING } = m.current;
    expect(SPORT.id).toBe('volleyball');
    expect(SPORT_SEASON.sportSeasonId).toBe('9f2e0dd1-c299-4f3e-8e0e-744d108b6db7');
    expect(SPORT_SEASON.allSeasonId).toBe('2059473e-9a9c-400b-b1e2-9a119e64e597');
    expect(SPORT_SEASON.jvSportSeasonId).toBe('d23401c4-759f-41af-b044-94497d049dd1');
    expect(SPORT_SEASON.genderSport).toBe('girls,volleyball');
    expect(SPORT_AUDIENCE).toBe('girls varsity volleyball');
    expect(DATA_DIR).toBe('data/volleyball');
    expect([IS_FIELD_HOCKEY, IS_BASKETBALL, IS_VOLLEYBALL, HAS_RECRUITING]).toEqual([false, false, true, false]);
  });

  it('scores sets, never ends level, has no overtime, and prints a record as W-L', () => {
    const { SPORT } = m.current;
    expect(SPORT.scoring).toMatchObject({
      allowsTies: false, overtime: 'none', tiebreak: null, unit: 'set', forAbbr: 'SW', againstAbbr: 'SL', diffAbbr: 'SD',
    });
    // lib/format reads the inlined SCVAL_SPORT, not the sport definition: the two must agree.
    expect(m.format.SPORT_HAS_NO_TIES).toBe(!SPORT.scoring.allowsTies);
    expect(m.format.SPORT_OVERTIME_IS_SUDDEN_VICTORY).toBe(false);
    expect(m.format.recordString({ w: 4, l: 1, t: 0 })).toBe('4-1');
    // A two-set split a tournament records is never hidden.
    expect(m.format.recordString({ w: 4, l: 1, t: 1 })).toBe('4-1-1');
  });

  it('derives the season words and source links from the volleyball definition', () => {
    expect(m.season.SEASON_DISPLAY).toBe('Fall 2026');
    expect(m.season.BOOTSTRAP_URL).toBe('https://www.maxpreps.com/ca/volleyball/');
    expect(m.season.CCS_BRACKET_URL).toBe(
      'https://www.maxpreps.com/tournament/TPozgxV2DkGkNEbD5cAlqA/volleyball-26/2026-central-coast-section-girls-volleyball-championship.htm',
    );
    expect(m.season.SOURCE_LINKS.ccsCalendar).toBe('https://cifccs.org/calendar/Girls_Volleyball?print=ical');
    expect(m.season.maxprepsJvTeamUrl('https://www.maxpreps.com/ca/palo-alto/gunn-titans/volleyball/')).toBe(
      'https://www.maxpreps.com/ca/palo-alto/gunn-titans/volleyball/jv/',
    );
  });

  it('rates a set of margin, capped at three, with no Elo-adjusted scoring model', () => {
    expect(m.current.SPORT.ratings).toMatchObject({ eloPerUnit: 150, marginCap: 3, adjustedScoring: null });
    expect(m.current.SPORT.ratings.provisionalNote).toMatch(/rule of thumb/);
  });
});

describe('SCVAL and BVAL girls volleyball', () => {
  it('covers SCVAL and BVAL, in one section and one region', () => {
    expect(m.leagues.LEAGUE_IDS).toEqual(['scval', 'bval']);
    expect(m.sections.SECTIONS.map((s) => s.id)).toEqual(['ccs']);
    expect(m.sections.REGIONS.map((r) => r.id)).toEqual(['norcal']);
  });

  it('aligns the 41 schools as the six official schedules do', () => {
    const slugs = (division: string) => m.teams.teamsInDivision(division).map((t) => t.slug).sort();
    expect(slugs('de-anza')).toEqual(['cupertino', 'homestead', 'los-altos', 'los-gatos', 'milpitas', 'monta-vista', 'palo-alto']);
    expect(slugs('el-camino')).toEqual(['fremont', 'gunn', 'lynbrook', 'macdonald', 'mountain-view', 'santa-clara', 'saratoga', 'wilcox']);
    expect(slugs('mt-hamilton')).toEqual(['branham', 'evergreen-valley', 'leigh', 'leland', 'pioneer', 'westmont']);
    expect(slugs('santa-teresa')).toEqual(['christopher', 'gilroy', 'piedmont-hills', 'santa-teresa', 'silver-creek', 'sobrato']);
    expect(slugs('almaden-valley')).toEqual(['del-mar', 'gunderson', 'lincoln', 'live-oak', 'prospect', 'willow-glen']);
    expect(slugs('west-valley')).toEqual([
      'andrew-hill', 'independence', 'james-lick', 'mt-pleasant', 'oak-grove', 'overfelt', 'san-jose', 'yerba-buena',
    ]);
    expect(m.teams.TEAMS).toHaveLength(41);
    for (const team of m.teams.TEAMS) expect(team.external.maxprepsTeamUrl).toMatch(/\/volleyball\/$/);
  });

  it('orders both leagues on the league record, each with its own by-laws tiebreak chain', () => {
    const scval = m.leagues.getLeague('scval').rules;
    const bval = m.leagues.getLeague('bval').rules;
    for (const rules of [scval, bval]) {
      expect(rules.orderBy).toBe('win-pct');
      expect(rules.points).toEqual({ win: 1, tie: 0, loss: 0 });
      expect(rules.leagueOvertime).toBe('none');
      expect(rules.classification).toBe('official-fixtures');
      expect(m.order.orderHead(rules)).toBe('PCT');
    }
    expect(scval.tiebreaks.default).toEqual(['head-to-head', 'h2h-set-ratio', 'set-points']);
    expect(bval.tiebreaks.default).toEqual(['head-to-head', 'h2h-sets-won', 'record-vs-placed', 'second-meeting']);
    for (const stage of ['set-points', 'second-meeting'] as const) expect(m.leagues.UNCOMPUTABLE_STAGES.has(stage)).toBe(true);
  });

  it('gives SCVAL four automatic berths and BVAL six, the last by a play-in at the West Valley champion', () => {
    const scval = m.leagues.getLeague('scval').postseason;
    const bval = m.leagues.getLeague('bval').postseason;
    expect(scval.kind === 'ccs-ladder' && scval.autoBerths).toBe(4);
    expect(bval.kind === 'ccs-ladder' && bval.autoBerths).toBe(6);
    if (bval.kind !== 'ccs-ladder') throw new Error('BVAL is a CCS ladder league');
    expect(bval.pairings).toHaveLength(1);
    expect(bval.pairings[0]).toMatchObject({
      date: '2026-10-28', tag: 'bval-play-in', host: 0, isPlayIn: true,
      seats: [{ division: 'west-valley', place: 1 }, { division: 'santa-teresa', place: 2 }],
    });
    expect(m.sections.CCS.autoQualifiers).toMatchObject({ scval: 4, bval: 6, atLarge: null, total: null });
  });

  it('opens the CCS bracket with a first round and names all six MaxPreps brackets', () => {
    const { CCS, ccsFirstDay, ccsLastDay } = m.sections;
    expect(ccsFirstDay(CCS.keyDates)).toBe('2026-10-31');
    expect(ccsLastDay(CCS.keyDates)).toBe('2026-11-07');
    expect(CCS.ccsDivisions).toEqual([]);
    expect(CCS.tournament?.otherBrackets?.map((b) => b.name)).toEqual(['Open Division', 'Division 3', 'Division 4', 'Division 5']);
    const page = m.ccs.readTournamentPage(readFileSync(path.join(REPO, 'tests/fixtures/corpus/volleyball-2026-11-14/ccs/bracket.html'), 'utf8'));
    expect(page.recognised).toBe(true);
    expect(page.divisions.map((d) => [d.name, d.published])).toEqual([
      ['Division 1', true], ['Division 2', true], ['Open Division', true], ['Division 3', true], ['Division 4', true], ['Division 5', true],
    ]);
  });
});

describe('the official schedules', () => {
  it('data/volleyball/official/scval-2026.json is the two schedule texts, transcribed: 42 and 56 fixtures, each with its JV match', () => {
    const built = m.scvalFixtures.buildBundle();
    expect(m.official.serializeBundle(built)).toBe(readFileSync(path.join(REPO, 'data/volleyball/official/scval-2026.json'), 'utf8'));
    const by = (division: string) => built.fixtures.filter((f) => f.division === division);
    expect([by('de-anza').length, by('el-camino').length]).toEqual([42, 56]);
    for (const f of built.fixtures) {
      expect(f.time).toBe('18:45');
      expect(f.jv).toEqual({ date: f.date, time: '17:30' });
    }
  });

  it('reads a De Anza column’s bye, and no match for the team on it', () => {
    const text = readFileSync(path.join(REPO, 'tests/fixtures/official/source/scval-volleyball-girls-de-anza-2026.txt'), 'utf8');
    const columns = m.scvalFixtures.parseGrid(text);
    expect(columns).toHaveLength(14);
    expect(columns[0]).toMatchObject({ head: 'THURSDAY SEPTEMBER 10', dateKey: '2026-09-10', bye: 'CUPERTINO' });
    for (const c of columns) {
      expect(c.games).toHaveLength(3);
      expect(c.games.flatMap((g) => [g.away, g.home])).not.toContain(c.bye);
    }
  });

  it('data/volleyball/official/bval-2026.json is the four division texts, transcribed, without the play-in line', () => {
    const built = m.bvalFixtures.buildBundle();
    expect(m.official.serializeBundle(built)).toBe(readFileSync(path.join(REPO, 'data/volleyball/official/bval-2026.json'), 'utf8'));
    const count = (division: string) => built.fixtures.filter((f) => f.division === division).length;
    expect(['mt-hamilton', 'santa-teresa', 'almaden-valley', 'west-valley'].map(count)).toEqual([30, 30, 30, 56]);
    expect(built.transcribedOn).toBe('2026-11-14');
    const text = readFileSync(path.join(REPO, 'tests/fixtures/official/source/bval-volleyball-girls-santa-teresa-2026.txt'), 'utf8');
    expect(text).toContain('Santa Teresa 2nd Place @ West Valley Division Champion');
    const parsed = m.bvalFixtures.parseDivisionText('santa-teresa', text);
    expect(parsed.games.some((g) => /Place|Champion/.test(`${g.away} ${g.home}`))).toBe(false);
    expect(parsed.revisedOn).toBe('5/26/26');
  });
});

describe('the bundled volleyball data', () => {
  it('loads a snapshot of the 41 teams, every league match from an official fixture', () => {
    const snapshot = m.data.getSnapshot();
    expect(snapshot.season.genderSport).toBe('girls,volleyball');
    expect(snapshot.teams).toHaveLength(41);
    // The loader turns a fixture with no contest into a listed game, so every league row traces to a fixture.
    const league = snapshot.games.filter((x) => x.countsFor !== null);
    expect(league.length).toBeGreaterThan(200);
    expect(league.length).toBeLessThanOrEqual(244);
    // A league match is one of the schedule's fixtures, on its day or the day MaxPreps has it (Lynbrook at
    // Saratoga, a Sep 23 fixture, is on MaxPreps as a league match of Aug 31), and never a postseason game.
    for (const g of league) {
      expect(g.postseason, g.contestId).toBeNull();
      expect(g.dateKey < '2026-10-29', g.contestId).toBe(true);
    }
  });

  it('never tags a state championship match as a CCS game', () => {
    const state = m.data.getSnapshot().games.filter((g) => /CIF State/.test(g.bracket?.tournament ?? ''));
    for (const g of state) {
      expect(g.postseason, g.contestId).toMatchObject({ kind: 'other', via: 'maxpreps-bracket' });
      expect(m.describeGame.postseasonTagOf(g)).toBe('CIF State');
    }
    const ccs = m.data.getSnapshot().games.filter((g) => /Central Coast Section/.test(g.bracket?.tournament ?? ''));
    for (const g of ccs) expect(g.postseason?.kind, g.contestId).toBe('ccs');
  });

  // Whatever the day's data is (update-data-volleyball.yml runs this file on what it fetched): the published
  // brackets are whole, every one drawn holds a team of ours, and every bracket game of ours has its card.
  it('holds the published brackets whole, and draws one per division our teams are in', () => {
    const snapshot = m.data.getSnapshot();
    const brackets = snapshot.playoffs.brackets ?? [];
    expect(brackets.length).toBeGreaterThan(0);
    expect(new Set(brackets.map((b) => b.bracketId)).size).toBe(brackets.length);
    const drawn = m.bracketsView.tournamentBracketsView(brackets, snapshot.games, m.data.getToday());
    expect(new Set(drawn.brackets.map((b) => b.id)).size).toBe(drawn.brackets.length);
    // CIF State first, then the CCS; a division left undrawn is a CCS one, named for the note.
    const events = drawn.brackets.map((b) => b.event);
    expect(events).toEqual([...events].sort((a, b) => (a === b ? 0 : a === 'cif' ? -1 : 1)));
    expect(drawn.brackets.length + drawn.ccsOthers.length).toBe(brackets.length);
    for (const b of drawn.brackets) {
      const slugs = b.rounds.flatMap((r) => r.ties.flatMap((t) => t.lines.map((l) => l.slug))).filter((slug) => slug !== null);
      expect(slugs.length, b.name).toBeGreaterThan(0);
      for (const slug of slugs) expect(m.teams.getTeamBySlug(slug), `${b.name} ${slug}`).toBeDefined();
      // A round's games feed the next two to one, once the opening round's byes are set aside.
      b.rounds.slice(1, -1).forEach((r, i) => {
        if (b.event === 'ccs' || i < b.rounds.length - 3) expect(r.ties.length, `${b.name} ${r.name}`).toBe(b.rounds[i + 2].ties.length * 2);
      });
    }
  });

  it('links every published bracket game of ours to its card on /playoffs', () => {
    const snapshot = m.data.getSnapshot();
    const drawn = m.bracketsView.tournamentBracketsView(snapshot.playoffs.brackets, snapshot.games, m.data.getToday());
    const cards = new Map(drawn.brackets.flatMap((b) => b.rounds.flatMap((r) => r.ties.map((t) => [t.contestId, { id: t.id, event: b.event }] as const))));
    const inBrackets = new Set((snapshot.playoffs.brackets ?? []).flatMap((b) => b.matchups.map((x) => x.contestId)));
    const ours = snapshot.games.filter((g) => g.bracket?.published && inBrackets.has(g.contestId));
    expect(ours.length).toBeGreaterThan(0);
    for (const g of ours) {
      const card = cards.get(g.contestId);
      expect(card, g.contestId).toBeDefined();
      expect(m.bracketLink.getBracketLink(g), g.contestId).toMatchObject({
        href: `/playoffs#${card?.id}`,
        label: card?.event === 'cif' ? 'CIF State bracket' : 'CCS bracket',
      });
    }
    // Every CCS game and every CIF State game the snapshot holds is in a bracket that was read.
    for (const g of snapshot.games.filter((x) => x.bracket?.published && x.postseason?.via === 'maxpreps-bracket')) {
      expect(inBrackets.has(g.contestId), `${g.dateKey} ${g.away.name} at ${g.home.name}`).toBe(true);
    }
  });

  it('holds a stats entry, a roster and a JV entry for every team, and last season’s SCVAL archive', () => {
    for (const team of m.teams.TEAMS) {
      expect(m.playerStats.getTeamPlayerStats(team.slug), team.slug).toBeDefined();
      expect(m.rosters.getTeamRoster(team.slug), team.slug).toBeDefined();
    }
    expect(m.jv.getJvFile().teams).toHaveLength(41);
    expect(m.history.getAvailableHistoryLeagues().map((l) => l.id)).toEqual(['scval']);
    expect(m.history.getUnavailableHistoryLeagues().map((l) => l.id)).toEqual(['bval']);
    // The El Camino JV document prints one player's year as "7": no grade is stored for her.
    const jv = m.history.getHistoryAwards('el-camino', 'jv');
    expect(jv?.firstTeam.find((p) => p.player === 'Kaylan Shab')).toMatchObject({ slug: 'saratoga', year: null });
  });

  it('holds the JV lists 13 schools publish themselves, and shows one where it is the fuller list', () => {
    const file = m.jvRosters.getJvSiteRostersFile();
    expect(file.teams.map((t) => t.slug)).toEqual([
      'cupertino',
      'los-gatos',
      'monta-vista',
      'palo-alto',
      'fremont',
      'gunn',
      'lynbrook',
      'santa-clara',
      'saratoga',
      'branham',
      'leland',
      'willow-glen',
      'yerba-buena',
    ]);
    expect(file.teams.reduce((n, t) => n + t.players.length, 0)).toBe(173);
    for (const t of file.teams) {
      expect(t.season, t.slug).toBe('2026-27');
      expect(t.seasonEvidence.length, t.slug).toBeGreaterThan(30);
      expect(t.checkedOn <= file.capturedAt, t.slug).toBe(true);
      expect(`${t.readUrl} ${t.pageUrl}`, t.slug).not.toMatch(/maxpreps/);
      for (const p of t.players) {
        expect(p.name, t.slug).not.toBe(p.name.toLowerCase());
        expect(p.name, t.slug).not.toBe(p.name.toUpperCase());
      }
    }
    // MaxPreps' JV pages list nobody for Cupertino and Willow Glen, and two players for Leland.
    expect(m.jvRosters.getJvRoster('cupertino')).toMatchObject({ source: 'school-site', other: null });
    expect(m.jvRosters.getJvRoster('willow-glen')).toMatchObject({ source: 'school-site', other: null });
    expect(m.jvRosters.getJvRoster('leland')).toMatchObject({ source: 'school-site', other: { source: 'maxpreps' } });
    expect(m.teams.TEAMS.filter((t) => m.jvRosters.getJvRoster(t.slug) !== null)).toHaveLength(27);
  });
});

describe('classifying a volleyball postseason match', () => {
  const side = (slug: string) => {
    const t = m.teams.getTeamBySlug(slug)!;
    return { teamId: t.id, slug: t.slug, name: t.name, city: t.city, score: 3, result: 'W' as const };
  };
  const game = (over: Partial<Game>): Game =>
    ({
      contestId: 'c', dateKey: '2026-11-10', status: 'final', contestTypes: { home: 4, away: 4 },
      home: side('homestead'), away: { ...side('milpitas'), score: 2, result: 'L' }, bracket: null, postseason: null,
      ...over,
    }) as unknown as Game;
  const bracket = (tournament: string) => ({
    tournamentId: '9929854c-7b21-4e27-a15c-387acee0c6ed', bracketId: null, tournament, name: 'Division II', published: true, matchupId: null, url: null,
  });

  it('reads a CIF State bracket row as another championship’s game, whatever the CCS window says', () => {
    const tag = m.classify.postseasonTag(game({ bracket: bracket('2026 CIF State Girls Volleyball Championships') as Game['bracket'] }));
    expect(tag).toEqual({ kind: 'other', leagueId: 'scval', via: 'maxpreps-bracket' });
  });

  it('still reads a CCS bracket row, and a cross-division BVAL game on Oct 28, as what each is', () => {
    const ccs = m.classify.postseasonTag(
      game({ dateKey: '2026-11-07', bracket: { ...bracket('2026 Central Coast Section Girls Volleyball Championship'), tournamentId: '8333fa4c-7615-410e-a434-46c3e5c025a8' } as Game['bracket'] }),
    );
    expect(ccs).toMatchObject({ kind: 'ccs', via: 'maxpreps-bracket' });
    const playIn = m.classify.postseasonTag(
      game({ dateKey: '2026-10-28', contestTypes: { home: 1, away: 1 }, home: side('independence'), away: { ...side('sobrato'), score: 0, result: 'L' } }),
    );
    expect(playIn).toEqual({ kind: 'bval-play-in', leagueId: 'bval', via: 'config-pairing' });
  });
});

describe('a forfeit entered with no score', () => {
  const forfeit = (homeResult: 'W' | 'L' | null, awayResult: 'W' | 'L' | null, score: [number, number] = [0, 0]) => ({
    status: 'final' as const, decider: 'FORFEIT' as const, shootout: null,
    home: { score: score[0], result: homeResult }, away: { score: score[1], result: awayResult },
  }) as unknown as Parameters<typeof m.format.sideOutcome>[0];

  it('is the win of the side MaxPreps marks, not a tie', () => {
    expect(m.format.sideOutcome(forfeit('W', 'L'), 'home')).toBe('W');
    expect(m.format.sideOutcome(forfeit('W', 'L'), 'away')).toBe('L');
  });

  it('stays level where no winner is marked, and is read off a nominal score where there is one', () => {
    expect(m.format.sideOutcome(forfeit(null, null), 'home')).toBe('T');
    expect(m.format.sideOutcome(forfeit('L', 'W', [1, 0]), 'home')).toBe('W');
  });
});

describe('the volleyball stat line', () => {
  const cell = (value: string, href: string | null = null) => ({ value, href, caption: null });
  const table = (name: string, columns: Array<[string, string]>, rows: string[][]) => ({
    name,
    subgroups: [{
      name: '',
      stats: {
        columns: [{ name: 'Jersey' }, { name: 'Name' }, ...columns.map(([n, overallValue]) => ({ name: n, overallValue }))],
        rows: rows.map(([jersey, player, ...values]) => ({
          columns: [cell(jersey), cell(player, `https://www.maxpreps.com/athletes/x/?careerid=${player.replace(/\W/g, '').toLowerCase()}`), ...values.map((v) => cell(v))],
        })),
      },
    }],
  });
  const rollup = () => ({
    status: 200,
    data: {
      teamId: 't', sportSeasonId: '9f2e0dd1-c299-4f3e-8e0e-744d108b6db7',
      groups: [
        table('Attacking', [['MatchGamesPlayed', '80'], ['AttacksKills', '30'], ['KillsPerGame', '1.5'], ['KillPercentage', '30'], ['AttacksAttempts', '100'], ['AttacksErrors', '10'], ['HittingPercentage', '0.200']],
          [['7', 'A. Player', '40', '20', '0.5', '25', '60', '4', '0.267'], ['9', 'B. Player', '20', '10', '0.5', '25', '40', '6', '0.100']]),
        table('Blocking', [['MatchGamesPlayed', '80'], ['BlocksSolo', '5'], ['BlocksAssists', '4'], ['TotalBlocks', '7'], ['BlocksPerGame', '0.1'], ['BlocksPerMatch', '0.5'], ['BlocksErrors', '2']],
          [['7', 'A. Player', '40', '5', '4', '7', '0.2', '1', '2']]),
      ],
    },
  });

  it('reads one line per player from MaxPreps’ groups, the counts only', () => {
    const page = m.statsSource.parsePlayerStats(rollup())!;
    expect(page.tracked.field).toEqual(['setsPlayed', 'kills', 'attackErrors', 'attackAttempts', 'soloBlocks', 'blockAssists']);
    expect(page.tracked.goalkeeping).toEqual([]);
    expect(page.players).toHaveLength(2);
    expect(page.players[0].field).toMatchObject({ setsPlayed: 40, kills: 20, attackErrors: 4, attackAttempts: 60, soloBlocks: 5, blockAssists: 4, digs: null });
    expect(page.players[1].field).toMatchObject({ setsPlayed: 20, kills: 10, soloBlocks: null });
    expect(page.warnings).toEqual([]);
  });

  it('throws where two groups disagree on a player’s sets played', () => {
    const raw = rollup();
    raw.data.groups[1].subgroups[0].stats.rows[0].columns[2] = cell('39');
    expect(() => m.statsSource.parsePlayerStats(raw)).toThrow(/setsPlayed is 39 here, 40 in another table/);
  });

  it('works out a hitting percentage and total blocks as volleyball prints them', () => {
    const { hittingPercent, threeDecimals, totalBlocks } = m.statsView;
    expect(threeDecimals(hittingPercent(20, 4, 60)!)).toBe('.267');
    expect(threeDecimals(hittingPercent(2, 5, 60)!)).toBe('-.050');
    expect(threeDecimals(1)).toBe('1.000');
    expect(hittingPercent(3, 1, 0)).toBeNull();
    expect(totalBlocks(5, 4)).toBe(7);
    expect(totalBlocks(null, null)).toBeNull();
  });

  it('builds the team page’s four tables, rates per set, for a team with a full sheet', () => {
    const team = m.teams.TEAMS.map((t) => m.playerStats.getTeamPlayerStats(t.slug)!).find((t) => t.tracked.field.length === 13);
    expect(team, 'a team tracking every volleyball stat').toBeDefined();
    const view = m.statsView.buildPlayerStatsView(team!.slug, [], team!)!;
    expect(view.tables?.map((t) => t.id)).toEqual(['attacking', 'serving', 'defense', 'passing']);
    expect(view.tables?.[0].table.columns.map((c) => c.label)).toEqual(['SP', 'K', 'K/S', 'E', 'Hit%']);
    expect(view.ratesPerSet).toBe(true);
    expect(view.goalies).toEqual([]);
  });

  it('names MaxPreps’ volleyball positions, and the all-league documents’ spellings', () => {
    expect(m.positions.positionWords(['OH', 'DS'])).toBe('Outside hitter / Defensive specialist');
    expect(m.positions.positionFromText('Lib')).toBe('Libero');
    expect(m.positions.positionFromText('S/Opp')).toBe('Setter / Opposite');
    expect(m.positions.positionFromText('Pin')).toBe('Pin');
  });
});
