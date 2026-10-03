/**
 * Team ratings on the Elo scale (DESIGN §20): one number per team that says how strong its results
 * have been, opponents and margins included, comparable across all four leagues.
 *
 * Not game-by-game Elo. Classic Elo starts every team at 1500 and nudges two ratings after each
 * game, so with one season and about ten games a team it is still mostly its starting value by
 * October (this site has no earlier season's games to start from). Instead every counted final is
 * fitted at once: the strengths for which
 *
 *     strength(home) − strength(away) + home edge ≈ goal margin
 *
 * holds best over the whole season, by least squares with each margin capped at MARGIN_CAP (so a
 * score run up past five goals earns nothing more) and a small pull of RIDGE toward an average team
 * (so a team with two games is not rated off them alone). The home edge applies only where a game
 * has a host (`site: 'home'`), never at a neutral site. One linear solve, in a fixed game order, so
 * a given snapshot always builds the same numbers.
 *
 * A strength in goals becomes Elo points as ELO_BASE + ELO_PER_GOAL × (strength − the mean
 * strength of the rated teams): 1500 is the average rated team. ELO_PER_GOAL is set so that, as on
 * any Elo scale, 400 points is roughly 10-to-1: from 2026-09-08 to 2026-10-02 the fit, run on only
 * the games before each day, missed that day's capped margins by 2.07 goals (root mean square),
 * and with margins spread that much a team 400 points (400 / 140 ≈ 2.9 goals) better comes out
 * ahead about 92% of the time, 11-to-1. In that same test it picked the winner of 89% of the games
 * that had one.
 *
 * Counted: every final between two registry teams, league or not, postseason included, with its
 * published score (a si.com backfill too). Left out: forfeits (no goals, as in the standings),
 * finals without a score, and games against schools outside the four leagues: a one-game opponent
 * nothing else connects to says nothing about the strength of the team it played.
 *
 * Pure: `computeRatings` reads only its arguments; `getRatings` is it over the bundled snapshot.
 */

import { getSnapshot } from './data';
import type { Game, Team, TeamId, TeamSlug } from './types';

/** The average rated team. */
export const ELO_BASE = 1500;
/** Elo points per goal of expected margin (see above for how it was set). */
export const ELO_PER_GOAL = 140;
/** A margin counts up to this many goals either way. */
export const MARGIN_CAP = 5;
/** The pull toward an average team, in games' worth of a 0 margin. */
export const RIDGE = 1;

export interface TeamRating {
  teamId: TeamId;
  slug: TeamSlug;
  /** Whole Elo points. */
  elo: number;
  /** The finals the fit counted for this team. */
  games: number;
}

export interface RatingTable {
  /** One per team with at least one counted final, highest first (equal ratings by slug). */
  ratings: TeamRating[];
  /** The fitted home edge, in whole Elo points. */
  homeEdge: number;
  /** The finals counted. */
  games: number;
  /** The last date with a counted final, YYYY-MM-DD; null before the first. */
  through: string | null;
}

/** The finals the fit counts, in a fixed order (kickoff, then contest id). */
export function ratingGames(teams: readonly Team[], games: readonly Game[]): Game[] {
  const ids = new Set(teams.map((t) => t.id));
  return games
    .filter(
      (g) =>
        g.status === 'final' &&
        !g.isForfeit &&
        g.home.score !== null &&
        g.away.score !== null &&
        g.home.teamId !== null &&
        g.away.teamId !== null &&
        ids.has(g.home.teamId) &&
        ids.has(g.away.teamId),
    )
    .sort((a, b) => a.dateUtc.localeCompare(b.dateUtc) || a.contestId.localeCompare(b.contestId));
}

/**
 * Solves (A + RIDGE·I) x = b for the symmetric positive-definite normal equations by Gaussian
 * elimination; the ridge keeps every pivot positive, so no pivoting is needed.
 */
function solve(a: Float64Array[], b: Float64Array): Float64Array {
  const n = b.length;
  for (let p = 0; p < n; p++) {
    for (let r = p + 1; r < n; r++) {
      const f = a[r][p] / a[p][p];
      if (f === 0) continue;
      for (let c = p; c < n; c++) a[r][c] -= f * a[p][c];
      b[r] -= f * b[p];
    }
  }
  const x = new Float64Array(n);
  for (let p = n - 1; p >= 0; p--) {
    let s = b[p];
    for (let c = p + 1; c < n; c++) s -= a[p][c] * x[c];
    x[p] = s / a[p][p];
  }
  return x;
}

export function computeRatings(teams: readonly Team[], games: readonly Game[]): RatingTable {
  const counted = ratingGames(teams, games);
  // Unknowns: one strength per team that has played, in slug order whatever order `teams` is in
  // (so every caller's solve runs the same arithmetic), then the home edge.
  const played = new Set(counted.flatMap((g) => [g.home.teamId!, g.away.teamId!]));
  const rated = teams.filter((t) => played.has(t.id)).sort((p, q) => p.slug.localeCompare(q.slug));
  const index = new Map(rated.map((t, i) => [t.id, i]));
  const n = rated.length + 1;
  const home = n - 1;
  const a = Array.from({ length: n }, () => new Float64Array(n));
  const b = new Float64Array(n);
  const gamesOf = new Map<TeamId, number>();

  for (const g of counted) {
    const h = index.get(g.home.teamId!)!;
    const w = index.get(g.away.teamId!)!;
    const margin = Math.max(-MARGIN_CAP, Math.min(MARGIN_CAP, g.home.score! - g.away.score!));
    // The row of this game: +1 for the home side, −1 for the away side, +1 for the edge if hosted.
    const row: Array<[number, number]> = [[h, 1], [w, -1]];
    if (g.site === 'home') row.push([home, 1]);
    for (const [i, xi] of row) {
      b[i] += xi * margin;
      for (const [j, xj] of row) a[i][j] += xi * xj;
    }
    gamesOf.set(g.home.teamId!, (gamesOf.get(g.home.teamId!) ?? 0) + 1);
    gamesOf.set(g.away.teamId!, (gamesOf.get(g.away.teamId!) ?? 0) + 1);
  }
  for (let i = 0; i < n; i++) a[i][i] += RIDGE;

  const x = rated.length > 0 ? solve(a, b) : new Float64Array(n);
  const mean = rated.length > 0 ? rated.reduce((s, _t, i) => s + x[i], 0) / rated.length : 0;
  const ratings = rated
    .map((t, i) => ({
      teamId: t.id,
      slug: t.slug,
      elo: Math.round(ELO_BASE + ELO_PER_GOAL * (x[i] - mean)),
      games: gamesOf.get(t.id) ?? 0,
    }))
    .sort((p, q) => q.elo - p.elo || p.slug.localeCompare(q.slug));

  return {
    ratings,
    homeEdge: Math.round(ELO_PER_GOAL * x[home]),
    games: counted.length,
    through: counted.length > 0 ? counted.map((g) => g.dateKey).sort()[counted.length - 1] : null,
  };
}

let bundled: RatingTable | null = null;

/** The ratings over the bundled snapshot, computed once per process. */
export function getRatings(): RatingTable {
  if (!bundled) {
    const snapshot = getSnapshot();
    bundled = computeRatings(snapshot.teams, snapshot.games);
  }
  return bundled;
}
