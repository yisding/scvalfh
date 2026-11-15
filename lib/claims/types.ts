/**
 * The claims model (pipeline inversion): every source's rows about a game, kept per fixture with the run that last
 * saw them, and written beside the snapshot as `claims.json`. A fixture is this site's own record of one game; a
 * claim is what one source says about it. Step 06 publishes from the MaxPreps claims (a feed not read is carried
 * from them), the official step carries a division it does not read from the official claims, the school calendars'
 * carry reads the VNN claims, the bracket sheet carries a tab it does not read from the sheet's claims and publishes
 * its own games on fixtures created from them, and the results step weighs the cifsshome.org and box-score claims;
 * the other steps still work over the game list, and each moves onto its source's claims in turn.
 *
 * Types only. lib/claims/schema.ts is the zod form of `ClaimsFile` as written on disk, where `seenAt` equal to the
 * file's `fetchedAt` and a MaxPreps game's `provenance.fetchedAt` are left out (lib/claims/store.ts toFile).
 */

import type {
  BackfillProvenance, BoxSide, CifssConflictRow, ContestId, DivisionId, Game, GameSide, LeagueId,
  OfficialFixture, OfficialStamp, StreetAddress, TeamId, TeamSlug, DroppedContest,
} from '../types';
import type { BoxEvidence } from '../results/box-evidence';
import type { ScheduleRow } from '../sources/maxpreps';
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

export interface CifssClaim extends ClaimBase<string /* `contest:<id>`: the conflict rows carry no cifsshome.org id */> {
  /** Not written: the report's conflict row is what the results step reads. */
  row?: CifssRow;
  /** The report's conflict row for this fixture, the evidence finalize reads (result.ts withCifssScore). */
  conflict?: Pick<CifssConflictRow, 'contestId' | 'cifss' | 'cifssUrl'>;
}

// ---------------------------------------------------------------- San Diego bracket sheet

export interface SdsSheetClaim extends ClaimBase<string /* `${division}:${slugA}~${slugB}` sorted: two teams meet once */> {
  /**
   * The result as the last publication showed it (lib/postseason/sds-sheet-results.ts sheetResultsFromGames reads it
   * back from the game), or, on a game the sheet's stage created this run, the row as read. Its host is `host`.
   */
  result?: Omit<SdsSheetResult, 'host'>;
  /** As `result`, for a game with no score yet (sheetFixturesFromGames). */
  fixture?: Omit<SdsSheetFixture, 'host'>;
  /** The host the last applying run published (today's read-back `host`), kept for carry. */
  host?: TeamSlug;
  /**
   * The game the row was published on: its contest id (a `cifsds:` game's fixture is found by it) and its local start.
   * A carried tab's rows are read in the previous publication's order, which is lib/format.ts byDateThenId over these.
   */
  published: { contestId: ContestId; dateLocal: string };
}

// ---------------------------------------------------------------- VNN school calendars (evidence only)

export interface VnnClaim extends ClaimBase<string /* `${school}:contest:<id>`: one per calendar school and game */> {
  /** Not written: the per-site carry reads `applied` alone. */
  event?: VnnEvent;
  /**
   * What the game showed when last published, for the per-site carry (lib/sources/vnn-ics.ts carryVnnPublished, which
   * copies `venue.address` whole): the venue name whatever wrote it, and the confirmed start time.
   */
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
  /**
   * A fixture carried at stage `maxpreps` for a feed this run did not read: the game as the previous run published it,
   * classification cleared (lib/claims/sources/maxpreps.ts asLastPublished). §11 R3's zero-deviation carry: it keeps
   * the other sources' contributions until their claims hold what they published.
   */
  published?: Game;
  /** Frozen league: the previous snapshot's game, classified with that league's previous degraded set (guards.ts). */
  frozen?: Game;
  /** Results stage evidence. */
  cifssRow?: Pick<CifssConflictRow, 'cifss' | 'cifssUrl'>;
  box?: ReadonlyMap<string, BoxSide>;                  // undefined: leave as the view has it (box not read)
}

/** One team feed's read this run, as step 05 records it (lib/pipeline/ledger.ts TeamFeedInfo). */
export interface FeedRead {
  teamId: TeamId;
  status: 'ok' | 'failed' | 'skipped' | 'not-fetched';
}

/**
 * One stage of the shadow harness (SCVAL_CLAIMS_SHADOW=1, tests/claims/shadow.test.ts): what a stage moved onto
 * claims read, and what it published. The harness runs the stage's legacy rule (the one that read the previous
 * snapshot's games) over the same input and checks the two agree; the legacy rules live in the test support only,
 * since the pipeline no longer runs them.
 */
export type ShadowStage =
  | {
      stage: 'maxpreps';
      /** Step 06's input: the rows read, each feed's read, the TBA rows split off. */
      input: { rows: readonly ScheduleRow[]; feeds: readonly FeedRead[]; tbaDropped: readonly DroppedContest[] };
      /** The view's fixture ids, in order. */
      view: readonly FixtureId[];
      games: readonly Game[];
      /** Contest ids carried from stored claims this stage (a side's feed not read). */
      carried: readonly ContestId[];
    }
  | {
      stage: 'vnn';
      /** The VNN part of step 09's input: the games, the events read, and each in-run site's read. */
      input: { games: readonly Game[]; events: readonly VnnEvent[]; sites: ReadonlyMap<TeamSlug, VnnSiteRead> };
      games: readonly Game[];
    }
  | {
      stage: 'official';
      kind: 'carry';
      /** One division the official step did not read, carried from the official claims onto `games`. */
      division: DivisionId;
      games: readonly Game[];
      /** What the carry gave: the division's unmatched rows, the games, and how many got a stamp back. */
      fixtures: readonly OfficialFixture[];
      out: readonly Game[];
      carried: number;
    }
  | {
      stage: 'official';
      kind: 'resolve';
      /** Step 07's input, the games the step returned, and the input with the step's decisions applied (what the run publishes). */
      input: readonly Game[];
      stepGames: readonly Game[];
      games: readonly Game[];
    }
  | {
      stage: 'sdsSheet';
      /** The sheet's part of step 09's input: the games, and each tab as read this run (a carried tab's rows are the claims'). */
      input: { games: readonly Game[]; tabs: readonly SdsTabShadow[] };
      /** The rows the stage decided over, fresh and carried, in the order it took them. */
      results: readonly SdsSheetResult[];
      fixtures: readonly SdsSheetFixture[];
      /** Rule 1's disagreements, as logged. */
      disagreements: readonly string[];
      games: readonly Game[];
    }
  | {
      stage: 'results';
      /** Step 11c's input: the games, the published cifss report's conflict rows, and the box evidence read. */
      input: { games: readonly Game[]; cifssConflicts: readonly Pick<CifssConflictRow, 'contestId' | 'cifss' | 'cifssUrl'>[]; box: BoxEvidence | undefined };
      games: readonly Game[];
    };

/** One tab of the bracket sheet as the run read it: its rows when read (with warnings, part of it), none when carried. */
export interface SdsTabShadow {
  division: string;
  read: 'read' | 'read-with-warnings' | 'carried';
  results: readonly SdsSheetResult[];
  fixtures: readonly SdsSheetFixture[];
}

/** How one school calendar of the run was read: answered with events, or asked and silent or failed. */
export type VnnSiteRead = 'answered' | 'not-answered';
