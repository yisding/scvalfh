import Link from 'next/link';

import EmptyState from '../ui/EmptyState';
import { GameLine } from '../ui/GameRow';
import SectionHeader from '../ui/SectionHeader';
import { plural } from '../ui/plural';
import { gameKind } from '../ui/describe-game';
import { shortDate } from '../../lib/format';
import type { Game } from '../../lib/types';
import type { NextLeagueDay } from './home-view';

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
  /** The league's first league day after `date` (its league games, every contest it has in
      `total`, and how many of those are postseason and non-league contests). */
  nextLeague?: Omit<NextLeagueDay, 'isToday'> | null;
  /** Where the empty state points once the schedule is used up (the league's postseason page). */
  after: { href: string; label: string };
  className?: string;
}

/** Rows shown for the slate day; the action goes to the whole day on /scores/[date]. */
const ROWS = 3;
/** League games shown under "Next league games": enough to name the day, not a second slate. */
const RESUME_LIMIT = 3;

export function NextSlate({
  date,
  games,
  total,
  isToday,
  kicker,
  nextLeague,
  after,
  className,
}: NextSlateProps) {
  const shown = games.slice(0, ROWS);
  // Counted over the whole shown day (`games`), not the capped list, so the meta matches the day.
  const counted = games.filter((g) => gameKind(g) === 'league').length;
  const post = games.filter((g) => gameKind(g) === 'postseason').length;
  const nonLeague = games.filter((g) => gameKind(g) === 'non-league').length;
  const counts =
    [
      counted > 0 ? `${counted} league` : null,
      nonLeague > 0 ? `${nonLeague} non-league` : null,
      post > 0 ? `${post} postseason` : null,
    ]
      .filter((part): part is string => part !== null)
      .join(', ') || plural(games.length, 'game');
  const has = date !== null && shown.length > 0;
  // Judged over the whole day, like the counts: a league game cut off by `ROWS` is still that
  // day's, and the card must not say league play resumes on a later date under a "1 league" meta.
  const resume =
    nextLeague && nextLeague.games.length > 0 && games.every((g) => gameKind(g) !== 'league')
      ? nextLeague
      : null;
  // `resume.games` is that later day's playable games counted in THIS league's tables (a day after
  // the slate day, so all of them); the postseason and non-league counts come with it, each
  // counted directly over every contest of the league that day (the list its /scores page shows),
  // never derived by subtraction from `total`.
  const resumeLeague = resume ? resume.games.length : 0;
  const resumePost = resume ? resume.postseason : 0;
  const resumeOther = resume ? resume.nonLeague : 0;
  return (
    <section className={className}>
      <SectionHeader
        as="h3"
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
                {/* One level below the block's own heading (panel h2 → block h3 → sub-row h4). */}
                <h4 className="m-0 text-micro font-semibold text-ink-3">Next league games</h4>
                {/* In a <p> so it takes the site's in-text link underline: in ink-2 it is
                    otherwise indistinguishable from the date it names. The link goes to the
                    whole day's /scores page, but a bare "3 games" under a "league games"
                    heading with two rows read as a missing row, so it says what it counts, in
                    the same words as the card's meta: "2 league, 1 non-league". */}
                <p className="m-0">
                  <Link
                    href={`/scores/${resume.date}`}
                    prefetch={false}
                    className="sx-action text-meta text-ink-2"
                  >
                    {shortDate(resume.date)} &middot; {resumeLeague} league
                    {resumeOther > 0 ? `, ${resumeOther} non-league` : ''}
                    {resumePost > 0 ? `, ${resumePost} postseason` : ''}
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
