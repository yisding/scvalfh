import Link from 'next/link';

import { EM_DASH, recordString } from '../../lib/format';
import type { Team } from '../../lib/types';
import EmptyState from '../ui/EmptyState';
import { PinNote } from '../ui/PinNote';
import PlaceMark from '../ui/PlaceMark';
import SectionHeader from '../ui/SectionHeader';
import TeamMonogram from '../ui/TeamMonogram';
import type { JvTableView } from './jv-standings-view';

/**
 * A JV slot team's name cell (York): its tile, or a letter without one, and its name, linking the
 * JV section of the school whose slot it plays, where its games are listed. The link's accessible
 * name says whose page it opens, so "York" is not read as a page of its own.
 */
function SlotTeamCell({ name, mascot, host }: { name: string; mascot: string | null; host: Team | null }) {
  const body = (
    <>
      {mascot ? (
        <TeamMonogram team={{ slug: mascot, name }} size={24} />
      ) : (
        <span
          aria-hidden="true"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-3 text-micro font-semibold text-ink-2"
        >
          {name.charAt(0)}
        </span>
      )}
      <span className="min-w-0 line-clamp-2 text-ellipsis text-body">
        {name}
        {host ? <span className="sr-only">, JV games on {host.shortName}&rsquo;s page</span> : null}
      </span>
    </>
  );
  return host ? (
    <Link
      href={`/teams/${host.slug}#jv`}
      prefetch={false}
      className="flex min-h-11 items-center gap-2 text-ink no-underline hover:underline after:absolute after:inset-0 after:content-['']"
    >
      {body}
    </Link>
  ) : (
    <span className="flex min-h-11 items-center gap-2 text-ink">{body}</span>
  );
}

/**
 * One league's JV tables on `/jv` (`#<division>` each): its divisions' blocks, in config order.
 *
 * A shown table is the compact table's shape (CompactStandingsTable: place, team with its monogram
 * and the pinned row's hidden "Your team." note, the whole row one link, GP, the record, the order column —
 * points, or the winning percentage where the league's record orders its tables — capped at
 * 48rem from lg) plus the for and against columns, with no ladder line: no JV place leads anywhere. They hide
 * below 25.9375rem (415px: under that, beside the monogram, they would squeeze the name into
 * an ellipsis), where Pts becomes the last column and takes the 16px right gutter.
 * Under it, one coverage sentence (how many played JV league games have a score, and how many are
 * si.com's), the date it runs through, the schools with no JV league game, and any same-division
 * game no varsity game matched. A division without a table says why in an EmptyState with the
 * same coverage sentence.
 */
export function JvStandings({ views, multi }: { views: readonly JvTableView[]; multi: boolean }) {
  return (
    <>
      {views.map((view, index) => (
        <div key={view.division} id={view.anchor ?? undefined} className={index === 0 ? undefined : 'mt-8'}>
          {multi ? <SectionHeader as="h3" kicker={view.title} /> : null}
          {view.status === 'shown' || view.preseason ? (
            <>
              <JvTable view={view} />
              <p className="mt-3 mb-0 max-w-prose text-meta text-ink-3">
                {[view.through, view.coverage, view.preseason ? null : view.orderNote].filter(Boolean).join(' ')}
              </p>
            </>
          ) : (
            <EmptyState heading={view.emptyHeading ?? ''}>{view.coverage}</EmptyState>
          )}
          {view.scheduleNote ? <p className="mt-2 mb-0 max-w-prose text-meta text-ink-3">{view.scheduleNote}</p> : null}
          {view.slotNote ? <p className="mt-2 mb-0 max-w-prose text-meta text-ink-3">{view.slotNote}</p> : null}
          {view.absentNote ? <p className="mt-2 mb-0 max-w-prose text-meta text-ink-3">{view.absentNote}</p> : null}
          {view.uncountedNote ? <p className="mt-2 mb-0 max-w-prose text-meta text-ink-3">{view.uncountedNote}</p> : null}
        </div>
      ))}
    </>
  );
}

function JvTable({ view }: { view: JvTableView }) {
  return (
    <div className="sx-card sx-flush sx-bleed lg:max-w-3xl">
      <table className="sx-table text-cell">
        <caption className="sr-only">
          {view.preseason ? `${view.title} teams; no league game played yet` : `${view.title} standings, unofficial`}
        </caption>
        <thead className="[&_th]:static">
          <tr>
            <th scope="col" className="w-[2.75rem] pl-gutter pr-2">
              #
            </th>
            <th scope="col">Team</th>
            <th scope="col" className="w-10 text-right" title={view.heads.gpTitle}>
              GP
            </th>
            <th scope="col" className="w-[4.5rem] text-right">
              {view.heads.record}
            </th>
            <th scope="col" className="w-12 text-right max-[25.9375rem]:pr-gutter" title={view.heads.orderTitle}>
              {view.heads.order}
            </th>
            <th scope="col" className="w-10 text-right max-[25.9375rem]:hidden" title={view.heads.scoredForTitle}>
              {view.heads.scoredFor}
            </th>
            <th scope="col" className="w-10 pr-gutter text-right max-[25.9375rem]:hidden" title={view.heads.scoredAgainstTitle}>
              {view.heads.scoredAgainst}
            </th>
          </tr>
        </thead>
        <tbody>
          {view.rows.map(({ row, team, mascot, slotHost, orderText }) => {
            const has = row.record.gp > 0;
            return (
              <tr key={row.teamId} data-team-slug={team?.slug} className="relative">
                <td className="sx-num w-[2.75rem] pl-gutter pr-2 text-ink-3">
                  <PlaceMark place={row.record.place} shared={row.shared} ranked={has} />
                </td>
                <th scope="row" className="max-w-0 text-left font-normal">
                  {team ? (
                    <Link
                      href={`/teams/${team.slug}#jv`}
                      prefetch={false}
                      className="flex min-h-11 items-center gap-2 text-ink no-underline hover:underline after:absolute after:inset-0 after:content-['']"
                    >
                      {/* As in CompactStandingsTable: only the pinned team's row displays this. */}
                      <span className="sr-only">
                        <PinNote />
                      </span>
                      <TeamMonogram team={team} size={24} />
                      <span className="min-w-0 line-clamp-2 text-ellipsis text-body">{team.shortName}</span>
                    </Link>
                  ) : (
                    // A JV slot team (York): no page of its own. Its JV games are on the page of the school
                    // whose slot it plays (Santa Catalina's `#jv`), so the row links there, and says so
                    // to a screen reader; its own tile, or a letter without one.
                    <SlotTeamCell name={row.name} mascot={mascot} host={slotHost} />
                  )}
                </th>
                <td className="sx-num w-10 text-right text-ink-2">{row.record.gp}</td>
                <td className="sx-num w-[4.5rem] text-right font-medium text-ink">
                  {has ? recordString(row.record) : EM_DASH}
                </td>
                <td className="sx-num w-12 text-right text-body font-bold text-ink max-[25.9375rem]:pr-gutter">{has ? orderText : EM_DASH}</td>
                <td className="sx-num w-10 text-right text-ink-2 max-[25.9375rem]:hidden">{has ? row.record.gf : EM_DASH}</td>
                <td className="sx-num w-10 pr-gutter text-right text-ink-2 max-[25.9375rem]:hidden">
                  {has ? row.record.ga : EM_DASH}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default JvStandings;
