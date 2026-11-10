import type { StandingContext } from '../../../lib/data';
import type { DivisionId, Standing, Team, TeamId, TeamSlug } from '../../../lib/types';

export type StandingsVariant = 'phone' | 'desktop' | 'mini' | 'archive';

export interface StandingsRowData {
  standing: Standing;
  team: Team;
  /** Defaults to /teams/[slug]. */
  href?: string;
}

export type StandingsColumn = 'gp' | 'left' | 'max';

export interface StandingsTableProps {
  division: DivisionId;
  /** Already sorted and ranked by lib/standings/engine.ts. */
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
  footnotes?: string[];
  /**
   * `inline` (default) prints the legend, the specific notes and the source links under the card;
   * `none` renders the card alone — the caller takes the notes from `collectStandingsNotes()`.
   */
  notes?: 'inline' | 'none';
  /** `mini` shows this many rows (default 4). */
  limit?: number;
  /** The MaxPreps league page, deep-linked under the table (SPEC §6). */
  sourceUrl?: string;
  className?: string;
  id?: string;
  /** Derived per-row facts (`getStandingContext(division)`), keyed by team id. */
  context?: ReadonlyMap<TeamId, StandingContext>;
  /** Extra columns read from `context`: GP (all variants but archive), LEFT and MAX (desktop). */
  columns?: ReadonlyArray<StandingsColumn>;
}
