import Link from 'next/link';

import { ordinal } from '../../lib/format';
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
 * Every status is a WORD (`AQ`, `Play-in`, `At-large`, `No AQ`) on a tag, so nothing here is
 * carried by color (DESIGN §6.5, channel 1 and 2). Only AQ takes the accent tag, because there the
 * accent already means "berth". The Article VII §2 text itself is cited once per page, in the
 * standings disclosure, and each status label names its place range.
 *
 * Each team is a pill link to its page with its place beside the name, so the band reads as a
 * row of facts rather than a `·`-separated sentence.
 *
 * A shared place is rendered `5=` exactly as the table renders it, and `caveat` says in words
 * that the cut is unsettled — Article VI §7's coin flip is the league's to run, not ours.
 * Teams with no reported results are NAMED but never given a projected place.
 */
export interface PlayoffStatusBandProps {
  divisionLabel: string;
  groups: StatusGroup[];
  caveat: string | null;
  /** Teams with `hasReportedResults === false` (Wilcox today). */
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
      <h3 className="m-0 text-lead text-ink">
        <span className="sr-only">{divisionLabel}: </span>CCS qualifying, as things stand
      </h3>
      <dl className="mt-2 mb-0 divide-y divide-divider">
        {/* Two columns (status | teams) where the band spans the content width (768-1023); from
            lg the band shares its row with the Notes inset, and an 11rem term column there wrapped
            "5th place — submitted to CCS for at-large consideration" onto five lines, so the
            term sits above its teams instead. */}
        {groups.map((group) => (
          <div
            key={group.status}
            className="grid gap-3 py-3 md:grid-cols-[minmax(0,11rem)_1fr] lg:grid-cols-1 lg:gap-2"
          >
            <dt className="flex items-baseline gap-2">
              <Tag size="md" tone={group.status === 'aq' ? 'accent' : 'neutral'}>
                {group.badge}
              </Tag>
              <span className="text-meta text-ink-2">{group.label}</span>
            </dt>
            <dd className="m-0 flex flex-wrap content-start gap-2">
              {group.teams.map((team) => (
                /* `prefetch={false}` for the reason the nav and the standings rows carry it
                   (components/layout/NavLink.tsx, components/ui/StandingsTable.tsx): every route
                   here is STATIC, so Next 16's `auto` downloads the whole linked route the moment
                   the link scrolls into view, and this band names every team in the division. */
                <Link
                  key={team.slug}
                  href={`/teams/${team.slug}`}
                  prefetch={false}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-meta text-ink no-underline hover:bg-surface-3 forced-colors:border"
                >
                  {team.name}
                  {/* The same `=` marker the table uses for a level place, so the two never
                      disagree about whether a place is settled. */}
                  <span className="sx-num text-micro text-ink-3">
                    {team.shared ? (
                      <>
                        <span aria-hidden="true">{ordinal(team.place)}=</span>
                        <span className="sr-only">tied for {ordinal(team.place)}</span>
                      </>
                    ) : (
                      ordinal(team.place)
                    )}
                  </span>
                </Link>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      {caveat ? <p className="mt-3 mb-0 max-w-prose text-meta text-ink-2">{caveat}</p> : null}
      {unrankedTeams.length > 0 ? (
        <p className="mt-3 mb-0 max-w-prose text-meta text-ink-2">
          {unrankedTeams.join(', ')} {unrankedTeams.length === 1 ? 'has' : 'have'} no published
          result, so no place and no playoff status is projected.
        </p>
      ) : null}
      {/* A standalone action, like the Notes link row beside it: a <div>, so the in-prose
          underline rule (`p a`) does not mark this one alone. */}
      <div className="mt-4">
        <Link
          href="/playoffs"
          prefetch={false}
          className="sx-action text-meta font-medium text-accent hover:underline"
        >
          Playoff picture
        </Link>
      </div>
    </div>
  );
}

export default PlayoffStatusBand;
