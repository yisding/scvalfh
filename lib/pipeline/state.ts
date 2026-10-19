/**
 * The run's working state (SPEC §7.4): what the built-in steps (lib/pipeline/steps/*) share through
 * run.ts. Plain data and its empty constructor; the ledgers live in lib/pipeline/ledger.ts and the
 * context that carries them in lib/pipeline/context.ts.
 */

import type { CifssCrossCheck, SbliveCrossCheck } from '@/lib/model/crosscheck';
import type { OfficialFixture } from '@/lib/model/fixture';
import type { Game } from '@/lib/model/game';
import type { DivisionHealth, DroppedContest } from '@/lib/model/health';
import type { DivisionId, LeagueId, TeamId, TeamSlug } from '@/lib/model/ids';
import type { ReportedRecord } from '@/lib/model/standings';
import type { ScheduleRow } from '@/lib/sources/maxpreps/schemas';
import type { OfficialStepResult, SecondaryStepResult } from './contract';

export interface DivisionRunInfo {
  meta: DivisionHealth['meta'];
  reportedTable: DivisionHealth['reportedTable'];
  reportedRows: number | null;
}

export interface TeamFeedInfo {
  slug: TeamSlug;
  teamId: TeamId;
  league: LeagueId;
  /** 'skipped' = not in the corpus / no data source; 'not-fetched' = its league is not in this run. */
  status: 'ok' | 'failed' | 'skipped' | 'not-fetched';
  /** Its games were carried from the previous snapshot. */
  carried: boolean;
}

/**
 * What the built-in steps (lib/pipeline/steps/*) share through run.ts. The injectable official and
 * si.com steps (PipelineSteps) never see it: they get only RunContext and their step input.
 */
export interface RunState {
  divisions: Map<DivisionId, DivisionRunInfo>;
  /** MaxPreps' reported rows, keyed on schoolId (cross-check only). */
  reported: Map<TeamId, ReportedRecord>;
  feeds: Map<TeamSlug, TeamFeedInfo>;
  /** Raw schedule rows of the feeds read this run, TBA rows split off, registry order. */
  rows: ScheduleRow[];
  /** One per TBA row split off a feed. */
  tbaDropped: DroppedContest[];
  games: Game[];
  unmatched: OfficialFixture[];
  /** The official step's flags and sets; its games and fixtures moved into `games` / `unmatched`. */
  official: Omit<OfficialStepResult, 'games' | 'unmatched'>;
  sbliveCrossCheck: SbliveCrossCheck | undefined;
  /** Step 11b's cifsshome.org report (undefined: none this run and none to carry). */
  cifssCrossCheck: CifssCrossCheck | undefined;
  /** The secondary step's CCS state; its games moved into `games`. */
  secondary: Omit<SecondaryStepResult, 'games'>;
  /** Leagues whose intra-league games and fixtures were substituted from the previous snapshot. */
  frozenFromPrevious: Set<LeagueId>;
  /** DivisionHealth.classification per division (a frozen league's is copied from the previous health). */
  classification: Map<DivisionId, DivisionHealth['classification']>;
}

export function emptyRunState(): RunState {
  return {
    divisions: new Map(),
    reported: new Map(),
    feeds: new Map(),
    rows: [],
    tbaDropped: [],
    games: [],
    unmatched: [],
    official: {
      degradedDivisions: new Set(),
      revisedUpstream: new Set(),
      carriedDivisions: new Set(),
    },
    sbliveCrossCheck: undefined,
    cifssCrossCheck: undefined,
    secondary: { bracketPublished: false },
    frozenFromPrevious: new Set(),
    classification: new Map(),
  };
}
