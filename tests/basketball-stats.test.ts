/**
 * Basketball's player stats, roster words and leader boards (SCVAL_SPORT=basketball; docs/MULTI-SPORT.md):
 * the stat model in the sport definition, MaxPreps' basketball stat sheets through the same parsers and the
 * same fetch script field hockey uses, and the tables and boards built from them.
 *
 * Every other test file runs on field hockey (the default); this one sets the switch before importing
 * anything that reads it, as tests/soccer.test.ts does. Numbers are asserted on the captures in
 * tests/fixtures/basketball (its README says what each is: Palo Alto's 2025-26 sheets, restamped for this
 * season and anonymised), never on data/basketball/player-stats.json, which every refresh rewrites.
 */
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { GameModel } from '../components/game/game-view';
import type { PlayerStatsFile, TeamPlayerStats } from '../lib/players/player-stats-schema';
import type { Game, Snapshot } from '../lib/types';
import { REPO, runScript } from './helpers';

const FIXTURES = path.join(REPO, 'tests', 'fixtures', 'basketball');
/** The box score capture's placeholder contest id (tests/fixtures/basketball/README.md). */
const PLACEHOLDER = '00000000-0000-4000-8000-00000000b0c5';
const PALO_ALTO_ID = 'a38a628c-c65f-487f-a65e-7264b6804ce0';
const capture = (name: string) => JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8')) as unknown;

type Modules = {
  current: typeof import('../lib/sports/current');
  schema: typeof import('../lib/players/player-stats-schema');
  source: typeof import('../lib/sources/maxpreps-player-stats');
  gameStats: typeof import('../lib/sources/maxpreps-game-stats');
  notes: typeof import('../lib/players/note-stats');
  teamView: typeof import('../components/teams/player-stats-view');
  gameView: typeof import('../components/game/game-stats-view');
  positions: typeof import('../components/words/position-words');
  leaders: typeof import('../components/leaders/leaders-view');
  elo: typeof import('../components/leaders/elo-board');
  adjusted: typeof import('../lib/ratings/adjusted-scoring');
  ratings: typeof import('../lib/ratings/ratings');
  data: typeof import('../lib/data');
};

let m: Modules;
/** data/basketball/snapshot.json with one Palo Alto game staged as an 81-42 final, and that game. */
let staged: { snapshot: Snapshot; game: Game; dir: string };
/** scripts/fetch-player-stats.ts over the captures and the staged snapshot. */
let built: PlayerStatsFile;
let run: ReturnType<typeof runScript>;

beforeAll(async () => {
  vi.stubEnv('SCVAL_SPORT', 'basketball');
  vi.resetModules();
  m = {
    current: await import('../lib/sports/current'),
    schema: await import('../lib/players/player-stats-schema'),
    source: await import('../lib/sources/maxpreps-player-stats'),
    gameStats: await import('../lib/sources/maxpreps-game-stats'),
    notes: await import('../lib/players/note-stats'),
    teamView: await import('../components/teams/player-stats-view'),
    gameView: await import('../components/game/game-stats-view'),
    positions: await import('../components/words/position-words'),
    leaders: await import('../components/leaders/leaders-view'),
    elo: await import('../components/leaders/elo-board'),
    adjusted: await import('../lib/ratings/adjusted-scoring'),
    ratings: await import('../lib/ratings/ratings'),
    data: await import('../lib/data'),
  };

  // Stage: a fixtures folder holding Palo Alto's captures under the id of one of its games in the
  // current snapshot, a "no data" answer for every other team, and that snapshot with the game final.
  const snapshot = structuredClone(m.data.getSnapshot()) as Snapshot;
  const game = snapshot.games.find(
    (g) => (g.home.slug === 'palo-alto' || g.away.slug === 'palo-alto') && g.home.teamId !== null && g.away.teamId !== null,
  );
  if (!game) throw new Error('tests/basketball-stats.test.ts: the snapshot lists no Palo Alto game to stage');
  // Every other game is put back to unplayed, so the boards below hold whatever the live season has done:
  // update-data-basketball.yml runs this file on each day's snapshot, and a real 82-point final or a second
  // Palo Alto final would otherwise move the leaders this file pins.
  for (const g of snapshot.games) {
    Object.assign(g, { status: 'scheduled', decider: null, isOt: false, otPeriods: 0, isForfeit: false, forfeitBy: null, shootout: null });
    Object.assign(g.home, { score: null, result: null });
    Object.assign(g.away, { score: null, result: null });
  }
  const paloAlto = game.home.slug === 'palo-alto' ? game.home : game.away;
  const opponent = game.home.slug === 'palo-alto' ? game.away : game.home;
  Object.assign(game, { status: 'final', decider: 'REG', isForfeit: false, forfeitBy: null });
  Object.assign(paloAlto, { score: 81, result: 'W' });
  Object.assign(opponent, { score: 42, result: 'L' });
  const dir = mkdtempSync(path.join(tmpdir(), 'scvalfh-basketball-stats-'));
  for (const file of readdirSync(FIXTURES).filter((f) => f.endsWith('.json'))) {
    const text = readFileSync(path.join(FIXTURES, file), 'utf8').replaceAll(PLACEHOLDER, game.contestId);
    writeFileSync(path.join(dir, file.replace(PLACEHOLDER, game.contestId)), text);
  }
  for (const team of snapshot.teams) {
    if (team.slug !== 'palo-alto' && team.slug !== 'gunn') cpSync(path.join(FIXTURES, 'stats-gunn.json'), path.join(dir, `stats-${team.slug}.json`));
  }
  // The standings of the staged games alone, as the pipeline would compute them.
  const { computeStandings } = await import('../lib/standings/engine');
  snapshot.standings = computeStandings(snapshot.games);
  writeFileSync(path.join(dir, 'snapshot.json'), JSON.stringify(snapshot));
  staged = { snapshot, game, dir };

  const out = path.join(dir, 'player-stats.json');
  run = runScript(
    'scripts/fetch-player-stats.ts',
    ['--fixtures', dir, '--snapshot', path.join(dir, 'snapshot.json'), '--out', out, '--fetched-at', '2026-12-01T16:00:00.000Z'],
    { env: { ...process.env, SCVAL_SPORT: 'basketball' } },
  );
  if (run.status !== 0) throw new Error(`scripts/fetch-player-stats.ts exited ${run.status}\n${run.output}`);
  built = m.schema.PlayerStatsFileSchema.parse(JSON.parse(readFileSync(out, 'utf8')) as unknown);
});

const paloAlto = (): TeamPlayerStats => built.teams.find((t) => t.slug === 'palo-alto')!;

describe('the basketball stat model', () => {
  it('is one line per player, with no goalkeeper group and no stats read from game notes', () => {
    const { stats } = m.current.SPORT;
    expect(stats.model).toBe('basketball');
    expect(stats.goalieKeys).toEqual([]);
    expect([stats.pointsPerGoal, stats.pointsPerAssist]).toEqual([0, 0]);
    expect(m.schema.FIELD_STAT_KEYS).toEqual([
      'gamesPlayed', 'minutes', 'points', 'fieldGoalsMade', 'fieldGoalAttempts', 'threePointsMade', 'threePointAttempts',
      'freeThrowsMade', 'freeThrowAttempts', 'offensiveRebounds', 'defensiveRebounds', 'rebounds', 'assists', 'steals',
      'blocks', 'turnovers', 'personalFouls',
    ]);
    expect(m.schema.GOALIE_STAT_KEYS).toEqual([]);
  });

  it('maps every kept MaxPreps column to a key of the line', () => {
    const keys = new Set<string>(m.schema.FIELD_STAT_KEYS);
    for (const map of [m.source.BASKETBALL_SHOOTING_COLUMNS, m.source.BASKETBALL_TOTALS_COLUMNS]) {
      for (const key of Object.values(map)) expect(keys.has(key), key).toBe(true);
    }
    const mapped = new Set<string>([...Object.values(m.source.BASKETBALL_SHOOTING_COLUMNS), ...Object.values(m.source.BASKETBALL_TOTALS_COLUMNS)]);
    expect([...keys].filter((k) => !mapped.has(k))).toEqual([]);
  });

  it('credits nobody from a game note', () => {
    expect(m.notes.NOTE_STATS_APPLY).toBe(false);
    const noted: Game = { ...staged.game, venue: { ...staged.game.venue, text: 'goals scored Avery Alder, Blake Birch; 3 assists Casey Cedar' } };
    const sources = {
      games: [noted],
      roster: () => [{ careerId: 'fixture01', careerUrl: null, athleteId: 'a1', fullName: 'Avery Alder', firstName: 'Avery', lastName: 'Alder', jersey: '44' }],
    };
    expect(m.notes.teamsCreditedByNotes(sources).size).toBe(0);
    expect(m.notes.noteStatsFor('palo-alto', sources).credits).toEqual([]);
  });
});

describe('parsePlayerStats on a basketball sheet', () => {
  const parse = (raw: unknown) => m.source.parsePlayerStats(raw, { expectedTeamId: PALO_ALTO_ID });

  it('reads the Shooting and Totals groups into one line per player', () => {
    const page = parse(capture('stats-palo-alto.json'))!;
    expect(page.players).toHaveLength(16);
    expect(page.tracked.goalkeeping).toEqual([]);
    // Minutes are 0 for the team (the coach does not track them), so they are not tracked.
    expect(page.tracked.field).toEqual(m.schema.FIELD_STAT_KEYS.filter((k) => k !== 'minutes'));
    expect(page.totals.field).toMatchObject({
      gamesPlayed: 26, points: 1424, fieldGoalsMade: 523, fieldGoalAttempts: 1221, threePointsMade: 188,
      threePointAttempts: 545, freeThrowsMade: 190, freeThrowAttempts: 330, offensiveRebounds: 229,
      defensiveRebounds: 449, rebounds: 678, assists: 351, steals: 243, blocks: 46, turnovers: 409, personalFouls: 421,
    });
    const alder = page.players.find((p) => p.shortName === 'A. Alder')!;
    expect(alder).toMatchObject({ careerId: 'fixture01', jersey: '44', goalkeeping: null });
    expect(alder.field).toMatchObject({
      gamesPlayed: 25, minutes: null, points: 84, fieldGoalsMade: 35, fieldGoalAttempts: 69, threePointsMade: 5,
      threePointAttempts: 11, freeThrowsMade: 9, freeThrowAttempts: 19, offensiveRebounds: 22, defensiveRebounds: 45,
      rebounds: 67, assists: 14, steals: 11, blocks: 6, turnovers: 29, personalFouls: 52,
    });
    // A field goal is a two or a three, and points are 2 per two, 3 per three, 1 per free throw.
    for (const p of page.players) {
      const f = p.field!;
      if (f.points === null || f.fieldGoalsMade === null || f.threePointsMade === null || f.freeThrowsMade === null) continue;
      expect(f.points, p.shortName).toBe(2 * (f.fieldGoalsMade - f.threePointsMade) + 3 * f.threePointsMade + f.freeThrowsMade);
    }
  });

  it('skips the per-game, per-32 and misc groups silently, and still names a group it does not know', () => {
    expect(parse(capture('stats-palo-alto.json'))!.warnings).toEqual([]);
    const odd = structuredClone(capture('stats-palo-alto.json')) as { data: { groups: Array<{ name: string }> } };
    odd.data.groups[0].name = 'Hustle Stats';
    expect(parse(odd)!.warnings).toEqual(['ignored stats group "Hustle Stats"']);
  });

  it('reads the "No data was found" answer as no stats, and throws on drift', () => {
    expect(parse(capture('stats-gunn.json'))).toBeNull();
    type Sheet = { data: { groups: Array<{ name: string; subgroups: Array<{ stats: { columns: Array<{ name: string }>; rows: Array<{ columns: Array<{ value: string | null }> }> } }> }> } };
    const noName = structuredClone(capture('stats-palo-alto.json')) as Sheet;
    const totals = noName.data.groups.find((g) => g.name === 'Totals')!.subgroups[0].stats;
    totals.columns.find((c) => c.name === 'Name')!.name = 'Player';
    expect(() => parse(noName)).toThrow(/no Name column/);
    const disagree = structuredClone(capture('stats-palo-alto.json')) as Sheet;
    const table = disagree.data.groups.find((g) => g.name === 'Totals')!.subgroups[0].stats;
    const pointsAt = table.columns.findIndex((c) => c.name === 'Points');
    table.rows[0].columns[pointsAt].value = '999';
    expect(() => parse(disagree)).toThrow(/points is 999 here/);
    expect(() => m.source.parsePlayerStats(capture('stats-palo-alto.json'), { expectedSeasonId: 'ee7cf537-7394-4430-88ca-becaabda286c' })).toThrow(/sportSeasonId/);
  });

  it('reads a box score with the same rules, and the per-game table that points at it', () => {
    const box = parse(capture(`box-palo-alto-${PLACEHOLDER}.json`))!;
    expect(box.totals.field).toMatchObject({ points: 78, fieldGoalsMade: 31, fieldGoalAttempts: 56, rebounds: 32, assists: 22 });
    // A box score has no games-played column.
    expect(box.tracked.field).not.toContain('gamesPlayed');
    expect(box.players.reduce((n, p) => n + (p.field?.points ?? 0), 0)).toBe(78);
    const rows = m.gameStats.parseGameRows(capture('game-stats-palo-alto.json'), { expectedTeamId: PALO_ALTO_ID });
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.entered && /^[0-9a-f]{8}$/.test(r.rowKey))).toBe(true);
    expect(rows[0].total.contestId).toBe(PLACEHOLDER);
  });
});

describe('scripts/fetch-player-stats.ts on the basketball captures', () => {
  it('writes a valid file: Palo Alto read, every other team with no stats', () => {
    expect(run.output).toMatch(/16 player stat lines on 1 of 15 teams · 1 box scores \(1 read this run\) · 0 team\(s\) failed/);
    expect(run.output).not.toMatch(/goalkeepers/);
    expect(built.counts).toMatchObject({ teams: 15, teamsWithStats: 1, players: 16, goalkeepers: 0, errors: 0 });
    expect(built.teams.filter((t) => t.slug !== 'palo-alto').map((t) => t.status)).toEqual(Array(14).fill('none'));
    const team = paloAlto();
    expect(team.status).toBe('ok');
    expect(team.players).toHaveLength(16);
    expect(team.players.every((p) => p.goalkeeping === null && p.field !== null)).toBe(true);
    expect(team.warnings.filter((w) => !/not on the MaxPreps roster/.test(w))).toEqual([]);
    expect(team.gameTotals).toBeUndefined();
  });

  it("reads the staged final's box score, and only that game's", () => {
    const games = paloAlto().games ?? [];
    expect(games.map((g) => g.contestId)).toEqual([staged.game.contestId]);
    expect(games[0].players).toHaveLength(11);
    expect(games[0].tracked.goalkeeping).toEqual([]);
    expect(games[0].players.find((p) => p.name === 'H. Hazel')?.field).toMatchObject({ points: 14, fieldGoalsMade: 5, fieldGoalAttempts: 9 });
  });
});

describe("the team page's basketball tables", () => {
  it('shows four tables of at most five columns, every player in each, most points first', () => {
    const tables = m.teamView.basketballTables(paloAlto());
    expect(tables.map((t) => [t.id, t.table.columns.map((c) => c.label)])).toEqual([
      ['scoring', ['GP', 'PTS', 'PPG', '3PM']],
      ['shooting', ['FG%', '3P%', 'FT%', 'FTM']],
      ['rebounds', ['REB', 'RPG', 'AST', 'APG']],
      // Minutes are not tracked, so the column is left out.
      ['defense', ['STL', 'BLK', 'TO', 'PF']],
    ]);
    for (const t of tables) {
      expect(t.table.columns.length).toBeLessThanOrEqual(5);
      expect(t.table.rows.map((r) => r.name)).toEqual(tables[0].table.rows.map((r) => r.name));
    }
    const points = tables[0].table.rows.map((r) => r.values[1] ?? -1);
    expect(points).toEqual([...points].sort((a, b) => b - a));
    expect(tables[0].table.rows[0]).toMatchObject({ name: 'C. Cedar', jersey: '10', texts: ['26', '346', '13.3', '56'] });
    expect(tables[1].table.rows[0].texts).toEqual(['39.8', '35.4', '71.3', '82']);
  });

  it('works a rate out only where it can, and leaves a column out when the team does not track it', () => {
    const { perGameRate, shootingPercent, oneDecimal } = m.teamView;
    expect(perGameRate(84, 25)).toBeCloseTo(3.36);
    expect([perGameRate(10, 0), perGameRate(null, 5), perGameRate(10, null)]).toEqual([null, null, null]);
    expect(shootingPercent(0, 0)).toBeNull();
    expect(oneDecimal(shootingPercent(1, 3)!)).toBe('33.3');
    const team = paloAlto();
    const noAttempts = { ...team, tracked: { ...team.tracked, field: team.tracked.field.filter((k) => k !== 'threePointAttempts') } };
    const shooting = m.teamView.basketballTables(noAttempts).find((t) => t.id === 'shooting')!;
    expect(shooting.table.columns.map((c) => c.label)).toEqual(['FG%', 'FT%', 'FTM']);
  });

  it('builds the section from them, with no goal-sport block and no game-note marks', () => {
    const view = m.teamView.buildPlayerStatsView('palo-alto', [staged.game], paloAlto())!;
    expect(view.tables?.map((t) => t.kicker)).toEqual(['Scoring', 'Shooting', 'Rebounds and assists', 'Defense and more']);
    expect([view.scoring, view.more, view.goalies, view.notedGames]).toEqual([null, null, [], []]);
    expect([view.showsPoints, view.showsSavePercent, view.goalkeepingEntered, view.showsDerived]).toEqual([false, false, false, true]);
    const none = m.teamView.buildPlayerStatsView('gunn', [], built.teams.find((t) => t.slug === 'gunn')!)!;
    expect(none.status).toBe('none');
    expect(none.tables).toEqual([]);
  });
});

describe("the game page's basketball box score", () => {
  const model = (): GameModel => {
    const { game } = staged;
    const side = (s: Game['home']) => ({ team: s.slug ? { slug: s.slug } : null, name: s.name });
    return { game, home: side(game.home), away: side(game.away), postseasonNotes: [] } as unknown as GameModel;
  };
  const lookup = (contestId: string, slug: string) => ({
    box: built.teams.find((t) => t.slug === slug)?.games?.find((g) => g.contestId === contestId),
    unread: false,
    credits: [],
  });

  it('prints points, made-attempted shooting and the rest in two tables, most points first', () => {
    const view = m.gameView.buildGameStatsView(model(), lookup)!;
    const side = view.sides.find((s) => s.key === 'palo-alto')!;
    expect(side.scoring!.columns.map((c) => c.label)).toEqual(['PTS', 'FG', '3PT', 'FT', 'PF']);
    expect(side.goalies!.columns.map((c) => c.label)).toEqual(['REB', 'AST', 'STL', 'BLK', 'TO']);
    expect(side.secondCaption).toBe('rebounds, assists and defense');
    expect(side.scoring!.rows[0]).toMatchObject({ name: 'H. Hazel', texts: ['14', '5-9', '4-7', '0-0', '2'] });
    expect(side.scoring!.rows.map((r) => r.name)).toEqual(side.goalies!.rows.map((r) => r.name));
    expect(side.scoring!.rows).toHaveLength(11);
    // The coach's entries add up to 78; the staged score is 81.
    expect(side.notes).toEqual(['The entries add up to 78 of the 81 points on the scoreboard.']);
    expect(view.caveat).toBeNull();
    expect(view.notedFrom).toBeNull();
    expect(view.legend).toContain('FG field goals made-attempted');
  });

  it('says nothing was entered for a side with no box score', () => {
    const view = m.gameView.buildGameStatsView(model(), (id, slug) => (slug === 'palo-alto' ? { box: undefined, unread: false, credits: [] } : lookup(id, slug)));
    expect(view).toBeNull();
  });
});

describe('basketball words', () => {
  it('reads G as a guard, never a goalkeeper', () => {
    const { positionWords, positionFromText, POSITION_WORDS } = m.positions;
    expect(positionWords(['G'])).toBe('Guard');
    expect(positionWords(['G', 'F'])).toBe('Guard / Forward');
    expect(positionWords(['F', 'C'])).toBe('Forward / Center');
    expect(positionWords(['PG'])).toBe('Point guard');
    expect(positionFromText('Guard, wing')).toBe('Guard / Forward');
    expect(Object.values(POSITION_WORDS)).not.toContain('Goalkeeper');
  });

  it('states the Elo scale in points of margin, and says the constants are provisional', () => {
    expect(m.ratings.ELO_PER_GOAL).toBe(25);
    expect(m.ratings.MARGIN_CAP).toBe(20);
    expect(m.elo.ELO_SCALE).toBe('1500 is an average team and 25 Elo points is about one point of winning margin');
    expect(m.elo.MARGIN_WORDS).toBe('scoring margin');
    expect(m.current.SPORT.ratings.provisionalNote).toMatch(/rule of thumb/);
  });
});

describe('the basketball leader boards', () => {
  const view = () => {
    const { snapshot } = staged;
    return m.leaders.buildLeadersView({ teams: snapshot.teams, stats: built.teams, standings: snapshot.standings, games: snapshot.games, prior: null });
  };

  it('has no Elo-adjusted board, no clean sheets and no goalkeeper board', () => {
    expect(m.adjusted.HAS_ADJUSTED_SCORING).toBe(false);
    expect(m.adjusted.getAdjustedScoring().size).toBe(0);
    const [region] = view().regions;
    expect(region.schools.map((b) => b.id)).toEqual([
      'best-record', 'best-league-record', 'most-points', 'fewest-points-allowed', 'best-margin', 'elo-rating',
    ]);
    expect(region.players.map((b) => b.id)).toEqual([
      'points-per-game', 'rebounds-per-game', 'assists-per-game', 'most-steals', 'most-blocks', 'most-three-pointers',
    ]);
    const words = JSON.stringify(region);
    for (const banned of ['goal', 'Goal', 'keeper', 'clean sheet', 'A tie counts', 'W-L-T', 'Elo-adjusted']) {
      expect(words.includes(banned), banned).toBe(false);
    }
  });

  it('ranks the school boards on points a game, with the staged final', () => {
    const [region] = view().regions;
    const board = (id: string) => region.schools.find((b) => b.id === id)!;
    expect(board('most-points').rows[0]).toMatchObject({ name: 'Palo Alto' });
    expect(board('most-points').rows[0].cells.map((c) => c.text)).toEqual(['1', '81', '81.0']);
    expect(board('most-points').columns.map((c) => c.label)).toEqual(['GP', 'PF', 'Avg']);
    expect(board('fewest-points-allowed').columns.map((c) => c.label)).toEqual(['GP', 'PA', 'Avg']);
    const margin = board('best-margin').rows.find((r) => r.name === 'Palo Alto')!;
    expect(margin.cells.map((c) => c.text)).toEqual(['1', '+39', '+39.0']);
    expect(board('best-record').columns.map((c) => c.label)).toEqual(['W-L', 'Pct', 'PD']);
  });

  it('ranks players per game past the half-the-games rule, and totals for everyone', () => {
    const [region] = view().regions;
    const board = (id: string) => region.players.find((b) => b.id === id)!;
    const ppg = board('points-per-game');
    expect(ppg.columns.map((c) => c.label)).toEqual(['GP', 'PTS', 'PPG']);
    expect(ppg.rows[0]).toMatchObject({ name: 'C. Cedar', rank: 1 });
    expect(ppg.rows[0].cells.map((c) => c.text)).toEqual(['26', '346', '13.3']);
    const listed = [...ppg.rows, ...(ppg.extra?.rows ?? [])];
    // Koa (8 games), Elm (10), Nutmeg and Pine (1 each) are under half of 26.
    expect(listed).toHaveLength(12);
    expect(listed.map((r) => r.name)).not.toContain('K. Koa');
    const rates = listed.map((r) => Number(r.cells[2].text));
    expect(rates).toEqual([...rates].sort((a, b) => b - a));
    expect(board('rebounds-per-game').rows[0]).toMatchObject({ name: 'L. Larch' });
    expect(board('most-steals').rows[0].cells.map((c) => c.text)).toEqual(['26', '53']);
    expect(board('most-three-pointers').rows[0].cells.map((c) => c.text)).toEqual(['22', '69', '42.6']);
    expect(ppg.note).toMatch(/at least half as many games/);
  });

  it('says so when no team has entered anything', () => {
    const { snapshot } = staged;
    const none = built.teams.map((t) => (t.slug === 'palo-alto' ? built.teams.find((x) => x.slug === 'gunn')! : t)).map((t, i) => ({ ...t, slug: built.teams[i].slug }));
    const empty = m.leaders.buildLeadersView({ teams: snapshot.teams, stats: none, standings: snapshot.standings, games: snapshot.games, prior: null });
    const ppg = empty.regions[0].players.find((b) => b.id === 'points-per-game')!;
    expect(ppg.rows).toEqual([]);
    expect(ppg.empty).toBe('No team enters points on MaxPreps yet.');
    expect(empty.regions[0].statTeams).toBe(0);
  });
});
