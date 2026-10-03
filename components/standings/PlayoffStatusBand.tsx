import Link from 'next/link';

import { ordinal } from '../../lib/format';

import type { StatusGroup } from './standings-view';

/**
 * The Article VII §2 markers AND their legend, in one block under each division's table.
 *
 * It is a `<dl>` rather than an extra table column because the status is a property of a PLACE,
 * not of a team: "places 1-3" is the rule, and the teams are what currently occupy them. Reading
 * it as term-then-teams also means the legend can never drift out of sync with the markers — they
 * are the same list.
 *
 * Every status is written out in WORDS ("Automatic qualifier", "Play-in game Oct 30", "At-large
 * consideration", "No automatic path" — `PLAYOFF_STATUS_LABELS`, the phrases /playoffs uses) on a
 * sentence-case chip, never a code like "AQ" or "NO AQ", so nothing here is carried by color or
 * by jargon (DESIGN §6.5, channels 1 and 2). Only the automatic-qualifier chip takes the accent
 * wash, because there the accent already means "berth". Beside the chip the term names the place
 * range ("Places 1–3", "5th place"), and for the play-in also what the game decides ("4th place ·
 * winner takes SCVAL's 7th automatic CCS spot"), the one consequence its chip cannot say. The
 * Article VII §2 text itself is cited once per page, in the standings disclosure.
 *
 * Each team is a pill link to its page with its place beside the name, so the band reads as a
 * row of facts rather than a `·`-separated sentence.
 *
 * A shared place is rendered `T-5th`, the pill-sized form of the table's `T5`, and `caveat` says
 * in words that the cut is unsettled — Article VI §7's coin flip is the league's to run, not ours.
 *
 * The caller passes `flex flex-col` with the card classes: from `lg` the band stretches to the
 * Notes inset beside it, and the link row's `mt-auto` keeps it on the bottom edge, level with
 * the Notes' own link row.
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
      <h3 className="m-0 text-lead text-ink">
        <span className="sr-only">{divisionLabel}: </span>CCS qualifying, as things stand
      </h3>
      <dl className="mt-2 mb-0 divide-y divide-divider">
        {/* Two columns (status | teams) where the band spans the content width (768-1023). The
            term column is 14rem there, just past the widest place-range term ("At-large
            consideration" chip + "5th place", ~213px), so those terms stay on one line and the
            pills get ~424px at 768: three AQ pills fit on one row. The play-in term's
            consequence clause wraps under its chip, and the dt's flex-wrap also absorbs a larger
            browser font. A fixed track, not `auto`: each row is its own grid, and a fixed width
            keeps the pill column aligned across rows. From lg the band shares its row with the
            Notes inset, so the term sits above its teams instead. */}
        {groups.map((group) => (
          <div
            key={group.status}
            className="grid gap-3 py-3 md:grid-cols-[minmax(0,14rem)_1fr] md:gap-6 lg:grid-cols-1 lg:gap-2"
          >
            <dt className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              {/* The sentence-case chip /playoffs uses (PlayoffProjection's StatusBadge): Tag's
                  tones, accent-ink on the wash only for the automatic qualifiers. */}
              <span
                className={`inline-block rounded-tag px-2 py-0.5 leading-5 text-micro font-semibold ${
                  group.status === 'aq' ? 'bg-accent-wash text-accent-ink' : 'bg-surface-3 text-ink-2'
                }`}
              >
                {group.statusText}
              </span>
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
                  {/* The same `T` marker the table uses for a level place ("T7" there, "T-7th"
                      here), so the two never disagree about whether a place is settled. */}
                  <span className="sx-num whitespace-nowrap text-micro text-ink-3">
                    {team.shared ? (
                      <>
                        <span aria-hidden="true">T-{ordinal(team.place)}</span>
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
          underline rule (`p a`) does not mark this one alone. `mt-auto` pins it to the bottom of
          the stretched card from lg (the caller's `flex flex-col`); `pt-4` is the old gap. */}
      <div className="mt-auto pt-4">
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
