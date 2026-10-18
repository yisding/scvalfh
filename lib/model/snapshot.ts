/**
 * The normalized domain model (lib/model/): the snapshot, the one JSON file every page reads.
 */

import type { CifssCrossCheck, CrossCheckRow, SbliveCrossCheck } from './crosscheck';
import type { OfficialFixture } from './fixture';
import type { Game } from './game';
import type { DroppedContest, LeagueHealth, SourceStatus } from './health';
import type { ContestId, LeagueId, TeamSlug } from './ids';
import type { CcsPlayoffs } from './postseason';
import type { Season } from './season';
import type { Standing } from './standings';
import type { Team } from './team';

// ---------- snapshot ----------

/** One contest leaving one date (Snapshot.contentRemovals). */
export interface ContentRemoval {
  contestId: ContestId;
  /** The date it left (YYYY-MM-DD, Pacific). */
  dateKey: string;
  /** Its registry sides, whose team and game pages showed it. */
  slugs: TeamSlug[];
  /** The run that saw it gone (that run's `fetchedAt`). */
  removedAt: string;
}

export interface Snapshot {
  /** NEW. v1 files (no field) are upgraded in memory by lib/snapshot/migrate.ts. */
  schemaVersion: 2;
  /** ISO UTC, when the run started. 'today' everywhere is derived from this. */
  fetchedAt: string;
  season: Season;
  /** EXACTLY the registry (102), in registry order, left-joined against the feeds. */
  teams: Team[];
  /** Deduped on contestId. */
  games: Game[];
  /** One row per registry team, in LEAGUES order then division order then place. */
  standings: Standing[];
  /** The CCS section block. */
  playoffs: CcsPlayoffs;
  /** One row per request; deterministic order (§7.12). */
  sources: SourceStatus[];
  /** NEW. One row per configured league, config order. */
  leagueHealth: LeagueHealth[];
  /** NEW. Contests removed on purpose this run. */
  dropped: DroppedContest[];
  crossCheck: CrossCheckRow[];
  sbliveCrossCheck?: SbliveCrossCheck;
  /** NEW. The cifsshome.org score cross-check (never changes a published score). */
  cifssCrossCheck?: CifssCrossCheck;
  /** Official fixtures, ALL leagues, that matched no published game. */
  officialFixtures?: OfficialFixture[];
  /**
   * NEW. 'sblive:<id>' games that D2 published in an earlier run and that a MaxPreps contest has since superseded
   * (rule 10), mapped to that contest. Carried forward for the season so /game/sblive-<id> keeps resolving as a
   * stub page (canonical → the MaxPreps game). Empty object when none.
   */
  supersededGames: Record<ContestId, ContestId>;
  /**
   * Contests that left a date: deleted, superseded, or moved to another day (lib/content-dates.ts
   * contentRemovalsOf). The pages that showed one still changed when it went, though no game left on
   * them did, so the sitemap's `lastmod` counts these too. Carried for the season; never shown.
   */
  contentRemovals?: ContentRemoval[];
  /** SCVAL-only (scval.com standings PDF poll). */
  officialStandingsPdfUrl?: string | null;
  counts: {
    teams: number;
    games: number;
    finals: number;
    pending: number;
    /** games with countsFor !== null, any status (was: isLeague). */
    leagueGames: number;
    mismatches: number;
    /** NEW */
    byLeague: Record<LeagueId, { teams: number; games: number; finals: number; leagueGames: number; backfilled: number }>;
  };
}
