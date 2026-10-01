import Link from 'next/link';

import EmptyState from '../ui/EmptyState';
import { GameLine } from '../ui/GameRow';
import SectionHeader from '../ui/SectionHeader';
import { shortDate } from '../../lib/format';
import type { Game } from '../../lib/types';

/**
 * Today's remaining slate, or the next day that has one (DESIGN §3.1).
 *
 * `GameLine` is the one-line form: time, `away at home`, and whether it counts for the league.
 * A scheduled game NEVER shows a score column (DESIGN §5.2), and a start time we do not have reads
 * TIME TBA rather than a guess.
 */
export interface NextSlateProps {
  date: string | null;
  games: Game[];
  total: number;
  isToday: boolean;
  /** Overrides the kicker — "First games" before the season starts. */
  kicker?: string;
  limit?: number;
  className?: string;
}

export function NextSlate({ date, games, total, isToday, kicker, limit = 4, className }: NextSlateProps) {
  const shown = games.slice(0, limit);
  return (
    <section className={className}>
      {/* No `meta` when the kicker already says "today": three slots on one 390px line —
          "STILL TO PLAY TODAY", "Wed Sep 30" and "full schedule →" — is more than the row can
          hold, and it broke the rule-and-kicker's one-line signature (DESIGN §7.2), standing 53px
          tall where every other kicker on the page is 33px. The date is the one thing of the three
          that is redundant: "today" names it, and the lead above states it in full. On any other
          day the kicker is the short "Next up" and the date is the information, so it stays. */}
      <SectionHeader
        kicker={kicker ?? (isToday ? 'Still to play today' : 'Next up')}
        meta={date && !(isToday && !kicker) ? shortDate(date) : undefined}
        action={{ href: '/schedule', label: 'full schedule' }}
      />
      {date && shown.length > 0 ? (
        <>
          <div className="sx-bleed">
            <ol className="sx-list">
              {shown.map((game) => (
                <li key={game.contestId}>
                  <GameLine game={game} />
                </li>
              ))}
            </ol>
          </div>
          {total > shown.length ? (
            <p className="m-0 flex min-h-12 items-center justify-center border-t border-hairline text-meta md:justify-start md:border-0 md:pt-3">
              <Link href={`/scores/${date}`} className="sx-action min-h-11 text-accent hover:underline">
                See all {total} games on {shortDate(date)} <span aria-hidden="true">&rarr;</span>
              </Link>
            </p>
          ) : null}
        </>
      ) : (
        <EmptyState
          heading="Nothing left on the schedule."
          action={{ href: '/playoffs', label: 'CCS playoffs' }}
        >
          Every contest we have is behind us. What happens next is the CCS tournament.
        </EmptyState>
      )}
    </section>
  );
}

export default NextSlate;
