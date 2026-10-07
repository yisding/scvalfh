/**
 * The pipeline contract (SPEC §7.2): resource keys, transports, run arguments, the run context
 * and the step signatures every pipeline module codes against. Types plus `resourcePath` and three
 * error classes; no I/O.
 */

import type { CifssSectionKey } from '../sources/cifss';
import type {
  CcsCalendarEvent, DivisionId, DroppedContest, Game, LeagueId, LeagueRunState, OfficialFixture,
  SbliveCrossCheck, SeasonWindow, Snapshot, SourceStatus, TeamSlug,
} from '../types';

/** One upstream resource. `resourcePath(key)` is its manifest key and its corpus file stem. */
export type ResourceKey =
  | { kind: 'maxpreps-bootstrap' }
  | { kind: 'maxpreps-league-meta'; division: DivisionId }
  | { kind: 'maxpreps-standings'; division: DivisionId }
  | { kind: 'maxpreps-schedule'; team: TeamSlug }
  | { kind: 'scval-pdf-text'; division: DivisionId }      // pdftotext output of the SCVAL grid PDF
  | { kind: 'scval-standings-index' }
  | { kind: 'official-revision'; division: DivisionId }   // body = lowercase hex sha256 of the upstream document bytes
  | { kind: 'official-changes'; league: LeagueId }        // body = lowercase hex sha256 of the officialChanges cell text (§2.1)
  | { kind: 'sblive-scores'; date: string }               // YYYY-MM-DD
  | { kind: 'sblive-team-games'; team: TeamSlug }
  | { kind: 'vnn-ics'; team: TeamSlug }
  | { kind: 'ccs-ical' }
  | { kind: 'ccs-bracket' }
  /** One page of a Section's cifsshome.org listing, season start through `through` (YYYY-MM-DD). */
  | { kind: 'cifss-scores'; section: CifssSectionKey; page: number; through: string };

/**
 * 'maxpreps/bootstrap', 'maxpreps/league-meta/<division>', 'maxpreps/standings/<division>',
 * 'maxpreps/schedule/<slug>', 'scval/pdf-text/<division>', 'scval/standings-index',
 * 'official/revision/<division>', 'official/changes/<league>', 'sblive/scores/<date>', 'sblive/team-games/<slug>',
 * 'vnn/<slug>', 'ccs/ical', 'ccs/bracket', 'cifss/<section>/<page>'
 */
export function resourcePath(key: ResourceKey): string {
  switch (key.kind) {
    case 'maxpreps-bootstrap':
      return 'maxpreps/bootstrap';
    case 'maxpreps-league-meta':
      return `maxpreps/league-meta/${key.division}`;
    case 'maxpreps-standings':
      return `maxpreps/standings/${key.division}`;
    case 'maxpreps-schedule':
      return `maxpreps/schedule/${key.team}`;
    case 'scval-pdf-text':
      return `scval/pdf-text/${key.division}`;
    case 'scval-standings-index':
      return 'scval/standings-index';
    case 'official-revision':
      return `official/revision/${key.division}`;
    case 'official-changes':
      return `official/changes/${key.league}`;
    case 'sblive-scores':
      return `sblive/scores/${key.date}`;
    case 'sblive-team-games':
      return `sblive/team-games/${key.team}`;
    case 'vnn-ics':
      return `vnn/${key.team}`;
    case 'ccs-ical':
      return 'ccs/ical';
    case 'ccs-bracket':
      return 'ccs/bracket';
    case 'cifss-scores':
      return `cifss/${key.section}/${key.page}`;
  }
}

export interface RawResponse {
  url: string;
  httpStatus: number;
  body: string;
  upstreamModifiedOn?: string;
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
