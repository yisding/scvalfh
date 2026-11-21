/**
 * The Valley Athletic League's middle school girls soccer build (SCVAL_SPORT=val-soccer; docs/MULTI-SPORT.md): the
 * first build whose primary source is not MaxPreps but the league's own TeamSideline site (lib/pipeline/primary.ts).
 * Its sport switch, its league, registry and level words, its data files, and its pipeline run offline from the
 * recorded corpus (tests/fixtures/corpus/val-soccer-2026-11-21/). Every other test file runs on field hockey (the
 * default); this one sets the switch before importing anything that reads it, and vitest runs each test file in its
 * own module graph.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import { REPO } from './helpers';

type Modules = {
  current: typeof import('../lib/sports/current');
  season: typeof import('../lib/season');
  leagues: typeof import('../lib/leagues');
  teams: typeof import('../lib/teams');
  sections: typeof import('../lib/league-config/sections');
  data: typeof import('../lib/data');
  jv: typeof import('../lib/jv/jv');
  rosters: typeof import('../lib/players/rosters');
  playerStats: typeof import('../lib/players/player-stats');
  schools: typeof import('../lib/schools/schools');
  levels: typeof import('../components/words/level-words');
  postseason: typeof import('../lib/postseason/postseason');
  support: typeof import('./pipeline/support/run-corpus');
};

let m: Modules;
const CORPUS = 'val-soccer-2026-11-21' as const;
const SLUGS = ['blach', 'columbia', 'crittenden', 'cupertino-ms', 'egan', 'graham', 'hyde', 'kennedy', 'lawson', 'miller', 'sunnyvale-ms'];

beforeAll(async () => {
  vi.stubEnv('SCVAL_SPORT', 'val-soccer');
  vi.resetModules();
  m = {
    current: await import('../lib/sports/current'),
    season: await import('../lib/season'),
    leagues: await import('../lib/leagues'),
    teams: await import('../lib/teams'),
    sections: await import('../lib/league-config/sections'),
    // Each validates its bundled data/val-soccer/ file at import (update-data-val-soccer.yml runs this file on what it fetched).
    data: await import('../lib/data'),
    jv: await import('../lib/jv/jv'),
    rosters: await import('../lib/players/rosters'),
    playerStats: await import('../lib/players/player-stats'),
    schools: await import('../lib/schools/schools'),
    levels: await import('../components/words/level-words'),
    postseason: await import('../lib/postseason/postseason'),
    support: await import('./pipeline/support/run-corpus'),
  };
}, 120_000);

describe('the val-soccer switch', () => {
  it('is the VAL’s 7th/8th grade girls soccer, winter 2026-27, read from the league’s own site', () => {
    const c = m.current;
    expect(c.SPORT_ID).toBe('val-soccer');
    expect(c.SPORT.id).toBe('soccer');
    expect(c.PRIMARY_SOURCE).toBe('teamsideline');
    expect(c.HAS_MAXPREPS).toBe(false);
    expect(c.MAXPREPS_SPORT_SEASON).toBeNull();
    expect(c.LISTS_PLAYERS).toBe(false);
    expect(c.HAS_RECRUITING).toBe(false);
    expect(c.DATA_DIR).toBe('data/val-soccer');
    expect(c.SPORT_AUDIENCE).toBe('7th/8th grade girls soccer');
    expect(m.season.SEASON_DISPLAY).toBe('Winter 2026-27');
    // No MaxPreps id is read in this build: the MaxPreps constants are empty, and no MaxPreps step runs.
    expect([m.season.SPORT_SEASON_ID, m.season.ALL_SEASON_ID, m.season.JV_SPORT_SEASON_ID, m.season.BOOTSTRAP_URL]).toEqual(['', '', '', '']);
  });

  it('names the levels by grade, as the league’s pages do', () => {
    const season = m.current.SPORT_SEASON;
    if (season.primary !== 'teamsideline') throw new Error('not a TeamSideline season');
    expect(m.levels.LEVELS_ARE_GRADES).toBe(true);
    expect(`${m.levels.MAIN_LEVEL.short} Grade`).toBe(season.pages.main.subtitle);
    expect(`${m.levels.SECOND_LEVEL.short} Grade`).toBe(season.pages.second.subtitle);
    expect(m.levels.SECOND_LEVEL.long).toBe(season.pages.second.subtitle.toLowerCase());
  });
});

describe('the league and its registry', () => {
  it('is one league of eleven middle schools, a single round robin, in no CIF section', () => {
    expect(m.leagues.LEAGUE_IDS).toEqual(['val']);
    const val = m.leagues.getLeague('val');
    expect(val.sectionId).toBe('none');
    expect(val.divisions).toHaveLength(1);
    expect(val.divisions[0]).toMatchObject({ expectedTeams: 11, gamesPerTeam: 10, meetings: 1, maxprepsLeagueId: null });
    expect(val.rules.points).toEqual({ win: 3, tie: 1, loss: 0 });
    expect(m.teams.TEAMS.map((t) => t.slug)).toEqual(SLUGS);
    // Ids of our own, never MaxPreps GUIDs: MaxPreps carries none of these schools.
    for (const t of m.teams.TEAMS) expect(t.id).toBe(`val-${t.slug}`);
    expect(m.sections.CCS).toBeNull();
    expect(() => m.sections.requireCcs()).toThrow(/no CCS block/);
  });

  it('plays a six-team bracket with byes for 1st and 2nd and fixed semifinals', () => {
    const ps = m.leagues.getLeague('val').postseason;
    if (ps.kind !== 'league-tournament') throw new Error('VAL has a league tournament');
    expect(ps).toMatchObject({ qualifiers: 6, byes: [1, 2], semifinals: 'fixed', lastSpot: null, finalSite: null });
    expect(ps.rounds.map((r) => [r.id, r.date])).toEqual([
      ['qf-1', '2027-02-01'], ['qf-2', '2027-02-01'], ['sf-1', '2027-02-02'], ['sf-2', '2027-02-02'], ['final', '2027-02-04'],
    ]);
  });

  it('draws the semifinals from the quarterfinals they follow, not by reseeding', () => {
    const projection = m.data.getLeagueTournament('val');
    const sf = projection.games.filter((g) => g.round === 'semifinal');
    expect(sf.map((g) => [g.id, g.home.kind === 'seed' ? g.home.seed : null, g.away.kind === 'winner-of' ? g.away.gameId : null])).toEqual([
      ['sf-1', 1, 'qf-1'],
      ['sf-2', 2, 'qf-2'],
    ]);
    expect(projection.playIn).toBeNull();
    expect(projection.games.find((g) => g.id === 'final')?.site).toBeNull();
  });
});

/**
 * The committed files are rewritten by every refresh (update-data-val-soccer.yml runs this file on what it just
 * fetched), so they are held to the season's invariants, never to one day's schedule: the league moves games and
 * fills its playoff seats through the season. One day's exact schedule is the corpus's, below.
 */
describe('the data files', () => {
  /** At most one league game a pair (a single round robin), and at most the page's five playoff games. */
  function holdsTheSeason(games: readonly import('../lib/types').Game[], scheduleId: string): void {
    const regular = games.filter((g) => !/-g\d+$/.test(g.contestId));
    const playoffs = games.filter((g) => /-g\d+$/.test(g.contestId));
    for (const g of games) {
      expect(g.contestId.startsWith(`teamsideline:${scheduleId}-`), g.contestId).toBe(true);
      expect(g.provenance.scores).toBe('teamsideline');
    }
    const pairs = regular.map((g) => [g.home.slug, g.away.slug].sort().join('~'));
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(regular.length).toBeLessThanOrEqual(55);
    expect(playoffs.length).toBeLessThanOrEqual(5);
  }

  it('bundles the 7th/8th grade page’s games, its league games counted, and no CCS block', () => {
    const snapshot = m.data.getSnapshot();
    expect(snapshot.teams.map((t) => t.slug)).toEqual(SLUGS);
    holdsTheSeason(snapshot.games, '731407');
    // Every game between two VAL schools before the playoffs is a league game; a playoff game counts for no table.
    for (const g of snapshot.games) expect(g.countsFor).toBe(g.postseason === null ? 'val' : null);
    expect(snapshot.playoffs).toBeNull();
    expect(snapshot.season.sections.map((s) => [s.id, s.maxprepsSectionId])).toEqual([['none', null]]);
    expect(snapshot.sources.map((s) => [s.id, s.kind])).toEqual([['teamsideline', 'league-schedule']]);
  });

  it('bundles the 6th/7th grade page’s games as the second level, read from the same site', () => {
    const file = m.jv.getJvFile();
    expect(file.sportSeasonId).toBeNull();
    expect(file.league?.url).toBe('https://valleyal.org/schedule/731408/0/1/6th7th-grade');
    holdsTheSeason(file.games, '731408');
    for (const t of file.teams) expect([t.maxpreps.status, t.sblive.status]).toEqual(['unavailable', 'unavailable']);
  });

  it('lists no player of any team', () => {
    expect(m.rosters.getRosters().teams.every((t) => t.status === 'pending' && t.players.length === 0)).toBe(true);
    expect(m.playerStats.getPlayerStats().teams.every((t) => t.status === 'pending' && t.players.length === 0)).toBe(true);
  });

  it('has each school’s address, as the league’s field links give it', () => {
    for (const slug of SLUGS) expect(m.schools.schoolAddress(slug).region).toBe('CA');
    expect(m.schools.schoolAddress('lawson')).toEqual({ street: '10401 Vista Drive', city: 'Cupertino', region: 'CA', postalCode: '95014' });
  });
});

describe('the pipeline, offline from the corpus', () => {
  it('reads the league’s page as its primary source, and asks MaxPreps and si.com for nothing', async () => {
    const { snapshot, run } = await m.support.snapshotOf({ corpus: CORPUS });
    expect(run.result?.meta.requests).toMatchObject({ maxpreps: 0, sblive: 0, official: 1 });
    // The page as read on 2026-11-21: the single round robin's 55 league games, no playoff seat filled yet.
    expect(snapshot.games).toHaveLength(55);
    expect(snapshot.games.every((g) => g.countsFor === 'val' && /^teamsideline:731407-[a-z-]+-at-[a-z-]+$/.test(g.contestId))).toBe(true);
    expect(new Set(snapshot.games.map((g) => [g.home.slug, g.away.slug].sort().join('~'))).size).toBe(55);
    expect([snapshot.games[0].dateKey, snapshot.games.at(-1)?.dateKey]).toEqual(['2026-12-14', '2027-01-28']);
    expect(snapshot.games.find((g) => g.contestId === 'teamsideline:731407-sunnyvale-ms-at-lawson')).toMatchObject({
      dateLocal: '2026-12-14T16:00:00',
      venue: { name: 'Lawson Field', address: { street: '10401 Vista Drive', city: 'Cupertino', region: 'CA', postalCode: '95014' } },
      status: 'scheduled',
    });
    expect(snapshot.sources.map((s) => [s.id, s.status, s.rowCount])).toEqual([['teamsideline', 'ok', 60]]);
  }, 120_000);

  it('publishes nothing when the page cannot be read: the league freezes and the run aborts', async () => {
    const variant = m.support.writeTempVariant({ 'teamsideline/schedule/main': 503 });
    await expect(m.support.snapshotOf({ corpus: CORPUS, variants: [variant] })).rejects.toThrow(/systemic outage/);
  }, 120_000);

  it('reads no page that is another program’s or another level’s', async () => {
    const html = readFileSync(path.join(REPO, 'tests/fixtures/teamsideline/val-girls-soccer-6th7th-2026-11-21.html'), 'utf8');
    const variant = m.support.writeTempVariant({ 'teamsideline/schedule/main': { rel: 'teamsideline/schedule/main.html', body: html } });
    await expect(m.support.snapshotOf({ corpus: CORPUS, variants: [variant] })).rejects.toThrow(/systemic outage/);
  }, 120_000);
});
