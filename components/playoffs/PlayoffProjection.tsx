import Link from 'next/link';
import { Fragment } from 'react';

import { listWords } from '../../lib/format';
import BerthMeter from '../ui/BerthMeter';
import { articleFor, membershipSource } from '../ui/membership-words';
import PlaceMark from '../ui/PlaceMark';
import SectionHeader from '../ui/SectionHeader';
import StatusChip from '../ui/StatusChip';
import TeamMonogram from '../ui/TeamMonogram';

import {
  projectionRowLabel,
  recordLine,
  splitStatusLabel,
  type DivisionProjection,
  type ProjectionRow,
} from './playoff-view';

/**
 * One division's projected CCS qualification (DESIGN §3.8, §7.11; SPEC §10.7), for any CCS league.
 *
 * Rules this table implements literally:
 *
 *  - **Every status is a written word.** `label` comes from the league's ladder in config —
 *    "Automatic qualifier", "Play-in game Oct 30", "Hosts the play-in Oct 31", "No automatic-berth
 *    route", "No results reported".
 *  - **The ladder line is a labelled separator row** ("AQ line", "Play-in host"), as on /standings:
 *    a 2px rule AND words, so the rule is never the only cue (WCAG 1.3.1).
 *  - **Shared places render level** — `T6`, the US tie mark, with an sr-only "tied for 6th" — and
 *    every tied group gets `tiebreak.note` verbatim in the footnotes, which already carries its
 *    league's citation.
 *  - **A per-division meter only where the league's berths ARE per division** (`meterNote`, SCVAL:
 *    "3 per division qualify automatically"); any other league's table shows its ladder line alone.
 *  - **The pinned team is marked** like every other team list: `data-team-slug` on the row is what
 *    the head script and `PinnedTeamMarks` stamp `data-pinned` on (the 2px accent rule, and a
 *    3px Highlight border in forced colours), and the row link's sentence carries a `.sx-pin-note`
 *    that only the pinned row displays. An attribute and an inset shadow, so CLS stays 0.
 *  - **Phone: a full-bleed band** (`sx-bleed`). Below md the card runs edge to edge and the first
 *    and last cells take the 16px gutter themselves, which buys the width the status capsule needs
 *    to sit beside the record instead of wrapping under it. The record-to-capsule gap is `gap-x-1.5`,
 *    and below sm the 28px monogram is hidden (the name beside it already says who it is): BVAL's
 *    and PCAL's "No automatic-berth route" needs 248/256px beside the record, and with the
 *    monogram the line had 231/236px at 320, so those rows were 89px with the capsule under the
 *    record. Without it the line has ~272px and every single-status row, in every league, is one
 *    line at 320. A tied coin-flip row still wraps by design; when anything wraps, it wraps under
 *    the record as one taller capsule (`StatusBadge`), never a pill per line.
 *  - **A team with nothing reported is never 0-0-0**: place `—`, record `—`, and the
 *    written status "No results reported". It is still a link to its team page.
 *  - The whole row is one block link whose hit area is exactly the row (WCAG 2.5.8), the same
 *    mechanism `StandingsTable` uses. Its sentence carries the place and the record; the status
 *    cell is real text beside it, so nothing is announced twice.
 */
export interface PlayoffProjectionProps {
  projection: DivisionProjection;
  /**
   * The h3 kicker: the division heading, or 'League table' for a single-division league (never the
   * league's name twice, never a division label for PCAL).
   */
  heading: string;
  /**
   * '3 per division qualify automatically.' — only for a league whose divisions each hold the same
   * number of automatic berths (SCVAL); null hides the per-division meter.
   */
  meterNote?: string | null;
  /** 'through Sep 29', or 'so far' before this division has a league result. */
  asOfLabel: string;
  /** Deep link to this division's full league table. */
  standingsHref: string;
  className?: string;
  id?: string;
}

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
      tone={ranked ? 'text-ink' : 'text-ink-3'}
    />
  );
}

/**
 * The written status as a StatusChip (components/ui/StatusChip.tsx): accent only for a sole AQ.
 * Any " — " tail (the coin-flip note) is plain text under it.
 */
function StatusBadge({ row }: { row: ProjectionRow }) {
  const { head, tail } = splitStatusLabel(row.label);
  return (
    <>
      <StatusChip tone={row.status === 'aq' && row.statuses.length === 1 ? 'accent' : 'neutral'}>
        {head}
      </StatusChip>
      {tail !== null ? <span className="block basis-full text-micro text-ink-2 md:mt-1">{tail}</span> : null}
    </>
  );
}

/**
 * The footnotes every division of a league shares, said once per league in a labelled disclosure
 * (brief §4.22). Division-specific facts (tie notes, no-results teams) stay visible under their own
 * table.
 */
export function ProjectionKey({
  qualification,
  className,
  showLine = true,
  rulesHref,
}: {
  /** The league's qualification sentence (`postseason.citation`, introduced). */
  qualification: string;
  className?: string;
  /** false when no table draws the ladder line (nobody has results yet). */
  showLine?: boolean;
  /** '/about#rules-<league>' */
  rulesHref: string;
}) {
  return (
    <details className={['sx-inset sx-disclosure', className].filter(Boolean).join(' ')}>
      <summary>How to read the projection</summary>
      {/* A flex column, not `space-y-3`: v4's space-y is a zero-specificity child rule, so the
          children's `m-0` would win and the paragraphs would touch. */}
      <div className="flex max-w-prose flex-col gap-3 text-meta text-ink-2">
        <p className="m-0">
          {showLine ? 'The labelled line marks the end of the division’s automatic or play-in places. ' : ''}
          {qualification}
        </p>
        {/* True while no model feeds this page (DESIGN §19.2): a change that adds one rewrites it. */}
        <p className="m-0">
          Every status in the tables is a written word. There are no probabilities on this page, because
          there is no model behind it &mdash; only the league points played so far.
        </p>
        <p className="m-0">
          <Link href={rulesHref} className="sx-action text-accent hover:underline">
            How these places are computed
          </Link>
        </p>
      </div>
    </details>
  );
}

export function PlayoffProjection({
  projection,
  heading,
  meterNote = null,
  asOfLabel,
  standingsHref,
  className,
  id,
}: PlayoffProjectionProps) {
  const { rows, divisionLabel, lineAfter, lineLabel, autoRows, notes } = projection;
  const footnotes: string[] = [...notes];
  // One footnote for the whole set, not one per team: eight identical sentences would bury the
  // rest. When NO row has results, buildDivisionProjection has already said so.
  const noData = rows.filter((r) => !r.standing.hasReportedResults).map((r) => r.team.name);
  if (noData.length > 0 && noData.length < rows.length) {
    const single = noData.length === 1;
    // A league with no documents of its own (`official.mode: 'none'`) publishes no alignment. "As
    // MaxPreps lists it" only where MaxPreps' table for this division lists every one of them (the
    // EAL); otherwise the league's membership source (components/ui/membership-words.ts).
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
      <SectionHeader
        as="h3"
        kicker={heading}
        meta={`${asOfLabel} · unofficial`}
        action={{ href: standingsHref, label: 'Full table' }}
      />
      {meterNote ? (
        <BerthMeter
          claimed={autoRows.length}
          total={rows.length}
          label={`${autoRows.length} of ${divisionLabel}’s ${rows.length} teams are in automatic-qualifier position today. ${meterNote}`}
          className="mb-4"
        />
      ) : null}
      <div className="sx-card sx-flush sx-bleed">
        <table className="sx-table text-meta">
          <caption className="sr-only">
            {divisionLabel} projected CCS qualification, from league points {asOfLabel}.
            Unofficial.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="w-8 pr-1 pl-gutter sm:w-10 sm:pr-2">
                #
              </th>
              <th scope="col" className="pr-gutter md:pr-0">Team</th>
              {/* 13rem only from lg: from md two divisions may sit side by side, and a fixed
                  13rem status column in a ~350px half would truncate the team names. */}
              <th scope="col" className="hidden pr-4 md:table-cell lg:w-52">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <Fragment key={row.team.slug}>
              <tr data-team-slug={row.team.slug} className="relative" style={{ height: 56 }}>
                <td className="w-8 pr-1 pl-gutter align-middle sm:w-10 sm:pr-2">
                  <PlaceCell row={row} />
                </td>
                <th scope="row" className="pr-gutter font-normal md:pr-0">
                  {/* `prefetch={false}` for the reason the nav and the standings rows carry it
                      (components/layout/NavLink.tsx, components/ui/StandingsTable.tsx): every route
                      here is STATIC, so Next 16's `auto` downloads the whole linked route the
                      moment the link scrolls into view, and every projection table is a column of
                      stretched row links. Navigation still fetches on click. */}
                  <Link
                    href={`/teams/${row.team.slug}`}
                    prefetch={false}
                    className="absolute inset-0"
                  >
                    <span className="sr-only">
                      {/* Only the pinned row's copy is displayed (app/globals.css), so the
                          accent rule is never the only thing saying "this is your team". */}
                      <span className="sx-pin-note" hidden>Your team. </span>
                      {projectionRowLabel(row, divisionLabel)}
                    </span>
                  </Link>
                  <span className="flex items-center gap-3">
                    <span className="hidden shrink-0 sm:flex">
                      <TeamMonogram team={row.team} size={28} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body text-ink" aria-hidden="true">
                        {row.team.shortName}
                      </span>
                      {/* Record and points wrap as two whole units, never "pts" alone, with a
                          visible middot between them as its own flex item (the gap alone read
                          "5-1-0 15 pts" as one number run). `gap-x-1` is a word space either side
                          of the dot; a wider gap cost the 320px row the width its status capsule
                          needs to stay on this line. For the same reason the record-to-capsule gap
                          is `gap-x-1.5`, and the monogram above is hidden below sm: without it,
                          BVAL's and PCAL's "No automatic-berth route" wrapped under the record at
                          320 (see the docblock). Digits are mono,
                          the word "pts" is sans (DESIGN §4.3: mono is for digits that stack).
                          Below md the status capsule follows them on the same line (it wraps under
                          them when the row is too narrow); from md it has its own column. */}
                      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                        <span className="flex flex-wrap gap-x-1 text-cell text-ink-2" aria-hidden="true">
                          {recordLine(row.standing)
                            .split(' · ')
                            .flatMap((part, i) => {
                              const pts = /^(\d+) pts$/.exec(part);
                              const unit = (
                                <span key={part} className="whitespace-nowrap">
                                  {pts ? (
                                    <>
                                      <span className="sx-num">{pts[1]}</span> pts
                                    </>
                                  ) : (
                                    <span className="sx-num">{part}</span>
                                  )}
                                </span>
                              );
                              return i === 0
                                ? [unit]
                                : [
                                    <span key={`dot-${i}`} aria-hidden="true">
                                      &middot;
                                    </span>,
                                    unit,
                                  ];
                            })}
                        </span>
                        <span className="contents md:hidden">
                          <StatusBadge row={row} />
                        </span>
                      </span>
                    </span>
                  </span>
                </th>
                {/* The status is the whole point of the page, so it stays in the a11y tree and
                    the row link's sentence deliberately does not repeat it. Below md it sits under
                    the record in the team cell (above), where it has the card's width; this
                    column only exists from md. `display: none` keeps it out of the a11y tree, so
                    exactly one copy is ever read. */}
                <td className="hidden pr-3 pl-3 align-middle sm:pr-4 md:table-cell">
                  <StatusBadge row={row} />
                </td>
              </tr>
              {lineLabel && index + 1 === lineAfter && index + 1 < rows.length ? (
                // The ladder line (SPEC §10.3): a labelled separator row, so the 2px rule is never
                // the only cue. Not a data row: its one cell spans the table.
                <tr>
                  <td
                    colSpan={3}
                    className="border-t-2 border-rule py-1 pl-gutter text-micro text-ink-3"
                  >
                    {lineLabel}
                  </td>
                </tr>
              ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {footnotes.length > 0 ? (
        <ul className="mt-3 mb-0 max-w-prose list-none space-y-1 pl-0 text-meta text-ink-2">
          {footnotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default PlayoffProjection;
