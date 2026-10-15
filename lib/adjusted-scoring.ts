/**
 * Elo-adjusted scoring: goals and points weighed by the strength of the teams they came against,
 * read off the Elo table (lib/ratings.ts, DESIGN §20). Two /leaders boards use it
 * (components/leaders/leaders-view.ts): a school's Elo-adjusted goals per game, and a player's
 * Elo-adjusted points.
 *
 * The model. A team scores fewer goals against a stronger opponent, and by a steady ratio: against a
 * team rated GOALS_TENFOLD points higher than another, it can expect a tenth as many. So each game
 * counts as `opponentGoalShare(opponent's Elo)` games against an average (ELO_BASE) team: a game
 * against a team rated 1000 counts about 3.2 times, one against a team rated 2000 about a third.
 * A school's Elo-adjusted goals per game is its goals over those weighted games, the goals it would
 * score per game against an average team:
 *
 *     adjusted goals per game = Σ goals for / Σ opponentGoalShare(opponent Elo)
 *
 * This is the maximum-likelihood rate when each game's goals are Poisson with a mean of the team's
 * own rate times opponentGoalShare, so a low-scoring game against a strong team and a rout of a
 * weak one both count for what they say, and a game in which the team scored nothing still counts.
 *
 * Players. The player stats are season totals (data/player-stats.json), with no per-game split, so a
 * player's points are adjusted by their team's schedule: points × `factor`, the team's counted games
 * over its weighted ones (its adjusted goals per game over its raw ones). It reads a player's points
 * as spread over the team's games like any of the team's goals.
 *
 * How GOALS_TENFOLD was chosen. Fitting each team's goals for with one rate per team and one
 * opponent-strength slope (Poisson, by maximum likelihood) over this season's 658 counted finals on
 * 2026-10-15 gave a tenfold fall every 1,075 Elo points; over 2025-26's 935 finals, with that
 * season's own ratings, every 995. 1000 is between them.
 *
 * Counted: the finals the Elo fit counts (lib/ratings.ts ratingGames: between two registry teams,
 * with a score, no forfeit), each against the opponent's rating today, which that game is part of.
 * A game against a school outside the nine leagues and the five independents has no rating to weigh it by
 * and is left out.
 *
 * Pure: `computeAdjustedScoring` reads only its arguments; `getAdjustedScoring` is it over the
 * bundled snapshot and the bundled Elo table.
 */

import { getSnapshot } from './data';
import { ELO_BASE, getRatings, ratingGames, type RatingTable } from './ratings';
import type { Game, Team, TeamId, TeamSlug } from './types';

/** Elo points over which the goals a team can expect against an opponent fall tenfold. */
export const GOALS_TENFOLD = 1000;

/**
 * The goals a team can expect against an opponent rated `elo`, as a share of what it would score
 * against an average team: 1 at ELO_BASE, 0.1 at ELO_BASE + GOALS_TENFOLD, 10 at ELO_BASE − it.
 */
export function opponentGoalShare(elo: number): number {
  return 10 ** ((ELO_BASE - elo) / GOALS_TENFOLD);
}

export interface AdjustedScoring {
  teamId: TeamId;
  slug: TeamSlug;
  /** The finals counted: the Elo fit's, so the same count as the team's rating `games`. */
  games: number;
  /** Goals for in them. */
  goals: number;
  /** The same games as games against an average team: Σ opponentGoalShare(opponent's Elo). */
  averageGames: number;
  /** goals / averageGames: the Elo-adjusted goals per game. */
  perGame: number;
  /** games / averageGames: what the schedule multiplies a raw number by (above 1: a hard schedule). */
  factor: number;
}

/**
 * Every team with a counted final, by id: its goals and its games weighed by `table`'s ratings of
 * its opponents. Pure and deterministic.
 */
export function computeAdjustedScoring(
  teams: readonly Team[],
  games: readonly Game[],
  table: RatingTable,
): Map<TeamId, AdjustedScoring> {
  const elo = new Map(table.ratings.map((r) => [r.teamId, r.elo]));
  const slugOf = new Map(teams.map((t) => [t.id, t.slug]));
  const tally = new Map<TeamId, { games: number; goals: number; averageGames: number }>();
  const add = (team: TeamId, goals: number, opponent: TeamId) => {
    const opponentElo = elo.get(opponent);
    if (opponentElo === undefined) return;
    const t = tally.get(team) ?? { games: 0, goals: 0, averageGames: 0 };
    t.games += 1;
    t.goals += goals;
    t.averageGames += opponentGoalShare(opponentElo);
    tally.set(team, t);
  };
  for (const g of ratingGames(teams, games)) {
    add(g.home.teamId!, g.home.score!, g.away.teamId!);
    add(g.away.teamId!, g.away.score!, g.home.teamId!);
  }
  return new Map(
    [...tally].map(([teamId, t]) => [
      teamId,
      {
        teamId,
        slug: slugOf.get(teamId)!,
        ...t,
        perGame: t.goals / t.averageGames,
        factor: t.games / t.averageGames,
      },
    ]),
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
