import Link from 'next/link';

import { EM_DASH, ordinal } from '../../lib/format';
import BerthMeter from '../ui/BerthMeter';
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
 *  - **Shared places render level** — `6=` with an sr-only "tied for 6th" — and every tied group
 *    gets `tiebreak.note` verbatim in the footnotes, which already carries its Article citation.
 *  - **A team with nothing reported (Wilcox) is never 0-0-0**: place `—`, record `—`, and the
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
  if (row.shared) {
    return (
      <span className="sx-num text-ink">
        <span aria-hidden="true">{place}=</span>
        <span className="sr-only">tied for {ordinal(place)}</span>
      </span>
    );
  }
  return <span className="sx-num text-ink">{place}</span>;
}

export function PlayoffProjection({
  projection,
  asOfLabel,
  standingsHref,
  className,
  id,
}: PlayoffProjectionProps) {
  const { rows, divisionLabel, berthRuleAfter, autoRows, notes } = projection;
  const qualifying =
    'The first three in each division qualify automatically (Article VII §2). The two ' +
    'fourth-place teams meet in the Oct 30 play-in for the seventh SCVAL berth, and the play-in ' +
    'loser plus both fifth-place teams are submitted to CCS for at-large consideration.';
  const footnotes: string[] = [
    berthRuleAfter > 0 ? `The 2px rule marks the last automatic berth. ${qualifying}` : qualifying,
    'Every status above is a written word. There are no probabilities on this page, because there is no model behind it — only the league points played so far.',
    ...notes,
  ];
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
        action={{ href: standingsHref, label: 'full table' }}
      />
      <BerthMeter
        claimed={autoRows.length}
        total={rows.length}
        label={`${autoRows.length} of ${divisionLabel}'s ${rows.length} teams are in automatic-qualifier position today. Three per division qualify automatically (Article VII §2).`}
        className="mb-3"
      />
      <div className="sx-bleed overflow-clip">
        <table className="sx-table text-meta">
          {/* Visually hidden on phone, shown on desktop (DESIGN §7.3): the section kicker above
              already says "projection · not official / through Sep 29" on a small screen. */}
          <caption className="sr-only md:not-sr-only md:pb-2 md:text-meta md:text-ink-3">
            {divisionLabel} projected CCS qualification, from league points {asOfLabel}.
            Unofficial.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="w-7 pl-gutter">
                #
              </th>
              <th scope="col">Team</th>
              <th scope="col" className="w-[8.5rem] pr-gutter md:w-52">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.team.slug}
                className="relative"
                style={
                  berthRuleAfter && index + 1 === berthRuleAfter
                    ? { height: 48, borderBottom: '2px solid var(--sx-border-strong)' }
                    : { height: 48 }
                }
              >
                <td className="pl-gutter align-middle">
                  <PlaceCell row={row} />
                </td>
                <th scope="row" className="font-normal">
                  {/* `prefetch={false}` for the reason the nav and the standings rows carry it
                      (components/layout/NavLink.tsx, components/ui/StandingsTable.tsx): every route
                      here is STATIC, so Next 16's `auto` downloads the whole linked route the
                      moment the link scrolls into view, and the two projection tables together are
                      sixteen stretched row links. Navigation still fetches on click. */}
                  <Link
                    href={`/teams/${row.team.slug}`}
                    prefetch={false}
                    className="absolute inset-0"
                  >
                    <span className="sr-only">{projectionRowLabel(row, divisionLabel)}</span>
                  </Link>
                  <span className="flex items-center gap-2" aria-hidden="true">
                    <TeamMonogram team={row.team} size={20} />
                    <span className="min-w-0">
                      <span className="block truncate text-body text-ink">
                        {row.team.shortName}
                      </span>
                      <span className="sx-num block text-meta text-ink-2">
                        {recordLine(row.standing)}
                      </span>
                    </span>
                  </span>
                </th>
                {/* The status is the whole point of the page, so it stays in the a11y tree and
                    the row link's sentence deliberately does not repeat it. */}
                <td className="pr-gutter align-middle text-ink">{row.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* 62ch (DESIGN §4.3) — the same measure as the "How it works" prose further down the
          page, which this block ran at twice the width of. */}
      <ul className="mt-2 mb-0 max-w-[62ch] list-none space-y-1 pl-0 text-meta text-ink-3">
        {footnotes.map((note) => (
          <li key={note}>{note}</li>
        ))}
        {/* The footnotes above are sentences; this one is a standalone action and the only thing
            in its row, so it takes its own 24px box (WCAG 2.5.8; see app/globals.css). */}
        <li>
          <Link href="/about#standings" className="sx-action text-accent hover:underline">
            How these places are computed
          </Link>
        </li>
      </ul>
    </section>
  );
}

export default PlayoffProjection;
