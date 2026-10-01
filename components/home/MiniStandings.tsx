import SectionHeader from '../ui/SectionHeader';
import StandingsTable from '../ui/StandingsTable';
import { monthDay } from '../../lib/format';

import type { HomeDivision } from './home-data';

/**
 * One division's top four on the home page (DESIGN §3.1, §7.3 `variant="mini"`).
 *
 * PTS ships and it is the ordering key — SCVAL By-Laws Article VI §2, which supersedes DESIGN §1.2
 * ("no PTS column") and §11.8's win-percentage sort (BYLAWS-ADDENDUM).
 *
 * The `mini` variant renders no footnotes of its own, so the two disclosures the bars and the
 * points column owe the reader are printed here instead: the per-division |GD| domain (§5.6 — the
 * two tables are NOT comparable to each other) and the points rule with its citation. Shared
 * places, MaxPreps mismatches and the no-results row are below the top four; the full table carries
 * all of them, and this table's header links straight to it.
 */
export interface MiniStandingsProps {
  division: HomeDivision;
  limit?: number;
  className?: string;
}

export function MiniStandings({ division, limit = 4, className }: MiniStandingsProps) {
  const shown = Math.min(limit, division.rows.length);
  // THIS division's last league result, never the latest scores day across both of them: the two
  // divisions play on different days, and the shared date captioned De Anza "through Sep 29" on a
  // day whose only finals were El Camino's. `null` ⇒ no league result yet, so the caption says so
  // rather than naming a date nothing was played on.
  const through = division.throughDate;
  return (
    <section className={className}>
      <SectionHeader
        kicker={division.label}
        action={{ href: `/standings#${division.division}`, label: 'full table' }}
      />
      <StandingsTable
        division={division.division}
        rows={division.rows}
        gdDomain={division.gdDomain}
        variant="mini"
        limit={limit}
        caption={
          `${division.label} Division league standings` +
          (through ? ` through ${monthDay(through)}` : ', no league games played yet') +
          ` — top ${shown} of ${division.total}`
        }
      />
      <p className="mt-2 mb-0 text-meta text-ink-3">
        Top {shown} of {division.total}. PTS is the ordering key: 3 for a win, 1 for a tie (By-Laws
        Article VI §2). Bars are scaled to {division.label} alone (|GD| max {division.gdDomain}), so
        the two divisions&rsquo; bars are not comparable.
      </p>
    </section>
  );
}

export default MiniStandings;
