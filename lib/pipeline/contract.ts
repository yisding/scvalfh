/**
 * The pipeline contract (SPEC §7.2): transports, run arguments, the run context and the step
 * signatures every pipeline module codes against. Types plus `resourcePath` and three error
 * classes; no I/O. The resource keys (ResourceKey) and what is known per kind live in the table of
 * lib/pipeline/resources.ts.
 */

import type { SbliveCrossCheck } from '@/lib/model/crosscheck';
import type { OfficialFixture } from '@/lib/model/fixture';
import type { Game } from '@/lib/model/game';
import type { DroppedContest, LeagueRunState, SourceStatus } from '@/lib/model/health';
import type { DivisionId, LeagueId } from '@/lib/model/ids';
import type { CcsCalendarEvent } from '@/lib/model/postseason';
import type { SeasonWindow } from '@/lib/model/season';
import type { Snapshot } from '@/lib/model/snapshot';
import type { RawResponse } from '@/lib/sources/http/raw-response';
import { specOf, type ResourceKey } from './resources';

/** The manifest key and corpus file stem of a resource: its row of the table in lib/pipeline/resources.ts (the path shapes are listed there). */
export function resourcePath(key: ResourceKey): string {
  return specOf(key).path(key);
}

export interface Transport {
  readonly mode: 'live' | 'fixture' | 'recording';
  /** Throws FixtureMissing (fixture mode: not in the corpus) or TransportError (network/HTTP). Never returns a 4xx/5xx silently. */
  get(key: ResourceKey): Promise<RawResponse>;
}

/** The corpus has no file for this resource: the step records status 'skipped', error 'not in corpus'. Never an abort. */
export class FixtureMissing extends Error {
  constructor(public readonly key: ResourceKey) { super(`not in corpus: ${resourcePath(key)}`); }
}

export class TransportError extends Error {
  constructor(message: string, public readonly url: string, public readonly httpStatus: number | null) { super(message); }
}

/** Nothing is written; the previous snapshot stays. Only §7.5 run-abort triggers throw this. */
export class RunAbort extends Error {}

export interface RunArgs {
  /** Corpus directory (manifest-driven) or null for live. */
  fixtures: string | null;
  /** Variant overlays applied on top of the corpus (tests). */
  variants: string[];
  /** Record every live response into this new corpus directory. */
  capture: string | null;
  out: string;
  dryRun: boolean;
  fetchedAt: string;
  force: boolean;
  /** Restrict the sweep; other leagues are carried forward with state 'frozen' (§7.5 trigger d). Defaults to the corpus manifest's leagues in fixture mode, all leagues live. */
  leagues: LeagueId[] | null;
  /** Skip the finals-regression guard for these leagues for this run only. */
  acceptRegression: LeagueId[];
  sblive: boolean;
  sbliveFull: boolean;
  official: boolean;
  ccs: boolean;
  vnn: boolean;
  cifss: boolean;
}

export interface RunLog {
  log(line: string): void;
  warn(line: string, scope?: SourceStatus['scope']): void;
}

/** What steps may read and record. The pipeline core implements it in lib/pipeline/ledger.ts (PipelineContext). */
export interface RunContext extends RunLog {
  args: RunArgs;
  fetchedAt: string;
  /** localDateKey(fetchedAt) — never Date.now(). */
  today: string;
  /** The previous snapshot (loadSnapshot: v1 is migrated), or null. */
  previous: Snapshot | null;
  transport: Transport;
  /** Append a SourceStatus row; the ledger orders rows deterministically at assembly (§7.11). */
  source(row: SourceStatus): void;
  /**
   * Move a league's state only towards worse (fresh → partial → degraded | frozen) and record a
   * reason sentence, plus a short `cause` for the commit summary ("official file invalid").
   */
  degrade(leagueId: LeagueId, state: Exclude<LeagueRunState, 'fresh'>, reason: string, cause?: string): void;
  drop(row: DroppedContest): void;
  /** Leagues this run fetches (args.leagues resolved). */
  leaguesInRun(): readonly LeagueId[];
}

export interface OfficialStepResult {
  games: Game[];
  /** Official fixtures, all leagues, that matched no game. */
  unmatched: OfficialFixture[];
  /** Divisions whose fixture set is missing or invalid this run (classified by contest-type). */
  degradedDivisions: Set<DivisionId>;
  /** Divisions whose upstream document changed after our bundled copy (or whose league's officialChanges cell changed). */
  revisedUpstream: Set<DivisionId>;
  /** Divisions whose official annotations were carried from the previous snapshot this run (DivisionHealth.official.carried). */
  carriedDivisions: Set<DivisionId>;
  /**
   * The SCVAL standings-PDF poll: the PDF's URL, null when the index lists none, undefined when this
   * run did not poll (assemble carries the previous value).
   */
  officialStandingsPdfUrl?: string | null;
}
export type OfficialStep = (ctx: RunContext, games: Game[]) => Promise<OfficialStepResult>;

export interface SbliveStepResult {
  games: Game[];
  /** Fixtures still unmatched after rule-2 fills. */
  unmatched: OfficialFixture[];
  sbliveCrossCheck: SbliveCrossCheck | undefined;
}
export type SbliveStep = (ctx: RunContext, input: { games: Game[]; unmatched: OfficialFixture[] }) => Promise<SbliveStepResult>;

export interface SecondaryStepResult { games: Game[]; ccsCalendar?: CcsCalendarEvent[]; keyDatesConfirmed?: boolean; bracketPublished: boolean }

export interface PipelineSteps { official: OfficialStep; sblive: SbliveStep }

/**
 * The data/snapshot.meta.json object (§7.11), written by lib/pipeline/steps/assemble.ts. Besides the
 * tests, .github/workflows/update-data.yml reads it: `contentHash` (commit only when it changes),
 * `today`, `counts` and `commitSummary` (the commit message), so a field renamed here must be renamed
 * there too; scripts/data-issues.ts reads `fetchedAt` and the previous run's `leagues` (the issues)
 * through this type.
 */
export interface SnapshotMeta {
  fetchedAt: string;
  /** The snapshot's SHA-256 with every fetchedAt stripped (snapshotContentHash). */
  contentHash: string;
  /** The Pacific date of the run, YYYY-MM-DD. */
  today: string;
  counts: Snapshot['counts'];
  /** The si.com cross-check in numbers; null when the run made none. */
  crossCheck: {
    compared: number;
    agreements: number;
    conflicts: number;
    sbliveOnlyScored: number;
    backfilled: number;
  } | null;
  /** The cifsshome.org cross-check in numbers; null when there is none. */
  cifssCrossCheck: {
    compared: number;
    agreements: number;
    conflicts: number;
    cifssOnlyScored: number;
    notOnMaxPreps: number;
  } | null;
  officialFixturesUnmatched: number | null;
  officialStandingsPdfUrl: string | null;
  window: SeasonWindow;
  sources: Array<{ label: string; status: SourceStatus['status']; rowCount: number | null }>;
  /** How many WARN lines the run logged. */
  warnings: number;
  requests: { maxpreps: number; sblive: number; official: number };
  leagues: Array<{
    id: LeagueId;
    state: LeagueRunState;
    countedFinals: number;
    finalsDelta: number;
    missingPast: number;
    backfilled: number;
    reasons: string[];
  }>;
  /** "SCVAL +2 finals · BVAL +0 · …": the data commit's subject. */
  commitSummary: string;
}

export interface PipelineResult {
  snapshot: Snapshot;
  /** The data/snapshot.meta.json object (§7.11). */
  meta: SnapshotMeta;
  logLines: string[];
}
