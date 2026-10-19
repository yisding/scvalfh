import Link from 'next/link';

import EmptyState from '@/components/ui/EmptyState';
import TeamMonogram from '@/components/ui/TeamMonogram';
import { monthDay } from '@/lib/format/dates';
import { recordString } from '@/lib/format/numbers';
import { plural } from '@/lib/format/words';
import { getTeamBySlug } from '@/lib/registry/teams';
import type { TeamPageView, UnbeatenOpponent } from '@/views/teams/team-view';

/**
 * "Who we haven't beaten" (DESIGN §3.7, grafted from `data-dense`).
 *
 * Every opponent in this team's table that it has no win against, soonest meeting first. It is the
 * one question a parent asks that no table answers: a record says how the season went, this says
 * what is still available. Every league here but one plays a double round robin, so a name can appear
 * with two meetings left, one, or none at all. The Sunset has no fixed schedule (gamesPerTeam null):
 * its teams meet 0, 1 or 2 times, and a meeting is a league game only when MaxPreps marks it, so an
 * opponent with nothing listed reads "no league game listed", never "no games left".
 *
 * An opponent whose remaining games exist ONLY in the league's official schedule is never counted
 * as a scheduled game we have a time and a page for. A fixture dated today or later reads "next
 * <date>", as the official-only fixture list marks it Upcoming; only one whose day has passed with
 * no result is labelled "unreported" (and explained under the list). The copy's noun is
 * the league's `gamesWord`: `division opponent` in a two-division league and `league opponent` in a
 * single-division one.
 */
/** What is left when nothing is listed: 'no games left', or, with no fixed schedule, 'no league game listed'. */
function nothingLeft(fixed: boolean): string {
  return fixed ? 'no games left' : 'no league game listed';
}

/** The row's status reads "N unreported": nothing ahead of it, and a past fixture with no result. */
function readsUnreported(opponent: UnbeatenOpponent): boolean {
  return (
    opponent.nextDate === null &&
    opponent.remaining === 0 &&
    opponent.nextFixtureDate === null &&
    opponent.unreportedFixtures > 0
  );
}

function statusOf(opponent: UnbeatenOpponent, fixed: boolean): string {
  if (opponent.nextDate !== null) return `next ${monthDay(opponent.nextDate)}`;
  if (opponent.remaining > 0) return `${opponent.remaining} to play`;
  if (opponent.nextFixtureDate !== null) return `next ${monthDay(opponent.nextFixtureDate)}`;
  if (readsUnreported(opponent)) return `${opponent.unreportedFixtures} unreported`;
  return nothingLeft(fixed);
}

function sentenceFor(opponent: UnbeatenOpponent, leagueShort: string, fixed: boolean): string {
  const played =
    opponent.played === 0
      ? 'not played yet'
      : `${recordString(opponent.record)} in ${plural(opponent.played, 'game')}`;
  const ahead =
    opponent.nextDate !== null
      ? `next meeting ${monthDay(opponent.nextDate)}`
      : opponent.remaining > 0
        ? `${opponent.remaining} still to play`
        : opponent.nextFixtureDate !== null
          ? `next meeting ${monthDay(opponent.nextFixtureDate)} on ${leagueShort}’s schedule`
          : opponent.unreportedFixtures > 0
            ? `${opponent.unreportedFixtures} scheduled per ${leagueShort} with no result reported`
            : nothingLeft(fixed);
  return `${opponent.name}: ${played}, ${ahead}`;
}

function OpponentRow({ opponent, leagueShort, fixed }: { opponent: UnbeatenOpponent; leagueShort: string; fixed: boolean }) {
  const team = getTeamBySlug(opponent.slug);
  return (
    <li>
      {/* `prefetch={false}` for the reason the nav and the standings rows carry it
          (components/layout/NavLink.tsx, components/standings/table/parts.tsx): every route here is
          STATIC, so Next 16's `auto` downloads the whole linked route the moment the link scrolls
          into view, and this list is one team page per opponent still to play. Navigation still
          fetches on click. */}
      <Link
        href={`/teams/${opponent.slug}`}
        prefetch={false}
        aria-label={sentenceFor(opponent, leagueShort, fixed)}
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
        {/* A fixed status column, so the records to its left end on one right edge down the list
            instead of moving with the width of each status. 92px fits every status of a league
            with a fixed schedule ("next Oct 13", "2 unreported", "no games left") on one line.
            Without one (the Sunset) a row can read "no league game listed", 141px, which ran past
            the card as "no league game l…". There the column is 148px from 640px, the same width
            on every row of the page; below 640px it stays 92px and that status takes two lines
            ("no league / game listed", a 56px row): a 148px column left a name 111px at 390
            (five of Chaparral's seven wrapped, 64px rows) and 41px at 320. */}
        <span
          className={`shrink-0 text-right text-ink-3 ${
            fixed ? 'w-[5.75rem] whitespace-nowrap' : 'w-[5.75rem] sm:w-[9.25rem] sm:whitespace-nowrap'
          }`}
          aria-hidden="true"
        >
          {statusOf(opponent, fixed)}
        </span>
      </Link>
    </li>
  );
}

export interface TeamUnbeatenProps {
  view: TeamPageView;
}

export function TeamUnbeaten({ view }: TeamUnbeatenProps) {
  const noun = view.league.gamesWord;
  const short = view.league.shortName;
  const fixed = view.leagueScheduled !== null;
  if (view.unbeaten.length === 0) {
    return (
      <EmptyState
        heading={`${view.team.name} has beaten every ${view.scopeLabel} ${noun} opponent at least once.`}
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
            <OpponentRow key={opponent.slug} opponent={opponent} leagueShort={short} fixed={fixed} />
          ))}
        </ul>
      </div>
      <p className="mt-3 mb-0 max-w-prose text-meta text-ink-3">
        {`${view.unbeaten.length} of ${view.divisionSize - 1} ${view.scopeLabel} ${noun} opponents. `}
        {fixed
          ? `${noun === 'league' ? 'League' : 'Division'} opponents play each other twice, home and away, so a name can be here with two meetings left, one, or none. `
          : `${short} teams do not all play each other: a meeting is a league game when MaxPreps marks it as one, so a name can be here with no meeting at all. `}
        {/* Only when a row actually says "unreported". */}
        {view.unbeaten.some(readsUnreported)
          ? `An “unreported” meeting is scheduled per ${short} with no result reported.`
          : null}
      </p>
    </>
  );
}

export default TeamUnbeaten;
