import { Fragment } from 'react';

import { CCS_LEAGUE_IDS, getLeague } from '../../lib/leagues';
import { listWords } from '../../lib/format';
import { ordersByRecord } from '../../lib/standings/order';
import { articleFor, membershipSource } from '../words/membership-words';
import { RECORD_HEAD } from '../words/score-words';
import { TeamRowLink } from '../ui/PinNote';
import PlaceMark from '../ui/PlaceMark';
import SectionHeader from '../ui/SectionHeader';
import TeamMonogram from '../ui/TeamMonogram';

import {
  projectionRowLabel,
  recordLine,
  splitStatusLabel,
  type DivisionProjection,
  type ProjectionRow,
} from './playoff-view';

/**
 * One division's projected CCS qualification (spec §5.6; SPEC §10.7), for any CCS league: a plain
 * table of who is in, under the division's strip. Rendered only until CCS seeds its field; after
 * that the bracket is the answer and the page draws no projection.
 *
 * Rules this table implements literally:
 *
 *  - **Every status is a written word**, plain text in its own column. `label` comes from the
 *    league's ladder in config: "Automatic qualifier", "Play-in game Oct 30", "Hosts the play-in
 *    Oct 31", "No automatic-berth route", "No results reported". A " — " tail (the coin-flip note)
 *    is a second line under it.
 *  - **The ladder line is the table's labelled qualification line** (`tr.sx-cutline`, "Automatic-berth
 *    line", "Play-in host"), as on /standings: a line AND words (WCAG 1.3.1). No meter.
 *  - **Shared places render level** (`T6`, with an sr-only "tied for 6th"), and every tied group
 *    gets `tiebreak.note` verbatim in the notes under the table.
 *  - **The pinned team is marked** like every other team list: `data-team-slug` on the row, the row
 *    link's sentence opening with the hidden pin note, and the star after the name.
 *  - **A team with nothing reported is never 0-0-0**: place and record are the missing-value dash
 *    and the status reads "No results reported". It is still a link to its team page.
 *  - The record and the ordering value (points; the record alone where the league orders by it) are
 *    columns of their own once the table is 24rem wide; on a phone the table is place, team, status,
 *    and the row link's sentence still carries the record.
 */
export interface PlayoffProjectionProps {
  projection: DivisionProjection;
  /**
   * The h3 kicker: the division heading, or 'League table' for a single-division league (never the
   * league's name twice, never a division label for PCAL).
   */
  heading: string;
  /** @deprecated There is no per-division meter: the labelled line in the table says who is in. Ignored. */
  meterNote?: string | null;
  /** 'through Sep 29', or 'so far' before this division has a league result. */
  asOfLabel: string;
  /** Deep link to this division's full league table. */
  standingsHref: string;
  className?: string;
  id?: string;
}

/** The CCS leagues of this build order their tables on the league record (basketball), not on points. */
const CCS_BY_RECORD = CCS_LEAGUE_IDS.length > 0 && CCS_LEAGUE_IDS.every((id) => ordersByRecord(getLeague(id).rules));

function PlaceCell({ row }: { row: ProjectionRow }) {
  const ranked = row.standing.hasReportedResults;
  // `T7`, the US tie mark this audience reads on every standings page, rather than the British
  // `7=` (PlaceMark).
  return (
    <PlaceMark
      place={row.standing.computed.place}
      shared={row.shared}
      ranked={ranked}
      className="sx-num"
    />
  );
}

export function PlayoffProjection({
  projection,
  heading,
  asOfLabel,
  standingsHref,
  className,
  id,
}: PlayoffProjectionProps) {
  const { rows, divisionLabel, lineAfter, lineLabel, notes } = projection;
  const footnotes: string[] = [...notes];
  // One footnote for the whole set, not one per team: eight identical sentences would bury the
  // rest. When NO row has results, buildDivisionProjection has already said so.
  const noData = rows.filter((r) => !r.standing.hasReportedResults).map((r) => r.team.name);
  if (noData.length > 0 && noData.length < rows.length) {
    const single = noData.length === 1;
    // A league with no documents of its own (`official.mode: 'none'`) publishes no alignment. "As
    // MaxPreps lists it" only where MaxPreps' table for this division lists every one of them (the
    // EAL); otherwise the league's membership source (components/words/membership-words.ts).
    const source = membershipSource(
      projection.division,
      rows.filter((r) => !r.standing.hasReportedResults).map((r) => r.team.slug),
    );
    const where =
      source.kind === 'maxpreps'
        ? `in the ${divisionLabel} table as MaxPreps lists it`
        : source.kind === 'official'
          ? `in the official ${divisionLabel} alignment`
          : single
            ? `${articleFor(divisionLabel)} ${divisionLabel} team (${source.source})`
            : `${divisionLabel} teams (${source.source})`;
    footnotes.push(
      `${listWords(noData)} ${single ? 'is' : 'are'} ${where} ` +
        `but ${single ? 'has' : 'have'} no reported results, so ${
          single ? 'it is' : 'they are'
        } listed last with no record and no place.`,
    );
  }

  return (
    <section className={className} id={id}>
      <SectionHeader strip kicker={heading} meta={asOfLabel} action={{ href: standingsHref, label: 'Full standings' }} />
      <div className="sx-tablewrap">
        <table className="sx-table">
          <caption className="sr-only">
            {divisionLabel}{` projected CCS qualification, from league ${CCS_BY_RECORD ? 'record' : 'points'} `}{asOfLabel}.
            Unofficial.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="sx-col-rank">
                #
              </th>
              <th scope="col" className="sx-col-team">
                Team
              </th>
              <th scope="col" className="sx-col-wide">
                {RECORD_HEAD}
              </th>
              {CCS_BY_RECORD ? null : (
                <th scope="col" className="sx-col-wide sx-col-key">
                  Pts
                </th>
              )}
              <th scope="col" className="text-left">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const [record, value] = recordLine(row.standing).split(' · ');
              const { head, tail } = splitStatusLabel(row.label);
              return (
                <Fragment key={row.team.slug}>
                  <tr data-team-slug={row.team.slug}>
                    <td className="sx-col-rank">
                      <PlaceCell row={row} />
                    </td>
                    <th scope="row" aria-label={row.team.name} className="sx-col-team">
                      <span className="sx-teamcell">
                        <TeamMonogram team={row.team} size={24} />
                        <span>
                          {/* The row link never prefetches (components/ui/PinNote.tsx): every projection
                              table is a column of them. Its sentence carries the place and the record; the
                              status cell is real text beside it, so nothing is announced twice. */}
                          <TeamRowLink href={`/teams/${row.team.slug}`} label={projectionRowLabel(row, divisionLabel)}>
                            {row.team.shortName}
                          </TeamRowLink>
                          <span className="sx-pin-note" aria-hidden="true" hidden>
                            Your team
                          </span>
                        </span>
                      </span>
                    </th>
                    <td className="sx-num sx-col-wide sx-col-quiet" aria-hidden="true">
                      {record}
                    </td>
                    {CCS_BY_RECORD ? null : (
                      <td className="sx-num sx-col-wide sx-col-key" aria-hidden="true">
                        {value ? value.replace(/ pts$/, '') : record}
                      </td>
                    )}
                    {/* The status is the point of the table, so it stays in the a11y tree and the row
                        link's sentence deliberately does not repeat it. It may wrap; a name may not. */}
                    <td className="min-w-40 py-1 text-left text-cell whitespace-normal text-ink-2 sm:min-w-60">
                      {head}
                      {tail !== null ? <span className="block text-ink-3">{tail}</span> : null}
                    </td>
                  </tr>
                  {lineLabel && index + 1 === lineAfter && index + 1 < rows.length ? (
                    // The ladder line (SPEC §10.3): the labelled qualification line. Not a data row.
                    <tr className="sx-cutline">
                      <td colSpan={CCS_BY_RECORD ? 4 : 5}>
                        <span>{lineLabel}</span>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {footnotes.map((note) => (
        <p key={note} className="sx-note">
          {note}
        </p>
      ))}
    </section>
  );
}

export default PlayoffProjection;
