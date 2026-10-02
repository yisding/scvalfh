import Link from 'next/link';

import { GameCard, GameRow } from '../ui/GameRow';
import SectionHeader from '../ui/SectionHeader';
import { longDate, shortDate } from '../../lib/format';
import type { Game } from '../../lib/types';

/**
 * The latest day's slate (DESIGN §3.1, §8).
 *
 * The day is ALWAYS named, in the kicker and in the footer link, so a day-old score can never read
 * as "last night" — that is §8's rule for the fallback to the most recent day that actually has
 * results. Phone gets the `GameRow` list (a `<details>`, so expanding needs no JavaScript) as a
 * full-bleed flush card; ≥768px gets a grid of `GameCard`s with nothing to expand.
 *
 * The grid is sized to the COUNT rather than auto-filled, so no card is left alone on a row beside
 * a card-sized hole (3 cards in 2 auto-fill columns put the third one under the first, next to
 * 330×226px of empty canvas). Two columns everywhere from 768px — the main column is 552–680px at
 * 1024+ — except that 3 or 6 cards go three across at 872–1023px, where each is still 264px wide
 * (a card's time and status line need about 258px, or "4:00 PM" breaks after the time). In two
 * columns, an odd count lets the FIRST card span the row, so the rest pair up beneath it.
 *
 * Every class below is a whole literal so Tailwind's scanner generates it.
 *
 * A game with no reported score renders two en dashes and the words SCORE NOT REPORTED — never
 * `0-0` — because every score on the site goes through `renderScore()` (DESIGN §5.2, §5.3).
 */
export interface LatestScoresProps {
  /** 'YYYY-MM-DD' */
  date: string;
  games: Game[];
  /** How many contests that day, before the cap below. */
  total: number;
  /** "Latest scores", or "Played, not reported" for a day with no results. */
  kicker?: string;
  /** The §8 sentence for a day that was played and reported nothing. */
  note?: string;
  /** Rows to show before the "see all" link. */
  limit?: number;
  className?: string;
}

export function LatestScores({
  date,
  games,
  total,
  kicker = 'Latest scores',
  note,
  limit = 6,
  className,
}: LatestScoresProps) {
  const shown = games.slice(0, limit);
  const rest = total - shown.length;
  const threeUp = shown.length % 3 === 0;
  const odd = shown.length % 2 === 1;
  const gridClass = threeUp
    ? 'hidden list-none grid-cols-2 gap-4 p-0 md:grid min-[54.5rem]:grid-cols-3 lg:grid-cols-2'
    : 'hidden list-none grid-cols-2 gap-4 p-0 md:grid';
  // The first card's span: full row whenever the grid is two across and the count is odd.
  const firstClass = !odd
    ? 'grid'
    : threeUp
      ? 'grid col-span-2 min-[54.5rem]:col-span-1 lg:col-span-2'
      : 'grid col-span-2';
  return (
    <section className={className}>
      <SectionHeader
        kicker={kicker}
        meta={shortDate(date)}
        action={{ href: `/scores/${date}`, label: `All ${total} ${total === 1 ? 'game' : 'games'}` }}
      />
      {note ? <p className="sx-inset mt-0 mb-3 max-w-prose">{note}</p> : null}

      <div className="sx-card sx-flush sx-bleed md:hidden">
        <ol className="sx-list">
          {shown.map((game) => (
            <li key={game.contestId}>
              <GameRow game={game} />
            </li>
          ))}
        </ol>
      </div>
      <ol className={gridClass}>
        {shown.map((game, i) => (
          <li key={game.contestId} className={i === 0 ? firstClass : 'grid'}>
            <GameCard game={game} />
          </li>
        ))}
      </ol>

      <p className="mt-4 mb-0 flex justify-center md:justify-start">
        {/* A 44px pill: alone in its paragraph it is a primary way on through the site, not a word
            in a sentence, so WCAG 2.5.8's inline exception does not cover it. It sits on the
            canvas, not in a card, where a surface-2 pill barely separated from the page in
            light: a surface fill and the 1px ring make it read as a button. */}
        <Link
          href={`/scores/${date}`}
          className="sx-pill min-h-11 bg-surface shadow-[var(--sx-ring)] hover:bg-surface-2"
        >
          {rest > 0 ? `See all ${total} games` : `Every game from ${longDate(date)}`}
        </Link>
      </p>
    </section>
  );
}

export default LatestScores;
