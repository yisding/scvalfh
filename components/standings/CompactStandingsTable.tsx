import Link from 'next/link';

import { EM_DASH, recordString } from '../../lib/format';
import PlaceMark from '../ui/PlaceMark';
import TeamMonogram from '../ui/TeamMonogram';
import type { StandingsRowData } from '../ui/StandingsTable';

import { ladderLineAfter, ladderRow } from './standings-view';

/**
 * The COMPACT full table of the all-league `/standings` overview (SPEC §10.3): place, team
 * (monogram + short name, a link to the team page), GP, W-L-T, PTS. Every team of the division,
 * in the engine's order — a full table, just narrow.
 *
 * After the league's ladder line (`DivisionConfig.ladderLine`: SCVAL 3 `AQ line`, Mt. Hamilton 3
 * `AQ line`, Santa Teresa 1 `Play-in host`, PCAL 2 `AQ line`, MCAL 6 `Tournament line`) a
 * LABELLED separator row: the heavier rule is never the only cue (WCAG 1.3.1). With shared places
 * the line is drawn after every row at or above it, and not at all before any result. A null
 * `ladderLine` draws no rule and no label: the EAL, whose Super Regional takes the top six of its
 * six teams, has no line to draw.
 *
 * No sticky head (a short table on a long page), no GD bars, no form strips, no disclosures.
 * A team with no results gets an em-dash place and em dashes for W-L-T and PTS — never 0-0-0.
 *
 * The pinned team's row (the head script and `PinnedTeamMarks` stamp `data-pinned` on its
 * `data-team-slug`) draws the accent rule and reveals a hidden "Your team." at the start of its
 * link, as the standings rows and the old /teams tiles do.
 *
 * `filterable` (the /teams page, whose `TeamFinder` filters these tables in place): each team row
 * carries `data-team-tile="<slug>"` and the ladder row `data-hide-while-searching`, the hooks the
 * finder's filter mode toggles.
 */
export interface CompactStandingsTableProps {
  rows: readonly StandingsRowData[];
  /** null = no line at all (the EAL). */
  ladderLine: { after: number; label: string } | null;
  caption: string;
  /** Carry the TeamFinder filter hooks (see above). */
  filterable?: boolean;
  className?: string;
}

export function CompactStandingsTable({
  rows,
  ladderLine,
  caption,
  filterable = false,
  className,
}: CompactStandingsTableProps) {
  const lineAfter = ladderLineAfter(rows.map(ladderRow), ladderLine?.after);

  return (
    <div className={['sx-card sx-flush sx-bleed', className].filter(Boolean).join(' ')}>
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
              <tr
                key={row.team.id}
                data-team-slug={row.team.slug}
                data-team-tile={filterable ? row.team.slug : undefined}
                className="relative"
              >
                <td className="sx-num w-[2.75rem] pl-gutter pr-2 text-ink-3">
                  <PlaceMark place={s.computed.place} shared={s.tiebreak.shared} ranked={has} />
                </td>
                <th scope="row" className="max-w-0 text-left font-normal">
                  <Link
                    href={`/teams/${row.team.slug}`}
                    prefetch={false}
                    className="flex min-h-11 items-center gap-2 text-ink no-underline hover:underline"
                  >
                    {/* Only the pinned team's row displays this (app/globals.css: the row's
                        `data-team-slug` gets `data-pinned`), so the accent rule is never the only
                        thing saying "this is your team"; it is the link's name, before the school. */}
                    <span className="sr-only">
                      <span className="sx-pin-note" hidden>Your team. </span>
                    </span>
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
                <tr key={`${row.team.id}-line`} data-hide-while-searching={filterable ? '' : undefined}>
                  <td colSpan={5} className="border-t-2 border-rule px-gutter text-micro text-ink-3">
                    {ladderLine?.label}
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
