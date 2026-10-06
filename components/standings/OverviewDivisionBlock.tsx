import Link from 'next/link';

import Arrow from '../ui/Arrow';

import CompactStandingsTable from './CompactStandingsTable';
import IndependentGroup from './IndependentGroup';
import type { OverviewDivision } from './standings-view';

/**
 * One division of a section → league → division overview (SPEC §10.3, DESIGN §18.1): its h4
 * (omitted for a single-division league), its COMPACT standings table and the
 * `Full <division> table →` link to `/standings/<league>#<division>`.
 *
 * The /standings overview and /teams both draw their divisions through here, from the same
 * `OverviewDivision` (`buildOverviewDivision`), so the two pages cannot disagree about a place or
 * about the block's markup. The section and league wrappers above it, and each page's closing
 * legend, stay with the page: /teams carries the finder's hooks and a league action there.
 *
 * The wrapper carries the division id unless it equals the league id (PCAL, EAL), where the league's
 * heading has it, so every id on a page is unique. `teamGroup` adds the `data-team-group` hook the
 * /teams finder hides an emptied group by; `filterable` passes the finder's row hooks down to the
 * table.
 */
export interface OverviewDivisionBlockProps {
  division: OverviewDivision;
  /** Carry the TeamFinder row hooks on the table (CompactStandingsTable `filterable`). */
  filterable?: boolean;
  /** Mark the wrapper `data-team-group` for the TeamFinder. */
  teamGroup?: boolean;
}

export function OverviewDivisionBlock({ division, filterable = false, teamGroup = false }: OverviewDivisionBlockProps) {
  return (
    <div id={division.anchorId ?? undefined} data-team-group={teamGroup ? '' : undefined} className="mt-6">
      {division.heading ? <h4 className="m-0 mb-3 text-lead text-ink">{division.heading}</h4> : null}
      {/* A group with no league table (the Southern Section independents) draws its note and team links. */}
      {division.independent ? (
        <IndependentGroup group={division.independent} filterable={filterable} />
      ) : (
        <CompactStandingsTable
          rows={division.rows}
          ladderLine={division.ladderLine}
          caption={division.caption}
          filterable={filterable}
        />
      )}
      <p className="m-0 mt-2">
        {/* prefetch off: the full league pages are static, and `auto` would download each one
            the moment its link scrolls into view. */}
        <Link
          href={division.fullHref}
          prefetch={false}
          className="sx-action text-meta font-medium text-accent hover:underline"
        >
          {division.fullLabel} <Arrow />
        </Link>
      </p>
    </div>
  );
}

export default OverviewDivisionBlock;
