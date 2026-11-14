/**
 * A level final in a game that must have a winner: the one rule for it, pure, read by the pipeline's classify
 * step (lib/pipeline/steps/classify.ts) and by the snapshot's load-time upgrade (lib/snapshot/snapshot-migrate.ts).
 *
 * MaxPreps records a game settled by a tiebreak (field hockey's shootout, soccer's kicks from the penalty mark)
 * as the level score with one side marked W and the other L, and stores no tally. lib/pipeline/normalize.ts reads
 * that shape as a win where a SECTION's rule ends every level varsity game that way (SectionConfig.shootout: the
 * Northern Section's 1 v 1s, the San Diego Section's shootout). This module covers the games no section rule
 * reaches but which cannot end level whatever the regular-season rule is:
 *
 *  - a postseason game (any `Game.postseason` tag: a CCS or San Diego playoff, a league tournament, a play-in, a
 *    crossover, the Tournament of Champions). Saint Francis 1, Archbishop Mitty 1 (CCS Division 1 semifinal, Nov
 *    11, 2026, contest 7d6e0426) is marked W for Saint Francis, who play the final; the 2025 CCS semifinal Willow
 *    Glen 1, Stevenson 1 has the same shape (data/history-brackets-2025-26.json). Read as its score, such a game
 *    was a tie in both teams' records, form and game logs while the bracket (lib/postseason/game-winner.ts)
 *    advanced the marked side.
 *  - any game of a sport that cannot end level (`Sport.scoring.allowsTies` false: basketball plays overtime
 *    until one team leads). A level basketball score is a score entered wrong; the marked side still won.
 *
 * Such a final gets decider 'SO' ("level on the scoreboard, won by the marked side", lib/types.ts Decider), so
 * `sideOutcome` (lib/format.ts), the one derivation of every W, L and T, gives the marked side the win, and the
 * sentence in `provenance.resultConflict` that called the flags a contradiction is dropped: they are the
 * result. The score, the overtime count and everything else stay as recorded. No source this site reads says
 * HOW the tie was broken, so the copy says only that MaxPreps credits the win (components/ui/describe-game.ts
 * `tiebreakRuleOf`: inference 'unverified').
 *
 *  - a tournament game (MaxPreps' contestType 2 on either row): Huntington Beach 0, Hockaday 0 (Aug 21) and
 *    University 0, Gilroy 0 (Sep 12) are marked W and L. A tournament game marked that way was played to a
 *    winner (owner decision, 2026-11-13).
 *
 * Left alone, on purpose:
 *  - any other regular-season game outside a shootout section: no rule this site has read says the game needed
 *    a winner, so the score is the record, it counts as a tie, and the game page prints MaxPreps' flags as a
 *    contradiction (where si.com has a decisive score, D2 rule 4a publishes that instead);
 *  - a level final with no winner marked (T and T, or no flags): nothing says who won;
 *  - a forfeit, and a final already 'SO';
 *  - JV games: the JV pipeline (scripts/fetch-jv.ts) tags no postseason and never calls this.
 */

import { SPORT } from '../sports/current';
import type { Game, GameSide } from '../types';

/** A level score whose result flags are complementary W and L (either order). */
export function isLevelWithWinner(home: Pick<GameSide, 'score' | 'result'>, away: Pick<GameSide, 'score' | 'result'>): boolean {
  return (
    home.score !== null &&
    home.score === away.score &&
    ((home.result === 'W' && away.result === 'L') || (home.result === 'L' && away.result === 'W'))
  );
}

/**
 * The sentence lib/pipeline/normalize.ts writes into `provenance.resultConflict` when a side's flag contradicts
 * the score. One definition, so the writer and `settleLevelFinal`, which removes it, cannot drift apart.
 */
export function flagConflictSentence(home: Pick<GameSide, 'name' | 'score' | 'result'>, away: Pick<GameSide, 'name' | 'score' | 'result'>): string {
  return (
    `MaxPreps marks ${home.name} ${home.result ?? 'unflagged'} and ${away.name} ${away.result ?? 'unflagged'} ` +
    `on a ${home.score}-${away.score} score.`
  );
}

/** Whether either side's MaxPreps row marks the game a tournament game (contestType 2). */
export function isTournamentRow(game: Pick<Game, 'contestTypes'>): boolean {
  return game.contestTypes?.home === 2 || game.contestTypes?.away === 2;
}

/**
 * Whether a level score with one side marked the winner is a result and not a contradiction: any game of a sport
 * with no ties; any postseason game; and a tournament game (owner decision, 2026-11-13: a tournament game marked
 * W and L was played to a winner). A tournament game MaxPreps marks T and T stays a tie: pool games end level,
 * and 22 of the 24 level tournament finals of 2026 are marked that way.
 */
export function mustHaveWinner(game: Pick<Game, 'postseason' | 'contestTypes'>): boolean {
  return !SPORT.scoring.allowsTies || (game.postseason !== null && game.postseason !== undefined) || isTournamentRow(game);
}

/**
 * Whether `settleLevelFinal` would change the game: a final that is not a forfeit and not already 'SO', in a game
 * that must have a winner, level on the scoreboard with one side marked W and the other L.
 */
export function isUnsettledLevelFinal(game: Game): boolean {
  if (game.status !== 'final' || game.isForfeit || game.decider === 'SO' || game.decider === 'FORFEIT') return false;
  return mustHaveWinner(game) && isLevelWithWinner(game.home, game.away);
}

/** The game with decider 'SO' and the flag sentence gone from its result conflict; the same object when nothing applies. */
export function settleLevelFinal(game: Game): Game {
  if (!isUnsettledLevelFinal(game)) return game;
  const { resultConflict, ...provenance } = game.provenance;
  // A feed-disagreement note (normalize's second sentence) is still evidence and stays.
  const rest = resultConflict?.replace(flagConflictSentence(game.home, game.away), '').trim();
  return { ...game, decider: 'SO', provenance: { ...provenance, ...(rest ? { resultConflict: rest } : {}) } };
}

/** `settleLevelFinal` over a list: the same array when no game changes. */
export function settleLevelFinals(games: readonly Game[]): Game[] {
  const out = games.map(settleLevelFinal);
  return out.some((g, i) => g !== games[i]) ? out : (games as Game[]);
}
