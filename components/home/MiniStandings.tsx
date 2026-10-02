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
 * points column owe the reader are printed here instead. The per-division bar scale (§5.6 — the
 * two tables are NOT comparable to each other) is division-specific, so it stays visible under
 * each table whenever the bars are drawn, in words ("bars scaled to De Anza's biggest goal
 * difference (36)"), not as "|GD| max 36". Where the card is too narrow for the plot (under
 * 23.4375rem: 375px at the default text size, wider under a larger one) the sentences about bars
 * are dropped with it. The points rule with its citation is the same
 * sentence for both, so it is said once, under El Camino, in a labelled `<details>`
 * (`showLegend`). Shared places, MaxPreps mismatches and the no-results row are below the top
 * four; the full table carries all of them, and this table's header links straight to it.
 */
export interface MiniStandingsProps {
  division: HomeDivision;
  limit?: number;
  /** Render the one shared "How to read these tables" disclosure (the home page passes it once). */
  showLegend?: boolean;
  className?: string;
}

export function MiniStandings({
  division,
  limit = 4,
  showLegend = false,
  className,
}: MiniStandingsProps) {
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
        action={{ href: `/standings#${division.division}`, label: 'Full table' }}
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
      {/* The GD plot is dropped when the CARD is under 23.4375rem (`@container` on the card:
          phones under 375, the side-by-side minis at 768–~820, and a 390 phone with a 24px
          browser text size, where the rem query resolves to 562px). This wrapper bleeds like the
          card (`.sx-bleed`; the gutter comes back as padding on an INNER box, because a container
          query measures the content box), so the SAME query, in the same unit, keeps every
          sentence about the bars in step with whether any bars are drawn. */}
      <div className="sx-bleed @container">
        <div className="px-gutter md:px-0">
          <p className="mt-2 mb-0 text-meta text-ink-3">
            Top {shown} of {division.total}
            <span className="hidden @min-[23.4375rem]:inline">
              {' '}
              &middot; bars scaled to {division.label}&rsquo;s biggest goal difference (
              {division.gdDomain})
            </span>
          </p>
          {showLegend ? (
            <details className="sx-disclosure mt-3">
              <summary>How to read these tables</summary>
              <p className="m-0 max-w-prose text-meta text-ink-2">
                PTS is the ordering key: 3 for a win, 1 for a tie (By-Laws Article VI §2).
                <span className="hidden @min-[23.4375rem]:inline">
                  {' '}
                  Bars are scaled to each division alone, so the two divisions&rsquo; bars are not
                  comparable.
                </span>
              </p>
            </details>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default MiniStandings;
