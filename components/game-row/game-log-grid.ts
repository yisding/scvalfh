import type { Game } from '@/lib/model/game';
import { gameKind } from '@/views/shared/describe-game';

/**
 * The game-log row's grid (components/game-row/GameLogRow.tsx has its four columns and why), for
 * the hosts that wrap `GameLogRowBody` themselves: the /game/[id] season series
 * (components/game/SeasonSeries.tsx) and the team page's JV list (components/teams/TeamJvGames.tsx).
 */

/** The log row's four-column grid, shared with the team page's JV list (components/teams/TeamJvGames.tsx). */
export const GAME_LOG_ROW_GRID =
  'relative @container grid min-h-row-1 grid-cols-[minmax(0,3.5rem)_minmax(0,1.25rem)_minmax(0,3.25rem)_minmax(0,1fr)] items-center gap-x-3 px-gutter py-2 text-meta';

export function gameLogRowClass(game: Game, className?: string): string {
  // The non-league rule is `display.isNonLeague` (SPEC §10.4): neither counted for a league table
  // nor postseason. A postseason game is neither league nor NL, so it takes no rule.
  const nonLeague = gameKind(game) === 'non-league';
  return [
    GAME_LOG_ROW_GRID,
    nonLeague ? 'sx-nonleague' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');
}
