import Link from 'next/link';

import { getTeamBySlug } from '../../lib/data';
import { EM_DASH, ordinal } from '../../lib/format';
import type { HistoryRow } from '../../lib/history';
import TeamMonogram from '../ui/TeamMonogram';

/**
 * The 2025-26 archive standings table (DESIGN §3.9) — final records only, no GD bar, no form
 * strip: the source PDF carries no game-level data, only a final W-L(-T) line per school.
 *
 * `overallRecord` is always null in this file (SPEC §1.3 — that PDF column was empty for the
 * 2025-26 season), so the Overall cell is always an em dash rather than a guess. `place` is the
 * PDF's own "SCHOOL by finish" order, not a value recomputed by this site.
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
    <div className="sx-bleed overflow-clip">
      {/* `sx-table-wide` puts a gutter between columns: without it the place cell ("1st") runs
          straight into the team monogram beside it. */}
      <table className="sx-table sx-table-wide text-meta">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {/* 32px, not 40: at 320px the four columns added up to 328 inside a 320px
                `overflow-clip` box and the Overall column lost its last 8px with nothing to
                scroll (DESIGN R-8). "8th" in tabular mono is 24px wide. */}
            <th scope="col" className="w-8 pl-gutter">
              #
            </th>
            <th scope="col">Team</th>
            <th scope="col" className="text-right">
              League
            </th>
            <th scope="col" className="pr-gutter text-right">
              Overall
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const team = row.slug ? getTeamBySlug(row.slug) : undefined;
            return (
              <tr key={`${row.place}-${row.name}`} style={{ height: 44 }}>
                <td className="sx-num w-8 pl-gutter">{ordinal(row.place)}</td>
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
                      className="flex items-center gap-1.5 no-underline hover:underline"
                    >
                      <TeamMonogram team={team} size={20} />
                      {/* Wraps rather than truncating: at 320px a nowrap name set the column's
                          minimum to 143px and pushed the four columns to 328px inside a 320px
                          clip box, so the Overall column lost its last 8px with no way to scroll
                          (DESIGN R-8). Wrapping drops the minimum to one word and loses nothing. */}
                      <span className="min-w-0 text-body text-ink">{row.name}</span>
                    </Link>
                  ) : (
                    <span className="flex items-center gap-1.5 text-body text-ink">{row.name}</span>
                  )}
                </th>
                <td className="sx-num text-right">{row.leagueRecord}</td>
                <td className="sx-num pr-gutter text-right text-ink-3">
                  {row.overallRecord ?? EM_DASH}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default HistoryStandingsTable;
