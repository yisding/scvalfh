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
 * results. Phone gets the two-line 68px `GameRow` list (a `<details>`, so expanding needs no
 * JavaScript); ≥768px gets `GameCard`s 2-up, 3-up from 900px, with nothing to expand.
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
  /** "LATEST SCORES", or "FIRST GAMES" in the preseason. */
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
        action={{ href: `/scores/${date}`, label: `all ${total}` }}
      />
      {note ? <p className="mt-0 mb-2 max-w-[62ch] text-meta text-ink-2">{note}</p> : null}

      <div className="sx-bleed md:hidden">
        <ol className="sx-list">
          {shown.map((game) => (
            <li key={game.contestId}>
              <GameRow game={game} />
            </li>
          ))}
        </ol>
      </div>
      <ol className="hidden list-none grid-cols-2 gap-3 p-0 md:grid min-[900px]:grid-cols-3">
        {shown.map((game) => (
          <li key={game.contestId}>
            <GameCard game={game} />
          </li>
        ))}
      </ol>

      <p className="m-0 flex min-h-12 items-center justify-center border-t border-hairline text-meta md:justify-start md:border-0 md:pt-3">
        {/* `sx-action` + `min-h-11`: the paragraph around it is already 48px, but the LINK was 18px
            of it, which is what a thumb and WCAG 2.5.8 actually measure. */}
        <Link href={`/scores/${date}`} className="sx-action min-h-11 text-accent hover:underline">
          {rest > 0 ? `See all ${total} games` : `Every game from ${longDate(date)}`}{' '}
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </p>
    </section>
  );
}

export default LatestScores;
