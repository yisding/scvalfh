import SectionHeader from '../ui/SectionHeader';
import StandingsTable, { type StandingsTableProps } from '../ui/StandingsTable';
import type { TeamSlug } from '../../lib/types';

import PlayoffStatusBand from './PlayoffStatusBand';
import StandingsNotes from './StandingsNotes';
import type { DivisionView } from './standings-view';

/**
 * One division's whole section: the rule-and-kicker, the table, the source notes and the Article
 * VII band. The `id` is the `#de-anza` / `#el-camino` anchor target, with `scroll-margin-top` equal
 * to the sticky stack (44px top bar + 44px division bar, 56 + 44 from `md`) so an anchor jump never
 * hides the heading under the chrome.
 *
 * The phone and desktop tables are DIFFERENT DOM (a 60px two-line row versus a 14-column row), so
 * both render and one is hidden at each breakpoint — the pattern StandingsTable's owner specified.
 * That is deliberate rather than a CSS-only reflow: DESIGN §10.8 requires 400% zoom at 320px to
 * reflow with no scrollable data table, which a 14-column table cannot do.
 *
 * The swap happens at `lg`, not `md`. `.sx-table` cells carry `padding-block` only, so the
 * 14-column row's min-content width is roughly 773px — 32 (#) + 115 (monogram + short name) + 30
 * (PTS) + 52 + 40 + 52 + 24 + 24 + 132 (the 96px GD track, its gap and the signed numeral) + 28 +
 * 3 × 52 + 88 (five 16px form chips and their gaps). At `md` the content box is only 720px, and
 * the table's wrapper is `overflow-hidden`, so NEUT and LAST 5 would be silently cut off rather
 * than scrolled to. At `lg` the box is 976px and every column fits with room to spare.
 */
export interface DivisionStandingsProps {
  view: DivisionView;
  /** The pinned team's 2px accent left rule, when a page above knows it. */
  highlightSlug?: TeamSlug | null;
}

export function DivisionStandings({ view, highlightSlug = null }: DivisionStandingsProps) {
  const table: Omit<StandingsTableProps, 'variant' | 'className'> = {
    division: view.division,
    rows: view.rows,
    gdDomain: view.gdDomain,
    caption: view.caption,
    footnotes: view.footnotes,
    sourceUrl: view.sourceUrl,
    highlightSlug,
    // The ⚑ DESIGN §3.2 draws on a row: driven by the published cross-check log, not only by
    // `standing.mismatch` (which covers W-L-T alone and is false for every team today, while the
    // log holds two real placement disagreements). StandingsNotes below the table explains each.
    flaggedSlugs: view.mismatches.map((m) => m.slug),
    ...(view.berthRuleAfter === undefined ? {} : { berthRuleAfter: view.berthRuleAfter }),
  };

  return (
    <section id={view.division} className="pt-3 md:pt-6">
      <SectionHeader kicker={view.label} meta={view.meta} />
      <StandingsTable {...table} variant="phone" className="lg:hidden" />
      <StandingsTable {...table} variant="desktop" className="hidden lg:block" />
      <StandingsNotes
        divisionLabel={view.label}
        mismatches={view.mismatches}
        unreported={view.unreported}
        scheduleUrl={view.scheduleUrl}
        className="mt-2"
      />
      <PlayoffStatusBand
        divisionLabel={view.label}
        groups={view.statusGroups}
        caveat={view.statusCaveat}
        unrankedTeams={view.unrankedTeams}
        className="mt-5 border-t border-hairline pt-3"
      />
    </section>
  );
}

export default DivisionStandings;
