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
 *
 * When everything shown is non-league, the same card ends with the next LEAGUE day: a reader
 * following the table wants to know when it next changes, and "2 non-league" alone does not say.
 */
export interface NextSlateProps {
  date: string | null;
  games: Game[];
  total: number;
  isToday: boolean;
  /** Overrides the kicker — "First games" before the season starts. */
  kicker?: string;
  limit?: number;
  /** The first league day after `date` (its league games, and every contest it has in `total`). */
  nextLeague?: { date: string; games: Game[]; total: number } | null;
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
  limit = 4,
  nextLeague,
  className,
}: NextSlateProps) {
  const shown = games.slice(0, limit);
  // Counted over the whole shown day (`games`), not the capped list, so the meta matches the day.
  // Only the non-zero parts: "2 non-league", not "0 league, 2 non-league".
  const nonLeague = games.filter((g) => !g.isLeague).length;
  const league = games.length - nonLeague;
  const counts = [
    league > 0 ? `${league} league` : null,
    nonLeague > 0 ? `${nonLeague} non-league` : null,
  ]
    .filter(Boolean)
    .join(', ');
  // The date is omitted when the heading already says "today"; the counts always show.
  const showDate = date && !(isToday && !kicker);
  // Judged over the whole day, like the counts: a league game cut off by `limit` is still today's,
  // and the card must not say league play resumes on a later date under a "1 league" meta.
  const resume =
    nextLeague && nextLeague.games.length > 0 && games.every((g) => !g.isLeague) ? nextLeague : null;
  const resumeRows = resume ? resume.games.slice(0, RESUME_LIMIT) : [];
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
            {resume ? (
              /* A sub-row of the same card, not a second section: a 44px line naming the day
                 (its /scores page is the "see all"; no second pill), then its first league
                 games in the same one-line form. */
              <div className="border-t border-divider">
                <div className="flex min-h-11 flex-wrap items-center gap-x-3 px-gutter py-1">
                  <h3 className="m-0 text-micro font-semibold text-ink-3">Next league games</h3>
                  {/* In a <p> so it takes the site's in-text link underline: in ink-2 it is
                      otherwise indistinguishable from the date it names. The count is the whole
                      day's /scores page, not the league rows below it, so it says "all N" when
                      that day has more contests than the rows show. */}
                  <p className="m-0">
                    <Link
                      href={`/scores/${resume.date}`}
                      prefetch={false}
                      className="sx-action text-meta text-ink-2"
                    >
                      {shortDate(resume.date)} &middot;{' '}
                      {resume.total > resumeRows.length
                        ? `all ${resume.total} games`
                        : `${resume.total} ${resume.total === 1 ? 'game' : 'games'}`}
                    </Link>
                  </p>
                </div>
                <ol className="sx-list border-t border-divider">
                  {resumeRows.map((game) => (
                    <li key={game.contestId}>
                      <GameLine game={game} />
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </div>
          {total > shown.length ? (
            <p className="mt-4 mb-0 flex justify-center md:justify-start">
              {/* On the canvas, not in a card, so the surface-2 pill alone barely separated from
                  the page in light: a surface fill and the 1px ring make it read as a button. */}
              <Link
                href={`/scores/${date}`}
                className="sx-pill min-h-11 bg-surface shadow-[var(--sx-ring)] hover:bg-surface-2"
              >
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
