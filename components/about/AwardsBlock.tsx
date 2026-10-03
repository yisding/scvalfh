import Link from 'next/link';

import { getTeamBySlug } from '../../lib/data';
import { ordinal } from '../../lib/format';
import type { HistoryAwards, HistoryPlayer } from '../../lib/history';

/**
 * The 2025-26 all-league awards (DESIGN §3.9): overall award lines, then First Team / Second
 * Team / Honorable Mention as `<dl>`s. `value` on an overall award is the source's right-hand side
 * printed as written — the divisions write it differently, so this site does not try to
 * normalize it.
 */
export interface AwardsBlockProps {
  awards: HistoryAwards | null;
  /** "Varsity" or "JV" — used only in the empty-state sentence. */
  levelLabel: string;
}

function PlayerList({
  title,
  players,
  columns,
}: {
  title: string;
  players: HistoryPlayer[];
  /**
   * Where the card's rows flow into two columns: `sm` for a list that has the full division
   * width from `sm` up (honorable mention), `lg` for First/Second team, which sit side by side
   * from `sm` to `md` and stack from `lg`, where each gets the whole ~470-550px division column.
   */
  columns: 'sm' | 'lg';
}) {
  if (players.length === 0) return null;
  return (
    <div>
      <dt className="text-micro font-semibold text-ink-3">
        {title}
      </dt>
      {/* The roster is data, so it sits in a card (the plane rule) with divider rows. Two
          columns are a row-major grid with no gap: a grid row's two cells share one height and
          the dividers run straight across, like a two-column table. Reading order is the DOM
          order (left, then right, then down). */}
      <dd
        className={`sx-card m-0 mt-2 grid ${
          columns === 'sm' ? 'sm:grid-cols-2' : 'lg:grid-cols-2'
        }`}
      >
        {players.map((p, i) => {
          const team = p.slug ? getTeamBySlug(p.slug) : undefined;
          return (
            <div
              key={i}
              // A rule on top of every row but the first in each column: one row in a single
              // column, the first two once the grid has two columns.
              className={`min-w-0 border-t border-divider px-4 py-2 first:border-t-0 ${
                columns === 'sm' ? 'sm:[&:nth-child(2)]:border-t-0' : 'lg:[&:nth-child(2)]:border-t-0'
              }`}
            >
              <span className="block text-body text-ink">{p.player}</span>
              <span className="block text-meta text-ink-2">
                {/* A no-break space BEFORE each dot, so a narrow column breaks after a dot and
                    never starts a line with one ("· Cupertino"), nor splits "12th grade". */}
                {/* A blank position cell in the source is null: say nothing rather than guess. */}
                {p.position ? <>{p.position}&nbsp;&middot; </> : null}
                {ordinal(p.year)}&nbsp;grade&nbsp;&middot;{' '}
                {/* `prefetch={false}`: every route here is STATIC, so Next 16's `auto` downloads
                    the whole linked route the moment the link scrolls into view, and every award
                    names a school, so one block is dozens of these. Navigation still fetches on
                    click. */}
                {team ? (
                  <Link
                    href={`/teams/${team.slug}`}
                    prefetch={false}
                    className="text-accent hover:underline"
                  >
                    {p.school}
                  </Link>
                ) : (
                  <span>{p.school}</span>
                )}
              </span>
            </div>
          );
        })}
      </dd>
    </div>
  );
}

export function AwardsBlock({ awards, levelLabel }: AwardsBlockProps) {
  if (!awards) {
    return (
      <p className="py-2 text-meta text-ink-3">
        No {levelLabel.toLowerCase()} all-league awards were published for this division.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-8">
      {awards.overall.length > 0 ? (
        // A two-column grid, so every value starts at the same x: the label column is as wide as
        // the longest label. On a phone each pair stacks (small label over the value) so a long
        // value never wraps flush-left under its label.
        <dl className="m-0 grid gap-y-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-6 sm:gap-y-2">
          {awards.overall.map((o, i) => (
            <div key={i} className="sm:contents">
              <dt className="text-micro text-ink-3 sm:text-meta sm:text-ink-2">{o.award}</dt>
              <dd className="m-0 text-body font-semibold text-ink sm:text-meta">{o.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <dl className="m-0 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-1">
        <PlayerList title="First team" players={awards.firstTeam} columns="lg" />
        <PlayerList title="Second team" players={awards.secondTeam} columns="lg" />
      </dl>
      {awards.honorableMention.length > 0 ? (
        <dl className="m-0">
          <PlayerList title="Honorable mention" players={awards.honorableMention} columns="sm" />
        </dl>
      ) : null}
    </div>
  );
}

export default AwardsBlock;
