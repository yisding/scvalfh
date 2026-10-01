import Link from 'next/link';

import { EM_DASH, recordString } from '../../lib/format';
import TeamMonogram from '../ui/TeamMonogram';

import { CROSSOVER_PURPOSE, type CrossoverRow, type CrossoverSide } from './playoff-view';

/**
 * The Friday Oct 30 crossover (BYLAWS-ADDENDUM Article VII §2).
 *
 * Four games: #1 v #1, #2 v #2 and #3 v #3 exist to help the CCS committee order the two
 * divisions, and **#4 v #4 is a play-in whose winner takes the SCVAL seventh automatic berth**.
 * The play-in row is marked with the word "play-in" and a 2px `--sx-text` left rule — a word and a
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
  if (!first) {
    return (
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="inline-block shrink-0" style={{ width: 20 }} aria-hidden="true" />
        <span className="min-w-0">
          <span className="block truncate text-body text-ink-2">TBD</span>
          <span className="block text-meta text-ink-3">
            {divisionLabel} #{seed}
          </span>
        </span>
      </span>
    );
  }
  // Two contenders means the coin flip has not been run, so both are named and the record line
  // says "or" rather than asserting one of them holds the seed.
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      {rest.length === 0 ? (
        <TeamMonogram team={first.team} size={20} />
      ) : (
        <span className="inline-block shrink-0" style={{ width: 20 }} aria-hidden="true" />
      )}
      <span className="min-w-0">
        <span className="block truncate text-body text-ink">
          {side.contenders.map((c) => c.team.shortName).join(' or ')}
        </span>
        <span className="sx-num block text-meta text-ink-2">
          {divisionLabel} #{seed}
          {rest.length === 0 ? (
            <> &middot; {recordString(first.standing.computed)}</>
          ) : (
            <> &middot; not settled</>
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
    <div className={className} id={id}>
      <p className="m-0 max-w-[62ch] text-meta text-ink-2">
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
      <ol className="sx-list sx-bleed mt-3 overflow-hidden border-y border-hairline bg-surface">
        {rows.map((row) => (
          <li key={row.seed}>
            <div
              className="px-gutter py-3"
              style={
                row.isPlayIn ? { boxShadow: 'inset 2px 0 0 var(--sx-text)' } : undefined
              }
            >
              <span className="sr-only">{sentenceFor(row)}</span>
              <div
                className="flex items-baseline justify-between gap-2 font-mono text-kicker font-semibold tracking-[0.10em] uppercase"
                aria-hidden="true"
              >
                <span className={row.isPlayIn ? 'text-ink' : 'text-ink-3'}>
                  {row.isPlayIn ? 'Play-in · 7th berth' : `Crossover · #${row.seed} v #${row.seed}`}
                </span>
                {/* The date is the section's, not the row's — all four games are the same day. */}
              </div>
              <div className="mt-2 flex items-center gap-3" aria-hidden="true">
                <Side side={row.deAnza} divisionLabel="De Anza" seed={row.seed} />
                <span className="shrink-0 text-meta text-ink-3">v</span>
                <Side side={row.elCamino} divisionLabel="El Camino" seed={row.seed} />
              </div>
              {row.isPlayIn ? (
                <p className="mt-2 mb-0 text-meta text-ink-2" aria-hidden="true">
                  {CROSSOVER_PURPOSE.playIn}
                </p>
              ) : null}
              {row.unsettled ? (
                <p className="mt-2 mb-0 text-meta text-ink-3">
                  {EM_DASH} This pairing is not settled: teams are still level across #{row.seed}{' '}
                  and Article VI §7 breaks that tie with a coin flip we cannot compute.{' '}
                  {/* Inside the pairings `.map()`, so `prefetch={false}` like every other per-row
                      link (components/layout/NavLink.tsx has the reasoning). */}
                  <Link href="/standings" prefetch={false} className="text-accent hover:underline">
                    See the table
                  </Link>
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default CrossoverPairings;
