/**
 * Team ratings on the Elo scale (DESIGN §20): one number per team that says how strong its results
 * have been, opponents and margins included, comparable across all five leagues.
 *
 * Not game-by-game Elo. Classic Elo nudges two ratings after each game, so one season of about ten
 * games a team leaves it mostly where it started. Instead every counted final is fitted at once:
 * the strengths for which
 *
 *     strength(home) − strength(away) + home edge ≈ goal margin
 *
 * holds best over the whole season, by least squares with each margin capped at MARGIN_CAP (so a
 * score run up past five goals earns nothing more). The home edge applies only where a game has a
 * host (`site: 'home'`), never at a neutral site. One linear solve, in a fixed order, so a given
 * snapshot always builds the same numbers. Elo fits goals, so an EAL 1 v 1 game (level on goals,
 * decided on 1 v 1s: decider 'SO') is level there, though the standings count it as a win.
 *
 * Seeded from last season. Each team starts from the strength the same fit gives it over last
 * season's finals (data/prior-season.json, lib/prior-season.ts), carried over in full (CARRYOVER),
 * and the fit pulls it toward that start with the weight of START_WEIGHT games: the start decides
 * the first weeks and fades as the season's own results come in. A team with no result yet this
 * season is rated at its start (preseason); without a prior season every start is average.
 *
 * A strength in goals becomes Elo points as ELO_BASE + ELO_PER_GOAL × (strength − the mean
 * strength of the rated teams): 1500 is the average rated team.
 *
 * How the numbers were chosen. Two seasons were replayed day by day over the 43 teams of the four
 * leagues covered on 2026-10-02, each day predicted from only the games before it: 2025-26 (368
 * finals, seeded from 2024-25) and 2026 through Oct 2 (196 finals, seeded from 2025-26). Seeding cut the root-mean-square miss on the capped margin from
 * 1.97 to 1.61 goals and from 2.37 to 1.76, and raised the share of winners picked from 84% to 88%
 * and from 79% to 89%. Carrying 85-115% of last season over at a weight of 0.5-3 games all scored
 * within a few thousandths (Brier); full carryover at one game was best or level in both seasons,
 * the first two weeks included (a team's strength from one full season to the next correlates at
 * 0.89). Over those 564 predictions, ELO_PER_GOAL = 175 fits Elo's own expected-score curve,
 * 1 / (1 + 10^(−Δ/400)), best: favorites by 100-200 points scored 69% (Elo expects 70%), by
 * 200-300 points 80% (81%), by 400-600 points 97% (95%).
 *
 * Counted: every final between two registry teams, league or not, postseason included, with its
 * published score (a si.com backfill too). Left out: forfeits (no goals, as in the standings),
 * finals without a score, and games against schools outside the five leagues: a one-game opponent
 * nothing else connects to says nothing about the strength of the team it played.
 *
 * Pure: `computeRatings` reads only its arguments; `getRatings` is it over the bundled snapshot
 * and prior season.
 */

import { getSnapshot } from './data';
import type { PriorSeason } from './prior-season';
import { getPriorSeason } from './prior-season-data';
import type { Game, Team, TeamId, TeamSlug } from './types';

/** The average rated team. */
export const ELO_BASE = 1500;
/** Elo points per goal of expected margin (see above for how it was set). */
export const ELO_PER_GOAL = 175;
/** A margin counts up to this many goals either way. */
export const MARGIN_CAP = 5;
/** How hard the fit pulls a team toward its start, in games' worth. */
export const START_WEIGHT = 1;
/** The share of last season's strength a team starts this season with. */
export const CARRYOVER = 1;

export interface TeamRating {
  teamId: TeamId;
  slug: TeamSlug;
  /** Whole Elo points. */
  elo: number;
  /** This season's finals the fit counted for this team (0: rated at its start, preseason). */
  games: number;
  /** Whether it started from last season's rating rather than from average. */
  seeded: boolean;
}

export interface RatingTable {
  /**
   * One per team with a counted final this season or a start from last season, highest first
   * (equal ratings by slug).
   */
  ratings: TeamRating[];
  /** The fitted home edge, in whole Elo points. */
  homeEdge: number;
  /** This season's finals counted. */
  games: number;
  /** The last date with a counted final, YYYY-MM-DD; null before the first. */
  through: string | null;
  /** The season the starts come from ("2025-26"); null when unseeded. */
  seededFrom: string | null;
  /** Last season's finals the starts were fitted to. */
  priorGames: number;
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
 * Solves A x = b for the symmetric positive-definite normal equations by Gaussian elimination;
 * the START_WEIGHT on the diagonal keeps every pivot positive, so no pivoting is needed.
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

/** One game as the fit sees it. */
interface FitRow {
  home: TeamId;
  away: TeamId;
  /** Capped at MARGIN_CAP either way. */
  margin: number;
  hosted: boolean;
}

/** A goal margin limited to MARGIN_CAP either way. */
const capped = (margin: number) => Math.max(-MARGIN_CAP, Math.min(MARGIN_CAP, margin));

/**
 * The least-squares strengths (goals) of `ids` over `rows`, each pulled toward `start` (0 when
 * absent) with START_WEIGHT, and the home edge, pulled toward 0 the same way. `ids` must be in a
 * fixed order (slug order), so every caller's solve runs the same arithmetic.
 */
function fit(
  ids: readonly TeamId[],
  rows: readonly FitRow[],
  start: ReadonlyMap<TeamId, number>,
): { strength: Map<TeamId, number>; homeEdge: number } {
  const index = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length + 1;
  const edge = n - 1;
  const a = Array.from({ length: n }, () => new Float64Array(n));
  const b = new Float64Array(n);
  for (const r of rows) {
    // The row of this game: +1 for the home side, −1 for the away side, +1 for the edge if hosted.
    const row: Array<[number, number]> = [[index.get(r.home)!, 1], [index.get(r.away)!, -1]];
    if (r.hosted) row.push([edge, 1]);
    for (const [i, xi] of row) {
      b[i] += xi * r.margin;
      for (const [j, xj] of row) a[i][j] += xi * xj;
    }
  }
  for (let i = 0; i < n; i++) {
    a[i][i] += START_WEIGHT;
    if (i < ids.length) b[i] += START_WEIGHT * (start.get(ids[i]) ?? 0);
  }
  const x = ids.length > 0 ? solve(a, b) : new Float64Array(n);
  return { strength: new Map(ids.map((id, i) => [id, x[i]])), homeEdge: x[edge] };
}

/** Last season's fit, centred on its average team and scaled by CARRYOVER: each team's start. */
function startsFrom(teams: readonly Team[], prior: PriorSeason): Map<TeamId, number> {
  const known = new Set(teams.map((t) => t.id));
  const rows: FitRow[] = prior.games
    .filter((g) => known.has(g.homeId) && known.has(g.awayId))
    .map((g) => ({ home: g.homeId, away: g.awayId, margin: capped(g.homeScore - g.awayScore), hosted: g.site === 'home' }));
  const played = new Set(rows.flatMap((r) => [r.home, r.away]));
  const ids = [...teams].sort((p, q) => p.slug.localeCompare(q.slug)).filter((t) => played.has(t.id)).map((t) => t.id);
  const { strength } = fit(ids, rows, new Map());
  const mean = ids.length > 0 ? ids.reduce((s, id) => s + strength.get(id)!, 0) / ids.length : 0;
  return new Map(ids.map((id) => [id, CARRYOVER * (strength.get(id)! - mean)]));
}

/**
 * Every rated team's Elo rating from this season's `games`, each team started from its rating
 * over `prior` (last season) when given, else from average. Pure and deterministic: the same
 * inputs in any order give the same table. See the header for the model and how it was chosen.
 */
export function computeRatings(
  teams: readonly Team[],
  games: readonly Game[],
  prior: PriorSeason | null = null,
): RatingTable {
  const counted = ratingGames(teams, games);
  const start = prior ? startsFrom(teams, prior) : new Map<TeamId, number>();
  const rows: FitRow[] = counted.map((g) => ({
    home: g.home.teamId!,
    away: g.away.teamId!,
    margin: capped(g.home.score! - g.away.score!),
    hosted: g.site === 'home',
  }));
  const gamesOf = new Map<TeamId, number>();
  for (const r of rows) {
    gamesOf.set(r.home, (gamesOf.get(r.home) ?? 0) + 1);
    gamesOf.set(r.away, (gamesOf.get(r.away) ?? 0) + 1);
  }
  // Rated: every team that has played this season or has a start, in slug order whatever order
  // `teams` is in.
  const rated = [...teams]
    .sort((p, q) => p.slug.localeCompare(q.slug))
    .filter((t) => gamesOf.has(t.id) || start.has(t.id));
  const { strength, homeEdge } = fit(rated.map((t) => t.id), rows, start);
  const mean = rated.length > 0 ? rated.reduce((s, t) => s + strength.get(t.id)!, 0) / rated.length : 0;
  const ratings = rated
    .map((t) => ({
      teamId: t.id,
      slug: t.slug,
      elo: Math.round(ELO_BASE + ELO_PER_GOAL * (strength.get(t.id)! - mean)),
      games: gamesOf.get(t.id) ?? 0,
      seeded: start.has(t.id),
    }))
    .sort((p, q) => q.elo - p.elo || p.slug.localeCompare(q.slug));

  return {
    ratings,
    homeEdge: Math.round(ELO_PER_GOAL * homeEdge),
    games: counted.length,
    through: counted.length > 0 ? counted.map((g) => g.dateKey).sort()[counted.length - 1] : null,
    seededFrom: start.size > 0 ? prior!.season : null,
    priorGames: prior ? prior.games.length : 0,
  };
}

let bundled: RatingTable | null = null;

/** The ratings over the bundled snapshot and prior season, computed once per process. */
export function getRatings(): RatingTable {
  if (!bundled) {
    const snapshot = getSnapshot();
    bundled = computeRatings(snapshot.teams, snapshot.games, getPriorSeason());
  }
  return bundled;
}
