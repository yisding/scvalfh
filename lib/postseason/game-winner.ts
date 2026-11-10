/**
 * The winner of a final, kept pure and apart from lib/postseason/sds-bracket.ts (which reads the bundled
 * snapshot) so the pipeline (lib/postseason/sds-sheet-results.ts), the CCS ladder outcomes and the bracket
 * components all read one rule.
 */

import type { Game, TeamSlug } from '../types';

/**
 * The winning side of a final: the higher score; a level score goes to the side MaxPreps marks 'W' alone (the
 * San Diego shootout convention); null when the game is not final or nothing decides it. The play-in card's
 * winner line (components/playoffs/PlayInCard.tsx) and the ladder outcomes (postseason-outcomes.ts) read it,
 * so card and team line agree.
 */
export function winningSide(game: Game): 'home' | 'away' | null {
  if (game.status !== 'final') return null;
  const h = game.home.score;
  const a = game.away.score;
  if (h === null || a === null) return null;
  if (h > a) return 'home';
  if (a > h) return 'away';
  if (game.home.result === 'W' && game.away.result !== 'W') return 'home';
  if (game.away.result === 'W' && game.home.result !== 'W') return 'away';
  return null;
}

/**
 * The winner of a game, by slug: winningSide's side. Kept here, pure, rather than widening
 * lib/postseason/postseason.ts's MCAL helper, which reads a TournamentGame.
 */
export function winnerOf(game: Game): TeamSlug | null {
  const s = winningSide(game);
  return s === null ? null : game[s].slug;
}
