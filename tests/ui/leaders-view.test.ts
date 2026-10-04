/**
 * `components/leaders/leaders-view.ts`, `LeaderBoardTable` and the /leaders page (DESIGN §16).
 *
 * The page's promises: a player's number is the one on their team page and a school's record the one
 * in its standings row; a board ranks with shared places (1, 2, 2, 4) and never lists more than its
 * cap; a 0 or an untracked stat never puts a player on a board; every team a board cannot cover is
 * named; a school needs a minimum number of results to lead a record or a rate; clean sheets leave
 * forfeits out, as goals do.
 *
 * Two data sets, as tests/ui/player-stats-view.test.ts has: the rules are asserted over the
 * COMMITTED data (they must hold for whatever the scheduled refresh writes), and exact outcomes over
 * synthetic games and stats, since the committed files move after every game.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import LeadersPage from '../../app/leaders/page';
import LeaderBoardTable from '../../components/leaders/LeaderBoardTable';
import {
  BOARD_MAX_ROWS,
  BOARD_PLACES,
  buildLeadersView,
  qualifyingMinimum,
  rankBoard,
  type LeaderBoard,
  type LeaderSources,
} from '../../components/leaders/leaders-view';
import { statText } from '../../components/teams/player-stats-view';
import { getGames, getStandingFor, getTeams } from '../../lib/data';
import { recordString } from '../../lib/format';
import { getPlayerStats } from '../../lib/player-stats';
import { getPriorSeason } from '../../lib/prior-season-data';
import { getRatings } from '../../lib/ratings';
import {
  FIELD_STAT_KEYS,
  GOALIE_STAT_KEYS,
  type FieldStatKey,
  type FieldStats,
  type GoalieStatKey,
  type GoalieStats,
  type TeamPlayerStats,
} from '../../lib/player-stats-schema';
import { computeStandings } from '../../lib/standings';
import { TEAMS, getTeamBySlug } from '../../lib/teams';
import type { Game } from '../../lib/types';
import { game } from '../helpers';

const PLAYER_IDS = ['most-points', 'most-assists', 'most-saves', 'most-clean-sheets'];
const SCHOOL_IDS = ['elo-rating', 'best-record', 'best-league-record', 'most-goals', 'fewest-goals-allowed', 'school-clean-sheets'];

/** The board's ranked cell, as printed. */
const ranked = (board: LeaderBoard, i: number) => board.rows[i].cells[board.rankedBy].text;

/** The ranking invariants every board keeps, whatever its data. */
function expectRanked(board: LeaderBoard): void {
  expect(board.rows.length, board.id).toBeLessThanOrEqual(BOARD_MAX_ROWS);
  board.rows.forEach((row, i) => {
    expect(row.rank, `${board.id} row ${i}`).toBeLessThanOrEqual(BOARD_PLACES);
    const prev = board.rows[i - 1];
    const next = board.rows[i + 1];
    if (prev && prev.rank === row.rank) {
      expect(ranked(board, i), `${board.id}: a shared place shares its value`).toBe(ranked(board, i - 1));
    } else {
      // Standard competition ranking: a new place starts at its 1-based position.
      expect(row.rank, `${board.id} row ${i}`).toBe(i + 1);
    }
    const shares = (prev && prev.rank === row.rank) || (next && next.rank === row.rank);
    expect(row.tied, `${board.id} row ${i} tied flag`).toBe(Boolean(shares));
  });
}

// ---------------------------------------------------------------- the committed data

describe('buildLeadersView — rules, over the committed data', () => {
  const view = buildLeadersView();
  const stats = getPlayerStats().teams;

  it('builds the four player boards and the six school boards, with unique anchors', () => {
    expect(view.players.map((b) => b.id)).toEqual(PLAYER_IDS);
    expect(view.schools.map((b) => b.id)).toEqual(SCHOOL_IDS);
    expect(view.teamCount).toBe(getTeams().length);
    expect(view.statTeams).toBe(stats.filter((t) => t.players.length > 0).length);
  });

  it('ranks every board with shared places and keeps to its cap', () => {
    for (const board of [...view.players, ...view.schools]) {
      expectRanked(board);
      expect(board.columns[board.rankedBy], board.id).toBeDefined();
      for (const row of board.rows) expect(row.cells, `${board.id} ${row.key}`).toHaveLength(board.columns.length);
    }
  });

  it("prints each player's number exactly as the team's player stats hold it, and only above 0", () => {
    const stat: Record<string, { block: 'field' | 'goalkeeping'; key: string }> = {
      'most-points': { block: 'field', key: 'points' },
      'most-assists': { block: 'field', key: 'assists' },
      'most-saves': { block: 'goalkeeping', key: 'saves' },
      'most-clean-sheets': { block: 'goalkeeping', key: 'shutouts' },
    };
    for (const board of view.players) {
      const { block, key } = stat[board.id];
      const tracking = stats.filter(
        (t) => t.players.length > 0 && (t.tracked[block] as string[]).includes(key),
      );
      expect(board.meta, board.id).toBe(`From ${tracking.length} ${tracking.length === 1 ? 'team' : 'teams'}`);
      board.rows.forEach((row, i) => {
        const team = stats.find((t) => t.slug === row.team.slug)!;
        expect((team.tracked[block] as string[]).includes(key), `${board.id}: ${row.team.slug} tracks ${key}`).toBe(true);
        const player = team.players.find((p) => p.fullName === row.name)!;
        expect(player, `${board.id}: ${row.name}`).toBeDefined();
        const value = (player[block] as Record<string, number | null> | null)?.[key] ?? null;
        expect(value, `${board.id}: ${row.name}`).toBeGreaterThan(0);
        expect(ranked(board, i), `${board.id}: ${row.name}`).toBe(statText(value));
        expect(row.team.href, row.name).toBe(`/teams/${row.team.slug}#player-stats`);
      });
    }
  });

  it("prints each school's record as its standings row has it, and only for a school past the minimum", () => {
    const record = view.schools.find((b) => b.id === 'best-record')!;
    const league = view.schools.find((b) => b.id === 'best-league-record')!;
    const minOf = (board: LeaderBoard) => Number(/At least (\d+)/.exec(board.meta)![1]);
    for (const row of record.rows) {
      const s = getStandingFor(row.team.slug)!;
      expect(row.cells[0].text, row.team.slug).toBe(recordString(s.overall));
      expect(s.overall.gp, row.team.slug).toBeGreaterThanOrEqual(minOf(record));
    }
    for (const row of league.rows) {
      const s = getStandingFor(row.team.slug)!;
      expect(row.cells[0].text, row.team.slug).toBe(recordString(s.computed));
      expect(s.computed.gp, row.team.slug).toBeGreaterThanOrEqual(minOf(league));
    }
  });

  it('counts a school clean sheet from the finals, forfeits left out', () => {
    const board = view.schools.find((b) => b.id === 'school-clean-sheets')!;
    for (const row of board.rows) {
      const team = getTeamBySlug(row.team.slug)!;
      const shutouts = getGames({ teamId: team.slug, status: 'final' }).filter((g) => {
        const theirs = g.home.teamId === team.id ? g.away : g.home;
        return !g.isForfeit && theirs.score === 0;
      }).length;
      expect(row.cells[board.rankedBy].text, row.team.slug).toBe(String(shutouts));
    }
  });

  it('prints each school’s Elo rating as lib/ratings.ts has it, only past the minimum, linking to its card', () => {
    const board = view.schools.find((b) => b.id === 'elo-rating')!;
    const min = Number(/At least (\d+)/.exec(board.meta)![1]);
    const bySlug = new Map(getRatings().ratings.map((r) => [r.slug, r]));
    expect(board.columns.map((c) => c.label)).toEqual(['GP', 'Elo']);
    for (const row of board.rows) {
      const r = bySlug.get(row.team.slug)!;
      expect(row.cells.map((c) => c.text), row.team.slug).toEqual([String(r.games), String(r.elo)]);
      expect(r.games, row.team.slug).toBeGreaterThanOrEqual(min);
      expect(row.team.href, row.team.slug).toBe(`/teams/${row.team.slug}#elo`);
    }
    // Every rated team under the minimum is named in the notes, with its games.
    const below = getRatings().ratings.filter((r) => r.games > 0 && r.games < min);
    const note = view.schoolNotes.find((n) => n.startsWith('The Elo board needs'));
    if (below.length > 0) {
      for (const r of below) expect(note, r.slug).toContain(`${getTeamBySlug(r.slug)!.name} (${r.games})`);
    }
  });

  it('names every team with no player stats, so no player board reads as all 43', () => {
    const none = getTeams().filter((t) => !stats.some((s) => s.slug === t.slug && s.players.length > 0));
    for (const team of none) expect(view.playerNotes[0], team.slug).toContain(team.name);
  });
});

// ---------------------------------------------------------------- ranking and the minimum

describe('rankBoard and qualifyingMinimum', () => {
  const same = (a: number, b: number) => a === b;

  it('shares places and skips past them (1, 2, 2, 4)', () => {
    const { rows, dropped } = rankBoard([9, 7, 7, 5], same);
    expect(rows.map((r) => [r.item, r.rank, r.tied])).toEqual([
      [9, 1, false],
      [7, 2, true],
      [7, 2, true],
      [5, 4, false],
    ]);
    expect(dropped).toBeNull();
  });

  it(`keeps the places up to ${BOARD_PLACES}, a tie for the last one included`, () => {
    const values = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 11, 10, 9];
    const { rows, dropped } = rankBoard(values, same);
    expect(rows.map((r) => r.item)).toEqual([20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 11]);
    expect(rows.at(-1)!.rank).toBe(10);
    expect(dropped).toBeNull();
  });

  it(`counts a tie that would pass ${BOARD_MAX_ROWS} rows instead of listing it`, () => {
    const values = [9, 8, 7, 6, 5, 4, 3, 2, ...Array<number>(8).fill(1)];
    const { rows, dropped } = rankBoard(values, same);
    expect(rows.map((r) => r.item)).toEqual([9, 8, 7, 6, 5, 4, 3, 2]);
    expect(dropped).toEqual({ items: Array<number>(8).fill(1), place: 9 });
  });

  it('is half the median of the teams that have played, rounded up, and at least 1', () => {
    expect(qualifyingMinimum([10, 10, 9, 0, 0, 11, 1])).toEqual({ min: 5, median: 10 });
    expect(qualifyingMinimum([7, 6, 6, 6, 1])).toEqual({ min: 3, median: 6 });
    expect(qualifyingMinimum([2, 3])).toEqual({ min: 2, median: 2.5 });
    expect(qualifyingMinimum([0, 0])).toEqual({ min: 1, median: 0 });
  });
});

// ---------------------------------------------------------------- synthetic seasons

interface PlayerSpec {
  name: string;
  field?: Partial<FieldStats>;
  goalkeeping?: Partial<GoalieStats>;
}

/** A schema-shaped TeamPlayerStats for a registry slug; untracked stats stay null. */
function teamStats(
  slug: string,
  spec: { field?: FieldStatKey[]; goalkeeping?: GoalieStatKey[]; players?: PlayerSpec[]; lastUpdated?: string } = {},
): TeamPlayerStats {
  const team = getTeamBySlug(slug)!;
  const field = spec.field ?? [];
  const goalkeeping = spec.goalkeeping ?? [];
  const players = (spec.players ?? []).map((p, i) => ({
    careerId: `${slug}-${i}`,
    careerUrl: null,
    athleteId: null,
    fullName: p.name,
    shortName: p.name,
    jersey: String(i + 1),
    onRoster: true,
    field: p.field
      ? (Object.fromEntries(FIELD_STAT_KEYS.map((k) => [k, field.includes(k) ? (p.field![k] ?? null) : null])) as FieldStats)
      : null,
    goalkeeping: p.goalkeeping
      ? (Object.fromEntries(
          GOALIE_STAT_KEYS.map((k) => [k, goalkeeping.includes(k) ? (p.goalkeeping![k] ?? null) : null]),
        ) as GoalieStats)
      : null,
  }));
  return {
    slug,
    teamId: team.id,
    name: team.name,
    maxprepsTeamId: players.length ? 'x' : null,
    statsUrl: null,
    status: players.length ? 'ok' : 'none',
    lastUpdated: spec.lastUpdated ?? (players.length ? '2026-10-30T12:00:00' : null),
    tracked: { field, goalkeeping },
    totals: { field: {}, goalkeeping: {} },
    players,
    warnings: [],
    fetchedAt: '2026-10-30T19:00:00.000Z',
    error: null,
  };
}

function sources(games: Game[], stats: TeamPlayerStats[] = []): LeaderSources {
  const bySlug = new Map(stats.map((s) => [s.slug, s]));
  return {
    teams: TEAMS,
    stats: TEAMS.map((t) => bySlug.get(t.slug) ?? teamStats(t.slug)),
    standings: computeStandings(games),
    games,
  };
}

/** Every pair of `slugs` twice, home and away, with `score(home, away)`. */
function roundRobin(slugs: string[], score: (h: string, a: string) => [number, number]): Game[] {
  const out: Game[] = [];
  let day = 1;
  for (const home of slugs) {
    for (const away of slugs) {
      if (home === away) continue;
      const [hs, as] = score(home, away);
      out.push(game({ home, away, hs, as, league: false, date: `2026-09-${String(day++).padStart(2, '0')}` }));
    }
  }
  return out;
}

describe('buildLeadersView — schools, over synthetic games', () => {
  // Four teams of four leagues play each other twice (6 games each); Del Mar plays once, a 1-0 win.
  const four = ['mitty', 'leigh', 'stevenson', 'tamalpais'];
  const strength: Record<string, number> = { mitty: 4, leigh: 1, stevenson: 3, tamalpais: 2 };
  const base = roundRobin(four, (h, a) => [strength[h], strength[a]]);
  const games = [
    ...base,
    game({ home: 'del-mar', away: 'leigh', hs: 1, as: 0, league: false, official: null, date: '2026-09-20' }),
    // A forfeit "win" over Mitty, recorded 1-0: a win for Stevenson's record, never a clean sheet.
    game({ home: 'stevenson', away: 'mitty', hs: 1, as: 0, league: false, forfeit: true, date: '2026-09-21' }),
  ];
  const view = buildLeadersView(sources(games));
  const board = (id: string) => view.schools.find((b) => b.id === id)!;

  it('leaves a school under the minimum off the record and rate boards, and names it', () => {
    const record = board('best-record');
    // gp: mitty 7, stevenson 7, leigh 7, tamalpais 6, del-mar 1 → median 7, minimum 4.
    expect(record.meta).toBe('At least 4 games');
    expect(record.rows.map((r) => r.team.slug)).not.toContain('del-mar');
    expect(board('most-goals').rows.map((r) => r.team.slug)).not.toContain('del-mar');
    expect(view.schoolNotes[0]).toContain('Del Mar (1)');
    // Mitty won all six it played on the field and lost the forfeit: 6-1-0.
    expect(record.rows[0]).toMatchObject({ rank: 1, tied: false, name: 'Archbishop Mitty' });
    expect(record.rows[0].cells.map((c) => c.text)).toEqual(['6-1-0', '.857', '+12']);
    expect(record.rows[0].cells[0].sr).toBe('6 wins, 1 loss, 0 ties');
  });

  it('ranks the Elo board by results, without the forfeit or the one-game school', () => {
    const elo = board('elo-rating');
    // Counted games: the round robin's six each, Leigh's seventh against Del Mar; the forfeit is
    // not a result. Median 6, minimum 3, so Del Mar (1) waits, and is named.
    expect(elo.meta).toBe('At least 3 games');
    expect(elo.rows.map((r) => r.team.slug)).toEqual(['mitty', 'stevenson', 'tamalpais', 'leigh']);
    expect(elo.rows.map((r) => r.cells[0].text)).toEqual(['6', '6', '6', '7']);
    expect(view.schoolNotes.find((n) => n.startsWith('The Elo board needs'))).toBe(
      'The Elo board needs at least 3 games against the four leagues’ teams, half the median of 6; not there yet: Del Mar (1).',
    );
    expect(elo.note).toContain('1500 is an average team');
    // No prior season in these sources: every team starts at average, and the note says nothing of one.
    expect(elo.note).not.toContain('started the season');
  });

  it('says a team with no game last season started from average, only when one did', () => {
    const fremont = getTeamBySlug('fremont')!;
    const saratoga = getTeamBySlug('saratoga')!;
    const prior = {
      ...getPriorSeason(),
      // Last season knew two of the four synthetic teams only.
      games: [
        {
          contestId: 'p1',
          date: '2025-09-10',
          homeId: fremont.id,
          homeSlug: 'fremont',
          awayId: saratoga.id,
          awaySlug: 'saratoga',
          homeScore: 2,
          awayScore: 0,
          site: 'home' as const,
        },
      ],
    };
    const note = buildLeadersView({ ...sources(base), prior }).schools.find((b) => b.id === 'elo-rating')!.note;
    expect(note).toContain('rating (the same fit over last season’s 1 final), or from average if it played none;');
    // The committed season seeds every rated team, so its note makes no such claim.
    expect(buildLeadersView().schools.find((b) => b.id === 'elo-rating')!.note).not.toContain('or from average');
  });

  it('starts the committed board from last season, and says so', () => {
    const board = buildLeadersView().schools.find((b) => b.id === 'elo-rating')!;
    expect(board.note).toContain(`started the season from its ${getPriorSeason().season} rating`);
  });

  it('shares an Elo place between equal ratings', () => {
    const v = buildLeadersView(sources(roundRobin(four, () => [2, 2])));
    const elo = v.schools.find((b) => b.id === 'elo-rating')!;
    expect(elo.rows.map((r) => [r.rank, r.tied, r.cells[1].text])).toEqual([
      [1, true, '1500'],
      [1, true, '1500'],
      [1, true, '1500'],
      [1, true, '1500'],
    ]);
  });

  it('counts clean sheets and goals per game without the forfeit', () => {
    const cs = board('school-clean-sheets');
    // Nobody keeps a clean sheet in the round robin (every side scores at least 1); Del Mar's 1-0
    // over Leigh is the only one, and Stevenson's 1-0 forfeit is not.
    expect(cs.rows.map((r) => [r.team.slug, r.cells[cs.rankedBy].text])).toEqual([['del-mar', '1']]);
    const goals = board('most-goals');
    const stevenson = goals.rows.find((r) => r.team.slug === 'stevenson')!;
    // 6 field games: 3 + 3 + 3 at home, 3 + 3 + 3 away = 18 goals; the forfeit is in neither number.
    expect(stevenson.cells.map((c) => c.text)).toEqual(['6', '18', '3.00']);
  });

  it('shares a place between equal rates and lists them by name', () => {
    // Every team concedes 2 a game when every score is 2-2.
    const even = roundRobin(four, () => [2, 2]);
    const v = buildLeadersView(sources(even));
    const allowed = v.schools.find((b) => b.id === 'fewest-goals-allowed')!;
    expect(allowed.rows.map((r) => [r.rank, r.tied])).toEqual([
      [1, true],
      [1, true],
      [1, true],
      [1, true],
    ]);
    expect(allowed.rows.map((r) => r.name)).toEqual([...allowed.rows.map((r) => r.name)].sort((a, b) => a.localeCompare(b)));
    // A season of draws keeps no clean sheet at all: the board says so instead of an empty table.
    const cs = v.schools.find((b) => b.id === 'school-clean-sheets')!;
    expect(cs.rows).toEqual([]);
    expect(cs.empty).toBe('No team has kept a clean sheet yet.');
  });
});

describe('buildLeadersView — players, over synthetic stats', () => {
  const games = [game({ home: 'mitty', away: 'leigh', hs: 2, as: 1, league: false, date: '2026-09-20' })];
  const stats = [
    teamStats('mitty', {
      field: ['gamesPlayed', 'goals', 'assists', 'points'],
      goalkeeping: ['gamesPlayed', 'saves', 'goalsAgainst', 'shutouts'],
      players: [
        { name: 'Ana Ames', field: { gamesPlayed: 6, goals: 5, assists: 2, points: 12 } },
        { name: 'Bea Bell', field: { gamesPlayed: 6, goals: 4, assists: 4, points: 12 } },
        { name: 'Cam Cole', field: { gamesPlayed: 6, goals: 0, assists: 0, points: 0 } },
        { name: 'Gia Gray', goalkeeping: { gamesPlayed: 6, saves: 30, goalsAgainst: 10, shutouts: 2 } },
      ],
      // Entered before the 2026-09-20 final: one game behind.
      lastUpdated: '2026-09-19T20:00:00',
    }),
    teamStats('leigh', {
      field: ['gamesPlayed', 'goals', 'points'],
      goalkeeping: ['gamesPlayed', 'saves'],
      players: [
        { name: 'Dee Dunn', field: { gamesPlayed: 5, goals: 7, points: 14 } },
        { name: 'Kit Kemp', goalkeeping: { gamesPlayed: 5, saves: 41 } },
      ],
      lastUpdated: '2026-09-21T09:00:00',
    }),
    teamStats('saint-francis', {
      field: ['goals', 'assists', 'points'],
      players: [{ name: 'Eve Eck', field: { goals: 1, assists: 1, points: 3 } }],
    }),
  ];
  const view = buildLeadersView(sources(games, stats));
  const board = (id: string) => view.players.find((b) => b.id === id)!;

  it('ranks on the stat, shares equal values, and never lists a 0', () => {
    const points = board('most-points');
    expect(points.rows.map((r, i) => [r.rank, r.tied, r.name, ranked(points, i)])).toEqual([
      [1, false, 'Dee Dunn', '14'],
      [2, true, 'Ana Ames', '12'],
      [2, true, 'Bea Bell', '12'],
      [4, false, 'Eve Eck', '3'],
    ]);
    expect(points.meta).toBe('From 3 teams');
    expect(points.note).toContain('Every team with player stats enters points.');
    // Leigh does not track assists: a dash, never a 0.
    expect(points.rows[0].cells[1]).toEqual({ text: null });
  });

  it('leaves a team that does not enter a stat off its board, and says so', () => {
    const assists = board('most-assists');
    expect(assists.rows.map((r) => r.name)).toEqual(['Bea Bell', 'Ana Ames', 'Eve Eck']);
    expect(assists.meta).toBe('From 2 teams');
    // The shorter list is named: here the one team with stats that does not enter assists.
    expect(assists.note).toContain('Of the 3 teams with player stats, Leigh does not enter assists.');
    const cs = board('most-clean-sheets');
    expect(cs.rows.map((r) => r.name)).toEqual(['Gia Gray']);
    expect(cs.note).toContain('Only 1 team enters clean sheets: Archbishop Mitty.');
  });

  it('prints save percentage only where the coach enters goals against', () => {
    const saves = board('most-saves');
    expect(saves.rows.map((r) => [r.name, ...r.cells.map((c) => c.text)])).toEqual([
      ['Kit Kemp', '5', '41', null],
      ['Gia Gray', '6', '30', '75.0%'],
    ]);
  });

  it('names the teams with no stats and the ones whose totals are behind', () => {
    expect(view.statTeams).toBe(3);
    expect(view.playerNotes[0]).toContain(`3 of the ${TEAMS.length} teams have entered some.`);
    expect(view.playerNotes[0]).toContain('Los Gatos');
    expect(view.playerNotes[0]).not.toContain('Saint Francis');
    expect(view.playerNotes[1]).toBe(
      'Totals lag the scores where a coach has not entered the latest games: Archbishop Mitty (1 game since Sat Sep 19).',
    );
  });

  it('says why a board is empty rather than drawing an empty table', () => {
    const v = buildLeadersView(sources([], []));
    for (const b of v.players) {
      expect(b.rows, b.id).toEqual([]);
      expect(b.empty, b.id).toMatch(/^No team enters .+ on MaxPreps yet\.$/);
    }
    expect(v.schoolNotes).toEqual([]);
    expect(v.resultsThrough).toBeNull();
  });
});

// ---------------------------------------------------------------- review findings (PR #16)

describe('buildLeadersView — ties, minimums and empty boards at the edges', () => {
  it('splits equal goal rates by games played, as the notes say, and shares only a full tie', () => {
    // Mitty and Stevenson both score 2 and concede 1 a game, Mitty over 4 games and Stevenson 2;
    // Tamalpais, Leigh and Del Mar each score 1 and concede 2 a game over 2 games.
    const games = [
      game({ home: 'mitty', away: 'tamalpais', hs: 2, as: 1, league: false, official: null, date: '2026-09-01' }),
      game({ home: 'mitty', away: 'leigh', hs: 2, as: 1, league: false, official: null, date: '2026-09-02' }),
      game({ home: 'mitty', away: 'del-mar', hs: 2, as: 1, league: false, official: null, date: '2026-09-03' }),
      game({ home: 'mitty', away: 'tamalpais', hs: 2, as: 1, league: false, official: null, date: '2026-09-04' }),
      game({ home: 'stevenson', away: 'leigh', hs: 2, as: 1, league: false, official: null, date: '2026-09-05' }),
      game({ home: 'stevenson', away: 'del-mar', hs: 2, as: 1, league: false, official: null, date: '2026-09-06' }),
    ];
    const v = buildLeadersView(sources(games));
    const rows = (id: string) =>
      v.schools.find((b) => b.id === id)!.rows.map((r) => [r.rank, r.tied, r.team.slug, r.cells[0].text]);
    expect(rows('fewest-goals-allowed')).toEqual([
      [1, false, 'mitty', '4'],
      [2, false, 'stevenson', '2'],
      [3, true, 'del-mar', '2'],
      [3, true, 'leigh', '2'],
      [3, true, 'tamalpais', '2'],
    ]);
    expect(rows('most-goals')).toEqual([
      [1, false, 'mitty', '4'],
      [2, false, 'stevenson', '2'],
      [3, true, 'del-mar', '2'],
      [3, true, 'leigh', '2'],
      [3, true, 'tamalpais', '2'],
    ]);
    for (const id of ['most-goals', 'fewest-goals-allowed']) {
      expect(v.schools.find((b) => b.id === id)!.note, id).toContain('Equal rates are split by more games played.');
    }
  });

  it('names a school that meets the record minimum but not the goals one because of a forfeit', () => {
    // Four teams play each other twice (6 games); Del Mar plays three of them and wins a forfeit
    // over the fourth: 4 results for its record, 3 games with goals counted.
    const four = ['mitty', 'leigh', 'stevenson', 'tamalpais'];
    const games = [
      ...roundRobin(four, () => [2, 1]),
      game({ home: 'del-mar', away: 'mitty', hs: 1, as: 3, league: false, official: null, date: '2026-10-01' }),
      game({ home: 'del-mar', away: 'leigh', hs: 1, as: 3, league: false, official: null, date: '2026-10-02' }),
      game({ home: 'del-mar', away: 'stevenson', hs: 1, as: 3, league: false, official: null, date: '2026-10-03' }),
      game({ home: 'del-mar', away: 'tamalpais', hs: 1, as: 0, league: false, official: null, forfeit: true, date: '2026-10-04' }),
    ];
    const v = buildLeadersView(sources(games));
    const slugs = (id: string) => v.schools.find((b) => b.id === id)!.rows.map((r) => r.team.slug);
    // gp: the four 7 each, Del Mar 4 → median 7, minimum 4.
    expect(v.schools.find((b) => b.id === 'best-record')!.meta).toBe('At least 4 games');
    expect(slugs('best-record')).toContain('del-mar');
    expect(slugs('most-goals')).not.toContain('del-mar');
    expect(slugs('fewest-goals-allowed')).not.toContain('del-mar');
    expect(v.schoolNotes).toContain(
      'Records need at least 4 results, half the median of 7.',
    );
    expect(v.schoolNotes).toContain(
      'Goals per game need at least 4 games with goals counted (a forfeit has none); not there yet: Del Mar (3).',
    );
  });

  it('keeps one note for records and goals per game when no forfeit separates them', () => {
    const games = roundRobin(['mitty', 'leigh', 'stevenson'], () => [2, 1]);
    games.push(game({ home: 'del-mar', away: 'mitty', hs: 1, as: 3, league: false, official: null, date: '2026-10-01' }));
    const v = buildLeadersView(sources(games));
    expect(v.schoolNotes[0]).toBe(
      // 4 games each for the three, 1 for Del Mar: median 4, minimum 2.
      'Records and goals per game need at least 2 results, half the median of 4; not there yet: Del Mar (1).',
    );
  });

  it('says which part of the most-goals minimum is missing when the board is empty', () => {
    // Nobody has scored: every team qualifies on games, none has a goal.
    const scoreless = roundRobin(['mitty', 'leigh', 'stevenson'], () => [0, 0]);
    const goals = (g: Game[]) => buildLeadersView(sources(g)).schools.find((b) => b.id === 'most-goals')!;
    expect(goals(scoreless).rows).toEqual([]);
    expect(goals(scoreless).empty).toBe('None of the teams with at least 2 games has scored yet.');
    expect(goals([]).empty).toBe('No team has played 1 game yet.');
  });

  it('counts a tie for 1st too long to list instead of calling the board empty', () => {
    const keepers = Array.from({ length: BOARD_MAX_ROWS + 1 }, (_, i) => ({
      name: `Keeper ${String(i + 1).padStart(2, '0')}`,
      goalkeeping: { gamesPlayed: 3, shutouts: 1 },
    }));
    const v = buildLeadersView(
      sources([], [teamStats('mitty', { goalkeeping: ['gamesPlayed', 'shutouts'], players: keepers })]),
    );
    const cs = v.players.find((b) => b.id === 'most-clean-sheets')!;
    expect(cs.rows).toEqual([]);
    expect(cs.more).toBe(`${BOARD_MAX_ROWS + 1} goalkeepers share 1st, with 1 clean sheet each.`);
    const html = renderToStaticMarkup(createElement(LeaderBoardTable, { board: cs }));
    expect(html).toContain(cs.more);
    expect(html).not.toContain(cs.empty);
    expect(html).not.toContain('<table');
  });

  it('still says "more" when some of the board is listed above the long tie', () => {
    const keepers = [
      { name: 'Ace Able', goalkeeping: { gamesPlayed: 3, shutouts: 3 } },
      ...Array.from({ length: BOARD_MAX_ROWS }, (_, i) => ({
        name: `Keeper ${String(i + 1).padStart(2, '0')}`,
        goalkeeping: { gamesPlayed: 3, shutouts: 1 },
      })),
    ];
    const v = buildLeadersView(
      sources([], [teamStats('mitty', { goalkeeping: ['gamesPlayed', 'shutouts'], players: keepers })]),
    );
    const cs = v.players.find((b) => b.id === 'most-clean-sheets')!;
    expect(cs.rows.map((r) => r.name)).toEqual(['Ace Able']);
    expect(cs.more).toBe(`${BOARD_MAX_ROWS} more goalkeepers share 2nd, with 1 clean sheet each.`);
  });
});

// ---------------------------------------------------------------- markup

describe('LeaderBoardTable and the /leaders page', () => {
  it('renders a shared place, a dash and the pinned-team hooks', () => {
    const games = [game({ home: 'mitty', away: 'leigh', hs: 2, as: 1, league: false })];
    const view = buildLeadersView(
      sources(games, [
        teamStats('mitty', {
          field: ['goals', 'assists', 'points'],
          players: [
            { name: 'Ana Ames', field: { goals: 5, assists: 2, points: 12 } },
            { name: 'Bea Bell', field: { goals: 4, assists: 4, points: 12 } },
          ],
        }),
        teamStats('leigh', { field: ['goals', 'points'], players: [{ name: 'Dee Dunn', field: { goals: 1, points: 2 } }] }),
      ]),
    );
    const html = renderToStaticMarkup(createElement(LeaderBoardTable, { board: view.players[0] }));
    expect(html).toContain('<section id="most-points"');
    expect(html).toContain('<caption class="sr-only">Most points, players in all four leagues, this season</caption>');
    expect(html).toContain('<span aria-hidden="true">T1</span><span class="sr-only">tied for 1st</span>');
    expect(html).toContain('data-team-slug="leigh"');
    expect(html).toContain('<span class="sx-pin-note">Your team’s player. </span>');
    // Dee Dunn's assists are not tracked: a dash with words, not a 0.
    expect(html).toContain('<span aria-hidden="true">—</span><span class="sr-only">not recorded</span>');
    expect(html).toContain('href="/teams/leigh#player-stats"');
  });

  it('renders both sections and every board anchor', () => {
    const html = renderToStaticMarkup(LeadersPage());
    expect(html).toMatch(/<section id="players"/);
    expect(html).toMatch(/<section id="schools"/);
    for (const id of [...PLAYER_IDS, ...SCHOOL_IDS]) expect(html, id).toContain(`<section id="${id}"`);
    expect(html).toContain('<h1');
    expect(html).not.toMatch(/eliminat/i);
  });
});
