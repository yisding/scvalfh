import Link from 'next/link';

import PlaceMark from '../ui/PlaceMark';
import StatusChip from '../ui/StatusChip';

import type { StatusGroup } from './standings-view';

/**
 * The league ladder's markers AND their legend, in one block under each division's table
 * (`statusBadge` / `statusLegend` from the league's config, SPEC §5.7). For a CCS league it is
 * the CCS picture; for MCAL it is the MCAL tournament line, and for the EAL its Super Regional
 * (linking the EAL card on /playoffs, since no bracket is published), with no CCS concept at all.
 *
 * It is a `<dl>` rather than an extra table column because the status is a property of a PLACE,
 * not of a team: "places 1-3" is the rule, and the teams are what currently occupy them. Reading
 * it as term-then-teams also means the legend can never drift out of sync with the markers — they
 * are the same list.
 *
 * Every status is written out in WORDS on a sentence-case chip: the ladder rung's own label
 * (`StatusGroup.statusText` — "Automatic qualifier", "Play-in game Oct 30", "Semifinal bye",
 * "MCAL tournament"), the phrase /playoffs uses, never a code like "AQ" a reader has to decode, so
 * nothing here is carried by color or by jargon (DESIGN §6.5, channels 1 and 2). Only the
 * automatic-qualifier chip takes the accent wash, because there the accent already means "berth".
 * Beside the chip the term keeps the rung's verbatim legend from config (`statusLegend`, SPEC §5.7
 * / §10.3: its place range, dates, hosts and pairings), so a play-in row also says what the game
 * decides — the one consequence its chip cannot. The league's qualification rule is cited once
 * per page.
 *
 * Each team is a pill link to its page with its place beside the name, so the band reads as a
 * row of facts rather than a `·`-separated sentence.
 *
 * A shared place is rendered `T-5th`, the pill-sized form of the table's `T5`, and `caveat` says
 * in words that the line is unsettled — the league's last step (a coin flip, a draw, a play-in)
 * is the league's to run, not ours.
 *
 * The caller passes `flex flex-col` with the card classes: from `lg` the band stretches to the
 * Notes inset beside it, and the link row's `mt-auto` keeps it on the bottom edge, level with
 * the Notes' own link row. A band with no ladder line (the EAL) is passed `lg:self-start`
 * instead, so it keeps its content height and the link row sits under its chips.
 * Teams with no reported results are NAMED but never given a projected place.
 */
export interface PlayoffStatusBandProps {
  divisionLabel: string;
  /** `CCS qualifying, as things stand` / `MCAL tournament, as things stand` / `Super Regional, as things stand`. */
  heading: string;
  /** `/playoffs#<league>` (a CCS league, or an unbracketed tournament's card) or `/playoffs/<league>`. */
  href: string;
  linkText: string;
  groups: StatusGroup[];
  caveat: string | null;
  /** Teams with `hasReportedResults === false`. */
  unrankedTeams: string[];
  className?: string;
}

export function PlayoffStatusBand({
  divisionLabel,
  heading,
  href,
  linkText,
  groups,
  caveat,
  unrankedTeams,
  className,
}: PlayoffStatusBandProps) {
  return (
    <div className={className}>
      <h3 className="m-0 text-lead text-ink">
        <span className="sr-only">{divisionLabel}: </span>
        {heading}
      </h3>
      <dl className="mt-2 mb-0 divide-y divide-divider">
        {/* Two columns (status | teams) where the band spans the content width (768-1023). The
            term column is 16rem there (256px of the 672px card at 768), a balance between two
            failures. Wider (22rem) left 296px of pills, so a three-team automatic-qualifier row
            broke onto two rows beside a short term; narrower (11rem) broke a legend such as "4th
            place — play-in Fri Oct 30 for the SCVAL 7th berth" into five lines beside a mostly
            empty pill column. At 16rem the automatic-qualifier legends ("Places 1-3 — automatic
            CCS qualifier", ~240px) sit on one line under their chip, the pills get ~392px, which
            holds three typical pills (~340px), and the longest legends (~550px, BVAL's play-in
            and PCAL's at-large route) take three lines under the chip. The term wraps
            (`flex-wrap`), which also absorbs a larger browser font. A fixed track, not `auto`:
            each row is its own grid, and a fixed width keeps the pill column aligned across
            rows. From lg the band shares its row with the Notes inset, so the term sits above
            its teams instead. */}
        {groups.map((group) => (
          <div
            key={group.status}
            className="grid gap-3 py-3 md:grid-cols-[minmax(0,16rem)_1fr] md:gap-6 lg:grid-cols-1 lg:gap-2"
          >
            <dt className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              {/* The sentence-case chip /playoffs uses: accent only for the automatic qualifiers. */}
              <StatusChip tone={group.status === 'aq' ? 'accent' : 'neutral'}>{group.statusText}</StatusChip>
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
                    <PlaceMark place={team.place} shared={team.shared} form="pill" />
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
          result, so no place and no postseason status is projected.
        </p>
      ) : null}
      {/* A standalone action, like the Notes link row beside it: a <div>, so the in-prose
          underline rule (`p a`) does not mark this one alone. `mt-auto` pins it to the bottom of
          the stretched card from lg (the caller's `flex flex-col`); `pt-4` is the old gap. */}
      <div className="mt-auto pt-4">
        <Link
          href={href}
          prefetch={false}
          className="sx-action text-meta font-medium text-accent hover:underline"
        >
          {linkText}
        </Link>
      </div>
    </div>
  );
}

export default PlayoffStatusBand;
