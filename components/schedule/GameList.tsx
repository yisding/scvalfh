import { GameCard, GameRow } from '../ui/GameRow';
import type { Game, TeamSlug } from '../../lib/types';

import { gameFilterAttrs } from './filter-data';

/**
 * One day's contests as a list (DESIGN §3.3, §3.4, §7.4).
 *
 * Phone gets the 76px two-line `GameRow` — a `<details>`/`<summary>` pair, so expanding a game
 * needs no JavaScript — in one full-bleed band. From 768px the same games are `GameCard`s in an
 * auto-fill grid (17rem minimum, so 2-up at 768 and 3- or 4-up wider), with the recap always
 * visible and nothing to expand.
 *
 * Both render inside ONE `<li>` per contest, with one set of `data-*` filter attributes, so:
 *   - the filter has exactly one element per game to hide, at any viewport width,
 *   - the visible count is unambiguous,
 *   - and DOM order matches visual order at both breakpoints (DESIGN §10.5).
 * That is the same "render both variants and hide one" pattern `StandingsTable` uses, because the
 * phone and desktop forms are genuinely different DOM rather than a restyle.
 *
 * With no `perspective` — /schedule and /scores/[date], a slate nobody is following one team
 * through — an upcoming league game prints each SCVAL side's league record beside its name
 * (`showRecords`), which is what a reader sizing up a game before kickoff wants. A list oriented to
 * one team leaves them off: that team's own page already leads with its record.
 */
export interface GameListProps {
  games: readonly Game[];
  perspective?: TeamSlug | null;
  /** Default true on /schedule and /scores/[date]; the recap is never the only place a score is. */
  showRecap?: boolean;
  /**
   * `bleed` (default): the phone band pulls itself out to the screen edge (`.sx-bleed`) and draws
   * its own line above and below. `grouped`: the HOST is already full-bleed (a /schedule date
   * group, which must be, because `content-visibility: auto` clips paint to its own box) and its
   * sticky date header draws the line above, so the list adds only the line below.
   */
  variant?: 'bleed' | 'grouped';
  /**
   * The ≥768px grid's track rule. `fill` (default) keeps empty tracks, so a /schedule day with
   * one game shows one card-sized card. `fit` collapses them, so a single-day page's two or
   * three cards run to the same right edge as everything else under its h1.
   */
  tracks?: 'fill' | 'fit';
  className?: string;
  id?: string;
}

export function GameList({
  games,
  perspective = null,
  showRecap = true,
  variant = 'bleed',
  tracks = 'fill',
  className,
  id,
}: GameListProps) {
  const showRecords = perspective === null;
  return (
    <ol
      id={id}
      // Tailwind v4's scanner skips a candidate that runs straight into `${`, so the
      // interpolation stays out of the literal.
      className={[
        'sx-list max-md:bg-surface md:grid md:items-stretch md:gap-4',
        tracks === 'fit'
          ? 'md:grid-cols-[repeat(auto-fit,minmax(17rem,1fr))]'
          : 'md:grid-cols-[repeat(auto-fill,minmax(17rem,1fr))]',
        variant === 'bleed'
          ? 'sx-bleed max-md:shadow-[0_-1px_0_var(--sx-border),0_1px_0_var(--sx-border)]'
          : 'max-md:shadow-[0_1px_0_var(--sx-border)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {games.map((game) => (
        // No display utility on the <li>: the filter toggles `hidden` on it, and a `display`
        // class would beat the attribute and leave a hole in the grid.
        <li key={game.contestId} {...gameFilterAttrs(game)} className="md:border-b-0">
          <GameRow
            game={game}
            perspective={perspective}
            showRecap={showRecap}
            showRecords={showRecords}
            className="md:hidden"
          />
          <div className="hidden h-full md:block">
            <GameCard
              game={game}
              perspective={perspective}
              showRecap={showRecap}
              showRecords={showRecords}
              className="h-full"
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

export default GameList;
