import Link from 'next/link';

import { ordinal } from '../../lib/format';
import { BYLAW_CITATIONS } from '../../lib/season';
import Tag from '../ui/Tag';

import type { StatusGroup } from './standings-view';

/**
 * The Article VII §2 markers AND their legend, in one block under each division's table.
 *
 * It is a `<dl>` rather than an extra table column because the status is a property of a PLACE,
 * not of a team: "places 1-3" is the rule, and the teams are what currently occupy them. Reading
 * it as term-then-teams also means the legend can never drift out of sync with the markers — they
 * are the same list.
 *
 * Every status is a WORD (`AQ`, `Play-in`, `At-large`, `No AQ`) on the hueless tag ground, so
 * nothing here is carried by color (DESIGN §6.5, channel 1 and 2). The by-law is cited in full
 * underneath, because a projection that does not name its rule is just an opinion.
 *
 * A shared place is rendered `5=` exactly as the table renders it, and `caveat` says in words
 * that the cut is unsettled — Article VI §7's coin flip is the league's to run, not ours.
 * Teams with no reported results are NAMED but never given a projected place.
 */
export interface PlayoffStatusBandProps {
  divisionLabel: string;
  groups: StatusGroup[];
  caveat: string | null;
  /** Teams with `hasReportedResults === false`. */
  unrankedTeams: string[];
  className?: string;
}

export function PlayoffStatusBand({
  divisionLabel,
  groups,
  caveat,
  unrankedTeams,
  className,
}: PlayoffStatusBandProps) {
  return (
    <div className={className}>
      <h3 className="m-0 font-mono text-kicker font-semibold tracking-[0.10em] uppercase text-ink-3">
        {divisionLabel} &mdash; CCS qualifying as things stand
      </h3>
      <dl className="mt-2 mb-0 grid grid-cols-1 gap-y-2 md:grid-cols-[minmax(0,22rem)_1fr] md:gap-x-6 md:gap-y-1.5">
        {groups.map((group) => (
          <div key={group.status} className="contents">
            <dt className="flex items-baseline gap-2">
              <Tag>{group.badge}</Tag>
              <span className="text-meta text-ink-2">{group.label}</span>
            </dt>
            <dd className="m-0 text-meta text-ink">
              {group.teams.map((team, index) => (
                <span key={team.slug}>
                  {index > 0 ? <span aria-hidden="true"> &middot; </span> : null}
                  {/* `prefetch={false}` for the reason the nav and the standings rows carry it
                      (components/layout/NavLink.tsx, components/ui/StandingsTable.tsx): every route
                      here is STATIC, so Next 16's `auto` downloads the whole linked route the
                      moment the link scrolls into view, and this band names all fifteen teams,
                      eight per division. Navigation still fetches on click. */}
                  <Link
                    href={`/teams/${team.slug}`}
                    prefetch={false}
                    className="text-ink hover:underline"
                  >
                    {team.name}
                  </Link>{' '}
                  {/* The same `=` marker the table uses for a level place, so the two never
                      disagree about whether a place is settled. */}
                  <span className="sx-num text-ink-3">
                    {team.shared ? (
                      <>
                        <span aria-hidden="true">{ordinal(team.place)}=</span>
                        <span className="sr-only">tied for {ordinal(team.place)}</span>
                      </>
                    ) : (
                      ordinal(team.place)
                    )}
                  </span>
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      {/* 62ch (DESIGN §4.3) on all three sentences below: the band itself spans the content
          column because its `dl` is a row of places, but these are prose. */}
      {caveat ? <p className="mt-2 mb-0 max-w-[62ch] text-meta text-ink-2">{caveat}</p> : null}
      {unrankedTeams.length > 0 ? (
        <p className="mt-2 mb-0 max-w-[62ch] text-meta text-ink-2">
          {unrankedTeams.join(', ')} {unrankedTeams.length === 1 ? 'has' : 'have'} no published
          result, so no place and no playoff status is projected.
        </p>
      ) : null}
      <p className="mt-2 mb-0 max-w-[62ch] text-meta text-ink-3">
        {BYLAW_CITATIONS.qualifiers}.{' '}
        <Link href="/playoffs" className="sx-action text-accent hover:underline">
          Playoff picture <span aria-hidden="true">&rarr;</span>
        </Link>
      </p>
    </div>
  );
}

export default PlayoffStatusBand;
