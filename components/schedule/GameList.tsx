import { GameRow } from '../game-row/GameRow';
import type { Game, LeagueId } from '../../lib/types';
import { WIDE_SCORES } from '../words/score-words';

import { gameFilterAttrs } from './filter-data-server';

/**
 * One day's contests as a list of game rows (DESIGN §33).
 *
 * `<ul className="sx-games">` of `GameRow`s, ONE `<li>` per contest carrying the `data-*` filter
 * attributes, so the schedule filter has exactly one element per game to hide at any width, the
 * visible count is unambiguous, and there is no phone/desktop twin. The row lays itself out from
 * its own width (stacked, or one line from 40rem), so `layout` only chooses the list's shape:
 *   - `list` (default): one column of rows;
 *   - `grid`: auto-fill columns of stacked rows, 18.75rem minimum (1 / 2 / 3 at 390 / 768 / 1136).
 *
 * GameList is only ever a slate nobody is following one team through: /schedule/<league>,
 * /scores/[date] and the playoff lists. So every upcoming league game prints both sides' league
 * records beside their names (`showRecords`), which is what a reader sizing up a game wants.
 */
export interface GameListProps {
  games: readonly Game[];
  /** A league-scoped list: a side from another league carries its league's short name. */
  scopeLeague?: LeagueId | null;
  /** `list` (default): one column. `grid`: auto-fill columns of stacked rows. */
  layout?: 'list' | 'grid';
  /** @deprecated Nothing bleeds: the page is the only surface. Ignored. */
  variant?: 'bleed' | 'grouped';
  /** @deprecated The grid is always auto-fill. Ignored. */
  tracks?: 'fill' | 'fit';
  /** @deprecated A row holds one link, to the game page. Ignored. */
  bracket?: boolean;
  className?: string;
}

export function GameList({ games, scopeLeague = null, layout = 'list', className }: GameListProps) {
  return (
    <ul
      className={[
        'sx-games',
        layout === 'grid' ? 'sx-games-grid' : null,
        // Three-digit scores (basketball) need a wider score track in the one-line form.
        WIDE_SCORES ? 'sx-games-wide' : null,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {games.map((game) => (
        // The row is the <li>. No display utility on it: the filter toggles `hidden`, and a
        // `display` class would beat the attribute and leave a hole in the grid. The filter's own
        // `data-state` (final / pending / upcoming) replaces the row's.
        <GameRow
          key={game.contestId}
          as="li"
          attrs={{ ...gameFilterAttrs(game) }}
          game={game}
          scopeLeague={scopeLeague}
          showRecords
        />
      ))}
    </ul>
  );
}

export default GameList;
