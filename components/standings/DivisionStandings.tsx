import { ordinal } from '../../lib/format';
import type { TeamSlug } from '../../lib/types';
import SectionHeader from '../ui/SectionHeader';
import StandingsTable, { collectStandingsNotes, type StandingsTableProps } from '../ui/StandingsTable';

import PlayoffStatusBand from './PlayoffStatusBand';
import StandingsNotes from './StandingsNotes';
import type { DivisionView } from './standings-view';

/**
 * One division's whole section: the heading, the table (in its own card), a one-line legend, then
 * the Notes inset and the CCS qualifying card — side by side from `lg`. The `id` is the
 * `#de-anza` / `#el-camino` anchor target; `html { scroll-padding-top }` clears the sticky stack.
 *
 * The phone and desktop tables are DIFFERENT DOM (a 68px two-line row versus a 14-column row), so
 * both render and one is hidden at each breakpoint. That is deliberate rather than a CSS-only
 * reflow: DESIGN §10.8 requires 400% zoom at 320px to reflow with no scrollable data table, which
 * a 14-column table cannot do. The swap is at `lg`: the desktop table's fixed `<colgroup>` needs
 * 806px of columns plus a ≥160px team column, which the 720px content box at `md` cannot give.
 *
 * Both tables pass `notes="none"`; their division-specific notes are collected here once and go
 * into the Notes inset, and the generic legend is printed once per page by app/standings/page.tsx.
 *
 * From `lg` the Notes inset and the CCS card share a row and STRETCH to the taller of the two;
 * each is a flex column whose link row is pushed to the bottom (`mt-auto`), so the two panels
 * end level and their link rows sit on one line. Below `lg` they stack and nothing moves.
 */
export interface DivisionStandingsProps {
  view: DivisionView;
  /** The pinned team's 2px accent left rule, when a page above knows it. */
  highlightSlug?: TeamSlug | null;
  className?: string;
}

export function DivisionStandings({ view, highlightSlug = null, className }: DivisionStandingsProps) {
  const table: Omit<StandingsTableProps, 'variant' | 'className'> = {
    division: view.division,
    rows: view.rows,
    gdDomain: view.gdDomain,
    caption: view.caption,
    footnotes: view.footnotes,
    sourceUrl: view.sourceUrl,
    highlightSlug,
    notes: 'none',
    // The ⚑ DESIGN §3.2 draws on a row: driven by the published cross-check log, not only by
    // `standing.mismatch` (which covers W-L-T alone and is false for every team today, while the
    // log holds real placement disagreements). The Notes block below explains each.
    flaggedSlugs: view.mismatches.map((m) => m.slug),
    ...(view.berthRuleAfter === undefined ? {} : { berthRuleAfter: view.berthRuleAfter }),
  };
  // `footnotes` go last in the Notes block, so they are left out of the table's own list here.
  const { specific } = collectStandingsNotes({ ...table, variant: 'phone', footnotes: [] });

  return (
    <section id={view.division} className={className}>
      <SectionHeader kicker={view.label} meta={`${view.meta} · unofficial`} />
      <StandingsTable {...table} variant="phone" className="lg:hidden" />
      <StandingsTable {...table} variant="desktop" className="hidden lg:block" />
      {/* Plain words: "|GD| max 36" was notation a parent at a game had to decode. */}
      <p className="mt-3 mb-0 text-meta text-ink-3">
        PTS: 3 for a win, 1 for a tie &middot; bars scaled to {view.label}&rsquo;s biggest goal
        difference ({view.gdDomain})
        {view.berthRuleAfter ? (
          <>
            {' '}
            &middot; the heavier line under {ordinal(view.berthRuleAfter)} marks the automatic CCS
            spots
          </>
        ) : null}
      </p>
      <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:items-stretch">
        <StandingsNotes
          divisionLabel={view.label}
          rows={view.rows}
          tableNotes={specific}
          mismatches={view.mismatches}
          unreported={view.unreported}
          footnotes={view.footnotes}
          sourceUrl={view.sourceUrl}
          scheduleUrl={view.scheduleUrl}
        />
        <PlayoffStatusBand
          divisionLabel={view.label}
          groups={view.statusGroups}
          caveat={view.statusCaveat}
          unrankedTeams={view.unrankedTeams}
          className="sx-card flex flex-col p-5 md:p-6"
        />
      </div>
    </section>
  );
}

export default DivisionStandings;
