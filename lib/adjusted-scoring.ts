/**
 * Elo-adjusted scoring: goals and points weighed by how hard the defences they came against are,
 * with the Elo table (lib/ratings.ts, DESIGN §20) at the core of that measure. Two /leaders boards use
 * it (components/leaders/leaders-view.ts): a school's Elo-adjusted goals per game, and a player's
 * Elo-adjusted points. DESIGN §27 and the README's "Elo-adjusted goals and points" say how it was chosen.
 *
 * The goal model. Every counted final gives two Poisson counts, one per side, with
 *
 *     log E[goals of t against o] = μ + h·host + a·s_t + u_t − (d·s_o + v_o)
 *
 * where s = (Elo − ELO_BASE) / ELO_PER_GOAL is a team's Elo strength in goals, `host` is +1 for the side
 * at home, −1 for the visitor and 0 at a neutral site, and a, d, μ, h are fitted. So a team's defence,
 * D_o = d·s_o + v_o, is what its Elo rating says plus a correction v_o for the goals it has actually
 * allowed, and its attack likewise; the corrections are pulled toward 0 with a normal prior of standard
 * deviation RIDGE_SIGMA (penalized maximum likelihood), so Elo decides for a team with few games and its
 * own goals count more as they come in. One Newton solve over every counted final, in slug order, so a
 * snapshot always builds the same numbers.
 *
 * The adjustment. A game against opponent o counts as `exp(−(D_o − mean D) + h·host)` games against an
 * average defence at a neutral site: a game away at a strong defence is worth less than one, a home game
 * against a weak one more. A team's Elo-adjusted goals per game is its goals over those weighted games,
 * with SHRINK_GAMES of a game at the season's average rate added to both, so a short record cannot run
 * to an extreme:
 *
 *     adjusted goals per game = (Σ goals + SHRINK_GAMES · average) / (Σ weight + SHRINK_GAMES)
 *
 * and its schedule factor is its games over its weighted games (above 1: a harder schedule than
 * average). Without the shrinkage this is the KenPom-style multiplicative adjustment (goals over the
 * goals an average team would expect against the same opponents) and the maximum-likelihood attack of
 * the model above given the defences.
 *
 * Players. Player stats are season totals with no game-by-game split (data/player-stats.json), so a
 * player's Elo-adjusted points are their points times their team's schedule factor: every player on a
 * team faced the same defences, and the factor reads a player's points as spread over the team's games
 * like its goals. A player who sat out the hard (or the easy) games is credited with the team's schedule.
 *
 * Why this model. Replayed day by day over this season (Elo seeded from 2025-26, games from Sep 20 on)
 * and over 2025-26 (unseeded, from Sep 25), each day's goals predicted from only the games before it,
 * on sides with at least 6 earlier games, mean Poisson log-likelihood per side (2026 / 2025-26), each
 * with the same half game of shrinkage: an opponent rated by its Elo alone (the first version of these
 * boards, goals falling tenfold every 1000 points) −1.624 / −1.459, at 1200 points −1.612 / −1.472; an
 * attack-defence model with no Elo −1.608 / −1.434; this model −1.574 / −1.430 (−1.614 / −1.463
 * without the shrinkage). No adjustment at all scored −2.53 / −2.13. Standard deviations 0.25-0.4 and
 * shrinkage of 0.5-1 games all scored within 0.01. README "Elo-adjusted goals and points" has the
 * root-mean-square errors too.
 *
 * Counted: the finals the Elo fit counts (lib/ratings.ts ratingGames: between two registry teams, with
 * a score, no forfeit). Ratings and defences are today's, from every counted game, the one being
 * weighed included. A game against a school outside the nine leagues and the five independents has no
 * rating and is left out.
 *
 * Pure: `computeAdjustedScoring` and `fitGoalModel` read only their arguments; `getAdjustedScoring` is
 * them over the bundled snapshot and the bundled Elo table.
 */

import { getSnapshot } from './data';
import { ELO_BASE, ELO_PER_GOAL, getRatings, ratingGames, type RatingTable } from './ratings';
import type { Game, Team, TeamId, TeamSlug } from './types';

/** The prior standard deviation of a team's attack and defence corrections to its Elo, in log goals. */
export const RIDGE_SIGMA = 0.3;
/** Games at the season's average scoring rate added to every team's adjusted rate. */
export const SHRINK_GAMES = 0.5;

/** The fitted goal model (see the header). */
export interface GoalModel {
  /** Log goals of an average side against an average defence at a neutral site. */
  mu: number;
  /** The home side's edge in log goals (the visitor's is −home). */
  home: number;
  /** Log goals per goal of the side's own Elo strength. */
  attackSlope: number;
  /** Log goals conceded fewer per goal of the opponent's Elo strength. */
  defenceSlope: number;
  /** Each counted team's defence D, centred on the mean of the counted teams (0: average). */
  defence: Map<TeamId, number>;
  /**
   * Each counted team's attack, a·s + u, less the mean defence, so a side's expected goals are
   * exp(mu + home·host + attack[team] − defence[opponent]).
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
  /** The same games as games against an average defence at a neutral site: Σ weight. */
  averageGames: number;
  /** The Elo-adjusted goals per game (with SHRINK_GAMES at the season's average). */
  perGame: number;
  /** games / averageGames: what the schedule multiplies a raw number by (above 1: a hard schedule). */
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
export function fitGoalModel(teams: readonly Team[], games: readonly Game[], table: RatingTable): GoalModel {
  const { ids, sides } = sidesOf(teams, games);
  const n = ids.length;
  if (n === 0) return { mu: 0, home: 0, attackSlope: 0, defenceSlope: 0, defence: new Map(), attack: new Map() };
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
  let x = new Array<number>(size).fill(0);
  x[MU] = Math.log(Math.max(meanGoals, 0.1));

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
  // The home edge gets a unit prior too, as the Elo fit's edge is pulled toward 0.
  const penalized = (p: readonly number[]) => {
    let value = 0;
    for (const side of sides) {
      const eta = termsOf(side).reduce((t, [i, c]) => t + c * p[i], 0);
      value += side.goals * eta - Math.exp(eta);
    }
    for (let i = 0; i < 2 * n; i++) value -= (ridge * p[i] * p[i]) / 2;
    return value - (p[H] * p[H]) / 2;
  };

  let current = penalized(x);
  for (let iteration = 0; iteration < 100; iteration++) {
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
    for (let i = 0; i < 2 * n; i++) {
      grad[i] -= ridge * x[i];
      hess[i][i] += ridge;
    }
    grad[H] -= x[H];
    hess[H][H] += 1;
    // μ, a and d are unpenalized; a hair on the diagonal keeps a degenerate season (every team at 1500)
    // solvable.
    for (const i of [MU, A, D]) hess[i][i] += 1e-9;
    const step = solve(hess, grad);
    let scale = 1;
    let next = x.map((v, i) => v + step[i]);
    let value = penalized(next);
    while (value < current && scale > 1 / 1024) {
      scale /= 2;
      next = x.map((v, i) => v + scale * step[i]);
      value = penalized(next);
    }
    x = next;
    const moved = Math.max(...step.map((v) => Math.abs(v * scale)));
    current = value;
    if (moved < 1e-10) break;
  }

  const raw = ids.map((_, i) => x[D] * s[i] + x[n + i]);
  const mean = raw.reduce((t, v) => t + v, 0) / n;
  return {
    mu: x[MU],
    home: x[H],
    attackSlope: x[A],
    defenceSlope: x[D],
    defence: new Map(ids.map((id, i) => [id, raw[i] - mean])),
    attack: new Map(ids.map((id, i) => [id, x[A] * s[i] + x[i] - mean])),
  };
}

/**
 * Every team with a counted final, by id: its goals, its games weighed by the defences it met (and
 * where), its Elo-adjusted goals per game and its schedule factor. Pure and deterministic.
 */
export function computeAdjustedScoring(
  teams: readonly Team[],
  games: readonly Game[],
  table: RatingTable,
): Map<TeamId, AdjustedScoring> {
  const { ids, sides } = sidesOf(teams, games);
  if (sides.length === 0) return new Map();
  const model = fitGoalModel(teams, games, table);
  const slugOf = new Map(teams.map((t) => [t.id, t.slug]));
  const average = sides.reduce((t, x) => t + x.goals, 0) / sides.length;
  const tally = ids.map(() => ({ games: 0, goals: 0, averageGames: 0 }));
  for (const side of sides) {
    const t = tally[side.team];
    t.games += 1;
    t.goals += side.goals;
    t.averageGames += Math.exp(-model.defence.get(ids[side.opponent])! + model.home * side.host);
  }
  return new Map(
    ids.map((teamId, i) => {
      const t = tally[i];
      return [
        teamId,
        {
          teamId,
          slug: slugOf.get(teamId)!,
          ...t,
          perGame: (t.goals + SHRINK_GAMES * average) / (t.averageGames + SHRINK_GAMES),
          factor: t.games / t.averageGames,
        },
      ];
    }),
  );
}

let bundled: Map<TeamId, AdjustedScoring> | null = null;

/** The adjusted scoring over the bundled snapshot and Elo table, computed once per process. */
export function getAdjustedScoring(): Map<TeamId, AdjustedScoring> {
  if (!bundled) {
    const snapshot = getSnapshot();
    bundled = computeAdjustedScoring(snapshot.teams, snapshot.games, getRatings());
  }
  return bundled;
}
