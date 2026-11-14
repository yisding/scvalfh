import Link from 'next/link';

import { monthDay, plural, recordString } from '../../lib/format';
import { getTeamBySlug } from '../../lib/teams';
import TeamMonogram from '../ui/TeamMonogram';
import type { TeamPageView, UnbeatenOpponent } from './team-view';

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

/** The record cell: blank before the first meeting. */
function recordOf(opponent: UnbeatenOpponent): string {
  return opponent.played === 0 ? '' : recordString(opponent.record);
}

/**
 * The link's accessible name. It BEGINS with the row's visible text, word for word (name, record,
 * status), so a voice-control user can say what they see (WCAG 2.5.3, axe label-content-name-mismatch),
 * then adds what the short cells leave out: how many games the record covers, and where a meeting that
 * exists only on the league's schedule comes from.
 */
function sentenceFor(opponent: UnbeatenOpponent, leagueShort: string, fixed: boolean): string {
  const shown = [opponent.shortName, recordOf(opponent), statusOf(opponent, fixed)].filter((part) => part !== '').join(' ');
  const played = opponent.played === 0 ? 'not played yet' : `${plural(opponent.played, 'game')} played`;
  const scheduleOnly =
    opponent.nextDate !== null || opponent.remaining > 0
      ? null
      : opponent.nextFixtureDate !== null
        ? `next meeting ${monthDay(opponent.nextFixtureDate)} on ${leagueShort}’s schedule`
        : opponent.unreportedFixtures > 0
          ? `${opponent.unreportedFixtures} scheduled per ${leagueShort} with no result reported`
          : null;
  return [shown, played, scheduleOnly].filter((part) => part !== null).join(', ');
}

function OpponentRow({ opponent, leagueShort, fixed }: { opponent: UnbeatenOpponent; leagueShort: string; fixed: boolean }) {
  const team = getTeamBySlug(opponent.slug);
  return (
    <li>
      {/* `prefetch={false}`: every route here is STATIC, so Next's `auto` downloads the whole linked
          route the moment the link scrolls into view, and this list is one team page per opponent. */}
      <Link
        href={`/teams/${opponent.slug}`}
        prefetch={false}
        aria-label={sentenceFor(opponent, leagueShort, fixed)}
        className="sx-tap flex min-h-11 items-center gap-2 px-2 py-1.5 text-body text-ink no-underline hover:bg-surface-2"
      >
        <span aria-hidden="true" className="sx-teamcell flex-1">
          {team ? <TeamMonogram team={team} size={24} /> : null}
          <span>{opponent.shortName}</span>
        </span>
        {/* The spaces between the cells are for the text a tool reads off the row ("Leigh 0-2-0 no games
            left", which the accessible name begins with); a flex row lays out no whitespace. */}{' '}
        <span className="sx-num shrink-0 text-ink-2" aria-hidden="true">
          {recordOf(opponent)}
        </span>{' '}
        {/* A fixed status column, so the records to its left end on one right edge down the list. */}
        <span className="w-[6.5rem] shrink-0 text-right text-cell text-ink-2" aria-hidden="true">
          {statusOf(opponent, fixed)}
        </span>
      </Link>
    </li>
  );
}

export interface TeamUnbeatenProps {
  view: TeamPageView;
}

/** Renders nothing when the team has beaten every opponent in its table at least once. */
export function TeamUnbeaten({ view }: TeamUnbeatenProps) {
  const short = view.league.shortName;
  const fixed = view.leagueScheduled !== null;
  if (view.unbeaten.length === 0) return null;
  return (
    <section className="sx-section" aria-labelledby="unbeaten-heading">
      <h2 id="unbeaten-heading">Not beaten yet</h2>
      <ul className="sx-list">
        {view.unbeaten.map((opponent) => (
          <OpponentRow key={opponent.slug} opponent={opponent} leagueShort={short} fixed={fixed} />
        ))}
      </ul>
      {/* Only when a row actually says "unreported". */}
      {view.unbeaten.some(readsUnreported) ? (
        <p className="sx-note">{`An “unreported” meeting is scheduled per ${short} with no result reported.`}</p>
      ) : null}
    </section>
  );
}

export default TeamUnbeaten;
