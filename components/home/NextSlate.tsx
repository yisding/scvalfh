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
  // Counted over the whole shown day (`games`), not the capped list, so the meta matches the day.
  const nonLeague = games.filter((g) => !g.isLeague).length;
  const league = games.length - nonLeague;
  const counts = `${league} league${nonLeague > 0 ? `, ${nonLeague} non-league` : ''}`;
  // The date is omitted when the heading already says "today"; the counts always show.
  const showDate = date && !(isToday && !kicker);
  return (
    <section className={className}>
      <SectionHeader
        kicker={kicker ?? (isToday ? 'Still to play today' : 'Next up')}
        meta={
          date && shown.length > 0
            ? showDate
              ? `${shortDate(date)} · ${counts}`
              : counts
            : undefined
        }
        action={{ href: '/schedule', label: 'Full schedule' }}
      />
      {date && shown.length > 0 ? (
        <>
          <div className="sx-card sx-flush sx-bleed">
            <ol className="sx-list">
              {shown.map((game) => (
                <li key={game.contestId}>
                  <GameLine game={game} />
                </li>
              ))}
            </ol>
          </div>
          {total > shown.length ? (
            <p className="mt-4 mb-0 flex justify-center md:justify-start">
              <Link href={`/scores/${date}`} className="sx-pill min-h-11">
                See all {total} games on {shortDate(date)}
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
