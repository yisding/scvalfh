/**
 * The claims model (pipeline inversion, phase P1): every source's rows about a game, kept per fixture with the run
 * that last saw them, and written beside the snapshot as `claims.json`. A fixture is this site's own record of one
 * game; a claim is what one source says about it. The pipeline still publishes from its legacy steps in this phase:
 * the claims are written, never read back to publish.
 *
 * Types only. lib/claims/schema.ts is the zod form of `ClaimsFile` as written on disk, where `seenAt` equal to the
 * file's `fetchedAt` and a MaxPreps game's `provenance.fetchedAt` are left out (lib/claims/store.ts toFile).
 */

import type {
  BackfillProvenance, BoxSide, CifssConflictRow, ContestId, DivisionId, Game, GameSide, LeagueId,
  OfficialFixture, OfficialStamp, StreetAddress, TeamSlug,
} from '../types';
import type { CanonicalFixture } from '../fixtures/shape';
import type { CifssRow } from '../sources/cifss';
import type { SbliveGame } from '../sources/sblive';
import type { SdsSheetFixture, SdsSheetResult } from '../sources/sds-bracket-sheet';
import type { VnnEvent } from '../sources/vnn-ics';
import type { SportId } from '../sports/current';

export const CLAIMS_SCHEMA_VERSION = 1 as const;

export type ClaimSource = 'maxpreps' | 'official' | 'sblive' | 'cifss' | 'sdsSheet' | 'vnn' | 'box' | 'editor';

/** Every source, in the order new fixtures are minted from its claims (§6.2). */
export const CLAIM_SOURCES: readonly ClaimSource[] = ['maxpreps', 'sblive', 'sdsSheet', 'editor', 'official', 'cifss', 'vnn', 'box'];

/** Our own id: `${dateKey}-${awayKey}-at-${homeKey}` (+ `~2`, `~3` … on collision). Never published; never re-minted. */
export type FixtureId = string;

/** Every claim: the source's own ref for the row, and the fetchedAt of the last run that saw it. */
export interface ClaimBase<Ref extends string = string> {
  ref: Ref;
  /** In memory: always set. On disk: omitted when equal to ClaimsFile.fetchedAt (§6.4). */
  seenAt: string;
}

/** Fields of a seeded claim that claimsFromSnapshot could not recover exactly and had to reconstruct (§9). */
export type Reconstructed =
  | 'dateUtc' | 'isDateTba' | 'isTimeTba' | 'flags' | 'decider' | 'forfeit' | 'resultConflict'
  | 'status' | 'venue' | 'site' | 'seenAt' | 'shootout';

export const RECONSTRUCTED_FIELDS: readonly Reconstructed[] = [
  'dateUtc', 'isDateTba', 'isTimeTba', 'flags', 'decider', 'forfeit', 'resultConflict', 'status', 'venue', 'site', 'seenAt', 'shootout',
];

// ---------------------------------------------------------------- maxpreps

/** The provenance keys normalize's toGame writes (lib/pipeline/normalize.ts toGame), and no other. */
export type MaxprepsProvenance = Pick<
  Game['provenance'],
  'scores' | 'schedule' | 'fetchedAt' | 'maxprepsModifiedOn' | 'leagueFlagConflict' | 'resultConflict' | 'overtimeNote'
>;

export const MAXPREPS_PROVENANCE_KEYS: readonly (keyof MaxprepsProvenance)[] = [
  'scores', 'schedule', 'fetchedAt', 'maxprepsModifiedOn', 'leagueFlagConflict', 'resultConflict', 'overtimeNote',
];

/** The Game keys a MaxPreps claim never holds: each is decided by a later stage or by assembly. */
export const MAXPREPS_GAME_OMITTED = ['slug', 'aliases', 'official', 'result', 'timeConfirmed'] as const;

/**
 * The contest exactly as lib/pipeline/normalize.ts toGame builds it from the rows read (both feeds' copies when
 * both were read), with NO ledger fact applied (normalizeGames with `dates: {}`, `hosts: {}`). countsFor and
 * postseason are toGame's null placeholders. `provenance.fetchedAt` equals the claim's `seenAt`.
 */
export type MaxprepsGame = Omit<
  Game,
  'slug' | 'aliases' | 'official' | 'result' | 'timeConfirmed' | 'provenance' | 'countsFor' | 'postseason'
> & { countsFor: null; postseason: null; provenance: MaxprepsProvenance };

export interface MaxprepsClaim extends ClaimBase<ContestId> {
  game: MaxprepsGame;
  /** Set only on a claim seeded from a snapshot (§9). */
  reconstructed?: Reconstructed[];
}

// ---------------------------------------------------------------- editor (lib/fixtures, never carried: rebuilt every run)

export interface EditorClaim extends ClaimBase<string /* fixtureKey(CanonicalFixture) */> {
  fixture: CanonicalFixture;
}

// ---------------------------------------------------------------- official (league schedules)

export interface OfficialClaim extends ClaimBase<string /* OfficialFixture.id, `division:date:away@home` */> {
  /** The document row as read (bundled or PDF). Absent only on a claim seeded from a stamp the snapshot holds. */
  fixture?: OfficialFixture;
  /** The stamp alone, when `fixture` is absent (a matched fixture seeded from a game). */
  stamp?: OfficialStamp;
  /**
   * The contest this row was matched to by the last run that READ its division. Used only when the division is not
   * read or not valid this run: carryOfficialForward semantics (stamp only, no notes; sources/scval-pdf.ts).
   */
  lastMatch?: { contestId: ContestId; stamp: OfficialStamp };
}

// ---------------------------------------------------------------- si.com

/** What carryForward (lib/crosscheck/backfill.ts) reads off a previous game for rule 10, rules 3 and 4. */
export interface PublishedScore {
  home: Pick<GameSide, 'score' | 'result'>;
  away: Pick<GameSide, 'score' | 'result'>;
  decider: Game['decider'];
  otPeriods: number;
  isOt: boolean;
  isForfeit: boolean;
  forfeitBy: Game['forfeitBy'];
  sbliveUrl: string | undefined;
  backfill: BackfillProvenance;
  scoreConflict?: NonNullable<Game['provenance']['scoreConflict']>;
}

export type SbliveFill =
  | { rule: 'score-pending' | 'contradictory-result' | 'off-schedule-date' | 'phantom-tie'; contestId: ContestId; published: PublishedScore }
  /** Rule 2: the whole game as last published (today's carry pushes `prev` as is). */
  | { rule: 'absent-fixture'; contestId: ContestId; officialFixtureId: string; game: Game };

export interface SbliveClaim extends ClaimBase<string /* sbliveGameId, or `contest:<id>` when seeded from a conflict mark */> {
  /** The si.com row as parsed and cleaned. Absent on a claim seeded from a snapshot. */
  row?: SbliveGame;
  /** What this row published last time it was used (D2 rules 2-4). Read by rule 10. */
  fill?: SbliveFill;
  /** A rule-5 plain disagreement published last time, for carryConflicts (steps/sblive.ts). */
  conflict?: { contestId: ContestId; scoreConflict: NonNullable<Game['provenance']['scoreConflict']>; published: { home: number; away: number } };
}

// ---------------------------------------------------------------- cifsshome.org (evidence only)

export interface CifssClaim extends ClaimBase<string /* `${section}:${cifssId}`, or `contest:<id>` when seeded */> {
  row?: CifssRow;
  /** The report's conflict row for this fixture, the evidence finalize reads (result.ts withCifssScore). */
  conflict?: Pick<CifssConflictRow, 'contestId' | 'cifss' | 'cifssUrl'>;
}

// ---------------------------------------------------------------- San Diego bracket sheet

export interface SdsSheetClaim extends ClaimBase<string /* `${division}:${slugA}~${slugB}` sorted: two teams meet once */> {
  result?: SdsSheetResult;
  fixture?: SdsSheetFixture;
  /** The host the last applying run published (today's read-back `host`), kept for carry. */
  host?: TeamSlug;
}

// ---------------------------------------------------------------- VNN school calendars (evidence only)

export interface VnnClaim extends ClaimBase<string /* `${schoolSlug}:${uid ?? `${dateKey}|${opponentKey}`}` */> {
  event?: VnnEvent;
  /** What it put on the game last time (for per-site carry, vnn-ics.ts carryVnnForward, which copies `venue.address` whole). */
  applied?: { venueName?: string; venueAddress?: StreetAddress; timeConfirmed?: true };
}

// ---------------------------------------------------------------- box scores (evidence only)

export interface BoxClaim extends ClaimBase<ContestId> {
  /** The player-stats file's entry for the contest (lib/results/box-evidence.ts BoxEvidence), by team slug. */
  sides: Readonly<Record<TeamSlug, BoxSide>>;
}

// ---------------------------------------------------------------- fixtures and the file

export interface FixtureClaims {
  maxpreps?: MaxprepsClaim;
  editor?: EditorClaim;
  official?: OfficialClaim;
  sblive?: SbliveClaim[];   // sorted by ref
  cifss?: CifssClaim[];     // sorted by ref
  sdsSheet?: SdsSheetClaim;
  vnn?: VnnClaim[];         // sorted by ref (one per school calendar)
  box?: BoxClaim;
}

/** The claim type each source keeps. */
export interface ClaimBySource {
  maxpreps: MaxprepsClaim;
  editor: EditorClaim;
  official: OfficialClaim;
  sblive: SbliveClaim;
  cifss: CifssClaim;
  sdsSheet: SdsSheetClaim;
  vnn: VnnClaim;
  box: BoxClaim;
}
export type ClaimOf<S extends ClaimSource> = ClaimBySource[S];

/** The sources a fixture holds several claims of (one per row), each list sorted by ref. */
export const MULTI_CLAIM_SOURCES: ReadonlySet<ClaimSource> = new Set<ClaimSource>(['sblive', 'cifss', 'vnn']);

export interface Fixture {
  id: FixtureId;
  /** Ids of fixtures merged into this one (§6.2), sorted. Readable slugs; never published. */
  aliases?: FixtureId[];
  claims: FixtureClaims;
}

export interface ClaimsFile {
  schemaVersion: typeof CLAIMS_SCHEMA_VERSION;
  sport: SportId;
  /** The fetchedAt of the run that wrote it. Equal to the fetchedAt of the snapshot written beside it. */
  fetchedAt: string;
  /** Sorted by id. */
  fixtures: Fixture[];
}

// ---------------------------------------------------------------- run-level facts and decisions (in memory only, never stored)

export type Stage = 'maxpreps' | 'official' | 'sblive' | 'vnn' | 'sdsSheet' | 'classify' | 'results';
export const STAGES: readonly Stage[] = ['maxpreps', 'official', 'sblive', 'vnn', 'sdsSheet', 'classify', 'results'];

/** Whether each source's scope was read this run. A scope not read keeps its stored claims (older seenAt). */
export interface SourceReads {
  maxprepsFeeds: ReadonlyMap<TeamSlug, 'ok' | 'failed' | 'skipped' | 'not-fetched'>;  // state.feeds
  officialDivisions: ReadonlyMap<DivisionId, 'read' | 'carried' | 'degraded'>;      // steps/official.ts read/failure sets
  sblive: { read: boolean; consulted: (pairKey: string, date: string) => boolean };  // steps/sblive.ts
  vnnSites: ReadonlyMap<TeamSlug, 'answered' | 'not-answered' | 'not-in-run'>;      // steps/secondary.ts
  sdsTabs: ReadonlyMap<string, 'read' | 'read-with-warnings' | 'carried'>;           // steps/sds-sheet.ts
  cifss: 'complete' | 'carried' | 'none';                                             // steps/cifss.ts
  box: boolean;                                                                       // run.ts box !== undefined
}

export interface RunFacts {
  fetchedAt: string;
  today: string;
  leaguesInRun: readonly LeagueId[];
  reads: SourceReads;
  degradedDivisions: ReadonlySet<DivisionId>;          // OfficialStepResult.degradedDivisions
}

/** Cross-game decisions for one fixture, produced by MATCH stage by stage, consumed by resolveFixture. */
export interface FixtureDecisions {
  /** The published contest id (§7.13), or null when the fixture publishes no game (official-only, superseded). */
  contestId: ContestId | null;
  /** The first stage at which the fixture appears in the view (rule-2: 'sblive'; cifsds: 'sdsSheet'; listing: 'results'). */
  from: Stage;
  official?: { stamp: OfficialStamp; leagueFlagNote?: string; hostNote?: string } | { classificationNote: string };
  sblive?:
    | { kind: 'override'; rule: Exclude<BackfillProvenance['rule'], 'absent-fixture'>; row: SbliveGame; score: { home: number; away: number }; note: string }
    | { kind: 'carried'; published: PublishedScore }                  // rule 10, rules 3/4
    | { kind: 'create'; game: Game };                                  // rule 2: fresh (absentFixtureGame) or carried (the stored game)
  reconcile?: { scoreConflict: NonNullable<Game['provenance']['scoreConflict']> } | { carriedConflict: SbliveClaim['conflict'] };
  vnn?: { venueName?: string; venueAddress?: StreetAddress; timeConfirmed?: true };
  sheet?:
    | { kind: 'score'; result: SdsSheetResult; rule: 'score-pending' | 'absent-game'; fetchedAt: string }
    | { kind: 'time'; time: string }
    | { kind: 'create'; game: Game };
  /** Frozen league: the previous snapshot's game, classified with that league's previous degraded set (guards.ts). */
  frozen?: Game;
  /** Results stage evidence. */
  cifssRow?: Pick<CifssConflictRow, 'cifss' | 'cifssUrl'>;
  box?: ReadonlyMap<string, BoxSide>;                  // undefined: leave as the view has it (box not read)
}

/**
 * One stage of the shadow harness (SCVAL_CLAIMS_SHADOW=1, tests/claims/shadow.test.ts): the games and fixtures
 * the legacy step chain left after the stage, and the view the claims path resolves at the same stage.
 */
export interface ShadowStage {
  stage: Stage;
  legacy: { games: readonly Game[]; unmatched: readonly OfficialFixture[] };
  claims: {
    /** The view's fixture ids, in order. */
    view: readonly FixtureId[];
    games: readonly Game[];
    /** Contest ids of the legacy list that no fixture of the view publishes. */
    unplaced: readonly ContestId[];
  };
  /** Contest ids the legacy step carried from the previous snapshot this stage (merged games, §0.3). */
  carried: readonly ContestId[];
}
