import Link from 'next/link';

import { EM_DASH, recordString } from '../../lib/format';
import TeamMonogram from '../ui/TeamMonogram';

import { CROSSOVER_PURPOSE, type CrossoverRow, type CrossoverSide } from './playoff-view';

/**
 * The Friday Oct 30 crossover (BYLAWS-ADDENDUM Article VII §2).
 *
 * Four games: #1 v #1, #2 v #2 and #3 v #3 exist to help the CCS committee order the two
 * divisions, and **#4 v #4 is a play-in whose winner takes the SCVAL seventh automatic berth**.
 * The play-in row is marked with the word "play-in" and a 3px `--sx-text` left rule — a word and a
 * position, never a hue.
 *
 * A side is EMPTY, or holds more than one contender, when the league table has not settled that
 * seed yet. Both cases render honestly: `TBD` for an empty seat, every candidate named where
 * Article VI §7's coin flip still stands between two teams, and a written "not settled yet" line
 * underneath. No pairing is ever invented, and no seed is ever dropped because a tie straddles it.
 */
export interface CrossoverPairingsProps {
  /** 'YYYY-MM-DD' */
  date: string;
  /** 'Fri Oct 30' */
  dateLabel: string;
  rows: CrossoverRow[];
  className?: string;
  id?: string;
}

function Side({
  side,
  divisionLabel,
  seed,
}: {
  side: CrossoverSide;
  divisionLabel: string;
  seed: number;
}) {
  const [first, ...rest] = side.contenders;
  // The right-hand team mirrors at md (`flex-row-reverse`, right-aligned text); on phone the two
  // sides STACK, each a full-width row reading left to right, so the names stay in a column.
  const mirror = divisionLabel === 'El Camino' ? ' md:flex-row-reverse md:text-right' : '';
  const row = `flex min-w-0 items-center gap-2${mirror}`;
  // The sub line is sans: "De Anza #4" is a label, and only the record's digits are mono (DESIGN
  // §4.3). The label is one unbreakable unit, so a wrap can never strand "#4" on its own line.
  const seedLabel = (
    <span className="whitespace-nowrap">
      {divisionLabel}&nbsp;#{seed}
    </span>
  );
  if (!first) {
    return (
      <span className={row}>
        <span className="inline-block size-7 shrink-0" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block truncate text-body text-ink-2">TBD</span>
          <span className="block text-meta text-ink-2">{seedLabel}</span>
        </span>
      </span>
    );
  }
  // Two contenders means the coin flip has not been run, so both are named and the record line
  // says "or" rather than asserting one of them holds the seed.
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
          {seedLabel}
          {/* In the two-up grid from lg until xl the half-width side cannot hold both on one
              line, and a free wrap left "·" at the start of a line; the record takes its own line
              there instead. On a phone the side is a full-width stacked row, so it fits inline. */}
          <span className="lg:max-xl:hidden"> &middot;</span>{' '}
          {rest.length === 0 ? (
            <span className="sx-num whitespace-nowrap lg:max-xl:block">
              {recordString(first.standing.computed)}
            </span>
          ) : (
            <span className="whitespace-nowrap lg:max-xl:block">not settled</span>
          )}
        </span>
      </span>
    </span>
  );
}

function sentenceFor(row: CrossoverRow): string {
  const name = (side: CrossoverSide, fallback: string) =>
    side.contenders.length === 0
      ? fallback
      : side.contenders.map((c) => c.team.name).join(' or ');
  const pairing = `${name(row.deAnza, `De Anza #${row.seed}`)} versus ${name(
    row.elCamino,
    `El Camino #${row.seed}`,
  )}`;
  return row.isPlayIn
    ? `Play-in: ${pairing}. ${CROSSOVER_PURPOSE.playIn}`
    : `Crossover #${row.seed}: ${pairing}. ${CROSSOVER_PURPOSE.ordering}`;
}

export function CrossoverPairings({
  date,
  dateLabel,
  rows,
  className,
  id,
}: CrossoverPairingsProps) {
  return (
    // One column capped at 48rem below lg; from lg the four cards sit two by two at full width, so the
    // row is filled and each pairing's names stay close enough to read as a pair.
    <div className={`max-w-3xl lg:max-w-none${className ? ` ${className}` : ''}`} id={id}>
      <p className="m-0 max-w-prose text-body text-ink-2">
        Played on{' '}
        <time dateTime={date} className="text-ink">
          {dateLabel}
        </time>
        {', after the league season. '}
        The three crossover games help the CCS committee order the two
        divisions; the fourth pairing is a play-in for SCVAL&rsquo;s seventh automatic berth. Home
        site is decided by a coin flip and these games do not count toward a team&rsquo;s maximum
        contests (Article VII §2).
      </p>
      <ol className="m-0 mt-stack list-none space-y-3 p-0 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
        {rows.map((row) => (
          <li
            key={row.seed}
            className="sx-card p-4"
            style={
              row.isPlayIn
                ? { boxShadow: 'inset 3px 0 0 var(--sx-text), var(--sx-ring), var(--sx-shadow-raised)' }
                : undefined
            }
          >
            <span className="sr-only">{sentenceFor(row)}</span>
            <p className="m-0 mb-3 text-meta font-semibold text-ink" aria-hidden="true">
              <span className={row.isPlayIn ? 'text-ink' : 'text-ink-2'}>
                {row.isPlayIn ? 'Play-in · 7th berth' : `Crossover · #${row.seed} v #${row.seed}`}
              </span>
              {/* The date is the section's, not the row's — all four games are the same day. */}
            </p>
            {/* Phone: the sides stack, and "vs" is a divider row between them (a hairline either
                side of the pill), so each side has the card's full width and its name and seed
                line stay one tidy row at 320. From md: the mirrored three-column pairing. */}
            <div
              className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center md:gap-3"
              aria-hidden="true"
            >
              <Side side={row.deAnza} divisionLabel="De Anza" seed={row.seed} />
              <span className="flex items-center gap-3 max-md:before:h-px max-md:before:flex-1 max-md:before:bg-divider max-md:after:h-px max-md:after:flex-1 max-md:after:bg-divider md:block">
                <span className="sx-badge">vs</span>
              </span>
              <Side side={row.elCamino} divisionLabel="El Camino" seed={row.seed} />
            </div>
            {row.isPlayIn ? (
              <p className="mt-3 mb-0 text-meta text-ink-2" aria-hidden="true">
                {CROSSOVER_PURPOSE.playIn}
              </p>
            ) : null}
            {row.unsettled ? (
              <p className="mt-3 mb-0 text-meta text-ink-2">
                {EM_DASH} This pairing is not settled: teams are still level across #{row.seed}{' '}
                and Article VI §7 breaks that tie with a coin flip we cannot compute.{' '}
                {/* Inside the pairings `.map()`, so `prefetch={false}` like every other per-row
                    link (components/layout/NavLink.tsx has the reasoning). */}
                <Link href="/standings" prefetch={false} className="text-accent hover:underline">
                  See the table
                </Link>
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default CrossoverPairings;
