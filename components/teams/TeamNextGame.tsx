import Link from 'next/link';

import { dateTimeAttr, timeOfDayPT } from '../../lib/format';
import { gameHref } from '../../lib/game-id';
import EmptyState from '../ui/EmptyState';
import ExternalLink from '../ui/ExternalLink';
import ResultChip from '../ui/ResultChip';
import SectionHeader from '../ui/SectionHeader';
import StatusLabel from '../ui/StatusLabel';
import TeamMonogram from '../ui/TeamMonogram';
import { describeGame } from '../ui/game-view';
import type { NextCard, TeamLeagueCopy } from './team-view';

/**
 * The NEXT block (DESIGN §3.7, modernization brief §5.7). Presentational: every string comes from
 * `buildNextCard` in team-view.ts. The heading says Next and whether it is a league game; the card
 * holds, top to bottom:
 *
 * - the date (18px, "Today · Fri Oct 2" on the day itself) and the start time (13px sans,
 *   tabular figures);
 * - the opponent's short name beside a 32px monogram, with their league record and place under it
 *   for a registry team ("3-3-1 · 4th in El Camino", "2nd in MCAL", or the opponent's league named
 *   too when it is another league's): "can we beat them?" is the question a parent asks next, and
 *   the answer used to be two taps away;
 * - where it is, when we can say so honestly (a venue, "Neutral site", or the host school's city);
 * - the last time the two met, as one link to that game ("Earlier: lost 0–7 at home, Sep 10");
 * - when the league's official schedule lists a fixture before this game that no source has
 *   published, one plain line naming it: the fixture list below marks it Upcoming, and without the
 *   line the page would name two different "next" games;
 * - a pill row pinned to the bottom: "Full game page" first (the opponent's name was the only way
 *   there, and nothing said it was a link), then only the external links that really exist. A
 *   dead affordance is worse than an absent one, so a game with no stream has no stream chip.
 *
 * The league copy comes from config (`league`): the official-fixture card names the league's own
 * schedule, and the empty state is the league's end-of-season and bracket sentences — an MCAL page
 * never mentions CCS (SPEC §10.5). The heading's meta is League / Postseason / Non-league from
 * `countsFor` and `postseason` (SPEC §10.4).
 *
 * There is no score here and never a `0-0`: a scheduled game's score slot does not exist, the
 * time takes its place (DESIGN §5.2).
 */
export interface TeamNextGameProps {
  card: NextCard;
  teamName: string;
  /** The team's league copy (config): the end-of-season and bracket sentences, the short name. */
  league: TeamLeagueCopy;
}

/** Monogram + "at Santa Clara" over the record line. Shared by the contest and fixture cards. */
function Opponent({ card }: { card: Exclude<NextCard, { kind: 'none' }> }) {
  return (
    <div className="mt-3 flex items-center gap-3">
      {card.opponent ? <TeamMonogram team={card.opponent} size={32} /> : null}
      <p className="m-0 min-w-0">
        {/* The space sits OUTSIDE the span: Chrome drops a trailing space inside an inline child
            when it builds an accessible name, which read "atSt. Ignatius…". */}
        <span className="block text-body text-ink">
          <span className="text-ink-2">{card.versus}</span> {card.opponentName}
        </span>
        {card.record ? (
          <span className="block text-meta text-ink-2">
            <span className="sr-only">Their record: </span>
            {card.record}
          </span>
        ) : null}
      </p>
    </div>
  );
}

export function TeamNextGame({ card, teamName, league }: TeamNextGameProps) {
  if (card.kind === 'official') {
    return (
      <section className="flex min-w-0 flex-col">
        <SectionHeader kicker="Next" meta="League" />
        <div className="sx-card flex-1 p-5">
          <p className="m-0 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <time dateTime={card.fixture.dateKey} className="text-lead text-ink">
              {card.dateLabel}
            </time>
            <span className="text-meta text-ink-2">No start time published</span>
          </p>
          <Opponent card={card} />
          <p className="mt-3 mb-0 max-w-prose text-meta text-ink-3">
            From the official {league.shortName} schedule. No source has published a contest for
            this fixture, so there is no start time, no venue and no game page for it &mdash; and
            there will be no score unless one is reported.
          </p>
        </div>
      </section>
    );
  }

  if (card.kind === 'none') {
    return (
      <section className="min-w-0">
        <SectionHeader kicker="Next" />
        <EmptyState heading={`No more games on ${teamName}'s published schedule.`}>
          {`${league.seasonEndSentence} ${league.bracketSentence}`}
        </EmptyState>
      </section>
    );
  }

  const { game } = card;
  const display = describeGame(game);
  // The start time is always shown when the date is known (struck through when the game is
  // postponed or cancelled, as everywhere else). A scheduled game's status label IS that time, so
  // it adds nothing; anything else (LIVE, POSTPONED, CANCELLED, SCORE NOT REPORTED) follows the
  // time as the written status, so neither the word nor the time is dropped (DESIGN §5.2). The
  // time is sans with tabular figures, not mono: it sits on the 18px date's baseline, alone, and
  // stacks with nothing.
  const scheduled = display.kind === 'scheduled';
  const timeClass = ['text-cell text-ink-2 tabular-nums', display.strikeTime ? 'line-through' : null]
    .filter(Boolean)
    .join(' ');

  return (
    <section className="flex min-w-0 flex-col">
      <SectionHeader
        kicker="Next"
        meta={game.countsFor !== null ? 'League' : game.postseason !== null ? 'Postseason' : 'Non-league'}
      />
      {/* `flex-1`: in the two-column grid the card fills its row beside the Last card, with the
          pill row pinned to its bottom edge (`mt-auto`), so the pair ends level. */}
      <div className="sx-card flex flex-1 flex-col p-5">
        <p className="m-0 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <time dateTime={dateTimeAttr(game)} className="text-lead text-ink">
            {card.dateLabel}
          </time>
          {game.isDateTba ? null : (
            <span className={timeClass}>
              {game.isTimeTba ? 'Time TBA' : timeOfDayPT(game.dateLocal)}
            </span>
          )}
          {scheduled ? null : (
            <StatusLabel display={display} showChips={false} className="shrink-0" />
          )}
        </p>
        <Opponent card={card} />
        {card.place ? <p className="mt-2 mb-0 text-meta text-ink-2">{card.place}</p> : null}
        {game.isTimeTba ? (
          <p className="mt-1 mb-0 text-meta text-ink-3">
            No source has published a start time for this game yet.
          </p>
        ) : null}
        {card.earlier ? (
          <p className="mt-2 mb-0">
            {/* One link, chip and words together. The chip is decoration here: the words already
                say won / lost / tied, so it is hidden rather than read as a second "Loss". */}
            <Link
              href={gameHref(card.earlier.contestId)}
              prefetch={false}
              className="sx-action gap-2 text-meta text-ink-2 no-underline hover:underline"
            >
              <span aria-hidden="true" className="inline-flex">
                <ResultChip kind={card.earlier.outcome} size={20} />
              </span>
              {card.earlier.text}
            </Link>
          </p>
        ) : null}
        {card.officialBefore ? (
          <p className="mt-2 mb-0 max-w-prose text-meta text-ink-3">
            {/* A league that publishes a start time (PCAL, BVAL) has it named; only a fixture
                without one (SCVAL) is said to have none. */}
            {league.shortName}&rsquo;s schedule also lists {card.officialBefore.dateLabel}
            {card.officialBefore.timeLabel ? `, ${card.officialBefore.timeLabel},` : null}{' '}
            {card.officialBefore.versus} {card.officialBefore.opponentName}, but no source does, so
            {card.officialBefore.timeLabel ? ' it has no game page here.' : ' it has no start time here.'}
          </p>
        ) : null}
        <p className="mt-auto mb-0 flex flex-wrap gap-2 pt-4">
          <Link
            href={gameHref(game.contestId)}
            prefetch={false}
            className="sx-pill sx-pill-accent min-h-11"
          >
            {/* The Last card's pill has the same visible words, so the opponent is added for a
                screen reader's links list and for voice control. */}
            Full game page<span className="sr-only">: {card.versus} {card.opponent?.name ?? card.opponentName}</span>
          </Link>
          {card.chips.map((chip) => (
            <ExternalLink key={chip.href} href={chip.href} className="sx-pill">
              {chip.label}
            </ExternalLink>
          ))}
        </p>
      </div>
    </section>
  );
}

export default TeamNextGame;
