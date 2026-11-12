import Link from 'next/link';

import ExternalLink from '../ui/ExternalLink';
import TeamMonogram from '../ui/TeamMonogram';

import type { CrossCheckGroup } from './about-view';

/**
 * The published MaxPreps STANDINGS cross-check (DESIGN §9, /about#cross-check), for one scope —
 * /about renders one per league, and a second one per division whose MaxPreps table differs for a
 * KNOWN reason (`CrossCheckRow.knownCause`), so expected differences sit in their own sub-list
 * under the cause sentence instead of reading as alarms.
 *
 * `snapshot.crossCheck` is a direct field-by-field comparison — not a reimplementation — for
 * every team where our computed record disagrees with MaxPreps' own table. We always show our
 * own computation and say so; a disagreement is published, never resolved silently.
 *
 * THREE columns, not four. Every row of a team's group carries the same `url`, its division's
 * MaxPreps standings page, so the link is said once, on the team's own line: a per-row Source
 * column repeated it and made the table wider than a 320px screen. A plain `.sx-table` (untinted
 * head over the ink rule, DESIGN §33), no box around it.
 */
export interface CrossCheckTableProps {
  groups: CrossCheckGroup[];
  /** Teams in scope (a league, or the whole site): "all <n> teams" in the agreement sentence. */
  teamCount: number;
  /**
   * Replaces the agreement sentence when the scope has no rows but agreement must NOT be claimed
   * (a division whose MaxPreps table leaves a team out, or one we compare for information only).
   */
  emptyText?: string | null;
}

export function CrossCheckTable({ groups, teamCount, emptyText = null }: CrossCheckTableProps) {
  if (groups.length === 0) {
    return (
      <p className="sx-empty max-w-prose">
        {emptyText ?? (
          <>
            No disagreements in the most recent run &mdash; our computed league records match
            MaxPreps&rsquo; published table exactly for all {teamCount} teams.
          </>
        )}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {groups.map(({ team, detail, rows }) => (
        // Capped at the prose measure, so the table's right edge lines up with the paragraphs around it.
        <div key={team.id} className="max-w-prose">
          <div className="flex flex-wrap items-center gap-x-3">
            {/* `prefetch={false}`: one link per cross-checked team, each to a static route. */}
            <Link
              href={`/teams/${team.slug}`}
              prefetch={false}
              className="sx-teamlink inline-flex min-h-7 min-w-0 items-center gap-2 text-body font-semibold text-ink pointer-coarse:min-h-11"
            >
              <TeamMonogram team={team} size={24} />
              <span>{team.name}</span>
            </Link>
            {/* Every row of a team's group carries the same `url`, its division's MaxPreps standings
                page, so it is linked once, on the team's own line. */}
            {rows[0] ? (
              <ExternalLink href={rows[0].url} arrow={false} className="sx-action ml-auto">
                MaxPreps table
              </ExternalLink>
            ) : null}
          </div>
          {detail ? <p className="m-0 text-cell text-ink-2">{detail}</p> : null}
          {rows.length > 0 ? (
            // Three columns: the field takes the spare width and wraps ("league goals against"); the two
            // value columns hold a place, a count or a record and stay on one line.
            <table className="sx-table mt-1">
              <caption className="sr-only">
                {team.name}: our computation compared with MaxPreps&rsquo; standings table
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="text-left">
                    Field
                  </th>
                  <th scope="col" className="w-[4.5rem]">
                    Ours
                  </th>
                  <th scope="col" className="w-[6rem]">
                    MaxPreps
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.field}>
                    <td className="text-left whitespace-normal text-ink-2">{row.field}</td>
                    <td className="sx-num font-semibold">{row.ours}</td>
                    <td className="sx-num text-ink-2">{row.theirs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default CrossCheckTable;
