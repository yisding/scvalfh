/**
 * Elo-adjusted scoring: goals and points weighed by how hard the defenses they came against are,
 * with the Elo table (lib/ratings.ts, DESIGN §20) at the core of that measure. Two /leaders boards use
 * it (components/leaders/leaders-view.ts): a school's Elo-adjusted goals per game, and a player's
 * Elo-adjusted points. DESIGN §27 and the README's "Elo-adjusted goals and points" say how it was chosen.
 *
 * The goal model. Every counted final gives two Poisson counts, one per side, with
 *
 *     log E[goals of t against o] = μ + h·host + a·s_t + u_t − (d·s_o + v_o)
 *
 * where s = (Elo − ELO_BASE) / ELO_PER_GOAL is a team's Elo strength in goals, `host` is +1 for the side
 * at home, −1 for the visitor and 0 at a neutral site, and a, d, μ, h are fitted. So a team's defense,
 * D_o = d·s_o + v_o, is what its Elo rating says plus a correction v_o for the goals it has actually
 * allowed, and its attack likewise; the corrections are pulled toward 0 with a normal prior of standard
 * deviation RIDGE_SIGMA (penalized maximum likelihood), so Elo decides for a team with few games and its
 * own goals count more as they come in. One Newton solve over every counted final, in slug order, so a
 * snapshot always builds the same numbers. The two slopes have a weak prior too (SLOPE_SIGMA), so a
 * season of a few games, which a steep enough slope would explain perfectly, stays near no adjustment,
 * and μ a unit prior about the log of the raw goals per side, so a season of 0-0s stays finite.
 *
 * The adjustment. A game against opponent o counts as `exp(−(D_o − mean D) + h·host)` games against an
 * average defense at a neutral site: a game away at a strong defense is worth less than one, a home game
 * against a weak one more. A team's Elo-adjusted goals per game is its goals over those weighted games,
 * with SHRINK_GAMES of a game against an average defense added to both, at the season's rate against
 * one (its goals over its weighted games, about 1.5 a game), so a short record cannot run to an extreme:
 *
 *     adjusted goals per game = (Σ goals + SHRINK_GAMES · season rate) / (Σ weight + SHRINK_GAMES)
 *
 * and its schedule factor is its games over its weighted games, the same game added to both (above 1:
 * a harder schedule than average). Without the shrinkage the rate is the Poisson maximum-likelihood
 * attack given the defenses: goals over the goals an average team would expect against the same
 * opponents, a ratio of sums (KenPom's original adjustment averaged per-game ratios instead).
 *
 * Players. Player stats are season totals with no game-by-game split (data/player-stats.json), so a
 * player's Elo-adjusted points are their points times their team's schedule factor: every player on a
 * team faced the same defenses, and the factor reads a player's points as spread over the team's games
 * like its goals. A player who sat out the hard (or the easy) games is credited with the team's
 * schedule; the factor covers every counted game even where a coach's totals lag behind them; and points
 * from games against schools outside the covered leagues are multiplied by it too. MaxPreps' per-game
 * box scores were read and tried instead (2026-10-15, all 518): weighing each game's points by its own
 * opponent predicted a player's later points worse than this (log-likelihood −1.003 to −0.964 per
 * player-game), and counting only the games a coach has entered was no better, so they are not used
 * (README "Elo-adjusted goals and points").
 *
 * At the extremes it extrapolates. Ratings run from about 200 to 2600, so a game against the strongest
 * defense counts as less than a tenth of a game against an average one and a game against the weakest
 * as more than fifteen, and schedule factors run from about 0.2 to 3. The multiplicative form over-predicts lopsided games (in-sample,
 * games it expected 12 or more goals in produced about three quarters of that), so a team that played
 * only very weak or very strong schedules is the least certain number on the board. Capping the weights
 * at 3, 5 or 8 games scored worse out of sample, so they are not capped.
 *
 * Why this model. Each candidate was replayed day by day, each day's goals predicted from only the games
 * before it: this season from Sep 20 (Elo seeded from 2025-26) and 2025-26 from Sep 25 (unseeded). Mean
 * Poisson log-likelihood per side (2026 / 2025-26; sides with at least 6 earlier games), every row with
 * a home edge and one game of shrinkage unless it says otherwise: no adjustment (no shrinkage)
 * −2.526 / −2.128; the opponent's Elo alone, goals falling tenfold per 1000 points (an earlier draft of
 * these boards) −1.609 / −1.449, per 1200 points −1.599 / −1.461; an attack-defense model with no Elo
 * (seeded from 2025-26's in 2026) −1.584 / −1.432; this model −1.577 / −1.427 (−1.620 / −1.463 without
 * the shrinkage). Scoring every side instead, the no-Elo model is ahead in 2026 (−1.579 to −1.584) and
 * behind in 2025-26 (−1.440 to −1.427); on root-mean-square error it is ahead in both. So the two
 * attack-defense models are about level, and this one is used because it builds on the one Elo table the
 * site already shows, which links the leagues' few cross-league games and carries last season over.
 * On the board's teams, standard deviations 0.25-0.4 and 0.5-2 games of shrinkage scored within 0.01
 * of the chosen pair (on every side in 2026, two games scored 0.014 worse). The Elo constants
 * themselves (lib/ratings.ts) were tuned on these same two seasons, which flatters every Elo row a little.
 *
 * Counted: the finals the Elo fit counts (lib/ratings.ts ratingGames: between two registry teams, with
 * a score, no forfeit). Ratings and defenses are today's, from every counted game, the one being
 * weighed included: taking each top team's own games out of both fits keeps every board's top two,
 * and can reorder teams close behind (on 2026-10-15 it swapped NorCal's 3rd and 5th, 0.06 apart).
 * A game against a school outside the nine leagues and the five independents has no rating and is left
 * out.
 *
 * Pure: `computeAdjustedScoring` and `fitGoalModel` read only their arguments; `getAdjustedScoring` is
 * them over the bundled snapshot and the bundled Elo table.
 */

import { getSnapshot } from './data';
import { ELO_BASE, ELO_PER_GOAL, getRatings, ratingGames, type RatingTable } from './ratings';
import type { Game, Team, TeamId, TeamSlug } from './types';

/** The prior standard deviation of a team's attack and defense corrections to its Elo, in log goals. */
export const RIDGE_SIGMA = 0.3;
/**
 * Games against an average defense, at the season's average rate against one, added to every team's
 * adjusted rate and schedule factor.
 */
export const SHRINK_GAMES = 1;
/**
 * The prior standard deviation of the two Elo slopes a and d, centred on 0: so weak that a full
 * season's fit is unchanged (both come out near 0.4 in 2025-26 and 2026), but a season of a few
 * games, which a large slope can explain perfectly, stays near no adjustment instead of running off.
 */
export const SLOPE_SIGMA = 0.5;
/**
 * The fit has converged when a full Newton step moves no parameter by more than this, in log goals (a
 * millionth of a scoring rate). On the bundled season the steps fall from 1.6 to 2e-4 in five
 * iterations, then stall near 2e-8, the solve's floating-point floor.
 */
const CONVERGED = 1e-6;
/**
 * A step this small that no halving can improve on has reached the floating-point floor of the
 * penalized likelihood: converged too (fifty times the floor seen on the bundled season).
 */
const FLOOR = 1e-4;

/** The fitted goal model (see the header). */
export interface GoalModel {
  /** Log goals of an average side against an average defense at a neutral site. */
  mu: number;
  /** The home side's edge in log goals (the visitor's is −home). */
  home: number;
  /** Log goals per goal of the side's own Elo strength. */
  attackSlope: number;
  /** Log goals conceded fewer per goal of the opponent's Elo strength. */
  defenseSlope: number;
  /** Each counted team's defense D, centred on the mean of the counted teams (0: average). */
  defense: Map<TeamId, number>;
  /**
   * Whether the Newton solve converged. It has on every day of both seasons replayed and on 400 fuzzed
   * small seasons; if it ever did not, `computeAdjustedScoring` adjusts nothing (and says so through
   * `adjusted`) rather than print a number from a half-finished fit.
   */
  converged: boolean;
  /**
   * Each counted team's attack, a·s + u, less the mean defense, so a side's expected goals are
   * exp(mu + home·host + attack[team] − defense[opponent]).
   */
  attack: Map<TeamId, number>;
}

export interface AdjustedScoring {
  teamId: TeamId;
  slug: TeamSlug;
  /** The finals counted: the Elo fit's, so the same count as the team's rating `games`. */
  games: number;
  /** Goals for in them. */
  goals: number;
  /** The same games as games against an average defense at a neutral site: Σ weight. */
  averageGames: number;
  /** The Elo-adjusted goals per game (with SHRINK_GAMES at the season's average). */
  perGame: number;
  /** false when the goal model did not converge: every game then counts as one, and nothing is adjusted. */
  adjusted: boolean;
  /**
   * What the schedule multiplies a raw number by (above 1: a hard schedule): games over weighted
   * games, with the same SHRINK_GAMES of an average game added to both.
   */
  factor: number;
}

/** One side of one game, as the fit sees it. */
interface Side {
  team: number;
  opponent: number;
  goals: number;
  /** +1 at home, −1 away, 0 at a neutral site. */
  host: number;
}

/**
 * Solves A x = b by Gaussian elimination with partial pivoting (A is the penalized Hessian, symmetric
 * positive definite, so this never meets a zero pivot).
 */
function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let p = 0; p < n; p++) {
    let best = p;
    for (let r = p + 1; r < n; r++) if (Math.abs(m[r][p]) > Math.abs(m[best][p])) best = r;
    [m[p], m[best]] = [m[best], m[p]];
    for (let r = p + 1; r < n; r++) {
      const f = m[r][p] / m[p][p];
      if (f === 0) continue;
      for (let c = p; c <= n; c++) m[r][c] -= f * m[p][c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let p = n - 1; p >= 0; p--) {
    let s = m[p][n];
    for (let c = p + 1; c < n; c++) s -= m[p][c] * x[c];
    x[p] = s / m[p][p];
  }
  return x;
}

/** The sides of the counted finals, and the counted teams in slug order. */
function sidesOf(teams: readonly Team[], games: readonly Game[]): { ids: TeamId[]; sides: Side[] } {
  const counted = ratingGames(teams, games);
  const playing = new Set(counted.flatMap((g) => [g.home.teamId!, g.away.teamId!]));
  const ids = [...teams]
    .sort((p, q) => p.slug.localeCompare(q.slug))
    .filter((t) => playing.has(t.id))
    .map((t) => t.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const sides: Side[] = counted.flatMap((g) => {
    const h = index.get(g.home.teamId!)!;
    const a = index.get(g.away.teamId!)!;
    const hosted = g.site === 'home' ? 1 : 0;
    return [
      { team: h, opponent: a, goals: g.home.score!, host: hosted },
      { team: a, opponent: h, goals: g.away.score!, host: -hosted },
    ];
  });
  return { ids, sides };
}

/**
 * The goal model over `games`' counted finals, with each team's Elo strength from `table`. Penalized
 * Newton–Raphson from a neutral start, each step halved until the penalized likelihood rises.
 */
export function fitGoalModel(
  teams: readonly Team[],
  games: readonly Game[],
  table: RatingTable,
  maxIterations = 100,
): GoalModel {
  const { ids, sides } = sidesOf(teams, games);
  const n = ids.length;
  if (n === 0) {
    return { mu: 0, home: 0, attackSlope: 0, defenseSlope: 0, defense: new Map(), attack: new Map(), converged: true };
  }
  const elo = new Map(table.ratings.map((r) => [r.teamId, r.elo]));
  const s = ids.map((id) => ((elo.get(id) ?? ELO_BASE) - ELO_BASE) / ELO_PER_GOAL);
  // Parameters: u[0..n), v[n..2n), μ, h, a, d.
  const MU = 2 * n;
  const H = MU + 1;
  const A = MU + 2;
  const D = MU + 3;
  const size = MU + 4;
  const ridge = 1 / (RIDGE_SIGMA * RIDGE_SIGMA);
  const meanGoals = sides.reduce((t, x) => t + x.goals, 0) / sides.length;
  const slopePrior = 1 / (SLOPE_SIGMA * SLOPE_SIGMA);
  // μ starts at the season's average scoring and has a unit prior there, so a season of 0-0s stays finite.
  const mu0 = Math.log(Math.max(meanGoals, 0.1));
  let x = new Array<number>(size).fill(0);
  x[MU] = mu0;

  const termsOf = (side: Side): Array<[number, number]> => {
    const terms: Array<[number, number]> = [
      [side.team, 1],
      [n + side.opponent, -1],
      [MU, 1],
      [A, s[side.team]],
      [D, -s[side.opponent]],
    ];
    if (side.host !== 0) terms.push([H, side.host]);
    return terms;
  };
  // The priors: RIDGE_SIGMA on every correction, SLOPE_SIGMA on the two slopes, a unit prior on the home
  // edge (as the Elo fit's edge is pulled toward 0) and on μ about its start.
  const prior: Array<[number, number, number]> = [
    [H, 1, 0],
    [MU, 1, mu0],
    [A, slopePrior, 0],
    [D, slopePrior, 0],
  ];
  for (let i = 0; i < 2 * n; i++) prior.push([i, ridge, 0]);
  const penalized = (p: readonly number[]) => {
    let value = 0;
    for (const side of sides) {
      const eta = termsOf(side).reduce((t, [i, c]) => t + c * p[i], 0);
      value += side.goals * eta - Math.exp(eta);
    }
    for (const [i, weight, centre] of prior) value -= (weight * (p[i] - centre) ** 2) / 2;
    return value;
  };

  let current = penalized(x);
  let converged = false;
  for (let iteration = 0; iteration < maxIterations && !converged; iteration++) {
    const hess = Array.from({ length: size }, () => new Array<number>(size).fill(0));
    const grad = new Array<number>(size).fill(0);
    for (const side of sides) {
      const terms = termsOf(side);
      const rate = Math.exp(terms.reduce((t, [i, c]) => t + c * x[i], 0));
      for (const [i, ci] of terms) {
        grad[i] += ci * (side.goals - rate);
        for (const [j, cj] of terms) hess[i][j] += rate * ci * cj;
      }
    }
    for (const [i, weight, centre] of prior) {
      grad[i] -= weight * (x[i] - centre);
      hess[i][i] += weight;
    }
    const step = solve(hess, grad);
    if (!step.every(Number.isFinite)) break;
    if (Math.max(...step.map(Math.abs)) < CONVERGED) {
      converged = true;
      break;
    }
    // Halve the step until the penalized likelihood rises; a step that never does (or is not finite)
    // is not taken.
    let taken = false;
    for (let scale = 1; scale >= 1 / 1024; scale /= 2) {
      const next = x.map((v, i) => v + scale * step[i]);
      const value = penalized(next);
      if (Number.isFinite(value) && value >= current) {
        x = next;
        current = value;
        taken = true;
        break;
      }
    }
    if (!taken) {
      converged = Math.max(...step.map(Math.abs)) < FLOOR;
      break;
    }
  }

  const raw = ids.map((_, i) => x[D] * s[i] + x[n + i]);
  const mean = raw.reduce((t, v) => t + v, 0) / n;
  return {
    mu: x[MU],
    home: x[H],
    attackSlope: x[A],
    defenseSlope: x[D],
    defense: new Map(ids.map((id, i) => [id, raw[i] - mean])),
    attack: new Map(ids.map((id, i) => [id, x[A] * s[i] + x[i] - mean])),
    converged,
  };
}

/**
 * Every team with a counted final, by id: its goals, its games weighed by the defenses it met (and
 * where), its Elo-adjusted goals per game and its schedule factor. Pure and deterministic.
 */
export function computeAdjustedScoring(
  teams: readonly Team[],
  games: readonly Game[],
  table: RatingTable,
  maxIterations?: number,
): Map<TeamId, AdjustedScoring> {
  const { ids, sides } = sidesOf(teams, games);
  if (sides.length === 0) return new Map();
  const model = fitGoalModel(teams, games, table, maxIterations);
  const slugOf = new Map(teams.map((t) => [t.id, t.slug]));
  const tally = ids.map(() => ({ games: 0, goals: 0, averageGames: 0 }));
  // A fit that did not converge weighs every game as one: no adjustment, never a half-finished one.
  const weight = (side: Side) =>
    model.converged ? Math.exp(-model.defense.get(ids[side.opponent])! + model.home * side.host) : 1;
  for (const side of sides) {
    const t = tally[side.team];
    t.games += 1;
    t.goals += side.goals;
    t.averageGames += weight(side);
  }
  // The shrinkage target is on the board's own scale: the season's goals over its weighted games, the
  // rate against an average defense (about 1.5 on 2026-10-15, where the raw rate per side is 2.2).
  const average =
    tally.reduce((n, t) => n + t.goals, 0) / tally.reduce((n, t) => n + t.averageGames, 0);
  return new Map(
    ids.map((teamId, i) => {
      const t = tally[i];
      return [
        teamId,
        {
          teamId,
          slug: slugOf.get(teamId)!,
          ...t,
          adjusted: model.converged,
          perGame: (t.goals + SHRINK_GAMES * average) / (t.averageGames + SHRINK_GAMES),
          factor: (t.games + SHRINK_GAMES) / (t.averageGames + SHRINK_GAMES),
        },
      ];
    }),
  );
}

let bundled: ReadonlyMap<TeamId, AdjustedScoring> | null = null;

/** The adjusted scoring over the bundled snapshot and Elo table, computed once per process; read-only, as it is shared. */
export function getAdjustedScoring(): ReadonlyMap<TeamId, AdjustedScoring> {
  if (!bundled) {
    const snapshot = getSnapshot();
    bundled = computeAdjustedScoring(snapshot.teams, snapshot.games, getRatings());
  }
  return bundled;
}
