import Link from 'next/link';

import { getTeamBySlug } from '../../lib/data';
import { ordinal } from '../../lib/format';
import { historySchoolName, type HistoryRow } from '../../lib/history';
import MissingValue from '../ui/MissingValue';
import TeamMonogram from '../ui/TeamMonogram';

/**
 * The 2025-26 archive standings table (DESIGN §3.9) — final records only, no GD bar, no form
 * strip: the source PDF carries no game-level data, only a final W-L(-T) line per school.
 *
 * Three columns: place, team, league record. The team is named by the registry (historySchoolName),
 * not by the source's spelling, so "St. Francis" in the PDF prints "Saint Francis" as everywhere else. `overallRecord` is null for every SCVAL row (SPEC
 * §1.3 — that PDF column was empty for the 2025-26 season), so SCVAL has no Overall column at
 * all: a column of nothing but em dashes told the reader nothing and cost every table a fourth
 * column of width. A league whose source publishes it (BVAL's sheet) gets a fourth column, Overall,
 * and a row that has none still shows an em dash there. `place` is the source's own finish order,
 * not a value recomputed by this site.
 *
 * Below 23.4375rem (375px at a 16px browser font, 562px at 24px: the threshold StandingsTable uses)
 * a four-column table leaves the team name no room: at 320px the two 80px record columns and the
 * place column left 80px beside the monogram, and "Christopher" needs ~95. There the Overall column
 * is not drawn and each row's overall record moves to a second line under the team name, the way
 * the phone standings table carries it (DESIGN §10.8: reflow, never a scrollable table).
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
}

export function HistoryStandingsTable({ rows, caption, emptyLabel }: HistoryStandingsTableProps) {
  if (rows.length === 0) {
    return <p className="py-2 text-meta text-ink-3">{emptyLabel}</p>;
  }
  const hasOverall = rows.some((r) => r.overallRecord !== null);
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

          `table-fixed` with a <colgroup>: the place and record columns are fixed widths and Team
          takes the rest, so every table of one league puts its record columns at the same x — the
          records line up down that league's section and across its divisions instead of each table
          sizing League to its own longest record. Record cells never wrap at a hyphen (the
          StandingsTable rule): under a large browser font a wrapped "13-3-5" read as two numbers. */}
      <table className="sx-table table-fixed text-meta">
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          {/* 48px: 16 of left padding, 24 for "8th" in tabular mono, 8 of gutter. */}
          <col className="w-12" />
          <col />
          {/* 96px: 16 of right padding, 8 (12 from sm) of gutter, and room for the longest
              record, "11-0-1", in tabular mono with space to spare. With an Overall column drawn
              the two record columns are 80px each ("13-3-5" needs about 52 of the 56 left after
              padding); below the break League is the only record column and keeps 96. */}
          <col className={hasOverall ? 'w-24 min-[23.4375rem]:w-20' : 'w-24'} />
          {hasOverall ? <col className="hidden w-20 min-[23.4375rem]:table-column" /> : null}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="pl-4 pr-2">
              <span aria-hidden="true">#</span>
              <span className="sr-only">Place</span>
            </th>
            <th scope="col">Team</th>
            <th
              scope="col"
              className={`pl-2 text-right sm:pl-3 ${hasOverall ? 'pr-4 min-[23.4375rem]:pr-2' : 'pr-4'}`}
            >
              League
            </th>
            {hasOverall ? (
              <th scope="col" className="hidden pl-2 pr-4 text-right sm:pl-3 min-[23.4375rem]:table-cell">
                Overall
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const team = row.slug ? getTeamBySlug(row.slug) : undefined;
            const name = historySchoolName(row.slug, row.name);
            const overall = row.overallRecord ? (
              <span className="sx-num whitespace-nowrap">{row.overallRecord}</span>
            ) : (
              <NotPublished />
            );
            return (
              <tr key={`${row.place}-${row.slug ?? row.name}`} className="h-12">
                <td className="sx-num pl-4 pr-2 text-cell">{ordinal(row.place)}</td>
                <th scope="row" className="text-left font-normal">
                  {/* `prefetch={false}` for the reason the nav and the standings rows carry it
                      (components/layout/NavLink.tsx, components/ui/StandingsTable.tsx): every route
                      here is STATIC, so Next 16's `auto` downloads the whole linked route the
                      moment the link scrolls into view, and /history/2025-26 stacks one of these
                      tables per division and level of every league with standings — dozens of
                      whole team pages. Navigation still fetches on click. */}
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
                          whatever the fixed columns leave, and wrapping means a long name costs a
                          second line, never a clipped record; `overflow-wrap: anywhere` breaks a
                          single long word under a large browser font rather than let it run
                          under the record. */}
                      <span className="min-w-0 text-body text-ink [overflow-wrap:anywhere]">{name}</span>
                    </Link>
                  ) : (
                    <span className="flex items-center gap-2 text-body text-ink [overflow-wrap:anywhere]">
                      {name}
                    </span>
                  )}
                  {/* Below the break, the overall record sits under the name, indented past the
                      24px monogram and its gap. Outside the link, so the link's name stays the
                      school's. The digits never wrap; the word may. */}
                  {hasOverall ? (
                    <span className="block pl-[calc(24px+0.5rem)] text-cell text-ink-3 min-[23.4375rem]:hidden">
                      {overall} overall
                    </span>
                  ) : null}
                </th>
                <td
                  className={`sx-num whitespace-nowrap pl-2 text-right text-cell sm:pl-3 ${
                    hasOverall ? 'pr-4 min-[23.4375rem]:pr-2' : 'pr-4'
                  }`}
                >
                  {row.leagueRecord}
                </td>
                {hasOverall ? (
                  <td className="hidden pl-2 pr-4 text-right text-cell sm:pl-3 min-[23.4375rem]:table-cell">
                    {overall}
                  </td>
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
