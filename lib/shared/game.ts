/**
 * The two single derivations every game list and every outcome on the site goes through: the
 * canonical game order and one side's W/L/T. Pure and client-safe (type imports only).
 */

import type { Game, Outcome } from '@/lib/model/game';

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
 * One side's W/L/T in a final, or null unless the game is final with both scores. THE single
 * derivation every outcome on the site goes through (standings, form, chips, series summaries):
 * a stored shootout tally decides when present; a decider 'SO' with complementary result flags
 * {W, L} (an EAL 1 v 1 win, or a San Diego Section shootout win MaxPreps records as a level score:
 * no tally stored) takes that side's flag; anything else is read off the score. Section-free on
 * purpose: `decider` 'SO' is only ever written by lib/normalize.ts for two teams of a section whose
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
