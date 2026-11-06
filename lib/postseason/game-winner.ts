/**
 * The winner of a San Diego Section playoff game, kept pure and apart from lib/postseason/sds-bracket.ts (which
 * reads the bundled snapshot) so the pipeline can use it too (lib/postseason/sds-sheet-results.ts).
 */

import type { Game, TeamSlug } from '../types';

/**
 * The winner of a game: the higher score; a level score goes to the side MaxPreps marks 'W' (the San Diego
 * shootout convention); null when the game is not final or nothing decides it. Kept here, pure, rather
 * than widening lib/postseason/postseason.ts's MCAL helper, which reads a TournamentGame.
 */
export function winnerOf(game: Game): TeamSlug | null {
  if (game.status !== 'final') return null;
  const h = game.home.score;
  const a = game.away.score;
  if (h === null || a === null) return null;
  if (h > a) return game.home.slug;
  if (a > h) return game.away.slug;
  if (game.home.result === 'W' && game.away.result !== 'W') return game.home.slug;
  if (game.away.result === 'W' && game.home.result !== 'W') return game.away.slug;
  return null;
}
