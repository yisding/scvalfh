import Link from 'next/link';

import { PinNote, TeamNameCell } from '@/components/standings/table/parts';
import EmptyState from '@/components/ui/EmptyState';
import PlaceMark from '@/components/ui/PlaceMark';
import SectionHeader from '@/components/ui/SectionHeader';
import { recordString } from '@/lib/format/numbers';
import { EM_DASH } from '@/lib/format/words';
import { teamHref } from '@/lib/shared/routes';
import type { JvTableView } from '@/views/standings/jv';

/**
 * One league's JV tables on `/jv` (`#<division>` each): its divisions' blocks, in config order.
 *
 * A shown table is the compact table's shape (CompactStandingsTable: place, team with its monogram
 * and the pinned row's hidden "Your team." note, the whole row one link, GP, W-L-T, PTS, capped at
 * 48rem from lg) plus GF and GA, with no ladder line: no JV place leads anywhere. GF and GA hide
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
          {view.status === 'shown' ? (
            <>
              <JvTable view={view} />
              <p className="mt-3 mb-0 max-w-prose text-meta text-ink-3">
                {[view.through, view.coverage].filter(Boolean).join(' ')}
              </p>
            </>
          ) : (
            <EmptyState heading={view.emptyHeading ?? ''}>{view.coverage}</EmptyState>
          )}
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
        <caption className="sr-only">{`${view.title} standings, unofficial`}</caption>
        <thead className="[&_th]:static">
          <tr>
            <th scope="col" className="w-[2.75rem] pl-gutter pr-2">
              #
            </th>
            <th scope="col">Team</th>
            <th scope="col" className="w-10 text-right" title="JV league games counted">
              GP
            </th>
            <th scope="col" className="w-[4.5rem] text-right">
              W-L-T
            </th>
            <th scope="col" className="w-12 text-right max-[25.9375rem]:pr-gutter">
              Pts
            </th>
            <th scope="col" className="w-10 text-right max-[25.9375rem]:hidden" title="Goals for">
              GF
            </th>
            <th scope="col" className="w-10 pr-gutter text-right max-[25.9375rem]:hidden" title="Goals against">
              GA
            </th>
          </tr>
        </thead>
        <tbody>
          {view.rows.map(({ row, team }) => {
            const has = row.record.gp > 0;
            return (
              <tr key={team.id} data-team-slug={team.slug} className="relative">
                <td className="sx-num w-[2.75rem] pl-gutter pr-2 text-ink-3">
                  <PlaceMark place={row.record.place} shared={row.shared} ranked={has} />
                </td>
                <th scope="row" className="max-w-0 text-left font-normal">
                  <Link
                    href={`${teamHref(team.slug)}#jv`}
                    prefetch={false}
                    className="flex min-h-11 items-center gap-2 text-ink no-underline hover:underline after:absolute after:inset-0 after:content-['']"
                  >
                    {/* As in CompactStandingsTable: only the pinned team's row displays this. */}
                    <span className="sr-only">
                      <PinNote />
                    </span>
                    <TeamNameCell team={team} size={24} nameClass="min-w-0 line-clamp-2 text-ellipsis text-body" />
                  </Link>
                </th>
                <td className="sx-num w-10 text-right text-ink-2">{row.record.gp}</td>
                <td className="sx-num w-[4.5rem] text-right font-medium text-ink">
                  {has ? recordString(row.record) : EM_DASH}
                </td>
                <td className="sx-num w-12 text-right text-body font-bold text-ink max-[25.9375rem]:pr-gutter">{has ? row.record.pts : EM_DASH}</td>
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
