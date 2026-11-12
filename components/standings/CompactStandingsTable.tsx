import Link from 'next/link';

import { leagueOfDivision } from '../../lib/leagues';
import { orderHead, orderValue } from '../../lib/standings/order';
import { capitalized } from '../words/capitalized';
import { formStripName } from '../words/plural';
import { RECORD_HEAD } from '../words/score-words';
import { EM_DASH, recordString } from '../../lib/format';
import FormStrip, { toFormEntries } from '../ui/FormStrip';
import { PinNote } from '../ui/PinNote';
import PlaceMark from '../ui/PlaceMark';
import TeamMonogram from '../ui/TeamMonogram';
import type { StandingsRowData } from './standings-table/types';

import { ladderLineAfter, ladderRow } from './standings-view';

/**
 * The COMPACT table of the all-league `/standings` overview (SPEC §10.3; DESIGN §33 for the face):
 * place, team (logo and short name, a link to the team page), W-L-T, Pts, and Last 5 where the table
 * itself is at least 24rem wide (`sx-col-wide`: a container query on `.sx-tablewrap`, so a table in a
 * narrow column drops it and one in a wide column shows it). Every team of the division, in the
 * engine's order.
 *
 * After the league's ladder line (`DivisionConfig.ladderLine`: SCVAL 3 `Automatic-berth line`, Mt. Hamilton 3
 * `Automatic-berth line`, Santa Teresa 1 `Play-in host`, PCAL 2 `Automatic-berth line`, MCAL 6 `Tournament line`) ONE
 * extra row, `tr.sx-cutline`: the green 2px line with its label set on it, so the line is never the
 * only cue (WCAG 1.3.1). With shared places the line is drawn after every row at or above it, and not
 * at all before any result. A null `ladderLine` draws no line and no label: the EAL, whose Super
 * Regional takes the top six of its six teams, has no line to draw.
 *
 * The whole row is the team link: the name is the link (`.sx-rowlink`) and its `::after` stretches
 * over the `relative` row, so a tap on the place, the record or the points opens the team page too.
 *
 * No sticky head (a short table on a long page), no GP column, no disclosures. A team with no results
 * gets an em-dash place and em dashes for W-L-T and Pts, never 0-0-0, and no Last 5.
 *
 * The pinned team's row (the head script and `PinnedTeamMarks` stamp `data-pinned` on its
 * `data-team-slug`) gets a bold name and the star after it, and a hidden "Your team." at the start of
 * its link's name.
 *
 * `filterable` (a page whose `TeamFinder` filters these tables in place): each team row carries
 * `data-team-tile="<slug>"` and the ladder row `data-hide-while-searching`, the hooks the finder's
 * filter mode toggles.
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

const COLUMNS = 5;

export function CompactStandingsTable({
  rows,
  ladderLine,
  caption,
  filterable = false,
  className,
}: CompactStandingsTableProps) {
  const lineAfter = ladderLineAfter(rows.map(ladderRow), ladderLine?.after);
  // The order column: Pts, or Pct for a table ordered on its league record (lib/standings/order.ts).
  const rules = rows.length > 0 ? leagueOfDivision(rows[0].standing.division).rules : null;

  return (
    <div className={['sx-tablewrap', className].filter(Boolean).join(' ')}>
      <table className="sx-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="sx-col-rank">
              #
            </th>
            <th scope="col" className="sx-col-team">
              Team
            </th>
            <th scope="col">{RECORD_HEAD}</th>
            <th scope="col" className="sx-col-key">
              {rules ? capitalized(orderHead(rules).toLowerCase()) : 'Pts'}
            </th>
            <th scope="col" className="sx-col-wide">
              Last 5
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
                <td className="sx-num sx-col-rank">
                  <PlaceMark place={s.computed.place} shared={s.tiebreak.shared} ranked={has} />
                </td>
                <th scope="row" className="sx-col-team">
                  <span className="sx-teamcell">
                    <TeamMonogram team={row.team} size={24} />
                    <span>
                      <Link href={`/teams/${row.team.slug}`} prefetch={false} className="sx-rowlink min-w-0">
                        {/* Only the pinned team's row displays this (app/globals.css), so the star is
                            never the only thing saying "this is your team": it leads the link's name. */}
                        <span className="sr-only">
                          <PinNote />
                        </span>
                        {row.team.shortName}
                      </Link>
                      {/* The star. aria-hidden: the link's own name already starts "Your team." */}
                      <span className="sx-pin-note" aria-hidden="true" hidden>
                        Your team
                      </span>
                    </span>
                  </span>
                </th>
                <td className="sx-num">{has ? recordString(s.computed) : EM_DASH}</td>
                <td className="sx-num sx-col-key">{has && rules ? orderValue(rules, s.computed) : EM_DASH}</td>
                <td className="sx-col-wide">
                  {has ? (
                    <FormStrip
                      entries={toFormEntries(s.computed.last5)}
                      size={16}
                      label={formStripName(row.team.name, s.computed.last5.length)}
                    />
                  ) : null}
                </td>
              </tr>,
              lineAfter !== null && index + 1 === lineAfter ? (
                <tr
                  key={`${row.team.id}-line`}
                  className="sx-cutline"
                  data-hide-while-searching={filterable ? '' : undefined}
                >
                  <td colSpan={COLUMNS}>
                    <span>{ladderLine?.label}</span>
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
