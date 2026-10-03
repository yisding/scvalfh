import Link from 'next/link';

import { getTeamBySlug } from '../../lib/data';
import { ordinal } from '../../lib/format';
import type { HistoryRow } from '../../lib/history';
import TeamMonogram from '../ui/TeamMonogram';

/**
 * The 2025-26 archive standings table (DESIGN §3.9) — final records only, no GD bar, no form
 * strip: the source PDF carries no game-level data, only a final W-L(-T) line per school.
 *
 * Three columns: place, team, league record. `overallRecord` is always null in this file (SPEC
 * §1.3 — that PDF column was empty for the 2025-26 season), so there is no Overall column at
 * all: a column of nothing but em dashes told the reader nothing and cost every table a fourth
 * column of width. The page's source note says why it is missing. `place` is the PDF's own
 * "SCHOOL by finish" order, not a value recomputed by this site.
 */
export interface HistoryStandingsTableProps {
  rows: HistoryRow[];
  caption: string;
  emptyLabel: string;
}

export function HistoryStandingsTable({ rows, caption, emptyLabel }: HistoryStandingsTableProps) {
  if (rows.length === 0) {
    return <p className="py-2 text-meta text-ink-3">{emptyLabel}</p>;
  }
  return (
    // `lg:self-start`: from lg this card is a grid item in a row track it shares with the other
    // division's table (the page's subgrid), and El Camino's varsity table has one more row than
    // De Anza's. Stretched, the shorter card grew a blank band under its last row; started, it
    // ends at its own last row and the next heading still lines up across the pair.
    <div className="sx-card sx-flush sx-bleed lg:self-start">
      {/* No `sx-table-wide`, so every gutter is explicit: `pr-2` after the place cell keeps "1st"
          off the monogram, `pl-2` (`pl-3` from sm) before League keeps the right-aligned record
          clear of a long wrapped name, and `pr-4` on League is the card's inner edge. On a phone
          the card is a full-bleed band (`sx-bleed`, like the standings).

          `table-fixed` with a <colgroup>: the place and League columns are fixed widths and Team
          takes the rest, so all four tables on the page put their League column at the same x —
          the records line up down the page and across the two divisions instead of each table
          sizing League to its own longest record. */}
      <table className="sx-table table-fixed text-meta">
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          {/* 48px: 16 of left padding, 24 for "8th" in tabular mono, 8 of gutter. */}
          <col className="w-12" />
          <col />
          {/* 96px: 16 of right padding, 8 (12 from sm) of gutter, and room for the longest
              record, "11-0-1", in tabular mono with space to spare. */}
          <col className="w-24" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="pl-4 pr-2">
              #
            </th>
            <th scope="col">Team</th>
            <th scope="col" className="pl-2 pr-4 text-right sm:pl-3">
              League
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const team = row.slug ? getTeamBySlug(row.slug) : undefined;
            return (
              <tr key={`${row.place}-${row.name}`} className="h-12">
                <td className="sx-num pl-4 pr-2 text-cell">{ordinal(row.place)}</td>
                <th scope="row" className="text-left font-normal">
                  {/* `prefetch={false}` for the reason the nav and the standings rows carry it
                      (components/layout/NavLink.tsx, components/ui/StandingsTable.tsx): every route
                      here is STATIC, so Next 16's `auto` downloads the whole linked route the
                      moment the link scrolls into view, and /history/2025-26 stacks four of these
                      tables — up to 32 whole team pages. Navigation still fetches on click. */}
                  {team ? (
                    <Link
                      href={`/teams/${team.slug}`}
                      prefetch={false}
                      className="flex items-center gap-2 no-underline hover:underline"
                    >
                      <TeamMonogram team={team} size={24} />
                      {/* Wraps rather than truncating: at 320px a nowrap name once set the
                          column's minimum to 143px and pushed the table past its 320px clip box
                          with no way to scroll (DESIGN R-8). The fixed layout now gives Team
                          whatever the two fixed columns leave, and wrapping means a long name
                          costs a second line, never a clipped record. */}
                      <span className="min-w-0 text-body text-ink">{row.name}</span>
                    </Link>
                  ) : (
                    <span className="flex items-center gap-2 text-body text-ink">{row.name}</span>
                  )}
                </th>
                <td className="sx-num pl-2 pr-4 text-right text-cell sm:pl-3">{row.leagueRecord}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default HistoryStandingsTable;
