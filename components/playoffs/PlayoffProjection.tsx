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

const QUALIFYING =
  'The first three in each division qualify automatically (Article VII §2). The two ' +
  'fourth-place teams meet in the Oct 30 play-in for the seventh SCVAL berth, and the play-in ' +
  'loser plus both fifth-place teams are submitted to CCS for at-large consideration.';

/**
 * The footnotes every division shares, said once for the page in a labelled disclosure (brief
 * §4.22). Division-specific facts (tie notes, no-results teams) stay visible under their own table.
 */
export function ProjectionKey({ className }: { className?: string }) {
  return (
    <details className={`sx-inset sx-disclosure${className ? ` ${className}` : ''}`}>
      <summary>How to read the projection</summary>
      <div className="max-w-prose space-y-3 text-meta text-ink-2">
        <p className="m-0">The 2px rule marks the last automatic berth. {QUALIFYING}</p>
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
  const { rows, divisionLabel, berthRuleAfter, autoRows, notes } = projection;
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
        action={{ href: standingsHref, label: 'Full table' }}
      />
      <BerthMeter
        claimed={autoRows.length}
        total={rows.length}
        label={`${autoRows.length} of ${divisionLabel}'s ${rows.length} teams are in automatic-qualifier position today. Three per division qualify automatically (Article VII §2).`}
        className="mb-4"
      />
      <div className="sx-card sx-flush">
        <table className="sx-table text-meta">
          <caption className="sr-only">
            {divisionLabel} projected CCS qualification, from league points {asOfLabel}.
            Unofficial.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="w-10 pr-2 pl-4">
                #
              </th>
              <th scope="col">Team</th>
              <th scope="col" className="w-[8.5rem] pr-4 md:w-52">
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
                    ? { height: 56, borderBottom: '2px solid var(--sx-border-strong)' }
                    : { height: 56 }
                }
              >
                <td className="w-10 pr-2 pl-4 align-middle">
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
                  <span className="flex items-center gap-3" aria-hidden="true">
                    <TeamMonogram team={row.team} size={28} />
                    <span className="min-w-0">
                      <span className="block truncate text-body text-ink">
                        {row.team.shortName}
                      </span>
                      <span className="sx-num block text-cell text-ink-2">
                        {recordLine(row.standing)}
                      </span>
                    </span>
                  </span>
                </th>
                {/* The status is the whole point of the page, so it stays in the a11y tree and
                    the row link's sentence deliberately does not repeat it. */}
                <td className="pr-4 align-middle">
                  {(() => {
                    const [head, ...tail] = row.label.split(' — ');
                    return (
                      <>
                        {/* A tinted chip in 12px SANS, sentence case: these are phrases
                            ("At-large consideration or no automatic path"), and mono caps are
                            kept for the 1–2 word codes a `Tag` is for (brief §1). The tones are
                            Tag's: accent-ink on the wash only for a sole AQ. */}
                        <span
                          className={`inline-block rounded-tag px-2 py-1 text-micro font-semibold ${
                            row.status === 'aq' && row.statuses.length === 1
                              ? 'bg-accent-wash text-accent-ink'
                              : 'bg-surface-3 text-ink-2'
                          }`}
                        >
                          {head}
                        </span>
                        {tail.length > 0 ? (
                          <span className="mt-1 block text-micro text-ink-2">{tail.join(' — ')}</span>
                        ) : null}
                      </>
                    );
                  })()}
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
