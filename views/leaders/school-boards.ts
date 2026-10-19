/**
 * The /leaders school boards (data/snapshot.json): best record, best league record, goals scored per game
 * raw and Elo-adjusted, goals allowed per game, clean sheets, and last the highest Elo rating (elo-board.ts,
 * DESIGN §23), plus the notes under them. Records are the `Standing` rows the standings and team pages
 * print (`overall` is every final, `computed` the league games the table counts), so a team's record here
 * is its record everywhere. The independents' table is their league (DESIGN §29): their games against
 * each other are their league record, so they rank on the league-record board like any league's teams.
 * Clean sheets and the per-game rates come from the same finals, with forfeits
 * left out of goals as lib/engine/standings/record.ts leaves them out (DESIGN §11.6). Records and rates need a minimum
 * number of results (ranking.ts qualifyingMinimum); the teams below it are named in the notes.
 *
 * The Elo-adjusted goals board (lib/engine/adjusted-scoring.ts) weighs each game by the opponent's defense: its
 * rating in the one Elo table, corrected by the goals it has allowed. It counts the games the Elo rating
 * counts, past the Elo board's minimum.
 */

import type { AdjustedScoring } from '@/lib/engine/adjusted-scoring';
import { recordString, recordWords, signedGd, winPct } from '@/lib/format/numbers';
import { listWords, plural } from '@/lib/format/words';
import type { Game } from '@/lib/model/game';
import type { TeamId } from '@/lib/model/ids';
import type { ComputedRecord, Standing } from '@/lib/model/standings';
import type { Team } from '@/lib/model/team';
import { sideView } from '@/lib/shared/game';

import { UNADJUSTED_NOTE, num, schoolBoard } from './board';
import type { EloBoardView } from './elo-board';
import { byName, qualifyingMinimum } from './ranking';
import { AND_INDEPENDENTS, LEAGUE_COUNT, type BoardScope } from './scope';
import type { LeaderBoard, LeaderCell } from './types';

interface SchoolLine {
  team: Team;
  overall: ComputedRecord;
  league: ComputedRecord;
  /** Finals whose goals count: forfeits are left out (DESIGN §11.6). */
  goalGames: number;
  gf: number;
  ga: number;
  cleanSheets: number;
}

function schoolLine(team: Team, standing: Standing, games: readonly Game[]): SchoolLine {
  let goalGames = 0;
  let gf = 0;
  let ga = 0;
  let cleanSheets = 0;
  for (const g of games) {
    if (g.status !== 'final' || g.isForfeit) continue;
    const view = sideView(g, team.id);
    if (!view) continue;
    goalGames += 1;
    gf += view.for;
    ga += view.against;
    if (view.against === 0) cleanSheets += 1;
  }
  return { team, overall: standing.overall, league: standing.computed, goalGames, gf, ga, cleanSheets };
}

const recordCell = (r: ComputedRecord): LeaderCell => ({ text: recordString(r), sr: recordWords(r) });
const pctCell = (r: ComputedRecord): LeaderCell => ({ text: winPct(r.winPct) });
const gdCell = (r: ComputedRecord): LeaderCell => {
  const text = signedGd(r.gd);
  return { text, sr: r.gd === 0 ? 'even' : r.gd > 0 ? `plus ${r.gd}` : `minus ${-r.gd}` };
};
const rate = (goals: number, games: number) => (games > 0 ? goals / games : 0);
const rateText = (goals: number, games: number) => rate(goals, games).toFixed(2);

/** Win percentage, then more wins, then goal difference; the name orders what is left. */
function recordBoard(
  spec: { id: string; title: string; navLabel: string; record: (l: SchoolLine) => ComputedRecord; min: number; unitWord: string; note: string },
  lines: readonly SchoolLine[],
  scope: BoardScope,
): LeaderBoard {
  const { record, min, unitWord } = spec;
  return schoolBoard(
    {
      id: spec.id,
      title: spec.title,
      navLabel: spec.navLabel,
      meta: `At least ${plural(min, unitWord)}`,
      sorted: lines
        .filter((l) => record(l).gp >= min)
        .sort(
          (a, b) =>
            record(b).winPct - record(a).winPct ||
            record(b).w - record(a).w ||
            record(b).gd - record(a).gd ||
            byName(a.team.name, b.team.name),
        ),
      same: (a, b) =>
        record(a).winPct === record(b).winPct && record(a).w === record(b).w && record(a).gd === record(b).gd,
      columns: [
        { key: 'record', label: 'W-L-T', title: 'Wins, losses and ties', cell: (l) => recordCell(record(l)) },
        { key: 'pct', label: 'Pct', title: 'Win percentage', cell: (l) => pctCell(record(l)) },
        { key: 'gd', label: 'GD', title: 'Goal difference', cell: (l) => gdCell(record(l)) },
      ],
      rankedBy: 1,
      note: spec.note,
      empty: `No team has ${plural(min, unitWord)} yet.`,
    },
    scope,
  );
}

/**
 * A goals-per-game board, scored or allowed: the rate over the finals with goals, past the record minimum.
 * Equal rates are split by more games played, so a shared place is an equal rate over the same number of
 * games (cross-multiplied: no float compare).
 */
function rateBoard(
  spec: { id: string; title: string; navLabel: string; side: 'gf' | 'ga'; min: number; note: string },
  lines: readonly SchoolLine[],
  scope: BoardScope,
): LeaderBoard {
  const { side, min } = spec;
  const scored = side === 'gf';
  // Most scored first; fewest allowed first. A school that has not scored never leads the first.
  const better = (a: SchoolLine, b: SchoolLine) => {
    const diff = rate(b[side], b.goalGames) - rate(a[side], a.goalGames);
    return scored ? diff : -diff;
  };
  const played = lines.filter((l) => l.goalGames >= min);
  return schoolBoard(
    {
      id: spec.id,
      title: spec.title,
      navLabel: spec.navLabel,
      meta: `At least ${plural(min, 'game')}`,
      sorted: played
        .filter((l) => !scored || l.gf > 0)
        .sort((a, b) => better(a, b) || b.goalGames - a.goalGames || byName(a.team.name, b.team.name)),
      same: (a, b) => a[side] * b.goalGames === b[side] * a.goalGames && a.goalGames === b.goalGames,
      columns: [
        { key: 'gp', label: 'GP', title: 'Games played', cell: (l) => num(l.goalGames) },
        scored
          ? { key: 'gf', label: 'GF', title: 'Goals for', cell: (l) => num(l.gf) }
          : { key: 'ga', label: 'GA', title: 'Goals against', cell: (l) => num(l.ga) },
        {
          key: 'perGame',
          label: 'Avg',
          title: scored ? 'Goals for per game' : 'Goals against per game',
          cell: (l) => ({ text: rateText(l[side], l.goalGames) }),
        },
      ],
      rankedBy: 2,
      note: spec.note,
      empty:
        scored && played.length > 0
          ? `None of the teams with at least ${plural(min, 'game')} has scored yet.`
          : `No team has played ${plural(min, 'game')} yet.`,
    },
    scope,
  );
}

/**
 * The `#adjusted-goals` board: goals per game against an average team (lib/engine/adjusted-scoring.ts), over the
 * games the Elo board counts and past its minimum `min`, with the raw rate over the same games beside it.
 * Ranked on the adjusted rate as printed (two places), then more games, as the raw goals board splits
 * equal rates; a school that has not scored is never listed.
 */
function adjustedGoalsBoard(
  teams: readonly Team[],
  adjusted: ReadonlyMap<TeamId, AdjustedScoring>,
  min: number,
  scope: BoardScope,
  unadjusted: boolean,
): LeaderBoard {
  const hundredths = (v: number) => Math.round(v * 100) / 100;
  const lines = teams.flatMap((team) => {
    const a = adjusted.get(team.id);
    return a ? [{ team, a, rate: hundredths(a.perGame) }] : [];
  });
  return schoolBoard(
    {
      id: 'adjusted-goals',
      title: 'Most Elo-adjusted goals per game',
      navLabel: 'Adjusted goals',
      meta: `At least ${plural(min, 'game')}`,
      sorted: lines
        .filter((l) => l.a.games >= min && l.a.goals > 0)
        .sort((x, y) => y.rate - x.rate || y.a.games - x.a.games || byName(x.team.name, y.team.name)),
      same: (x, y) => x.rate === y.rate && x.a.games === y.a.games,
      columns: [
        { key: 'gp', label: 'GP', title: 'Games counted', cell: (l) => num(l.a.games) },
        { key: 'perGame', label: 'Avg', title: 'Goals for per game', cell: (l) => ({ text: rateText(l.a.goals, l.a.games) }) },
        { key: 'adjusted', label: 'Adj', title: 'Elo-adjusted goals for per game', cell: (l) => ({ text: l.rate.toFixed(2) }) },
      ],
      rankedBy: 2,
      note:
        'Goals per game against an average defense: each game is weighed by the opponent’s defense (its Elo rating, corrected by the goals it has allowed) and by who was at home. ' +
        'Avg is the raw rate over the same games, the ones the Elo board counts. Equal rates are split by more games played.' +
        (unadjusted ? UNADJUSTED_NOTE : ''),
      method:
        'One game against an average defense is added so a short record cannot run to an extreme. ' +
        'Ratings are today’s, from every counted game, and a schedule of only very weak or very strong opponents is the least certain.',
      empty: lines.some((l) => l.a.games >= min)
        ? `None of the teams with at least ${plural(min, 'game')} has scored yet.`
        : `No team has played ${plural(min, 'game')} yet.`,
    },
    scope,
  );
}

/**
 * "Del Mar (1), Live Oak (2)": the teams that have played (`played`, the board's own count unless
 * given), but fewer than `min` of the games this board counts.
 */
function belowMinimum(
  lines: readonly SchoolLine[],
  gp: (l: SchoolLine) => number,
  min: number,
  played: (l: SchoolLine) => number = gp,
): string[] {
  return lines
    .filter((l) => played(l) > 0 && gp(l) < min)
    .sort((a, b) => gp(a) - gp(b) || byName(a.team.name, b.team.name))
    .map((l) => `${l.team.name} (${gp(l)})`);
}

export interface SchoolBoardsInput {
  /** The region's teams (registry order). */
  teams: readonly Team[];
  standings: readonly Standing[];
  games: readonly Game[];
  elo: EloBoardView;
  adjusted: ReadonlyMap<TeamId, AdjustedScoring>;
  /** The goal model did not settle: every schedule factor is 1.00, and the adjusted board says so. */
  unadjusted: boolean;
  scope: BoardScope;
}

/** One region's school boards, in page order, and the notes under them. */
export function buildSchoolBoards(input: SchoolBoardsInput): { boards: LeaderBoard[]; notes: string[] } {
  const { teams, standings, games, elo, adjusted, unadjusted, scope } = input;
  const standingById = new Map(standings.map((s) => [s.teamId, s]));
  const lines = teams.flatMap((t) => {
    const s = standingById.get(t.id);
    return s ? [schoolLine(t, s, games)] : [];
  });
  const overallMin = qualifyingMinimum(lines.map((l) => l.overall.gp));
  const leagueMin = qualifyingMinimum(lines.map((l) => l.league.gp));

  const boards: LeaderBoard[] = [
    recordBoard(
      {
        id: 'best-record',
        title: 'Best record',
        navLabel: 'Record',
        record: (l) => l.overall,
        min: overallMin.min,
        unitWord: 'game',
        note: 'Every completed game, league and non-league, postseason included: the overall record on each team’s page. A tie counts as half a win; equal percentages are split by more wins, then goal difference.',
      },
      lines,
      scope,
    ),
    recordBoard(
      {
        id: 'best-league-record',
        title: 'Best league record',
        navLabel: 'League record',
        record: (l) => l.league,
        min: leagueMin.min,
        unitWord: 'league game',
        note:
          `League games only, as the standings count them${scope.independents > 0 ? '; the independents’ table counts their games against each other' : ''}. ` +
          'Leagues play different numbers of league games, so this compares percentages, not points.',
      },
      lines,
      scope,
    ),
    rateBoard(
      {
        id: 'most-goals',
        title: 'Most goals per game',
        navLabel: 'Goals',
        side: 'gf',
        min: overallMin.min,
        note: 'Goals scored in every completed game, divided by the games played. Equal rates are split by more games played. Forfeits count in records but not in goals, so a forfeit is left out of both numbers here.',
      },
      lines,
      scope,
    ),
    adjustedGoalsBoard(teams, adjusted, elo.minimum.min, scope, unadjusted),
    rateBoard(
      {
        id: 'fewest-goals-allowed',
        title: 'Fewest goals allowed per game',
        navLabel: 'Goals allowed',
        side: 'ga',
        min: overallMin.min,
        note: 'Goals conceded in every completed game, divided by the games played. Equal rates are split by more games played.',
      },
      lines,
      scope,
    ),
    schoolBoard(
      {
        id: 'school-clean-sheets',
        title: 'Most clean sheets',
        navLabel: 'Clean sheets',
        meta: `From all ${plural(lines.length, 'team')}`,
        sorted: lines
          .filter((l) => l.cleanSheets > 0)
          .sort((a, b) => b.cleanSheets - a.cleanSheets || byName(a.team.name, b.team.name)),
        same: (a, b) => a.cleanSheets === b.cleanSheets,
        columns: [
          { key: 'gp', label: 'GP', title: 'Games played', cell: (l) => num(l.goalGames) },
          { key: 'cleanSheets', label: 'CS', title: 'Clean sheets', cell: (l) => num(l.cleanSheets) },
        ],
        rankedBy: 1,
        note: 'Games in which the team did not concede, counted from every score on this site, so every team counts. The goalkeepers’ board counts only what coaches enter.',
        empty: 'No team has kept a clean sheet yet.',
      },
      scope,
    ),
    // Last of the school boards (DESIGN §23).
    elo.board,
  ];

  const notes: string[] = [];
  const notYet = (below: string[]) => (below.length ? `; not there yet: ${listWords(below)}.` : '.');
  const overallBelow = belowMinimum(lines, (l) => l.overall.gp, overallMin.min);
  // The rate boards count only games with goals, and a forfeit has none, so a forfeit can leave a
  // school past the record minimum and short of the rate one: it is named for each it misses.
  const rateBelow = belowMinimum(lines, (l) => l.goalGames, overallMin.min, (l) => l.overall.gp);
  const leagueBelow = belowMinimum(lines, (l) => l.league.gp, leagueMin.min);
  if (overallMin.median > 0) {
    const lead = `need at least ${plural(overallMin.min, 'result')}, half the median of ${overallMin.median}`;
    if (rateBelow.join() === overallBelow.join()) {
      notes.push(`Records and goals per game ${lead}${notYet(overallBelow)}`);
    } else {
      notes.push(`Records ${lead}${notYet(overallBelow)}`);
      notes.push(
        `Goals per game need at least ${plural(overallMin.min, 'game')} with goals counted (a forfeit has none)${notYet(rateBelow)}`,
      );
    }
  }
  if (leagueMin.median > 0) {
    notes.push(
      `The league record needs at least ${plural(leagueMin.min, 'league result')}, half the median of ${leagueMin.median}${notYet(leagueBelow)}`,
    );
  }
  if (elo.minimum.median > 0) {
    notes.push(
      `The Elo-adjusted goals board and the Elo board need at least ${plural(elo.minimum.min, 'game')} against the ${LEAGUE_COUNT} leagues’ teams${AND_INDEPENDENTS}, half the median of ${elo.minimum.median}${notYet(elo.below)}`,
    );
  }
  return { boards, notes };
}
