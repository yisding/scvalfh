import Link from 'next/link';

import { EM_DASH, ordinal } from '../../lib/format';
import SectionHeader from '../ui/SectionHeader';
import TeamMonogram from '../ui/TeamMonogram';

import {
  joinNames,
  projectionRowLabel,
  recordLine,
  type DivisionProjection,
  type ProjectionRow,
} from './playoff-view';

/**
 * One division's projected CCS qualification (DESIGN §3.8, §7.11; BYLAWS-ADDENDUM Article VII §2).
 *
 * Rules this table implements literally:
 *
 *  - **Every status is a written word.** `label` comes from `PLAYOFF_STATUS_LABELS` — "Automatic
 *    qualifier", "Play-in game Oct 30", "At-large consideration", "No automatic path", "No results
 *    reported". There are NO percentages anywhere on this page, because there is no model.
 *  - **The 2px rule after the last automatic berth is the redundant cue**, never the only one.
 *  - **Shared places render level** — `T6`, the US tie mark, with an sr-only "tied for 6th" — and
 *    every tied group gets `tiebreak.note` verbatim in the footnotes, which already carries its
 *    Article citation.
 *  - **No per-division meter.** "3 of 7 in automatic position" restated what the 2px rule and the
 *    three "Automatic qualifier" capsules already show, and pushed each table ~100px down; the
 *    page's one berth meter (SCVAL 7 of 16) is in "SCVAL's share of the field".
 *  - **The pinned team is marked** like every other team list: `data-team-slug` on the row is what
 *    the head script and `PinnedTeamMarks` stamp `data-pinned` on (the 2px accent rule, and a
 *    3px Highlight border in forced colours), and the row link's sentence carries a `.sx-pin-note`
 *    that only the pinned row displays. An attribute and an inset shadow, so CLS stays 0.
 *  - **Phone: a full-bleed band** (`sx-bleed`). Below md the card runs edge to edge and the first
 *    and last cells take the 16px gutter themselves, which buys the ~28px the status capsule needs
 *    to sit beside the record instead of wrapping under it. Below sm the monogram gap (`gap-2`) and
 *    the record-to-capsule gap (`gap-x-1.5`) tighten too, so the longest capsules still fit in the
 *    table whose `T7` widens the first column. Measured at 320: every row is 65/66px (every row was
 *    89px before).
 *  - **A team with nothing reported is never 0-0-0**: place `—`, record `—`, and the
 *    written status "No results reported". It is still a link to its team page.
 *  - The whole row is one block link whose hit area is exactly the row (WCAG 2.5.8), the same
 *    mechanism `StandingsTable` uses. Its sentence carries the place and the record; the status
 *    cell is real text beside it, so nothing is announced twice.
 */
export interface PlayoffProjectionProps {
  projection: DivisionProjection;
  /** 'through Sep 29', or 'so far' before this division has a league result. */
  asOfLabel: string;
  /** Deep link to this division's full league table. */
  standingsHref: string;
  className?: string;
  id?: string;
}

function PlaceCell({ row }: { row: ProjectionRow }) {
  const { standing } = row;
  if (!standing.hasReportedResults) {
    return (
      <span className="sx-num text-ink-3">
        <span aria-hidden="true">{EM_DASH}</span>
        <span className="sr-only">not ranked</span>
      </span>
    );
  }
  const { place } = standing.computed;
  // `T7`, the US tie mark this audience reads on every standings page, rather than the British
  // `7=`. `whitespace-nowrap` so the narrow first column can never break the T from its number.
  if (row.shared) {
    return (
      <span className="sx-num whitespace-nowrap text-ink">
        <span aria-hidden="true">T{place}</span>
        <span className="sr-only">tied for {ordinal(place)}</span>
      </span>
    );
  }
  return <span className="sx-num text-ink">{place}</span>;
}

/**
 * The written status: one tinted capsule in 12px SANS, sentence case. These are phrases ("At-large
 * consideration or no automatic path"), and mono caps are kept for the 1–2 word codes a `Tag` is
 * for (brief §1). The tones are Tag's: accent-ink on the wash only for a sole AQ. The capsule is
 * `inline-block`, so a long phrase grows into ONE taller capsule instead of breaking into a cloned
 * pill per line. Any " — " tail (the coin-flip note) is plain text under it.
 */
function StatusBadge({ row }: { row: ProjectionRow }) {
  const [head, ...tail] = row.label.split(' — ');
  return (
    <>
      <span
        className={`inline-block max-w-full rounded-tag px-2 py-0.5 text-micro font-semibold leading-5 ${
          row.status === 'aq' && row.statuses.length === 1
            ? 'bg-accent-wash text-accent-ink'
            : 'bg-surface-3 text-ink-2'
        }`}
      >
        {head}
      </span>
      {tail.length > 0 ? (
        <span className="block basis-full text-micro text-ink-2 md:mt-1">{tail.join(' — ')}</span>
      ) : null}
    </>
  );
}

/** The by-law sentence, with the play-in date formatted from the snapshot like every other date. */
function qualifying(playIn: string): string {
  return (
    'The first three in each division qualify automatically (Article VII §2). The two ' +
    `fourth-place teams meet in the ${playIn} play-in for the seventh SCVAL berth, and the play-in ` +
    'loser plus both fifth-place teams are submitted to CCS for at-large consideration.'
  );
}

/**
 * The footnotes every division shares, said once for the page in a labelled disclosure (brief
 * §4.22). Division-specific facts (tie notes, no-results teams) stay visible under their own table.
 */
export function ProjectionKey({
  playIn,
  className,
  showRule = true,
}: {
  /** The crossover / play-in date, already formatted ("Fri Oct 30"). */
  playIn: string;
  className?: string;
  /** false when no table draws the 2px rule (nobody is in automatic position yet). */
  showRule?: boolean;
}) {
  return (
    <details className={`sx-inset sx-disclosure${className ? ` ${className}` : ''}`}>
      <summary>How to read the projection</summary>
      {/* A flex column, not `space-y-3`: v4's space-y is a zero-specificity child rule, so the
          children's `m-0` would win and the paragraphs would touch. */}
      <div className="flex max-w-prose flex-col gap-3 text-meta text-ink-2">
        <p className="m-0">
          {showRule ? 'The 2px rule marks the last automatic berth. ' : ''}
          {qualifying(playIn)}
        </p>
        <p className="m-0">
          Every status in the tables is a written word. There are no probabilities on this page, because
          there is no model behind it &mdash; only the league points played so far.
        </p>
        <p className="m-0">
          <Link href="/about#standings" className="sx-action text-accent hover:underline">
            How these places are computed
          </Link>
        </p>
      </div>
    </details>
  );
}

export function PlayoffProjection({
  projection,
  asOfLabel,
  standingsHref,
  className,
  id,
}: PlayoffProjectionProps) {
  const { rows, divisionLabel, berthRuleAfter, notes } = projection;
  const footnotes: string[] = [...notes];
  // One footnote for the whole set, not one per team: eight identical sentences would bury the
  // rest. When NO row has results, buildDivisionProjection has already said so.
  const noData = rows.filter((r) => !r.standing.hasReportedResults).map((r) => r.team.name);
  if (noData.length > 0 && noData.length < rows.length) {
    const single = noData.length === 1;
    footnotes.push(
      `${joinNames(noData)} ${single ? 'is' : 'are'} in the official ${divisionLabel} alignment ` +
        `but ${single ? 'has' : 'have'} no reported results, so ${
          single ? 'it is' : 'they are'
        } listed last with no record and no place.`,
    );
  }

  return (
    <section className={className} id={id}>
      <SectionHeader
        as="h3"
        kicker={divisionLabel}
        meta={`${asOfLabel} · unofficial`}
        action={{ href: standingsHref, label: 'Full table' }}
      />
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
              {/* 13rem only from lg: from md the two divisions sit side by side, and a fixed
                  13rem status column in a ~350px half would truncate the team names. */}
              <th scope="col" className="hidden pr-4 md:table-cell lg:w-52">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.team.slug}
                data-team-slug={row.team.slug}
                className="relative"
                style={
                  berthRuleAfter && index + 1 === berthRuleAfter
                    ? { height: 56, borderBottom: '2px solid var(--sx-border-strong)' }
                    : { height: 56 }
                }
              >
                <td className="w-8 pr-1 pl-gutter align-middle sm:w-10 sm:pr-2">
                  <PlaceCell row={row} />
                </td>
                <th scope="row" className="pr-gutter font-normal md:pr-0">
                  {/* `prefetch={false}` for the reason the nav and the standings rows carry it
                      (components/layout/NavLink.tsx, components/ui/StandingsTable.tsx): every route
                      here is STATIC, so Next 16's `auto` downloads the whole linked route the
                      moment the link scrolls into view, and the two projection tables together are
                      fifteen stretched row links. Navigation still fetches on click. */}
                  <Link
                    href={`/teams/${row.team.slug}`}
                    prefetch={false}
                    className="absolute inset-0"
                  >
                    <span className="sr-only">
                      {/* Only the pinned row's copy is displayed (app/globals.css), so the
                          accent rule is never the only thing saying "this is your team". */}
                      <span className="sx-pin-note">Your team. </span>
                      {projectionRowLabel(row, divisionLabel)}
                    </span>
                  </Link>
                  <span className="flex items-center gap-2 sm:gap-3">
                    <TeamMonogram team={row.team} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body text-ink" aria-hidden="true">
                        {row.team.shortName}
                      </span>
                      {/* Record and points wrap as two whole units, never "pts" alone, with a
                          visible middot between them as its own flex item (the gap alone read
                          "5-1-0 15 pts" as one number run). `gap-x-1` is a word space either side
                          of the dot; a wider gap cost the 320px row the width its status capsule
                          needs to stay on this line. For the same reason the record-to-capsule gap
                          is `gap-x-1.5` and the monogram gap above is `gap-2` below sm: without
                          both, El Camino's longest capsules ("Play-in game Oct 30", "At-large
                          consideration") wrapped at 320. Digits are mono, the word "pts" is sans
                          (DESIGN §4.3: mono is for digits that stack). Below md the status
                          capsule follows them on the same line (it wraps under them when the row
                          is too narrow); from md it has its own column. */}
                      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                        <span
                          className="flex flex-wrap gap-x-1 text-cell text-ink-2"
                          aria-hidden="true"
                        >
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
