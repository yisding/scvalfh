import Link from 'next/link';

import { getTeamBySlug } from '../../lib/data';
import { historySchoolName, type HistoryRow } from '../../lib/history/history';
import MissingValue from '../ui/MissingValue';
import TeamMonogram from '../ui/TeamMonogram';

/**
 * The 2025-26 archive standings table (spec §5.6): the site's plain table (`.sx-table`), final records
 * only, no form strip: the source carries no game-level data, only a final W-L(-T) line per school.
 *
 * Columns: place, team (logo and name, a link to the team page for a school this site follows),
 * league record, and Overall where the league's source publishes it. The team is named by the registry
 * (historySchoolName), not by the source's spelling, so "St. Francis" in the PDF prints "Saint Francis"
 * as everywhere else. `overallRecord` is null for every SCVAL row (SPEC §1.3: that PDF column was empty
 * for the 2025-26 season), so SCVAL has no Overall column at all; a league whose source publishes it
 * (BVAL's sheet) gets it in every one of its tables (the page decides once per league: `hasOverall`),
 * and a row that has none still shows a dash there. Overall answers to the table's own width
 * (`sx-col-mid`: it is dropped under 20rem, a 320px phone). `place` is the source's own finish order,
 * not a value recomputed by this site. With `champion`, row 1's name is bold and followed by the plain
 * label "Champion" (it was a card above the table).
 */

/** A record the source left out: a dash for the eye, words for a screen reader. */
function NotPublished() {
  return (
    <span className="sx-num">
      <MissingValue words="not published" />
    </span>
  );
}

export interface HistoryStandingsTableProps {
  rows: HistoryRow[];
  caption: string;
  emptyLabel: string;
  /**
   * Whether the table draws an Overall column: the LEAGUE's answer (`leagueHasOverall`), not this
   * table's. Decided per table, a division or level whose rows all lacked an overall record would
   * drop the column and widen its League column to 96px beside a sibling's 80, and the records of
   * one league would stop lining up across its tables.
   */
  hasOverall: boolean;
  /** Row 1 is the division's champion: its name is bold and followed by the plain label "Champion". */
  champion?: boolean;
}

/** True when any of a league's tables publishes an overall record (BVAL's sheet; never SCVAL's). */
export function leagueHasOverall(tables: ReadonlyArray<ReadonlyArray<HistoryRow>>): boolean {
  return tables.some((rows) => rows.some((r) => r.overallRecord !== null));
}

export function HistoryStandingsTable({ rows, caption, emptyLabel, hasOverall, champion = false }: HistoryStandingsTableProps) {
  if (rows.length === 0) {
    return <p className="sx-empty">{emptyLabel}</p>;
  }
  return (
    <div className="sx-tablewrap">
      <table className="sx-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="sx-col-rank">
              <span aria-hidden="true">#</span>
              <span className="sr-only">Place</span>
            </th>
            <th scope="col" className="sx-col-team">
              Team
            </th>
            <th scope="col">League</th>
            {hasOverall ? (
              <th scope="col" className="sx-col-mid">
                Overall
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const team = row.slug ? getTeamBySlug(row.slug) : undefined;
            const name = historySchoolName(row.slug, row.name);
            const first = champion && index === 0;
            return (
              <tr key={`${row.place}-${row.slug ?? row.name}`} data-team-slug={team?.slug}>
                <td className="sx-num sx-col-rank">{row.place}</td>
                <th scope="row" className={first ? 'sx-col-team font-bold' : 'sx-col-team'}>
                  <span className="sx-teamcell">
                    {team ? <TeamMonogram team={team} size={24} /> : null}
                    <span>
                      {/* `prefetch={false}`: every route here is STATIC, so Next 16's `auto` downloads the
                          whole linked route the moment the link scrolls into view, and this page stacks one
                          of these tables per division and level of every league with standings. */}
                      {team ? (
                        <Link href={`/teams/${team.slug}`} prefetch={false} className="sx-rowlink">
                          {name}
                        </Link>
                      ) : (
                        name
                      )}
                      {first ? <span className="ml-2 text-cell font-normal text-ink-2">Champion</span> : null}
                    </span>
                  </span>
                </th>
                <td className="sx-num">{row.leagueRecord}</td>
                {hasOverall ? (
                  <td className="sx-num sx-col-mid sx-col-quiet">{row.overallRecord ?? <NotPublished />}</td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default HistoryStandingsTable;
