import Link from 'next/link';

import ExternalLink from '../ui/ExternalLink';
import TeamMonogram from '../ui/TeamMonogram';
import type { CrossCheckRow, Team } from '../../lib/types';

/**
 * The published MaxPreps STANDINGS cross-check (DESIGN §9, /about#cross-check).
 *
 * `snapshot.crossCheck` is a direct field-by-field comparison — not a reimplementation — for
 * every team where our computed record disagrees with MaxPreps' own table. We always show our
 * own computation and say so; a disagreement is published, never resolved silently.
 *
 * THREE columns, not four. Every row of a team's group carries the same `url` — its division's
 * MaxPreps standings page — so a per-row Source column repeated one link per row AND made the
 * table 346px wide inside a 320px `overflow-clip` box, where the last column (that very link)
 * was cut off with nothing to scroll. DESIGN R-8 asks for a reflow at 320px with no loss of
 * content and no scrollable data table, so the link moved up to the team's own line, where it is
 * said once and reads better.
 */
export interface CrossCheckGroup {
  team: Team;
  /** The one-sentence summary from `Standing.mismatchDetail`, when the snapshot carries one. */
  detail?: string;
  /** The field-by-field rows for this team from `snapshot.crossCheck`. */
  rows: CrossCheckRow[];
}

export interface CrossCheckTableProps {
  groups: CrossCheckGroup[];
}

export function CrossCheckTable({ groups }: CrossCheckTableProps) {
  if (groups.length === 0) {
    return (
      <p className="max-w-[62ch] py-1 text-body text-ink-2">
        No disagreements in the most recent run &mdash; our computed league records match
        MaxPreps&rsquo; published table exactly for all 15 teams.
      </p>
    );
  }
  return (
    <div className="space-y-6">
      {groups.map(({ team, detail, rows }) => (
        <div key={team.id} className="border-t border-hairline pt-3 first:border-t-0 first:pt-0">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <TeamMonogram team={team} size={20} />
            {/* `prefetch={false}` for the reason the nav and the standings rows carry it
                (components/layout/NavLink.tsx, components/ui/StandingsTable.tsx): every route here is
                STATIC, so Next 16's `auto` downloads the whole linked route the moment the link
                scrolls into view, and the table is one link per cross-checked row. Navigation still
                fetches on click. */}
            <Link
              href={`/teams/${team.slug}`}
              prefetch={false}
              className="text-body font-semibold text-ink hover:underline"
            >
              {team.name}
            </Link>
            <span aria-hidden="true" className="text-ink-3">
              &#9873;
            </span>
            {/* A standalone action in the header row, not a word in the sentence below it, so it
                carries its own 24px box (WCAG 2.5.8; see app/globals.css). */}
            {rows[0] ? (
              <span className="ml-auto text-meta">
                <ExternalLink href={rows[0].url} arrow={false} className="sx-action">
                  MaxPreps table
                </ExternalLink>
              </span>
            ) : null}
          </div>
          {detail ? <p className="mt-1 mb-0 max-w-[62ch] text-meta text-ink-2">{detail}</p> : null}
          {rows.length > 0 ? (
            <div className="sx-bleed mt-2 overflow-clip">
              <table className="sx-table sx-table-wide text-meta">
                <caption className="sr-only">{team.name} MaxPreps cross-check</caption>
                <thead>
                  <tr>
                    <th scope="col" className="pl-gutter">
                      Field
                    </th>
                    <th scope="col" className="text-right">
                      We compute
                    </th>
                    <th scope="col" className="pr-gutter text-right">
                      MaxPreps shows
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.field}>
                      <td className="pl-gutter text-ink-2">{row.field}</td>
                      <td className="sx-num text-right font-semibold text-ink">{row.ours}</td>
                      <td className="sx-num pr-gutter text-right text-ink-2">{row.theirs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default CrossCheckTable;
