import EmptyState from '../ui/EmptyState';
import { GameLine } from '../ui/GameRow';
import SectionHeader from '../ui/SectionHeader';
import { shortDate } from '../../lib/format';
import type { Game } from '../../lib/types';

/**
 * A league's remaining slate for today, or the next day that has one (SPEC §10.1, DESIGN §3.1).
 *
 * `GameLine` is the one-line form: time, `away at home`, and the game's chip. A scheduled game
 * NEVER shows a score column (DESIGN §5.2), and a start time we do not have reads TIME TBA rather
 * than a guess. Three rows at most; the action goes to the whole day on /scores/[date].
 */
export interface NextSlateProps {
  date: string | null;
  games: Game[];
  total: number;
  isToday: boolean;
  /** Overrides the kicker — "First games" before the season starts. */
  kicker?: string;
  limit?: number;
  /** Where the empty state points once the schedule is used up (the league's postseason page). */
  after: { href: string; label: string };
  as?: 'h2' | 'h3';
  className?: string;
}

export function NextSlate({
  date,
  games,
  total,
  isToday,
  kicker,
  limit = 3,
  after,
  as = 'h3',
  className,
}: NextSlateProps) {
  const shown = games.slice(0, limit);
  // Counted over the whole shown day (`games`), not the capped list, so the meta matches the day.
  const counted = games.filter((g) => g.countsFor !== null).length;
  const post = games.filter((g) => g.countsFor === null && g.postseason !== null).length;
  const nonLeague = games.length - counted - post;
  const counts =
    [
      counted > 0 ? `${counted} league` : null,
      nonLeague > 0 ? `${nonLeague} non-league` : null,
      post > 0 ? `${post} postseason` : null,
    ]
      .filter((part): part is string => part !== null)
      .join(', ') || `${games.length} ${games.length === 1 ? 'game' : 'games'}`;
  const has = date !== null && shown.length > 0;
  return (
    <section className={className}>
      <SectionHeader
        as={as}
        kicker={kicker ?? (isToday ? 'Still to play today' : 'Next up')}
        meta={has ? (isToday && !kicker ? counts : `${shortDate(date)} · ${counts}`) : undefined}
        action={has ? { href: `/scores/${date}`, label: `All ${total} on ${shortDate(date)}` } : undefined}
      />
      {has ? (
        <div className="sx-card sx-flush sx-bleed">
          <ol className="sx-list">
            {shown.map((game) => (
              <li key={game.contestId}>
                <GameLine game={game} />
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <EmptyState heading="Nothing left on the schedule." action={after}>
          Every contest we have for this league is behind us.
        </EmptyState>
      )}
    </section>
  );
}

export default NextSlate;
