/**
 * The single derivations every game list and every outcome on the site goes through: the canonical
 * game order, the date-only order, one side's W/L/T, and a game read from one team's side. Pure and
 * client-safe (type imports only).
 */

import type { Game, Outcome } from '@/lib/model/game';
import type { TeamId, TeamSlug } from '@/lib/model/ids';

/**
 * The canonical game order: oldest first by `dateLocal`; a contest id breaks a tie so the order never
 * depends on how the pipeline built the array.
 */
export function byDateThenId(
  a: { dateLocal: string; contestId: string },
  b: { dateLocal: string; contestId: string },
): number {
  return a.dateLocal.localeCompare(b.dateLocal) || a.contestId.localeCompare(b.contestId);
}

/**
 * Oldest first by `dateLocal` ALONE. Unlike `byDateThenId` it deliberately ignores the contest id:
 * Array.prototype.sort is stable, so games on one date keep the order they were read in, and every
 * list that sorted this way before (a team's form, a head-to-head, a schedule day, a note walk) keeps
 * its tie order byte for byte. Use `byDateThenId` when the order must not depend on the input array.
 */
export function byDateLocal(a: { dateLocal: string }, b: { dateLocal: string }): number {
  return a.dateLocal.localeCompare(b.dateLocal);
}

/**
 * One side's W/L/T in a final, or null unless the game is final with both scores. THE single
 * derivation every outcome on the site goes through (standings, form, chips, series summaries):
 * a stored shootout tally decides when present; a decider 'SO' with complementary result flags
 * {W, L} (an EAL 1 v 1 win, or a San Diego Section shootout win MaxPreps records as a level score:
 * no tally stored) takes that side's flag; anything else is read off the score. Section-free on
 * purpose: `decider` 'SO' is only ever written by lib/pipeline/reconcile/normalize.ts for two teams of a section whose
 * `shootout` rule is set, so nothing here needs the config.
 */
export function sideOutcome(
  game: Pick<Game, 'status' | 'home' | 'away' | 'decider' | 'shootout'>,
  side: 'home' | 'away',
): Outcome | null {
  if (game.status !== 'final' || game.home.score === null || game.away.score === null) return null;
  const [mine, theirs] = side === 'home' ? [game.home, game.away] : [game.away, game.home];
  if (game.shootout) {
    const [us, them] =
      side === 'home'
        ? [game.shootout.home, game.shootout.away]
        : [game.shootout.away, game.shootout.home];
    return us > them ? 'W' : 'L';
  }
  if (
    game.decider === 'SO' &&
    (mine.result === 'W' || mine.result === 'L') &&
    theirs.result === (mine.result === 'W' ? 'L' : 'W')
  ) {
    return mine.result;
  }
  const [us, them] = [mine.score as number, theirs.score as number];
  return us > them ? 'W' : us < them ? 'L' : 'T';
}

/** A completed game read from one team's side. */
export interface SideView {
  for: number;
  against: number;
  outcome: Outcome;
  /** Where the team played: 'neutral' stays neutral, otherwise 'home' or 'away' by which side it is. */
  site: Game['site'];
}

/**
 * A completed game as seen from one team. Returns null when the team is not in it or the game is
 * not final with both scores. The outcome is `sideOutcome`'s, so a shootout win (decider 'SO', level
 * on goals: an EAL 1 v 1 win, a San Diego Section shootout MaxPreps records as a level score marked
 * W and L) counts as the flagged side's win while its goals stay as recorded. The goals are the
 * recorded ones even in a forfeit: callers that exclude forfeit goals (DESIGN §11.6) check
 * `game.isForfeit` themselves, while the W/L it counts is exact.
 */
export function sideView(game: Game, teamId: TeamId): SideView | null {
  const isHome = game.home.teamId === teamId;
  const isAway = game.away.teamId === teamId;
  if (!isHome && !isAway) return null;
  const mine = isHome ? game.home : game.away;
  const theirs = isHome ? game.away : game.home;
  if (mine.score === null || theirs.score === null) return null;
  const outcome = sideOutcome(game, isHome ? 'home' : 'away');
  if (outcome === null) return null;
  return {
    for: mine.score,
    against: theirs.score,
    outcome,
    site: game.site === 'neutral' ? 'neutral' : isHome ? 'home' : 'away',
  };
}

/** Counts one outcome into a W-L-T record. */
export function bumpRecord(rec: { w: number; l: number; t: number }, outcome: Outcome): void {
  if (outcome === 'W') rec.w += 1;
  else if (outcome === 'L') rec.l += 1;
  else rec.t += 1;
}

/**
 * Whether a team is a side of the game, by registry id OR slug (a side can carry only its slug before
 * the registry resolves it). The one predicate behind `getGames({ teamId })` and a team's form line.
 */
export function involvesTeam(game: Game, team: { id: TeamId; slug: TeamSlug }): boolean {
  return (
    game.home.teamId === team.id ||
    game.away.teamId === team.id ||
    game.home.slug === team.slug ||
    game.away.slug === team.slug
  );
}
