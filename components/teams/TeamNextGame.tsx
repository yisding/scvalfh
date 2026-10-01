import Link from 'next/link';

import { gameWhen, shortDate } from '../../lib/format';
import { getTeamBySlug } from '../../lib/teams';
import type { Game, OfficialFixture, TeamSlug } from '../../lib/types';
import EmptyState from '../ui/EmptyState';
import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';
import StatusLabel from '../ui/StatusLabel';
import TeamMonogram from '../ui/TeamMonogram';
import { describeGame } from '../ui/game-view';

/**
 * The NEXT block (DESIGN §3.7). The kicker carries the date, the time and league/non-league; the
 * body is one lead line — `at Los Altos` — and then only the chips that are real links. A dead
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
  /**
   * The next fixture that exists only in the official SCVAL grid. Wilcox has no contest in any
   * source, so without this the block would claim it has no games left when the league schedule
   * says otherwise (SPEC §1.3).
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
  nextOfficial,
}: TeamNextGameProps) {
  if (!game && nextOfficial) {
    const mineIsHome = nextOfficial.homeSlug === perspective;
    const opponentSlug = mineIsHome ? nextOfficial.awaySlug : nextOfficial.homeSlug;
    const opponent = opponentSlug ? getTeamBySlug(opponentSlug) : undefined;
    return (
      <section>
        <SectionHeader kicker="Next" meta={`${shortDate(nextOfficial.dateKey)} \u00b7 League`} />
        <p className="m-0 flex items-center gap-2 text-lead">
          {opponent ? <TeamMonogram team={opponent} size={24} /> : null}
          <span className="text-ink">
            <span className="text-ink-2">{mineIsHome ? 'vs' : 'at'} </span>
            {opponent ? opponent.name : mineIsHome ? nextOfficial.awayName : nextOfficial.homeName}
          </span>
        </p>
        <p className="mt-1 mb-0 max-w-[62ch] text-meta text-ink-3">
          From the official SCVAL schedule. No source has published a contest for this fixture, so
          there is no start time, no venue and no game page for it &mdash; and there will be no
          score unless one is reported.
        </p>
      </section>
    );
  }

  if (!game) {
    return (
      <section>
        <SectionHeader kicker="Next" />
        <EmptyState heading={`No more games on ${teamName}'s published schedule.`}>
          The league season ends Oct 28 and the SCVAL crossover is Fri Oct 30. We will list a
          playoff game as soon as CCS publishes the bracket.
        </EmptyState>
      </section>
    );
  }

  const display = describeGame(game, perspective);
  const mineIsHome = game.home.slug === perspective;
  const opponentSide = mineIsHome ? game.away : game.home;
  const opponent = opponentSide.slug ? getTeamBySlug(opponentSide.slug) : undefined;
  const chips = chipsFor(game);

  return (
    <section>
      <SectionHeader
        kicker="Next"
        meta={`${gameWhen(game)} · ${game.isLeague ? 'League' : 'Non-league'}`}
      />
      <p className="m-0 flex items-center gap-2 text-lead">
        {opponent ? <TeamMonogram team={opponent} size={24} /> : null}
        <Link href={`/game/${game.contestId}`} className="text-ink no-underline hover:underline">
          <span className="text-ink-2">{display.versus ?? 'vs'} </span>
          {opponent ? opponent.name : opponentSide.name}
        </Link>
        <StatusLabel display={display} className="shrink-0" />
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
        <p className="mt-2 mb-0 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <ExternalLink
              key={chip.href}
              href={chip.href}
              className="inline-flex h-11 items-center rounded-chip border border-hairline bg-surface px-3 text-meta no-underline"
            >
              {chip.label}
            </ExternalLink>
          ))}
        </p>
      ) : null}
    </section>
  );
}

export default TeamNextGame;
