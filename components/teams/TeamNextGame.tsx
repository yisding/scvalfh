import Link from 'next/link';

import { dateTimeAttr, shortDate, timeOfDayPT } from '../../lib/format';
import { gameHref } from '../../lib/game-id';
import { getTeamBySlug } from '../../lib/teams';
import type { Game, OfficialFixture, TeamSlug } from '../../lib/types';
import EmptyState from '../ui/EmptyState';
import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';
import StatusLabel from '../ui/StatusLabel';
import TeamMonogram from '../ui/TeamMonogram';
import { describeGame } from '../ui/game-view';
import type { TeamLeagueCopy } from './team-view';

/**
 * The NEXT block (DESIGN §3.7, modernization brief §5.7). The heading says Next and whether it is a
 * league game; the card holds the date (18px) and the time (13px mono), the opponent beside a
 * 32px monogram, and then only the pills that are real links. A dead
 * affordance is worse than an absent one, so a game with no stream and no ticket link simply has
 * fewer chips.
 *
 * There is no score here and never a `0-0`: a scheduled game's score slot does not exist, the
 * time takes the column (DESIGN §5.2).
 */
export interface TeamNextGameProps {
  game: Game | null;
  perspective: TeamSlug;
  teamName: string;
  /** The team's league copy (config): the end-of-season and bracket sentences, the short name. */
  league: TeamLeagueCopy;
  /**
   * The next fixture that exists only in the league's official schedule. A fixture with no contest in any
   * source would otherwise make the block claim no games are left when the league schedule says
   * otherwise (SPEC §1.3).
   */
  nextOfficial?: OfficialFixture | null;
}

function chipsFor(game: Game): Array<{ href: string; label: string }> {
  const chips: Array<{ href: string; label: string }> = [];
  const address = game.venue.address;
  if (address) {
    chips.push({
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${address.street}, ${address.city}, ${address.region} ${address.postalCode}`,
      )}`,
      label: 'Directions',
    });
  }
  if (game.urls.nfhsStream) chips.push({ href: game.urls.nfhsStream, label: 'Stream' });
  if (game.urls.goFan) chips.push({ href: game.urls.goFan, label: 'Tickets' });
  if (game.urls.maxpreps) chips.push({ href: game.urls.maxpreps, label: 'MaxPreps' });
  return chips;
}

export function TeamNextGame({
  game,
  perspective,
  teamName,
  league,
  nextOfficial,
}: TeamNextGameProps) {
  if (!game && nextOfficial) {
    const mineIsHome = nextOfficial.homeSlug === perspective;
    const opponentSlug = mineIsHome ? nextOfficial.awaySlug : nextOfficial.homeSlug;
    const opponent = opponentSlug ? getTeamBySlug(opponentSlug) : undefined;
    return (
      <section className="flex min-w-0 flex-col">
        <SectionHeader kicker="Next" meta="League" />
        <div className="sx-card flex-1 p-5">
          <p className="m-0 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-lead text-ink">{shortDate(nextOfficial.dateKey)}</span>
            <span className="text-meta text-ink-2">No start time published</span>
          </p>
          <p className="mt-3 mb-0 flex items-center gap-3 text-body">
            {opponent ? <TeamMonogram team={opponent} size={32} /> : null}
            <span className="min-w-0 text-ink">
              <span className="text-ink-2">{mineIsHome ? 'vs' : 'at'}</span>{' '}
              {opponent ? opponent.name : mineIsHome ? nextOfficial.awayName : nextOfficial.homeName}
            </span>
          </p>
          <p className="mt-3 mb-0 max-w-prose text-meta text-ink-3">
            From the official {league.shortName} schedule. No source has published a contest for this fixture,
            so there is no start time, no venue and no game page for it &mdash; and there will be no
            score unless one is reported.
          </p>
        </div>
      </section>
    );
  }

  if (!game) {
    return (
      <section className="min-w-0">
        <SectionHeader kicker="Next" />
        <EmptyState heading={`No more games on ${teamName}'s published schedule.`}>
          {`${league.seasonEndSentence} ${league.bracketSentence}`}
        </EmptyState>
      </section>
    );
  }

  const display = describeGame(game, perspective);
  const mineIsHome = game.home.slug === perspective;
  const opponentSide = mineIsHome ? game.away : game.home;
  const opponent = opponentSide.slug ? getTeamBySlug(opponentSide.slug) : undefined;
  const chips = chipsFor(game);
  // The start time is always shown when the date is known (struck through when the game is
  // postponed or cancelled, as everywhere else). A scheduled game's status label IS that time, so
  // it adds nothing; anything else (LIVE, POSTPONED, CANCELLED, SCORE NOT REPORTED) follows the
  // time as the written status, so neither the word nor the time is dropped (DESIGN §5.2).
  const scheduled = display.kind === 'scheduled';
  const timeClass = ['sx-num text-cell text-ink-2', display.strikeTime ? 'line-through' : null]
    .filter(Boolean)
    .join(' ');

  return (
    <section className="flex min-w-0 flex-col">
      <SectionHeader
        kicker="Next"
        meta={game.countsFor !== null ? 'League' : game.postseason !== null ? 'Postseason' : 'Non-league'}
      />
      {/* `flex-1`: in the two-column grid the card fills its row beside the taller Last card,
          with the link pills pinned to its bottom edge, so the pair ends level. */}
      <div className="sx-card flex flex-1 flex-col p-5">
        <p className="m-0 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <time dateTime={dateTimeAttr(game)} className="text-lead text-ink">
            {game.isDateTba ? 'Date TBA' : shortDate(game.dateLocal)}
          </time>
          {game.isDateTba ? null : (
            <span className={timeClass}>
              {game.isTimeTba ? 'Time TBA' : timeOfDayPT(game.dateLocal)}
            </span>
          )}
          {scheduled ? null : (
            <StatusLabel display={display} showNonLeague={false} className="shrink-0" />
          )}
        </p>
        <p className="mt-3 mb-0 flex items-center gap-3 text-body">
          {opponent ? <TeamMonogram team={opponent} size={32} /> : null}
          <Link
            href={gameHref(game.contestId)}
            className="min-w-0 text-ink no-underline hover:underline"
          >
            {/* The space sits OUTSIDE the span: Chrome drops a trailing space inside an inline
                child when it builds the link's name, which read "atSt. Ignatius…". */}
            <span className="text-ink-2">{display.versus ?? 'vs'}</span>{' '}
            {opponent ? opponent.name : opponentSide.name}
          </Link>
        </p>
        {game.venue.name ? (
          <p className="mt-1 mb-0 text-meta text-ink-2">{game.venue.name}</p>
        ) : null}
        {game.isTimeTba ? (
          <p className="mt-1 mb-0 text-meta text-ink-3">
            MaxPreps has not published a start time for this game yet.
          </p>
        ) : null}
        {chips.length > 0 ? (
          <p className="mt-auto mb-0 flex flex-wrap gap-2 pt-4">
            {chips.map((chip) => (
              <ExternalLink key={chip.href} href={chip.href} className="sx-pill">
                {chip.label}
              </ExternalLink>
            ))}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export default TeamNextGame;
