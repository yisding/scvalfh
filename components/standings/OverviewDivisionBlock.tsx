import Link from 'next/link';

import CompactStandingsTable from './CompactStandingsTable';
import type { OverviewDivision } from './standings-view';

/**
 * One division of a league in an overview (SPEC §10.3; DESIGN §33): a group strip with the
 * division's name, which links the full standings at `/standings/<league>#<division>`, then its
 * COMPACT standings table. A single-division league has no strip: its table sits directly under the
 * league's own heading, whose "Full standings" link is the way to the full one.
 *
 * `buildOverviewDivision` builds the `OverviewDivision`, so two pages that draw a division through
 * here cannot disagree about a place or about the block's markup. The league wrapper above it stays
 * with the page.
 *
 * The strip is written out here rather than through `SectionHeader strip`, whose heading is plain
 * text: this one is a link.
 *
 * The wrapper carries the division id unless it equals the league id (PCAL, EAL), where the league's
 * heading has it, so every id on a page is unique. `teamGroup` adds the `data-team-group` hook the
 * team finder hides an emptied group by; `filterable` passes the finder's row hooks down to the
 * table.
 */
export interface OverviewDivisionBlockProps {
  division: OverviewDivision;
  /** Carry the TeamFinder row hooks on the table (CompactStandingsTable `filterable`). */
  filterable?: boolean;
  /** Mark the wrapper `data-team-group` for the TeamFinder. */
  teamGroup?: boolean;
}

/** The strip's link is a 36px target with a mouse and a 44px one on touch (the strip grows with it). */
const STRIP_LINK = 'inline-flex min-h-9 items-center pointer-coarse:min-h-11';

export function OverviewDivisionBlock({ division, filterable = false, teamGroup = false }: OverviewDivisionBlockProps) {
  return (
    <div id={division.anchorId ?? undefined} data-team-group={teamGroup ? '' : undefined} className="min-w-0">
      {division.heading ? (
        <div className="sx-strip">
          <h3 className="m-0 text-lead text-ink">
            {/* prefetch off: the full league pages are static, and `auto` would download each one
                the moment its link scrolls into view. */}
            <Link href={division.fullHref} prefetch={false} className={STRIP_LINK}>
              {division.heading}
            </Link>
          </h3>
        </div>
      ) : null}
      <CompactStandingsTable
        rows={division.rows}
        ladderLine={division.ladderLine}
        caption={division.caption}
        filterable={filterable}
      />
    </div>
  );
}

export default OverviewDivisionBlock;
