import type { DivisionId, TeamId, TeamSlug } from '@/lib/model/ids';
import type { StandingContext } from '@/lib/queries/standings';
import type { StandingsRowData } from '@/views/standings/types';

import type { StandingsVariantProps } from './cells';
import DesktopStandingsTable from './DesktopStandingsTable';
import type { StandingsColumn } from './desktop-columns';
import PhoneStandingsTable from './PhoneStandingsTable';

/**
 * The league table (DESIGN §3.2, §7.3), amended by BYLAWS-ADDENDUM.
 *
 * A PTS column SHIPS and it is the ordering key: By-Laws Article VI §2 awards 3 points for a win
 * and 1 for a tie, and "the division placement/standings will be the order of team points".
 * DESIGN §1.2's "no PTS column" and §11.8's win-percentage sort predate the by-laws PDF and are
 * superseded by it.
 *
 * SHARED PLACES ARE REAL. Every league's chain ends in a step we cannot compute (a coin flip, a
 * blind draw, a play-in), so two or more teams can carry the same `computed.place` with
 * `tiebreak.shared === true`. Those rows render LEVEL — the same number with the US sports-page
 * `T` prefix ("T7", never the British "7=") — and `tiebreak.note` (which already cites the rule)
 * goes into the footnotes. Two teams level on 7th leave no 8th.
 *
 * A row with `hasReportedResults === false` sorts last, renders its rank as an em dash
 * and, in the phone and desktop tables, ONE "No results yet" cell across the data columns (the
 * home page's mini table, components/home/MiniStandings.tsx, which only ever shows the top rows,
 * keeps em dashes and a `·` on the zero rule) — never `0-0-0`, never `.000`, never a rank by
 * merit — and it is still a link.
 *
 * No client-side sorting: the table has one correct order and re-sorting it is a coach's
 * affordance that costs a client component and a whole `aria-sort` surface.
 *
 * Every variant renders its OWN card (`.sx-card.sx-flush`, plus `.sx-bleed` for the phone table,
 * which runs edge to edge below 768px), so callers never wrap it. `sx-flush` clips with
 * `overflow: clip`, never `hidden`, so the sticky `<thead>` still sticks under the chrome.
 *
 * The table renders no notes: `collectStandingsNotes()` (views/standings/table-notes.ts) hands the
 * caller the table-specific notes (shared places, the no-results team, mismatch flags,
 * `footnotes`) as data, and StandingsNoteItem renders each where the caller places it.
 *
 * This file is the card, the caption and the dispatch; the variants are PhoneStandingsTable.tsx
 * and DesktopStandingsTable.tsx, their shared cells cells.tsx, the desktop columns
 * desktop-columns.ts, and the row link and team name (shared with every team table on the site)
 * parts.tsx.
 *
 * Multi-league (SPEC §10.3, §13.3 — additive only): `context` (`getStandingContext(division)`) and
 * `columns` add a GP column (both variants; the phone row prints `<counted>/<scheduled>
 * GP` on its second line) and, on the desktop table, LEFT and MAX after PTS. LEFT is league games
 * with no counted result yet; MAX the most points a team could still reach — a ceiling, never a
 * projection. With the two new columns the desktop table drops its Home / Away / Neutral splits,
 * which the team page carries, so the team column keeps its width. A `†` follows W-L-T for a team
 * with a counted si.com score (`context.backfilled > 0`); the caller prints the footnote. Without
 * `context` and `columns` the table renders exactly today's columns.
 */
export type StandingsVariant = 'phone' | 'desktop';

export interface StandingsTableProps {
  division: DivisionId;
  /** Already sorted and ranked by lib/engine/standings.ts. */
  rows: StandingsRowData[];
  /** max |gd| for THIS division — never global (R-2). */
  gdDomain: number;
  variant: StandingsVariant;
  /** "De Anza Division league standings through Sep 29" */
  caption: string;
  /**
   * Teams whose published MaxPreps row disagrees with ours in ANY field (`snapshot.crossCheck`).
   * `standing.mismatch` only covers a W-L-T disagreement; today every mismatch flag is false while
   * the cross-check log holds two real placement disagreements (we order on points per Article
   * VI §2, MaxPreps orders on win percentage), so without this the ⚑ DESIGN §3.2 draws on a row
   * would never appear. The explanation stays in the notes under the table.
   */
  flaggedSlugs?: readonly TeamSlug[];
  /** Draw a 2px rule after this row index (1-based) — the 7th automatic berth. */
  berthRuleAfter?: number;
  className?: string;
  id?: string;
  /** Derived per-row facts (`getStandingContext(division)`), keyed by team id. */
  context?: ReadonlyMap<TeamId, StandingContext>;
  /** Extra columns read from `context`: GP (both variants), LEFT and MAX (desktop). */
  columns?: ReadonlyArray<StandingsColumn>;
}

export function StandingsTable(props: StandingsTableProps) {
  const { variant, caption, berthRuleAfter, className, id } = props;
  const flagged = new Set<TeamSlug>(props.flaggedSlugs ?? []);
  const context = props.context;
  const contextOf = (row: StandingsRowData) => context?.get(row.team.id);

  // The pinned team's 2px accent left rule has one channel. The pages are static and the pin lives
  // in localStorage, so every row carries `data-team-slug`, and the pinned-team head script
  // (components/head/pinned-team-script.ts, run from app/layout.tsx's <head>; then
  // components/ui/PinnedTeamMarks.tsx after a client navigation) sets `[data-pinned]` on the
  // matching row.
  // The 2px automatic-qualifier cut: the one deliberately strong line in the table.
  const cut = (index: number) =>
    berthRuleAfter && index + 1 === berthRuleAfter
      ? { borderBottom: '2px solid var(--sx-border-strong)' }
      : undefined;

  const table: StandingsVariantProps = {
    division: props.division,
    rows: props.rows,
    gdDomain: props.gdDomain,
    columns: new Set<StandingsColumn>(context ? (props.columns ?? []) : []),
    // Every row of a table shares its division's schedule, so one null `scheduled` means none is fixed.
    fixedSchedule: props.rows.every((row) => contextOf(row)?.scheduled !== null),
    contextOf,
    // The ⚑ mark, shown on any row MaxPreps publishes differently.
    isFlagged: (row) => row.standing.mismatch || flagged.has(row.team.slug),
    cut,
  };

  return (
    <div className={className} id={id}>
      {/* `sx-flush` is `overflow: clip`, NOT `hidden`: `hidden` makes the card a scroll container,
          and a sticky `<thead>` then resolves its `top` against the card instead of the viewport
          — the head floated between rows 1 and 2 at rest and scrolled away entirely. */}
      <div className={variant === 'phone' ? 'sx-card sx-flush sx-bleed' : 'sx-card sx-flush'}>
        <table className={variant === 'desktop' ? 'sx-table sx-table-wide text-cell xl:text-meta' : 'sx-table text-cell'}>
          {/* sr-only in every variant: "unofficial" and the through-date are in the section meta. */}
          <caption className="sr-only">{caption}</caption>
          {variant === 'phone' ? <PhoneStandingsTable {...table} /> : <DesktopStandingsTable {...table} />}
        </table>
      </div>
    </div>
  );
}

export default StandingsTable;
