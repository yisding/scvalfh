import { GameCard, GameRow } from '../ui/GameRow';
import type { Game, TeamSlug } from '../../lib/types';

import { gameFilterAttrs } from './filter-data';

/**
 * One day's contests as a list (DESIGN §3.3, §3.4, §7.4).
 *
 * Phone gets the 68px two-line `GameRow` — a `<details>`/`<summary>` pair, so expanding a game
 * needs no JavaScript. Desktop gets the same games as `GameCard`s, 2-up at 768px and 3-up at
 * 1120px, with the recap and venue always visible and nothing to expand.
 *
 * Both render inside ONE `<li>` per contest, with one set of `data-*` filter attributes, so:
 *   - the filter has exactly one element per game to hide, at any viewport width,
 *   - the visible count is unambiguous,
 *   - and DOM order matches visual order at both breakpoints (DESIGN §10.5).
 * That is the same "render both variants and hide one" pattern `StandingsTable` uses, because the
 * phone and desktop forms are genuinely different DOM rather than a restyle.
 */
export interface GameListProps {
  games: readonly Game[];
  perspective?: TeamSlug | null;
  /** Default true on /schedule and /scores/[date]; the recap is never the only place a score is. */
  showRecap?: boolean;
  className?: string;
  id?: string;
}

export function GameList({
  games,
  perspective = null,
  showRecap = true,
  className,
  id,
}: GameListProps) {
  return (
    <ol
      id={id}
      // Tailwind v4's scanner skips a candidate that runs straight into `${`, which is how
      // `xl:grid-cols-3` — DESIGN §3.3's desktop 3-up card grid — went missing from the built
      // CSS while every other class here survived. Keep the interpolation out of the literal.
      className={[
        'sx-bleed m-0 list-none p-0 md:grid md:grid-cols-2 md:items-start md:gap-3 xl:grid-cols-3',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {games.map((game) => (
        <li
          key={game.contestId}
          {...gameFilterAttrs(game)}
          className="border-b border-hairline last:border-b-0 md:border-b-0"
        >
          <GameRow
            game={game}
            perspective={perspective}
            showRecap={showRecap}
            className="md:hidden"
          />
          <GameCard
            game={game}
            perspective={perspective}
            showRecap={showRecap}
            className="hidden md:block"
          />
        </li>
      ))}
    </ol>
  );
}

export default GameList;
