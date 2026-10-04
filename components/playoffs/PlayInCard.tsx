import Link from 'next/link';

import { recordString, scoreSentence } from '../../lib/format';
import { gameHref } from '../../lib/game-id';
import type { Game, Standing, Team } from '../../lib/types';
import TeamMonogram from '../ui/TeamMonogram';

/**
 * One two-sided postseason card: a SCVAL crossover game, the BVAL play-in, the MCAL play-in.
 *
 * League-neutral on purpose — every word on it arrives as a prop (seat labels from config, the
 * purpose sentence from the pairing's config label), so the same card serves a CCS page and an NCS
 * page without carrying a CCS concept onto the NCS one.
 *
 * A side is EMPTY, or holds more than one contender, when the league table has not settled that
 * seat. Both render honestly: `TBD` for an empty seat, every contender named (`A or B`) when a level
 * place spans it, and the card's notes say why in words. The hosting side is marked `(host)` in
 * text — never by position or colour alone. Once the contest exists, the card links to it with
 * `gameHref`, and the link text is the score sentence (never a 0-0 for a missing score).
 */
export interface PlayInSide {
  /** 'Santa Teresa #1' — from config. */
  label: string;
  contenders: Array<{ team: Team; standing?: Standing }>;
  host: boolean;
}

export interface PlayInCardProps {
  /** 'Play-in' / 'Crossover · #1 v #1' */
  title: string;
  /** 'Fri Oct 30' and, when the league states one, '11 AM PT'. */
  when?: { dateKey: string; dateLabel: string; timeLabel: string | null } | null;
  /** Reading order: the visitor first when `connector` is 'at'. */
  sides: [PlayInSide, PlayInSide];
  connector: 'vs' | 'at';
  /** The whole card as one screen-reader sentence. */
  sentence: string;
  /** What the game is for, one sentence. */
  purpose?: string | null;
  notes?: readonly string[];
  game?: Game | null;
  /** The play-in of a pairing set (a 3px ink rule on the left edge — a position, never a hue). */
  emphasis?: boolean;
  className?: string;
}

function Side({ side, align }: { side: PlayInSide; align: 'start' | 'end' }) {
  const [first, ...rest] = side.contenders;
  // The right-hand side mirrors at md (`flex-row-reverse`, right-aligned text); on a phone the two
  // sides STACK, each a full-width row reading left to right, so the names stay in a column.
  const mirror = align === 'end' ? 'md:flex-row-reverse md:text-right' : null;
  const row = ['flex min-w-0 items-center gap-2', mirror].filter(Boolean).join(' ');
  const host = side.host ? ' (host)' : '';
  // The sub line is sans: the seat ("Santa Teresa #1") is a label, and only the record's digits
  // are mono (DESIGN §4.3). The seat is one unbreakable unit, so a wrap can never strand "#1" (or
  // "(host)") on its own line.
  const seat = (
    <span className="whitespace-nowrap">
      {side.label}
      {host}
    </span>
  );
  if (!first) {
    return (
      <span className={row}>
        <span className="inline-block size-7 shrink-0" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block truncate text-body text-ink-2">TBD</span>
          <span className="block text-meta text-ink-2">{seat}</span>
        </span>
      </span>
    );
  }
  return (
    <span className={row}>
      {rest.length === 0 ? (
        <TeamMonogram team={first.team} size={28} />
      ) : (
        <span className="inline-block size-7 shrink-0" aria-hidden="true" />
      )}
      <span className="min-w-0">
        <span className="block text-body text-ink md:truncate">
          {side.contenders.map((c) => c.team.shortName).join(' or ')}
        </span>
        <span className="block text-meta text-ink-2">
          {seat}
          {/* In the two-up grid from lg until xl the half-width side cannot hold both on one line,
              and a free wrap left "·" at the start of a line; the record takes its own line there
              instead. On a phone the side is a full-width stacked row, so it fits inline. */}
          {rest.length === 0 && first.standing?.hasReportedResults ? (
            <>
              <span className="lg:max-xl:hidden"> &middot;</span>{' '}
              <span className="sx-num whitespace-nowrap lg:max-xl:block">
                {recordString(first.standing.computed)}
              </span>
            </>
          ) : rest.length > 0 ? (
            <>
              <span className="lg:max-xl:hidden"> &middot;</span>{' '}
              <span className="whitespace-nowrap lg:max-xl:block">not settled</span>
            </>
          ) : null}
        </span>
      </span>
    </span>
  );
}

export function PlayInCard({
  title,
  when,
  sides,
  connector,
  sentence,
  purpose,
  notes = [],
  game,
  emphasis = false,
  className,
}: PlayInCardProps) {
  return (
    <div
      className={['sx-card p-4', className].filter(Boolean).join(' ')}
      style={
        emphasis
          ? { boxShadow: 'inset 3px 0 0 var(--sx-text), var(--sx-ring), var(--sx-shadow-raised)' }
          : undefined
      }
    >
      <span className="sr-only">{sentence}</span>
      {/* A paragraph, not a heading: the card's sentence above is what a screen reader hears, and
          the page owns the outline. */}
      <p className="m-0 mb-3 flex flex-wrap items-baseline gap-x-2 text-meta font-semibold text-ink" aria-hidden="true">
        <span>{title}</span>
        {when ? (
          <span className="font-normal text-ink-2">
            <time dateTime={when.dateKey}>{when.dateLabel}</time>
            {when.timeLabel ? `, ${when.timeLabel}` : ''}
          </span>
        ) : null}
      </p>
      {/* Phone: the sides stack, and the connector is a divider row between them (a hairline
          either side of the pill), so each side has the card's full width and its name and seat
          line stay one tidy row at 320. From md: the mirrored three-column pairing. */}
      <div
        className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center md:gap-3"
        aria-hidden="true"
      >
        <Side side={sides[0]} align="start" />
        <span className="flex items-center gap-3 max-md:before:h-px max-md:before:flex-1 max-md:before:bg-divider max-md:after:h-px max-md:after:flex-1 max-md:after:bg-divider md:block">
          <span className="sx-badge">{connector}</span>
        </span>
        <Side side={sides[1]} align="end" />
      </div>
      {purpose ? (
        <p className="mt-3 mb-0 text-meta text-ink-2" aria-hidden="true">
          {purpose}
        </p>
      ) : null}
      {notes.map((note) => (
        <p key={note} className="mt-3 mb-0 text-meta text-ink-2">
          {note}
        </p>
      ))}
      {game ? (
        <p className="mt-3 mb-0 text-meta">
          <Link href={gameHref(game.contestId)} prefetch={false} className="sx-action text-accent hover:underline">
            {scoreSentence(game)}
          </Link>
        </p>
      ) : null}
    </div>
  );
}

export default PlayInCard;
