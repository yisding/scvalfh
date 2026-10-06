/**
 * `components/leaders/leaders-view.ts`, `LeaderBoardTable` and the /leaders page (DESIGN §16).
 *
 * The page's promises: a player's number is the one on their team page and a school's record the one
 * in its standings row; a board ranks with shared places (1, 2, 2, 4) and lists the places to 10th
 * with every row tied for the last, however many, and a player board's places to 25th wait behind
 * "Show N more", the same way; a 0 or an untracked stat never
 * puts a player on a board; every team a board cannot cover is named; a school needs a minimum
 * number of results to lead a record or a rate; clean sheets leave forfeits out, as goals do; the
 * schools come first and the Elo board is the last of them.
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
  BOARD_PLACES,
  EXPANDED_PLACES,
  buildEloBoard,
  buildLeadersView,
  crossRegionFinals,
  getEloBoard,
  getEloBoardForTeam,
  qualifyingMinimum,
  rankBoard,
  type LeaderBoard,
  type LeaderSources,
  type LeadersView,
  type RegionLeadersView,
} from '../../components/leaders/leaders-view';
import { statText } from '../../components/teams/player-stats-view';
import { positionWords } from '../../components/ui/position-words';
import { getGames, getStandingFor, getTeams } from '../../lib/data';
import { gradeWord, recordString } from '../../lib/format';
import { regionOf } from '../../lib/leagues';
import { getAllPlayerStatsWithNotes } from '../../lib/player-stats';
import { getPriorSeason } from '../../lib/prior-season';
import { getEnrichedTeamRoster } from '../../lib/rosters';
import { computeRatings, getRatings } from '../../lib/ratings';
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
import { textOf } from './html-text';

const PLAYER_IDS = ['most-points', 'most-assists', 'most-saves', 'most-clean-sheets'];
const SCHOOL_IDS = ['best-record', 'best-league-record', 'most-goals', 'fewest-goals-allowed', 'school-clean-sheets', 'elo-rating'];

/** A view's NorCal half: the synthetic seasons below are NorCal teams' (SoCal's boards are empty there). */
const nc = (v: LeadersView): RegionLeadersView => v.regions.find((r) => r.region === 'norcal')!;
/** A view's SoCal half. */
const sc = (v: LeadersView): RegionLeadersView => v.regions.find((r) => r.region === 'socal')!;

/** The board's ranked cell, as printed. */
const ranked = (board: LeaderBoard, i: number) => board.rows[i].cells[board.rankedBy].text;

/** The ranking invariants every board keeps, whatever its data: the expanded rows rank on from the board's own. */
function expectRanked(board: LeaderBoard): void {
  for (const row of board.rows) expect(row.rank, `${board.id} ${row.key}`).toBeLessThanOrEqual(BOARD_PLACES);
  if (board.kind === 'school') expect(board.extra, board.id).toBeNull();
  if (board.extra) expect(board.extra.rows.length, board.id).toBeGreaterThan(0);
  // Places past 10th, and only those, are behind the disclosure.
  for (const row of board.extra?.rows ?? []) expect(row.rank, `${board.id} ${row.key}`).toBeGreaterThan(BOARD_PLACES);
  const rows = [...board.rows, ...(board.extra?.rows ?? [])];
  const value = (i: number) => rows[i].cells[board.rankedBy].text;
  expect(new Set(rows.map((r) => r.key)).size, `${board.id}: unique row keys`).toBe(rows.length);
  rows.forEach((row, i) => {
    expect(row.rank, `${board.id} row ${i}`).toBeLessThanOrEqual(EXPANDED_PLACES);
    const prev = rows[i - 1];
    const next = rows[i + 1];
    if (prev && prev.rank === row.rank) {
      expect(value(i), `${board.id}: a shared place shares its value`).toBe(value(i - 1));
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
  // What the boards read: MaxPreps' numbers with the coaches' game notes added (lib/note-stats.ts).
  const stats = getAllPlayerStatsWithNotes();
  /** A board's id without its region suffix: the same board in either region. */
  const unsuffixed = (id: string) => id.replace(/-socal$/, '');
  const teamsOf = (region: string) => getTeams().filter((t) => regionOf(t.league) === region);

  it('builds one half per region, NorCal first, each with four player boards and six school boards, the Elo board last', () => {
    expect(view.regions.map((r) => [r.region, r.shortName, r.idSuffix, r.schoolsId, r.playersId, r.leagueCount])).toEqual([
      ['norcal', 'NorCal', '', 'schools', 'players', 5],
      ['socal', 'SoCal', '-socal', 'schools-socal', 'players-socal', 4],
    ]);
    for (const r of view.regions) {
      expect(r.players.map((b) => b.id)).toEqual(PLAYER_IDS.map((id) => `${id}${r.idSuffix}`));
      expect(r.schools.map((b) => b.id)).toEqual(SCHOOL_IDS.map((id) => `${id}${r.idSuffix}`));
      const teams = teamsOf(r.region);
      expect(r.teamCount).toBe(teams.length);
      expect(r.statTeams).toBe(stats.filter((t) => t.players.length > 0 && teams.some((x) => x.slug === t.slug)).length);
    }
    expect(view.teamCount).toBe(getTeams().length);
    // One page renders both halves: every id is unique across them.
    const ids = view.regions.flatMap((r) => [r.schoolsId, r.playersId, ...r.players.map((b) => b.id), ...r.schools.map((b) => b.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ranks every board with shared places, keeps to its cap, and lists only its own region’s teams', () => {
    for (const r of view.regions) {
      const slugs = new Set(teamsOf(r.region).map((t) => t.slug));
      for (const board of [...r.players, ...r.schools]) {
        expectRanked(board);
        expect(board.columns[board.rankedBy], board.id).toBeDefined();
        // SoCal's boards also take the LA independents (DESIGN §24.9), named after the leagues,
        // except the league-record board: a team that plays no league games has no league record to rank.
        const leagueOnly = board.id.startsWith('best-league-record');
        const independents = r.independentCount > 0 && !leagueOnly ? ' and five independents' : '';
        expect(board.caption, board.id).toContain(
          `in all ${r.leagueCount === 5 ? 'five' : 'four'} ${r.shortName} leagues${independents}, this season`,
        );
        for (const row of [...board.rows, ...(board.extra?.rows ?? [])]) {
          expect(row.cells, `${board.id} ${row.key}`).toHaveLength(board.columns.length);
          expect(slugs.has(row.team.slug), `${board.id}: ${row.team.slug} is a ${r.shortName} team`).toBe(true);
        }
      }
    }
  });

  it("prints each player's number exactly as the team's player stats hold it, and only above 0", () => {
    const stat: Record<string, { block: 'field' | 'goalkeeping'; key: string }> = {
      'most-points': { block: 'field', key: 'points' },
      'most-assists': { block: 'field', key: 'assists' },
      'most-saves': { block: 'goalkeeping', key: 'saves' },
      'most-clean-sheets': { block: 'goalkeeping', key: 'shutouts' },
    };
    for (const r of view.regions) {
      const regionSlugs = new Set(teamsOf(r.region).map((t) => t.slug));
      for (const board of r.players) {
        const { block, key } = stat[unsuffixed(board.id)];
        const tracking = stats.filter(
          (t) => regionSlugs.has(t.slug) && t.players.length > 0 && (t.tracked[block] as string[]).includes(key),
        );
        expect(board.meta, board.id).toBe(`From ${tracking.length} ${tracking.length === 1 ? 'team' : 'teams'}`);
        [...board.rows, ...(board.extra?.rows ?? [])].forEach((row) => {
          const team = stats.find((t) => t.slug === row.team.slug)!;
          expect((team.tracked[block] as string[]).includes(key), `${board.id}: ${row.team.slug} tracks ${key}`).toBe(true);
          const player = team.players.find((p) => p.fullName === row.name)!;
          expect(player, `${board.id}: ${row.name}`).toBeDefined();
          const value = (player[block] as Record<string, number | null> | null)?.[key] ?? null;
          expect(value, `${board.id}: ${row.name}`).toBeGreaterThan(0);
          expect(row.cells[board.rankedBy].text, `${board.id}: ${row.name}`).toBe(statText(value));
          expect(row.team.href, row.name).toBe(`/teams/${row.team.slug}#player-stats`);
        });
      }
    }
  });

  it("prints each player's grade and position exactly as the team page's roster has them", () => {
    let withFacts = 0;
    for (const board of view.regions.flatMap((r) => r.players)) {
      for (const row of [...board.rows, ...(board.extra?.rows ?? [])]) {
        const line = stats.find((t) => t.slug === row.team.slug)!.players.find((p) => p.fullName === row.name)!;
        const rosterRow = getEnrichedTeamRoster(row.team.slug)!.players.find(
          (p) => line.athleteId !== null && p.athleteId === line.athleteId,
        );
        const expected = rosterRow
          ? [
              ...(rosterRow.grade !== null ? [gradeWord(rosterRow.grade)] : []),
              ...(rosterRow.positions.length > 0 ? [positionWords(rosterRow.positions)] : []),
            ]
          : [];
        expect(row.facts, `${board.id}: ${row.name}`).toEqual(expected);
        if (row.facts.length > 0) withFacts += 1;
      }
    }
    // The join works: most listed players have a roster row with a grade or a position.
    expect(withFacts).toBeGreaterThan(0);
  });

  it("prints each school's record as its standings row has it, and only for a school past its region's minimum", () => {
    const minOf = (board: LeaderBoard) => Number(/At least (\d+)/.exec(board.meta)![1]);
    for (const r of view.regions) {
      const record = r.schools.find((b) => unsuffixed(b.id) === 'best-record')!;
      const league = r.schools.find((b) => unsuffixed(b.id) === 'best-league-record')!;
      // The minimum is the region's: half the median of its own teams' games.
      const gps = teamsOf(r.region).map((t) => getStandingFor(t.slug)!.overall.gp);
      expect(minOf(record), r.region).toBe(qualifyingMinimum(gps).min);
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
    }
  });

  it('counts a school clean sheet from the finals, forfeits left out', () => {
    for (const board of view.regions.map((r) => r.schools.find((b) => unsuffixed(b.id) === 'school-clean-sheets')!)) {
      for (const row of board.rows) {
        const team = getTeamBySlug(row.team.slug)!;
        const shutouts = getGames({ teamId: team.slug, status: 'final' }).filter((g) => {
          const theirs = g.home.teamId === team.id ? g.away : g.home;
          return !g.isForfeit && theirs.score === 0;
        }).length;
        expect(row.cells[board.rankedBy].text, row.team.slug).toBe(String(shutouts));
      }
    }
  });

  it('prints each school’s Elo rating from the ONE table over all 99, only past its region’s minimum, linking to its card', () => {
    const bySlug = new Map(getRatings().ratings.map((r) => [r.slug, r]));
    for (const r of view.regions) {
      const board = r.schools.find((b) => unsuffixed(b.id) === 'elo-rating')!;
      expect(board.id).toBe(`elo-rating${r.idSuffix}`);
      const min = Number(/At least (\d+)/.exec(board.meta)![1]);
      expect(board.columns.map((c) => c.label)).toEqual(['GP', 'Elo']);
      for (const row of board.rows) {
        const rating = bySlug.get(row.team.slug)!;
        expect(row.cells.map((c) => c.text), row.team.slug).toEqual([String(rating.games), String(rating.elo)]);
        expect(rating.games, row.team.slug).toBeGreaterThanOrEqual(min);
        expect(row.team.href, row.team.slug).toBe(`/teams/${row.team.slug}#elo`);
      }
      // Every rated team of the region under the minimum is named in the region's notes, with its games.
      const slugs = new Set(teamsOf(r.region).map((t) => t.slug));
      const below = getRatings().ratings.filter((x) => slugs.has(x.slug) && x.games > 0 && x.games < min);
      const note = r.schoolNotes.find((n) => n.startsWith('The Elo board needs'));
      for (const x of below) expect(note, x.slug).toContain(`${getTeamBySlug(x.slug)!.name} (${x.games})`);
      // The bundled board each team page reads its place from is this one.
      expect(getEloBoard(r.region).board).toEqual(board);
      expect(board.note, r.region).toContain(view.crossRegion.sentence);
    }
  });

  it('counts the finals that link NorCal and SoCal at build time, this season and last', () => {
    const teams = getTeams();
    const region = new Map(teams.map((t) => [t.id, regionOf(t.league)]));
    const across = (a: string | null, b: string | null) => a !== null && b !== null && region.has(a) && region.has(b) && region.get(a) !== region.get(b);
    const thisSeason = getGames({ status: 'final' }).filter(
      (g) => !g.isForfeit && g.home.score !== null && g.away.score !== null && across(g.home.teamId, g.away.teamId),
    ).length;
    const lastSeason = getPriorSeason()!.games.filter((g) => across(g.homeId, g.awayId)).length;
    expect([view.crossRegion.thisSeason, view.crossRegion.lastSeason]).toEqual([thisSeason, lastSeason]);
    expect(view.crossRegion.sentence).toBe(
      `The ratings are on one scale across all nine leagues and the Southern Section’s five independents; comparisons between NorCal and SoCal rest on ${thisSeason} final${thisSeason === 1 ? '' : 's'} between the regions this season and ${lastSeason} last season, so treat them as rough.`,
    );
  });

  it('names every team of a region with no player stats, so no player board reads as all of them', () => {
    for (const r of view.regions) {
      const none = teamsOf(r.region).filter((t) => !stats.some((s) => s.slug === t.slug && s.players.length > 0));
      for (const team of none) expect(r.playerNotes[0], team.slug).toContain(team.name);
    }
  });
});

// ---------------------------------------------------------------- ranking and the minimum

describe('rankBoard and qualifyingMinimum', () => {
  const same = (a: number, b: number) => a === b;

  it('shares places and skips past them (1, 2, 2, 4)', () => {
    expect(rankBoard([9, 7, 7, 5], same).map((r) => [r.item, r.rank, r.tied])).toEqual([
      [9, 1, false],
      [7, 2, true],
      [7, 2, true],
      [5, 4, false],
    ]);
  });

  it(`keeps the places up to ${BOARD_PLACES}, a tie for the last one included`, () => {
    const values = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 11, 10, 9];
    const rows = rankBoard(values, same);
    expect(rows.map((r) => r.item)).toEqual([20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 11]);
    expect(rows.at(-1)!.rank).toBe(10);
  });

  it('lists a tie for the last place whole, however long', () => {
    const values = [9, 8, 7, 6, 5, 4, 3, 2, ...Array<number>(40).fill(1), 0];
    const rows = rankBoard(values, same);
    expect(rows.map((r) => r.item)).toEqual(values.slice(0, -1));
    expect(rows.slice(8).every((r) => r.rank === 9 && r.tied)).toBe(true);
    // A tie for 1st is the whole board, never an empty one.
    expect(rankBoard(Array<number>(30).fill(4), same)).toHaveLength(30);
  });

  it(`goes on to ${EXPANDED_PLACES} places when asked, from the same first rows`, () => {
    const values = Array.from({ length: 40 }, (_, i) => 40 - i);
    expect(rankBoard(values, same).map((r) => r.item)).toEqual(values.slice(0, BOARD_PLACES));
    const all = rankBoard(values, same, EXPANDED_PLACES);
    expect(all.map((r) => r.item)).toEqual(values.slice(0, EXPANDED_PLACES));
    expect(all.at(-1)!.rank).toBe(EXPANDED_PLACES);
    // A tie for 10th is listed whole on the board, and the expanded board goes on after it.
    const tie = [...values.slice(0, 9), ...Array<number>(8).fill(5), 4, 3];
    expect(rankBoard(tie, same).map((r) => r.item)).toEqual(tie.slice(0, 17));
    const expanded = rankBoard(tie, same, EXPANDED_PLACES);
    expect(expanded.map((r) => r.item)).toEqual(tie);
    expect(expanded.slice(9).map((r) => r.rank)).toEqual([...Array<number>(8).fill(10), 18, 19]);
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
    athleteId: `${slug}-a${i}`,
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
  const board = (id: string) => nc(view).schools.find((b) => b.id === id)!;

  it('leaves a school under the minimum off the record and rate boards, and names it', () => {
    const record = board('best-record');
    // gp: mitty 7, stevenson 7, leigh 7, tamalpais 6, del-mar 1 → median 7, minimum 4.
    expect(record.meta).toBe('At least 4 games');
    expect(record.rows.map((r) => r.team.slug)).not.toContain('del-mar');
    expect(board('most-goals').rows.map((r) => r.team.slug)).not.toContain('del-mar');
    expect(nc(view).schoolNotes[0]).toContain('Del Mar (1)');
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
    expect(nc(view).schoolNotes.find((n) => n.startsWith('The Elo board needs'))).toBe(
      'The Elo board needs at least 3 games against the nine leagues’ teams and the Southern Section’s five independents, half the median of 6; not there yet: Del Mar (1).',
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
    const note = nc(buildLeadersView({ ...sources(base), prior })).schools.find((b) => b.id === 'elo-rating')!.note;
    expect(note).toContain('rating (the same fit over last season’s 1 final), or from average if it had no counted 2025-26 final;');
    // The committed season seeds every rated team, so its note makes no such claim.
    expect(nc(buildLeadersView()).schools.find((b) => b.id === 'elo-rating')!.note).not.toContain('or from average');
  });

  it('starts the committed board from last season, and says so', () => {
    const board = nc(buildLeadersView()).schools.find((b) => b.id === 'elo-rating')!;
    expect(board.note).toContain(`started the season from its ${getPriorSeason().season} rating`);
  });

  it('shares an Elo place between equal ratings', () => {
    const v = buildLeadersView(sources(roundRobin(four, () => [2, 2])));
    const elo = nc(v).schools.find((b) => b.id === 'elo-rating')!;
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
    const allowed = nc(v).schools.find((b) => b.id === 'fewest-goals-allowed')!;
    expect(allowed.rows.map((r) => [r.rank, r.tied])).toEqual([
      [1, true],
      [1, true],
      [1, true],
      [1, true],
    ]);
    expect(allowed.rows.map((r) => r.name)).toEqual([...allowed.rows.map((r) => r.name)].sort((a, b) => a.localeCompare(b)));
    // A season of draws keeps no clean sheet at all: the board says so instead of an empty table.
    const cs = nc(v).schools.find((b) => b.id === 'school-clean-sheets')!;
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
  const board = (id: string) => nc(view).players.find((b) => b.id === id)!;

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
    expect(nc(view).statTeams).toBe(3);
    expect(nc(view).playerNotes[0]).toContain('3 of the 49 teams have entered some.');
    expect(nc(view).playerNotes[0]).toContain('Los Gatos');
    expect(nc(view).playerNotes[0]).not.toContain('Saint Francis');
    expect(nc(view).playerNotes[1]).toBe(
      'Totals lag the scores where a coach has not entered the latest games: Archbishop Mitty (1 game since Sat Sep 19).',
    );
  });

  it("prints a player's grade and position as the roster has them, and only the ones it has", () => {
    const v = buildLeadersView({
      ...sources(games, stats),
      rosters: [
        {
          slug: 'mitty',
          players: [
            { athleteId: 'mitty-a0', grade: 12, positions: ['F', 'M'] },
            { athleteId: 'mitty-a1', grade: null, positions: ['D'] },
            { athleteId: 'mitty-a3', grade: 10, positions: [] },
          ],
        },
      ],
    });
    const facts = (id: string) =>
      Object.fromEntries(nc(v).players.find((b) => b.id === id)!.rows.map((r) => [r.name, r.facts]));
    expect(facts('most-points')).toEqual({
      'Dee Dunn': [],
      'Ana Ames': ['Senior', 'Forward / Midfield'],
      'Bea Bell': ['Defense'],
      'Eve Eck': [],
    });
    expect(facts('most-saves')['Gia Gray']).toEqual(['Sophomore']);
    // Printed after the school and league, each part kept whole, as the roster prints them: on a
    // line of their own below 640px (the first dot hidden there), on the school's line from it.
    const html = renderToStaticMarkup(
      createElement(LeaderBoardTable, { board: nc(v).players.find((b) => b.id === 'most-points')! }),
    );
    expect(html).toContain(
      '<span class="whitespace-nowrap">SCVAL</span><span class="block sm:inline">' +
        '<span class="hidden sm:inline">\u00a0<span aria-hidden="true">·</span> </span><span class="whitespace-nowrap">Senior</span>' +
        '\u00a0<span aria-hidden="true">·</span> <span class="whitespace-nowrap">Forward / Midfield</span></span>',
    );
    // No rosters given: no facts, never a guess.
    expect(board('most-points').rows.every((r) => r.facts.length === 0)).toBe(true);
    for (const b of nc(v).schools) for (const r of b.rows) expect(r.facts, b.id).toEqual([]);
  });

  it('says why a board is empty rather than drawing an empty table', () => {
    const v = buildLeadersView(sources([], []));
    for (const b of nc(v).players) {
      expect(b.rows, b.id).toEqual([]);
      expect(b.empty, b.id).toMatch(/^No team enters .+ on MaxPreps yet\.$/);
    }
    expect(nc(v).schoolNotes).toEqual([]);
    expect(nc(v).resultsThrough).toBeNull();
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
      nc(v).schools.find((b) => b.id === id)!.rows.map((r) => [r.rank, r.tied, r.team.slug, r.cells[0].text]);
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
      expect(nc(v).schools.find((b) => b.id === id)!.note, id).toContain('Equal rates are split by more games played.');
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
    const slugs = (id: string) => nc(v).schools.find((b) => b.id === id)!.rows.map((r) => r.team.slug);
    // gp: the four 7 each, Del Mar 4 → median 7, minimum 4.
    expect(nc(v).schools.find((b) => b.id === 'best-record')!.meta).toBe('At least 4 games');
    expect(slugs('best-record')).toContain('del-mar');
    expect(slugs('most-goals')).not.toContain('del-mar');
    expect(slugs('fewest-goals-allowed')).not.toContain('del-mar');
    expect(nc(v).schoolNotes).toContain(
      'Records need at least 4 results, half the median of 7.',
    );
    expect(nc(v).schoolNotes).toContain(
      'Goals per game need at least 4 games with goals counted (a forfeit has none); not there yet: Del Mar (3).',
    );
  });

  it('keeps one note for records and goals per game when no forfeit separates them', () => {
    const games = roundRobin(['mitty', 'leigh', 'stevenson'], () => [2, 1]);
    games.push(game({ home: 'del-mar', away: 'mitty', hs: 1, as: 3, league: false, official: null, date: '2026-10-01' }));
    const v = buildLeadersView(sources(games));
    expect(nc(v).schoolNotes[0]).toBe(
      // 4 games each for the three, 1 for Del Mar: median 4, minimum 2.
      'Records and goals per game need at least 2 results, half the median of 4; not there yet: Del Mar (1).',
    );
  });

  it('says which part of the most-goals minimum is missing when the board is empty', () => {
    // Nobody has scored: every team qualifies on games, none has a goal.
    const scoreless = roundRobin(['mitty', 'leigh', 'stevenson'], () => [0, 0]);
    const goals = (g: Game[]) => nc(buildLeadersView(sources(g))).schools.find((b) => b.id === 'most-goals')!;
    expect(goals(scoreless).rows).toEqual([]);
    expect(goals(scoreless).empty).toBe('None of the teams with at least 2 games has scored yet.');
    expect(goals([]).empty).toBe('No team has played 1 game yet.');
  });

  it('lists every goalkeeper in a long tie for 1st on the board, with nothing to expand', () => {
    const keepers = Array.from({ length: 31 }, (_, i) => ({
      name: `Keeper ${String(i + 1).padStart(2, '0')}`,
      goalkeeping: { gamesPlayed: 3, shutouts: 1 },
    }));
    const v = buildLeadersView(
      sources([], [teamStats('mitty', { goalkeeping: ['gamesPlayed', 'shutouts'], players: keepers })]),
    );
    const cs = nc(v).players.find((b) => b.id === 'most-clean-sheets')!;
    expect(cs.rows.map((r) => [r.rank, r.tied])).toEqual(Array(31).fill([1, true]));
    expect(cs.extra).toBeNull();
    const html = renderToStaticMarkup(createElement(LeaderBoardTable, { board: cs }));
    expect(html.match(/data-team-slug="mitty"/g)).toHaveLength(31);
    expect(html).not.toContain(cs.empty);
    expect(html).not.toContain('<details');
  });

  it('lists a long tie for 2nd on the board after the leader', () => {
    const keepers = [
      { name: 'Ace Able', goalkeeping: { gamesPlayed: 3, shutouts: 3 } },
      ...Array.from({ length: 20 }, (_, i) => ({
        name: `Keeper ${String(i + 1).padStart(2, '0')}`,
        goalkeeping: { gamesPlayed: 3, shutouts: 1 },
      })),
    ];
    const v = buildLeadersView(
      sources([], [teamStats('mitty', { goalkeeping: ['gamesPlayed', 'shutouts'], players: keepers })]),
    );
    const cs = nc(v).players.find((b) => b.id === 'most-clean-sheets')!;
    expectRanked(cs);
    expect(cs.rows.map((r) => r.name)).toEqual(['Ace Able', ...keepers.slice(1).map((k) => k.name)]);
    expect(cs.rows.slice(1).every((r) => r.rank === 2 && r.tied)).toBe(true);
    expect(cs.extra).toBeNull();
  });

  it('lists a long tie on a school board too', () => {
    // Sixteen teams in a ring, each hosting the next and winning 1-0: one clean sheet each, all tied.
    const slugs = TEAMS.slice(0, 16).map((t) => t.slug);
    const ring = slugs.map((home, i) =>
      game({ home, away: slugs[(i + 1) % 16], hs: 1, as: 0, league: false, date: `2026-09-${String(i + 1).padStart(2, '0')}` }),
    );
    const cs = nc(buildLeadersView(sources(ring))).schools.find((b) => b.id === 'school-clean-sheets')!;
    expectRanked(cs);
    expect(cs.rows.map((r) => [r.rank, r.tied, r.cells[cs.rankedBy].text])).toEqual(Array(16).fill([1, true, '1']));
  });
});

// ---------------------------------------------------------------- the expanded player boards

describe('buildLeadersView — player boards past 10th', () => {
  /** One team of `points.length` players, "Player 01" … in order, with these points. */
  const pointsBoard = (points: number[]) =>
    buildLeadersView(
      sources(
        [],
        [
          teamStats('mitty', {
            field: ['points'],
            players: points.map((p, i) => ({ name: `Player ${String(i + 1).padStart(2, '0')}`, field: { points: p } })),
          }),
        ],
      ),
    ).regions[0].players.find((b) => b.id === 'most-points')!;

  it(`lists the top ${BOARD_PLACES} and keeps the places to ${EXPANDED_PLACES} behind "Show N more"`, () => {
    const board = pointsBoard(Array.from({ length: 30 }, (_, i) => 30 - i));
    expectRanked(board);
    expect(board.rows.map((r) => r.rank)).toEqual(Array.from({ length: BOARD_PLACES }, (_, i) => i + 1));
    expect(board.extra).toMatchObject({
      summary: 'Show 15 more players',
      caption: 'Most points, players in all five NorCal leagues, this season, continued',
    });
    expect(board.extra!.rows.map((r) => [r.rank, r.name, r.cells[board.rankedBy].text])).toEqual(
      Array.from({ length: 15 }, (_, i) => [i + 11, `Player ${i + 11}`, String(20 - i)]),
    );
  });

  it('has nothing to expand when the board lists every player', () => {
    expect(pointsBoard([5, 4, 3]).extra).toBeNull();
    expect(pointsBoard(Array.from({ length: BOARD_PLACES }, (_, i) => 20 - i)).extra).toBeNull();
    // One more player is one more row, not "the top 25".
    expect(pointsBoard(Array.from({ length: BOARD_PLACES + 1 }, (_, i) => 20 - i)).extra!.summary).toBe('Show 1 more player');
  });

  it('lists a long tie for 10th on the board, and goes on after it behind the disclosure', () => {
    // Nine places, then eight players on 10 points: all 17 rows are the board's own.
    const board = pointsBoard([30, 29, 28, 27, 26, 25, 24, 23, 22, ...Array<number>(8).fill(10), 9, 8]);
    expectRanked(board);
    expect(board.rows).toHaveLength(17);
    expect(board.rows.slice(9).every((r) => r.rank === 10 && r.tied)).toBe(true);
    expect(board.extra!.summary).toBe('Show 2 more players');
    expect(board.extra!.rows.map((r) => [r.rank, r.tied])).toEqual([
      [18, false],
      [19, false],
    ]);
  });

  it('lists a long tie for 11th whole behind the disclosure', () => {
    // Ten places, then 21 players on 1 point.
    const board = pointsBoard([...Array.from({ length: 10 }, (_, i) => 30 - i), ...Array<number>(21).fill(1)]);
    expectRanked(board);
    expect(board.rows).toHaveLength(10);
    expect(board.extra!.summary).toBe('Show 21 more players');
    expect(board.extra!.rows.map((r) => [r.rank, r.tied])).toEqual(Array(21).fill([11, true]));
  });

  it('lists a long tie for 25th whole behind the disclosure, and no one after it', () => {
    // 24 places, then seven players on 2 points, then one on 1.
    const board = pointsBoard([...Array.from({ length: 24 }, (_, i) => 30 - i), ...Array<number>(7).fill(2), 1]);
    expectRanked(board);
    expect(board.extra!.rows.map((r) => r.rank)).toEqual([
      ...Array.from({ length: 14 }, (_, i) => i + 11),
      ...Array<number>(7).fill(25),
    ]);
  });

  it('renders the extra rows in a closed disclosure under the board, as a second table', () => {
    const board = pointsBoard(Array.from({ length: 30 }, (_, i) => 30 - i));
    const html = renderToStaticMarkup(createElement(LeaderBoardTable, { board }));
    expect(html).toContain('<details class="sx-disclosure mt-1"><summary>Show 15 more players</summary>');
    expect(html).not.toContain('<details open');
    expect(html.match(/<table/g)).toHaveLength(2);
    expect(html.match(/data-team-slug="mitty"/g)).toHaveLength(25);
    const [top, rest] = html.split('<details');
    expect(top).toContain('Player 10');
    expect(top).not.toContain('Player 11');
    expect(rest).toContain('<caption class="sr-only">Most points, players in all five NorCal leagues, this season, continued</caption>');
    expect(rest).toContain('Player 11');
    expect(rest).toContain('Player 25');
    expect(rest).not.toContain('Player 26');
    // The board's note still closes the board, under the disclosure.
    expect(rest).toContain(board.note);
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
    const html = renderToStaticMarkup(createElement(LeaderBoardTable, { board: nc(view).players[0] }));
    expect(html).toContain('<section id="most-points"');
    expect(html).toContain('<caption class="sr-only">Most points, players in all five NorCal leagues, this season</caption>');
    expect(html).toContain('<span aria-hidden="true">T1</span><span class="sr-only">tied for 1st</span>');
    expect(html).toContain('data-team-slug="leigh"');
    expect(html).toContain('<span class="sx-pin-note">Your team’s player. </span>');
    // Dee Dunn's assists are not tracked: a dash with words, not a 0.
    expect(html).toContain('<span aria-hidden="true">—</span><span class="sr-only">not recorded</span>');
    expect(html).toContain('href="/teams/leigh#player-stats"');
  });

  it('renders each region’s two sections, NorCal first, the schools first in each, every board anchor in order', () => {
    // The page is app/leaders/page.tsx's (DESIGN-socal §2.4): both regions render, NorCal first (the reading
    // order with JavaScript off), each region's ids suffixed as buildLeadersView names them.
    const html = renderToStaticMarkup(LeadersPage());
    const view = buildLeadersView();
    const at = (id: string) => html.indexOf(`<section id="${id}"`);
    const order = view.regions.flatMap((r) => [
      r.schoolsId, ...r.schools.map((b) => b.id), r.playersId, ...r.players.map((b) => b.id),
    ]);
    expect(order.slice(0, 2)).toEqual(['schools', ...SCHOOL_IDS.slice(0, 1)]);
    for (const id of order) expect(at(id), id).toBeGreaterThanOrEqual(0);
    expect(order.map(at)).toEqual(order.map(at).sort((a, b) => a - b));
    // The jump links follow the sections.
    expect(html.indexOf('href="#schools"')).toBeLessThan(html.indexOf('href="#players"'));
    expect(html).toContain('<h1');
    expect(html).not.toMatch(/eliminat/i);
    // With JS off all four pills show: each names its region to a screen reader, visible text first.
    for (const [id, words] of [
      ['schools', 'Schools, Northern California'],
      ['players', 'Players, Northern California'],
      ['schools-socal', 'Schools, Southern California'],
      ['players-socal', 'Players, Southern California'],
    ] as const) {
      const pill = html.match(new RegExp(`<a href="#${id}"[^>]*>([\\s\\S]*?)</a>`))![1];
      // textOf puts a space where each tag was: 'Schools , Southern California'.
      expect(textOf(pill).replace(/\s+/g, ' ').replace(/ ,/g, ',').trim(), `app/leaders/page.tsx #${id}`).toBe(words);
      expect(pill).toContain(`<span class="sr-only">${words.slice(words.indexOf(','))}</span>`);
    }
  });

  it('counts the leagues from config: nine and the independents on one Elo scale, five NorCal and four SoCal (and five independents) on the boards', () => {
    const text = textOf(renderToStaticMarkup(LeadersPage()));
    expect(text, 'components/leaders/leaders-view.ts captions').toMatch(/players in all five NorCal leagues, this season/);
    expect(text, 'components/leaders/leaders-view.ts captions').toMatch(/schools in all five NorCal leagues, this season/);
    expect(text, 'components/leaders/leaders-view.ts captions').toMatch(/schools in all four SoCal leagues and five independents, this season/);
    expect(text, 'components/leaders/leaders-view.ts Elo note').toContain('on one scale across all nine leagues and the Southern Section’s five independents');
    expect(text, 'components/leaders/leaders-view.ts').not.toMatch(/all (four|five) leagues|\bten leagues\b|\b10 leagues\b/);
    expect(text, 'app/leaders/page.tsx eyebrow').toContain('All nine leagues and five independents');
  });
});

// ---------------------------------------------------------------- per region (DESIGN-socal §2.3)

describe('buildLeadersView — each region its own boards, one Elo scale', () => {
  // NorCal: Mitty, Leigh and Stevenson play each other twice (4 games each). SoCal: La Jolla, Torrey Pines,
  // Bonita and Marina play once each pair (3 each), and Great Oak plays Bonita once. One final links the
  // regions: Mitty at La Jolla.
  const norcal = roundRobin(['mitty', 'leigh', 'stevenson'], (h, a) => (h === 'mitty' ? [3, 0] : a === 'mitty' ? [0, 2] : [1, 1]));
  const socalTeams = ['la-jolla', 'torrey-pines', 'bonita', 'marina'];
  const socal: Game[] = [];
  let day = 1;
  for (let i = 0; i < socalTeams.length; i += 1) {
    for (let j = i + 1; j < socalTeams.length; j += 1) {
      socal.push(game({ home: socalTeams[i], away: socalTeams[j], hs: 2, as: 1, league: false, date: `2026-10-${String(day++).padStart(2, '0')}` }));
    }
  }
  socal.push(game({ home: 'great-oak', away: 'bonita', hs: 0, as: 1, league: false, date: '2026-10-20' }));
  const bridge = game({ home: 'la-jolla', away: 'mitty', hs: 1, as: 4, league: false, date: '2026-10-21' });
  const games = [...norcal, ...socal, bridge];
  const view = buildLeadersView(sources(games));

  it('ranks each region’s schools on its own boards, with suffixed ids and its own captions', () => {
    const north = nc(view);
    const south = sc(view);
    const record = south.schools.find((b) => b.id === 'best-record-socal')!;
    expect(record.caption).toBe('Best record, schools in all four SoCal leagues and five independents, this season');
    expect(south.schools.find((b) => b.id === 'best-league-record-socal')!.caption).toBe(
      'Best league record, schools in all four SoCal leagues, this season',
    );
    expect(record.rows.map((r) => r.team.slug).sort()).toEqual(['bonita', 'la-jolla', 'marina', 'torrey-pines']);
    expect(north.schools.find((b) => b.id === 'best-record')!.rows.map((r) => r.team.slug).sort()).toEqual(['leigh', 'mitty', 'stevenson']);
    expect(south.players.map((b) => b.id)).toEqual(PLAYER_IDS.map((id) => `${id}-socal`));
    expect(south.teamCount).toBe(53);
    expect(north.teamCount).toBe(49);
  });

  it('sets each region’s minimum from its own teams', () => {
    // NorCal: Mitty 5 (with the bridge), Leigh 4, Stevenson 4 → median 4, minimum 2.
    expect(nc(view).schools.find((b) => b.id === 'best-record')!.meta).toBe('At least 2 games');
    // SoCal: La Jolla 4, Torrey Pines 3, Bonita 4, Marina 3, Great Oak 1 → median 3, minimum 2; Great Oak waits.
    const south = sc(view);
    expect(south.schools.find((b) => b.id === 'best-record-socal')!.meta).toBe('At least 2 games');
    expect(south.schoolNotes[0]).toBe('Records and goals per game need at least 2 results, half the median of 3; not there yet: Great Oak (1).');
    expect(south.resultsThrough).toBe('Wed Oct 21');
  });

  it('reads both Elo boards off one fit over every team, and says how few finals link the regions', () => {
    const table = computeRatings(TEAMS, games, null);
    const bySlug = new Map(table.ratings.map((r) => [r.slug, r]));
    for (const r of view.regions) {
      const board = r.schools.find((b) => b.id === `elo-rating${r.idSuffix}`)!;
      expect(board.rows.length, r.region).toBeGreaterThan(0);
      for (const row of board.rows) {
        expect(row.cells[1].text, row.team.slug).toBe(String(bySlug.get(row.team.slug)!.elo));
        expect(regionOf(getTeamBySlug(row.team.slug)!.league)).toBe(r.region);
      }
      expect(board.note).toContain(
        'The ratings are on one scale across all nine leagues and the Southern Section’s five independents; comparisons between NorCal and SoCal rest on 1 final between the regions this season and 0 last season, so treat them as rough.',
      );
      expect(board.note).toContain('Every final between two of the 102 teams, league or not, fitted at once');
    }
    expect(view.crossRegion).toMatchObject({ thisSeason: 1, lastSeason: 0 });
    // The rating La Jolla's board prints is the one the unified table gives it, not a SoCal-only refit.
    const alone = computeRatings(TEAMS, socal, null);
    expect(alone.ratings.find((x) => x.slug === 'la-jolla')!.elo).not.toBe(bySlug.get('la-jolla')!.elo);
  });

  it('counts last season’s cross-region finals from the prior season, between registry teams only', () => {
    const mitty = getTeamBySlug('mitty')!;
    const lj = getTeamBySlug('la-jolla')!;
    const leigh = getTeamBySlug('leigh')!;
    const prior = {
      ...getPriorSeason()!,
      games: [
        { contestId: 'p1', date: '2025-09-10', homeId: mitty.id, homeSlug: 'mitty', awayId: lj.id, awaySlug: 'la-jolla', homeScore: 2, awayScore: 0, site: 'home' as const },
        { contestId: 'p2', date: '2025-09-11', homeId: mitty.id, homeSlug: 'mitty', awayId: leigh.id, awaySlug: 'leigh', homeScore: 2, awayScore: 0, site: 'home' as const },
      ],
    };
    expect(crossRegionFinals(TEAMS, games, prior)).toMatchObject({ thisSeason: 1, lastSeason: 1 });
    expect(crossRegionFinals(TEAMS, games, null)).toMatchObject({ thisSeason: 1, lastSeason: 0 });
  });

  it('builds a single-region board with no cross-region sentence when the sources hold one region only', () => {
    const nor = TEAMS.filter((t) => regionOf(t.league) === 'norcal');
    const v = buildLeadersView({ ...sources(norcal), teams: nor, stats: [] });
    expect(v.regions.map((r) => r.region)).toEqual(['norcal']);
    expect(nc(v).schools.find((b) => b.id === 'elo-rating')!.note).not.toContain('NorCal and SoCal');
    const elo = buildEloBoard(nor, computeRatings(nor, norcal, null));
    expect(elo.board.id).toBe('elo-rating');
    expect(elo.board.note).not.toContain('NorCal and SoCal');
  });

  it('gives a team page its own region’s bundled board', () => {
    expect(getEloBoardForTeam(getTeamBySlug('la-jolla')!)).toBe(getEloBoard('socal'));
    expect(getEloBoardForTeam(getTeamBySlug('mitty')!)).toBe(getEloBoard('norcal'));
    expect(getEloBoard('socal').board.id).toBe('elo-rating-socal');
  });
});
