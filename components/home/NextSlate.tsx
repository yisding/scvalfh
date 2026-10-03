import Link from 'next/link';

import EmptyState from '../ui/EmptyState';
import { GameLine } from '../ui/GameRow';
import SectionHeader from '../ui/SectionHeader';
import { plural } from '../ui/plural';
import { shortDate } from '../../lib/format';
import type { Game } from '../../lib/types';

/**
 * A league's remaining slate for today, or the next day that has one (SPEC §10.1, DESIGN §3.1).
 *
 * `GameLine` is the one-line form: time, `away at home`, and the game's chip. A scheduled game
 * NEVER shows a score column (DESIGN §5.2), and a start time we do not have reads TIME TBA rather
 * than a guess. Three rows at most; the action goes to the whole day on /scores/[date].
 *
 * When everything shown is non-league, the same card ends with the league's next LEAGUE day
 * (`nextLeague`): a reader following the table wants to know when it next changes, and
 * "2 non-league" alone does not say.
 */
export interface NextSlateProps {
  date: string | null;
  games: Game[];
  total: number;
  isToday: boolean;
  /** Overrides the kicker — "First games" before the season starts. */
  kicker?: string;
  limit?: number;
  /** The league's first league day after `date` (its league games, and every contest it has in `total`). */
  nextLeague?: { date: string; games: Game[]; total: number } | null;
  /** Where the empty state points once the schedule is used up (the league's postseason page). */
  after: { href: string; label: string };
  as?: 'h2' | 'h3';
  className?: string;
}

/** League games shown under "Next league games": enough to name the day, not a second slate. */
const RESUME_LIMIT = 3;

export function NextSlate({
  date,
  games,
  total,
  isToday,
  kicker,
  limit = 3,
  nextLeague,
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
      .join(', ') || plural(games.length, 'game');
  const has = date !== null && shown.length > 0;
  // Judged over the whole day, like the counts: a league game cut off by `limit` is still that
  // day's, and the card must not say league play resumes on a later date under a "1 league" meta.
  const resume =
    nextLeague && nextLeague.games.length > 0 && games.every((g) => g.countsFor === null)
      ? nextLeague
      : null;
  // One level below the block's own heading (panel h2 → block h3 → sub-row h4).
  const Sub = as === 'h2' ? 'h3' : 'h4';
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
          {resume ? (
            /* A sub-row of the same card, not a second section: a 44px line naming the day (its
               /scores page is the "see all"; no second pill), then its first league games in the
               same one-line form. */
            <div className="border-t border-divider">
              <div className="flex min-h-11 flex-wrap items-center gap-x-3 px-gutter py-1">
                <Sub className="m-0 text-micro font-semibold text-ink-3">Next league games</Sub>
                {/* In a <p> so it takes the site's in-text link underline: in ink-2 it is
                    otherwise indistinguishable from the date it names. */}
                <p className="m-0">
                  <Link
                    href={`/scores/${resume.date}`}
                    prefetch={false}
                    className="sx-action text-meta text-ink-2"
                  >
                    {shortDate(resume.date)} &middot; {plural(resume.total, 'game')}
                  </Link>
                </p>
              </div>
              <ol className="sx-list border-t border-divider">
                {resume.games.slice(0, RESUME_LIMIT).map((game) => (
                  <li key={game.contestId}>
                    <GameLine game={game} />
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
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
