import { GameRow } from '../game-row/GameRow';
import type { Game, LeagueId } from '../../lib/types';
import { WIDE_SCORES } from '../words/score-words';

import { gameFilterAttrs } from './filter-data-server';

/**
 * A list of game rows (DESIGN §33).
 *
 * `<div className="sx-gamelist"><ul className="sx-games">` of `GameRow`s. The outer div is the size
 * container: under 44rem of its width the list is one column; from 44rem it is auto-fill columns
 * of the same rows (two in a 760px main column, three across a full page), filled left to right in
 * the order given. ONE `<li>` per contest carries the `data-*` filter attributes, so the schedule
 * filter has exactly one element per game to hide at any width and there is no phone/desktop twin.
 *
 * One row size, and every final prints "Final", so `layout`, `lead`, `dense`, `variant` and
 * `tracks` are accepted and ignored. `solo` keeps a single game on one full-width row (a team's
 * next game). Order is the caller's.
 */
export interface GameListProps {
  games: readonly Game[];
  /** @deprecated A row prints no league suffix. Ignored. */
  scopeLeague?: LeagueId | null;
  /** One full-width column whatever the list's width (`sx-games-solo`). */
  solo?: boolean;
  /**
   * true where the list is NOT grouped by competition (a league's schedule by date, a rail list):
   * each row then notes its round or `Non-league`. Default false: a list sits under its
   * competition's own strip, which already says it.
   */
  showChips?: boolean;
  /** The list spans days: an upcoming row prints its date under its start time. */
  showDate?: boolean;
  /** One link at the end of each row's note ("Bracket"): a team page's next game. */
  noteLink?: { href: string; label: string };
  /** @deprecated One row size. Ignored. */
  layout?: 'list' | 'grid';
  /** @deprecated One row size. Ignored. */
  lead?: boolean;
  /** @deprecated Every final prints "Final". Ignored. */
  dense?: boolean;
  /** @deprecated Nothing bleeds: the page is the only surface. Ignored. */
  variant?: 'bleed' | 'grouped';
  /** @deprecated The list chooses its own columns. Ignored. */
  tracks?: 'fill' | 'fit';
  /** @deprecated A row holds one link, to the game page. Ignored. */
  bracket?: boolean;
  /** Goes on the `<ul>`. */
  className?: string;
}

export function GameList({ games, solo = false, showChips = false, showDate = false, noteLink, className }: GameListProps) {
  return (
    <div className="sx-gamelist">
      <ul
        className={[
          'sx-games',
          solo ? 'sx-games-solo' : null,
          // Three-digit scores (basketball) need a wider score cell.
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
            showChips={showChips}
            showDate={showDate}
            noteLink={noteLink}
          />
        ))}
      </ul>
    </div>
  );
}

export default GameList;
