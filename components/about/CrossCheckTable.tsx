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
      <p className="max-w-prose py-1 text-body text-ink-2">
        No disagreements in the most recent run &mdash; our computed league records match
        MaxPreps&rsquo; published table exactly for all 15 teams.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-stack">
      {groups.map(({ team, detail, rows }) => (
        // The group is capped at the prose measure (`max-w-prose`, the theme's one prose token,
        // which the ledes and the `max-w-prose` paragraphs on this page use too), so the header's
        // right-aligned link lines up with the card edge below it and the card's right edge lines
        // up with the paragraphs around it. A private `66ch` here once sat 10px past them.
        <div key={team.id} className="max-w-prose">
          {/* The monogram holds the first line; the name, its flag and the table link wrap in
              their own box. The flag is glued to the name's last word (a no-break space), so a
              long name like "St. Ignatius College Preparatory" never leaves it alone on a line;
              when the link does not fit it drops under the name, still right-aligned. */}
          <div className="flex items-start gap-x-2">
            <TeamMonogram team={team} size={24} />
            <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="min-w-0 text-body font-semibold text-ink">
                {/* `prefetch={false}` for the reason the nav and the standings rows carry it
                    (components/layout/NavLink.tsx, components/ui/StandingsTable.tsx): every route
                    here is STATIC, so Next 16's `auto` downloads the whole linked route the moment
                    the link scrolls into view, and the table is one link per cross-checked row.
                    Navigation still fetches on click. */}
                {/* `py-0.5` on the inline link: its box is the font's 21px content area, and the
                    2px above and below bring the hit area to the 24px minimum (WCAG 2.5.8)
                    without moving the line. */}
                <Link href={`/teams/${team.slug}`} prefetch={false} className="py-0.5 hover:underline">
                  {team.name}
                </Link>
                {'\u00a0'}
                <span aria-hidden="true" className="font-normal text-ink-3">
                  &#9873;
                </span>
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
          </div>
          {detail ? <p className="mt-1 mb-0 max-w-prose text-meta text-ink-2">{detail}</p> : null}
          {rows.length > 0 ? (
            <div className="sx-card sx-flush mt-3">
              {/* Auto layout with the two value columns shrink-wrapped (`w-px` + nowrap): they
                  hold a place or a record, so they take only their head's width ("Ours",
                  "MaxPreps") and the Field text gets the rest of the card (about 150px at 320
                  instead of 104). The longest unbreakable piece of any column is well under the
                  card's width, so the table still fits a 320px screen without scrolling. */}
              <table className="sx-table text-meta">
                <caption className="sr-only">
                  {team.name}: our computation compared with MaxPreps&rsquo; standings table
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="pl-4">
                      Field
                    </th>
                    {/* `tracking-normal`: right-aligned tracked caps leave the letter-spacing
                        after the last letter, a visible gap before the column edge. */}
                    <th scope="col" className="w-px px-3 text-right tracking-normal">
                      Ours
                    </th>
                    <th scope="col" className="w-px pl-3 pr-4 text-right tracking-normal">
                      MaxPreps
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.field}>
                      <td className="py-3 pl-4 text-ink-2">{row.field}</td>
                      <td className="sx-num whitespace-nowrap px-3 py-3 text-right text-cell font-semibold text-ink">{row.ours}</td>
                      <td className="sx-num whitespace-nowrap py-3 pl-3 pr-4 text-right text-cell text-ink-2">{row.theirs}</td>
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
