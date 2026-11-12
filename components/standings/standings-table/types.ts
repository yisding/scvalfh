import type { StandingContext } from '../../../lib/data';
import type { DivisionId, Standing, Team, TeamId, TeamSlug } from '../../../lib/types';

/**
 * `phone` and `desktop` are the same responsive table (the old twin's two names, both still accepted);
 * `mini` is the compact table (rail, team page, overview); `archive` is final records only.
 */
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
  /** @deprecated There is no GD bar to scale; accepted and ignored. */
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
  /** The qualification line: an extra `tr.sx-cutline` row after this row (1-based index). */
  berthRuleAfter?: number;
  /**
   * The words set on the qualification line ("Top 3 qualify for CCS"). Default: the division's own
   * line label from the league config (`ladderLine.label`: "Automatic-berth line", "Tournament line").
   */
  berthLabel?: string;
  /** The team whose page this is: its row is `tr.sx-self` (a bold name). */
  self?: TeamSlug;
  footnotes?: string[];
  /**
   * `inline` (default) prints ONE note under the table (this table's own facts and the source links);
   * `none` renders the table alone — the caller takes the notes from `collectStandingsNotes()`.
   */
  notes?: 'inline' | 'none';
  /** `mini` shows only this many rows (default: all of them). */
  limit?: number;
  /** The MaxPreps league page, deep-linked under the table (SPEC §6). */
  sourceUrl?: string;
  className?: string;
  id?: string;
  /** Derived per-row facts (`getStandingContext(division)`), keyed by team id. */
  context?: ReadonlyMap<TeamId, StandingContext>;
  /** `'gp'` adds a GP column while some team has games left. `'left'` and `'max'` are accepted and never drawn. */
  columns?: ReadonlyArray<StandingsColumn>;
}
