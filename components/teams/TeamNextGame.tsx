import Link from 'next/link';

import { monthDay } from '../../lib/format';
import { GAME_LOG_ROW_GRID } from '../game-row/GameLogRow';
import GameList from '../schedule/GameList';
import ExternalLink from '../ui/ExternalLink';
import TeamMonogram from '../ui/TeamMonogram';
import type { NextCard, TeamLeagueCopy } from './team-view';

/**
 * The team page's first block, "Next game" (DESIGN §33). Presentational: every string comes from
 * `buildNextCard` in team-view.ts.
 *
 * A listed game is ONE full-width game row (`GameList solo`): the start time with the date under it
 * in the status slot, the two teams, and one note line that says what kind of game it is when it is
 * not a league game and where it is played, ending in the link "Bracket" for a postseason game.
 * Under the row, only the outside links that really exist (directions, a stream, tickets, MaxPreps):
 * a dead affordance is worse than an absent one.
 *
 * Two kinds of next game have no game page, so they are drawn on the schedule's row grid instead,
 * with one line that says why:
 * - a fixture that exists only on the league's official schedule (no start time, no venue);
 * - a CCS league's crossover or play-in the team is seated in that MaxPreps has not listed yet
 *   (`pairing`), with the link to the pairing on /playoffs.
 * When the official schedule lists a fixture BEFORE the listed game that no source has published,
 * one line names it, so the page never shows two different "next" games without saying so.
 *
 * With nothing ahead the block reads "No upcoming games"; the league's season-end words are the
 * Playoffs block's. There is no score here and never a `0-0`.
 */
export interface TeamNextGameProps {
  card: NextCard;
  /** Unused; kept so callers need not change. */
  teamName?: string;
  /** The team's league copy (config): the short name the official-fixture lines use. */
  league: TeamLeagueCopy;
  /** Where a postseason game's "Bracket" link goes; no link without it. */
  bracketHref?: string | null;
}

/** A next game with no game page: date, what stands where the time would be, the opponent, a note. */
function PlainRow({
  card,
  dateKey,
  time,
  note,
}: {
  card: Exclude<NextCard, { kind: 'none' }>;
  dateKey: string;
  time: string | null;
  note: string;
}) {
  const name = card.opponent ? (
    <Link href={`/teams/${card.opponent.slug}`} prefetch={false} className="sx-rowlink">
      {card.versus} {card.opponentName}
    </Link>
  ) : (
    <span>
      {card.versus} {card.opponentName}
    </span>
  );
  return (
    <div className={GAME_LOG_ROW_GRID}>
      <time dateTime={dateKey} className="sx-num">
        {monthDay(dateKey)}
      </time>
      <span />
      {time ? (
        <span className="sx-num" data-time="">
          {time}
        </span>
      ) : (
        <span className="text-cell text-ink-2">No time</span>
      )}
      <span className="sx-teamcell">
        {card.opponent ? <TeamMonogram team={card.opponent} size={24} /> : null}
        {name}
      </span>
      <span className="sx-logrow-note">{note}</span>
    </div>
  );
}

export function TeamNextGame({ card, league, bracketHref }: TeamNextGameProps) {
  let body: React.ReactNode;
  if (card.kind === 'none') {
    body = <p className="sx-empty">No upcoming games</p>;
  } else if (card.kind === 'official') {
    body = (
      <>
        <PlainRow card={card} dateKey={card.fixture.dateKey} time={null} note="League" />
        <p className="sx-note">
          From the official {league.shortName} schedule. No source has published this game, so it has no start
          time and no venue here.
        </p>
      </>
    );
  } else if (card.kind === 'pairing') {
    const { pairing } = card;
    return (
      <section className="sx-section" data-first="" aria-labelledby="next-heading">
        <h2 id="next-heading">Next game</h2>
        <PlainRow
          card={card}
          dateKey={pairing.dateKey}
          time={pairing.timeLabel ? pairing.timeLabel.replace(/ PT$/, '') : null}
          note={pairing.kindLabel}
        />
        <p className="sx-note">
          {/* Whole sentences as single text nodes, so the built HTML carries them verbatim. */}
          {`${pairing.purpose}. ${pairing.seats}, from the ${league.shortName} standings today${pairing.settled ? '' : '; the pairing can still change'}. MaxPreps has not listed this game yet.`}{' '}
          <Link href={pairing.href} prefetch={false} className="sx-link">
            Playoffs<span className="sr-only">: {pairing.kindLabel}</span>
          </Link>
        </p>
      </section>
    );
  } else {
    body = (
      <>
        <GameList
          games={[card.game]}
          solo
          showChips
          showDate
          noteLink={bracketHref ? { href: bracketHref, label: 'Bracket' } : undefined}
        />
        {card.officialBefore ? (
          <p className="sx-note">
            {/* A league that publishes a start time (PCAL, BVAL) has it named. */}
            {league.shortName}&rsquo;s schedule also lists {card.officialBefore.dateLabel}
            {card.officialBefore.timeLabel ? `, ${card.officialBefore.timeLabel},` : null}{' '}
            {card.officialBefore.versus} {card.officialBefore.opponentName}, but no source has published that game.
          </p>
        ) : null}
        {card.chips.length > 0 ? (
          <ul className="sx-linkrow">
            {card.chips.map((chip) => (
              <li key={chip.href}>
                <ExternalLink href={chip.href} className="sx-action">
                  {chip.label}
                </ExternalLink>
              </li>
            ))}
          </ul>
        ) : null}
      </>
    );
  }
  return (
    <section className="sx-section" data-first="" aria-labelledby="next-heading">
      <h2 id="next-heading">Next game</h2>
      {body}
    </section>
  );
}

export default TeamNextGame;
