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
 * full-bleed flush card; ≥768px gets an auto-fill grid of `GameCard`s with nothing to expand
 * (15.5rem minimum each, so the 520px main column at 1024px still holds two).
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
      <ol className="hidden list-none grid-cols-[repeat(auto-fill,minmax(15.5rem,1fr))] gap-4 p-0 md:grid">
        {shown.map((game) => (
          <li key={game.contestId} className="grid">
            <GameCard game={game} />
          </li>
        ))}
      </ol>

      <p className="mt-4 mb-0 flex justify-center md:justify-start">
        {/* A 44px pill: alone in its paragraph it is a primary way on through the site, not a word
            in a sentence, so WCAG 2.5.8's inline exception does not cover it. */}
        <Link href={`/scores/${date}`} className="sx-pill min-h-11">
          {rest > 0 ? `See all ${total} games` : `Every game from ${longDate(date)}`}
        </Link>
      </p>
    </section>
  );
}

export default LatestScores;
