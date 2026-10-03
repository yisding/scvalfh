import Link from 'next/link';

import { EM_DASH, ordinal, recordString } from '../../lib/format';
import type { Standing } from '../../lib/types';
import TeamMonogram from '../ui/TeamMonogram';
import type { StandingsRowData } from '../ui/StandingsTable';

/**
 * The COMPACT full table of the all-league `/standings` overview (SPEC §10.3): place, team
 * (monogram + short name, a link to the team page), GP, W-L-T, PTS. Every team of the division,
 * in the engine's order — a full table, just narrow.
 *
 * After the league's ladder line (`DivisionConfig.ladderLine`: SCVAL 3 `AQ line`, Mt. Hamilton 3
 * `AQ line`, Santa Teresa 1 `Play-in host`, PCAL 2 `AQ line`, MCAL 6 `Tournament line`) a
 * LABELLED separator row: the heavier rule is never the only cue (WCAG 1.3.1). With shared places
 * the line is drawn after every row at or above it, and not at all before any result.
 *
 * No sticky head (a short table on a long page), no GD bars, no form strips, no disclosures.
 * A team with no results gets an em-dash place and em dashes for W-L-T and PTS — never 0-0-0.
 */
export interface CompactStandingsTableProps {
  rows: readonly StandingsRowData[];
  ladderLine: { after: number; label: string };
  caption: string;
  className?: string;
}

function Place({ standing }: { standing: Standing }) {
  if (!standing.hasReportedResults) {
    return (
      <>
        <span aria-hidden="true">{EM_DASH}</span>
        <span className="sr-only">not ranked</span>
      </>
    );
  }
  const { place } = standing.computed;
  // A level place reads `T7`, as every table on the site prints it (StandingsTable, the playoff
  // projection): never a second notation such as `7=` beside it.
  return standing.tiebreak.shared ? (
    <span className="whitespace-nowrap">
      <span aria-hidden="true">T{place}</span>
      <span className="sr-only">tied for {ordinal(place)}</span>
    </span>
  ) : (
    <>{place}</>
  );
}

export function CompactStandingsTable({ rows, ladderLine, caption, className }: CompactStandingsTableProps) {
  const above = rows.filter(
    (r) => r.standing.hasReportedResults && r.standing.computed.place <= ladderLine.after,
  ).length;
  const lineAfter = above > 0 && above < rows.length ? above : null;

  return (
    <div className={`sx-card sx-flush sx-bleed${className ? ` ${className}` : ''}`}>
      <table className="sx-table text-cell">
        <caption className="sr-only">{caption}</caption>
        <thead className="[&_th]:static">
          <tr>
            <th scope="col" className="w-[2.75rem] pl-gutter pr-2">
              #
            </th>
            <th scope="col">Team</th>
            <th scope="col" className="w-10 text-right" title="League games counted">
              GP
            </th>
            <th scope="col" className="w-[4.5rem] text-right">
              W-L-T
            </th>
            <th scope="col" className="w-12 pr-gutter text-right">
              Pts
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const s = row.standing;
            const has = s.hasReportedResults;
            return [
              <tr key={row.team.id} data-team-slug={row.team.slug} className="relative">
                <td className="sx-num w-[2.75rem] pl-gutter pr-2 text-ink-3">
                  <Place standing={s} />
                </td>
                <th scope="row" className="max-w-0 text-left font-normal">
                  <Link
                    href={`/teams/${row.team.slug}`}
                    prefetch={false}
                    className="flex min-h-11 items-center gap-2 text-ink no-underline hover:underline"
                  >
                    <TeamMonogram team={row.team} size={24} />
                    <span className="min-w-0 truncate text-body">{row.team.shortName}</span>
                  </Link>
                </th>
                <td className="sx-num w-10 text-right text-ink-2">{s.computed.gp}</td>
                <td className="sx-num w-[4.5rem] text-right font-medium text-ink">
                  {has ? recordString(s.computed) : EM_DASH}
                </td>
                <td className="sx-num w-12 pr-gutter text-right text-body font-bold text-ink">
                  {has ? s.computed.pts : EM_DASH}
                </td>
              </tr>,
              lineAfter !== null && index + 1 === lineAfter ? (
                <tr key={`${row.team.id}-line`}>
                  <td colSpan={5} className="border-t-2 border-rule px-gutter text-micro text-ink-3">
                    {ladderLine.label}
                  </td>
                </tr>
              ) : null,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

export default CompactStandingsTable;
