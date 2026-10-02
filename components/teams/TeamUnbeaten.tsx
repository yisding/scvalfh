import Link from 'next/link';

import { monthDay, recordString } from '../../lib/format';
import { getTeamBySlug } from '../../lib/teams';
import EmptyState from '../ui/EmptyState';
import TeamMonogram from '../ui/TeamMonogram';
import type { TeamPageView, UnbeatenOpponent } from './team-view';

/**
 * "Who we haven't beaten" (DESIGN §3.7, grafted from `data-dense`).
 *
 * Every division opponent this team has no win against, soonest meeting first. It is the one
 * question a parent asks that no table answers: a record says how the season went, this says what
 * is still available. A double round robin (Article VI §1) means a name can appear with two
 * meetings left, one, or none at all.
 *
 * An opponent whose remaining games exist ONLY in the official SCVAL grid is labelled
 * "unreported", never counted as a scheduled game we have a date and time for.
 */
function statusOf(opponent: UnbeatenOpponent): string {
  if (opponent.nextDate !== null) return `next ${monthDay(opponent.nextDate)}`;
  if (opponent.remaining > 0) return `${opponent.remaining} to play`;
  if (opponent.unreportedFixtures > 0) return `${opponent.unreportedFixtures} unreported`;
  return 'no games left';
}

function sentenceFor(opponent: UnbeatenOpponent): string {
  const played =
    opponent.played === 0
      ? 'not played yet'
      : `${recordString(opponent.record)} in ${opponent.played} ${
          opponent.played === 1 ? 'game' : 'games'
        }`;
  const ahead =
    opponent.nextDate !== null
      ? `next meeting ${monthDay(opponent.nextDate)}`
      : opponent.remaining > 0
        ? `${opponent.remaining} still to play`
        : opponent.unreportedFixtures > 0
          ? `${opponent.unreportedFixtures} scheduled per SCVAL with no result reported`
          : 'no games left';
  return `${opponent.name}: ${played}, ${ahead}`;
}

function OpponentRow({ opponent }: { opponent: UnbeatenOpponent }) {
  const team = getTeamBySlug(opponent.slug);
  return (
    <li>
      {/* `prefetch={false}` for the reason the nav and the standings rows carry it
          (components/layout/NavLink.tsx, components/ui/StandingsTable.tsx): every route here is
          STATIC, so Next 16's `auto` downloads the whole linked route the moment the link scrolls
          into view, and this list is one team page per opponent still to play. Navigation still
          fetches on click. */}
      <Link
        href={`/teams/${opponent.slug}`}
        prefetch={false}
        aria-label={sentenceFor(opponent)}
        className="sx-tap flex min-h-12 items-center gap-3 px-gutter py-2 text-meta no-underline"
      >
        <span aria-hidden="true" className="flex min-w-0 flex-1 items-center gap-3">
          {team ? <TeamMonogram team={team} size={24} /> : null}
          {/* Two lines, never an ellipsis: at 320px the fixed status column leaves the name ~110px,
              and "Presentation" truncated to "Presenta…". */}
          <span className="line-clamp-2 min-w-0 flex-1 break-words text-body text-ink">
            {opponent.shortName}
          </span>
        </span>
        <span className="sx-num shrink-0 text-cell text-ink-2" aria-hidden="true">
          {opponent.played === 0 ? '' : recordString(opponent.record)}
        </span>
        {/* A fixed 92px status column ("next Oct 13", "2 unreported" fit it on one line), so the
            records to its left end on one right edge down the list instead of moving with the
            width of each status. */}
        <span
          className="w-[5.75rem] shrink-0 whitespace-nowrap text-right text-ink-3"
          aria-hidden="true"
        >
          {statusOf(opponent)}
        </span>
      </Link>
    </li>
  );
}

export function TeamUnbeaten({ view }: { view: TeamPageView }) {
  if (view.unbeaten.length === 0) {
    return (
      <EmptyState
        heading={`${view.team.name} has beaten every ${view.divisionLabel} opponent at least once.`}
      >
        The full league game log is below.
      </EmptyState>
    );
  }
  return (
    <>
      <div className="sx-card sx-flush sx-bleed">
        <ul className="sx-list">
          {view.unbeaten.map((opponent) => (
            <OpponentRow key={opponent.slug} opponent={opponent} />
          ))}
        </ul>
      </div>
      <p className="mt-3 mb-0 max-w-prose text-meta text-ink-3">
        {view.unbeaten.length} of {view.divisionSize - 1} {view.divisionLabel} opponents. Division
        mates play each other twice, home and away (By-Laws Article VI §1), so a name can be here
        with two meetings left, one, or none.
      </p>
    </>
  );
}

export default TeamUnbeaten;
