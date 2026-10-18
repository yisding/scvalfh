/**
 * The normalized domain model (lib/model/): pipeline health (sources, league and division run states, dropped contests).
 */

import type { ContestId, DivisionId, LeagueId, OfficialSourceId, SectionId, SourceId, TeamSlug } from './ids';

// ---------- pipeline health ----------

export type SourceKind =
  | 'bootstrap' | 'league-meta' | 'reported-standings' | 'team-schedule'
  | 'official-schedule' | 'official-revision-check' | 'standings-index'
  | 'sblive-scoreboard' | 'sblive-team-games'
  | 'ccs-calendar' | 'ccs-bracket' | 'school-calendar' | 'cifss-scores';

export interface SourceStatus {
  id: SourceId;
  /** NEW (always set by the v2 pipeline; absent on rows migrated from v1). */
  kind?: SourceKind;
  /** NEW. Which section/league/division/team the row is about. Absent = global. */
  scope?: { section?: SectionId; league?: LeagueId; division?: DivisionId; team?: TeamSlug };
  label: string;
  url: string;
  status: 'ok' | 'stale' | 'error' | 'skipped';
  httpStatus?: number;
  fetchedAt: string;
  /** NEW. When a stale row's data was last fresh (copied from the previous snapshot). */
  carriedFrom?: string;
  upstreamModifiedOn?: string;
  error?: string;
  rowCount?: number;
}

export type LeagueRunState = 'fresh' | 'partial' | 'frozen' | 'degraded';

export interface DivisionHealth {
  divisionId: DivisionId;
  meta: 'ok' | 'error' | 'mismatch' | 'skipped';
  reportedTable: 'ok' | 'carried' | 'missing' | 'skipped';
  reportedRows: number | null;
  /**
   * The division's LeagueRules.classification ('membership' = Sunset, the San Diego divisions and the LA
   * independents: both sides members, whatever MaxPreps' league flag says), or 'fallback-contest-type' when an
   * official-fixtures division fell back to MaxPreps' flag this run.
   */
  classification: 'contest-type' | 'official-fixtures' | 'membership' | 'fallback-contest-type';
  official: {
    source: OfficialSourceId;
    total: number;
    matched: number;
    /** Official fixtures dated before today with no counted result. */
    missingPast: number;
    carried: boolean;
    /** The upstream document's sha256 differs from our bundled copy's. */
    revisedUpstream: boolean;
  } | null;
  countedFinals: number;
  previousCountedFinals: number | null;
  backfilled: number;
  /**
   * Only on a division whose official.mode is 'none' (EAL, Sunset, the San Diego divisions): league games
   * (MaxPreps-flagged, or for 'membership' every game between two members), dated before today, with no
   * counted result. Fixture-backed divisions carry this count in `official.missingPast`.
   */
  missingLeaguePast?: number;
}

export interface LeagueHealth {
  leagueId: LeagueId;
  state: LeagueRunState;
  /** fetchedAt of the last run in which this league was 'fresh' or 'partial'. */
  lastFreshAt: string | null;
  /** Plain sentences, safe to render verbatim (league banner, /about health card). */
  reasons: string[];
  divisions: DivisionHealth[];
  teamFeeds: { total: number; ok: number; carried: number; failed: number };
}

/** A contest the pipeline removed on purpose, published so nothing disappears silently. */
export interface DroppedContest {
  contestId: ContestId;
  reason: 'ghost-team' | 'excluded-by-config' | 'tba-opponent' | 'phantom-duplicate';
  note: string;
  dateKey: string | null;
  teams: string[];
}
