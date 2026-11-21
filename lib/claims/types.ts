/**
 * The claims model (docs/DATA-SOURCES.md §4.2): every source's rows about a game, kept per fixture with the run that
 * last saw them, and written beside the snapshot as `claims.json`. A fixture is this site's own record of one game; a
 * claim is what one source says about it. Step 06 publishes from the MaxPreps claims (a feed not read is carried
 * from them), the official step carries a division it does not read from the official claims, the school calendars'
 * carry reads the VNN claims, the si.com step carries the fills and disagreements it did not read again from the si.com
 * claims and publishes its rule-2 games on fixtures of their own, the bracket sheet carries a tab it does not read
 * from the sheet's claims and publishes its own games on fixtures created from them, and the results step weighs the
 * cifsshome.org and box-score claims.
 *
 * What the run publishes is the view (lib/claims/view.ts): the fixtures in order, each folded from its claims with
 * the cross-game decisions every stage took about it (`FixtureDecisions`, in memory only, never stored) through
 * lib/claims/resolve.ts. The editor's claims (the fixture ledger) are rebuilt every run and stored for information
 * only.
 *
 * Types only. lib/claims/schema.ts is the zod form of `ClaimsFile` as written on disk, where `seenAt` equal to the
 * file's `fetchedAt` and a MaxPreps game's `provenance.fetchedAt` are left out (lib/claims/store.ts toFile).
 */

import type {
  BoxSide, CifssConflictRow, ContestId, DivisionId, Game,
  OfficialFixture, OfficialStamp, StreetAddress, TeamId, TeamSlug,
} from '../types';
import type { BackfillDecision, BackfillPublished } from '../crosscheck/backfill';
import type { ReconcileDecision } from '../crosscheck/crosscheck';
import type { OfficialDecision } from '../official/match';
import type { SdsSheetDecision } from '../postseason/sds-sheet-results';
import type { BoxEvidence } from '../results/box-evidence';
import type { ScheduleRow } from '../sources/maxpreps';
import type { CanonicalFixture } from '../fixtures/shape';
import type { CifssRow } from '../sources/cifss';
import type { SbliveGame } from '../sources/sblive';
import type { SdsSheetFixture, SdsSheetResult } from '../sources/sds-bracket-sheet';
import type { VnnEvent, VnnStageDecision } from '../sources/vnn-ics';
import type { SportId } from '../sports/current';

export const CLAIMS_SCHEMA_VERSION = 1 as const;

export type ClaimSource = 'maxpreps' | 'teamsideline' | 'official' | 'sblive' | 'cifss' | 'sdsSheet' | 'vnn' | 'box' | 'editor';

/** Our own id: `${dateKey}-${awayKey}-at-${homeKey}` (+ `~2`, `~3` … on collision). Never published; never re-minted. */
export type FixtureId = string;

/** Every claim: the source's own ref for the row, and the fetchedAt of the last run that saw it. */
export interface ClaimBase<Ref extends string = string> {
  ref: Ref;
  /** In memory: always set. On disk: omitted when equal to ClaimsFile.fetchedAt. */
  seenAt: string;
}

/** Fields of a seeded claim that claimsFromSnapshot could not recover exactly and had to reconstruct. */
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
  /** Set only on a claim seeded from a snapshot. */
  reconstructed?: Reconstructed[];
}

// ---------------------------------------------------------------- teamsideline (a league's own site, the primary source of a build MaxPreps does not carry)

/**
 * A game as lib/pipeline/steps/teamsideline.ts builds it from one row of a league's TeamSideline schedule page: the
 * same fields a MaxPreps claim's game holds (`MaxprepsGame`'s omissions and null placeholders), with the page as its
 * provenance. `provenance.fetchedAt` equals the claim's `seenAt`.
 */
export type TeamsidelineGame = Omit<
  Game,
  'slug' | 'aliases' | 'official' | 'result' | 'timeConfirmed' | 'countsFor' | 'postseason'
> & { countsFor: null; postseason: null };

export interface TeamsidelineClaim extends ClaimBase<ContestId /* `teamsideline:<schedule id>-<away>-at-<home>` or `…-g<n>` */> {
  game: TeamsidelineGame;
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
  /**
   * The official step's league-flag note the `lastMatch` game showed with the stamp (its
   * `provenance.leagueFlagConflict` when that is not normalize's own sentence): a contest carried for a feed the run
   * did not read shows it as it did (lib/claims/resolve.ts resolveCarriedClaims).
   */
  leagueFlagNote?: string;
  /** The official step's host note the `lastMatch` game showed with the stamp (its `provenance.hostConflict`). */
  hostNote?: string;
}

// ---------------------------------------------------------------- si.com

/** What rule 10 (lib/crosscheck/backfill.ts) re-applies for rules 3 and 4: the si.com value the game last published. */
export type PublishedScore = BackfillPublished;

export type SbliveFill =
  | { rule: 'score-pending' | 'contradictory-result' | 'off-schedule-date' | 'phantom-tie'; contestId: ContestId; published: PublishedScore }
  /** Rule 2: the whole game as last published, verbatim (the carry publishes it as it was, as the snapshot's game was). */
  | { rule: 'absent-fixture'; contestId: ContestId; officialFixtureId: string; game: Game };

export interface SbliveClaim extends ClaimBase<string /* a fill's sbliveGameId (`#2` … for a second game of one row), or `contest:<id>` for a conflict mark */> {
  /** The si.com row as cleaned, when the run that wrote the fill read it. Absent on a carried or seeded fill and on a conflict mark. */
  row?: SbliveGame;
  /** What this row published last time it was used (D2 rules 2-4). Read by rule 10. */
  fill?: SbliveFill;
  /**
   * A si.com disagreement a game with no fill published last time (rule 5's conflict, or the note on a game MaxPreps
   * has not scored), with the game's scores then, for the carry of a run that reads no si.com data (steps/sblive.ts).
   */
  conflict?: { contestId: ContestId; scoreConflict: NonNullable<Game['provenance']['scoreConflict']>; published: { home: number | null; away: number | null } };
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
  published: {
    contestId: ContestId;
    dateLocal: string;
    /**
     * On a game the sheet scored or only the sheet has, the `provenance.fetchedAt` it showed: the run that wrote the
     * sheet's score, or built the game.
     */
    fetchedAt?: string;
  };
}

// ---------------------------------------------------------------- VNN school calendars (evidence only)

export interface VnnClaim extends ClaimBase<string /* `${school}:contest:<id>`: one per calendar school and game */> {
  /** Not written: the per-site carry reads `applied` alone. */
  event?: VnnEvent;
  /**
   * What the game showed when last published, for the per-site carry (lib/sources/vnn-ics.ts decideVnnCarry and
   * applyVnnCarry, which copies `venue.address` whole): the venue name whatever wrote it, and the confirmed start time.
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
  teamsideline?: TeamsidelineClaim;
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
  teamsideline: TeamsidelineClaim;
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

/** One contest id a fixture's game was published under, and the fetchedAt of the last run that published it so. */
export interface PublishedUnder {
  contestId: ContestId;
  /** In memory: always set. On disk: omitted when equal to ClaimsFile.fetchedAt. */
  seenAt: string;
  /**
   * For an editor's listing (`official:`), the fetchedAt its game was built with (`provenance.fetchedAt`): a listing
   * carried for a feed the run did not read is rebuilt with it (lib/claims/resolve.ts resolveCarriedClaims).
   */
  builtAt?: string;
}

export interface Fixture {
  id: FixtureId;
  /** Ids of fixtures merged into this one, sorted. Readable slugs; never published. */
  aliases?: FixtureId[];
  claims: FixtureClaims;
  /**
   * The contest ids the fixture's game has been published under, in the order it first was: an si.com rule-2 game, a
   * bracket sheet game or an editor listing, and then the MaxPreps contest that took it over (lib/claims/supersede.ts).
   */
  published?: PublishedUnder[];
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

/**
 * The stages of a run, in order: the view (lib/claims/view.ts) is resolved through each in turn, and a fixture's game
 * is folded through them (lib/claims/resolve.ts). `primary` is where the build's primary source (lib/sports/shape.ts
 * PrimarySourceId: MaxPreps, or a league's TeamSideline site) starts the view; `guards` is step 11's frozen-league
 * substitution.
 */
export type Stage = 'primary' | 'official' | 'sblive' | 'vnn' | 'sdsSheet' | 'classify' | 'guards' | 'results';
export const STAGES: readonly Stage[] = ['primary', 'official', 'sblive', 'vnn', 'sdsSheet', 'classify', 'guards', 'results'];

/** The run-level facts resolve reads: the divisions the official step degraded, which classification falls back on. */
export interface RunFacts {
  degradedDivisions: ReadonlySet<DivisionId>;
}

/**
 * One fixture's cross-game decisions, each taken by its stage over the view the stage before resolved, and read by
 * resolveFixture. Every stage's decision is the one its rule module applies to a game (`applyX`); a fixture with no
 * entry is a MaxPreps contest resolved from its claim alone.
 */
export interface FixtureDecisions {
  /** The first stage at which the fixture is in the view: rule-2 games 'sblive', sheet games 'sdsSheet', a frozen league's passthrough 'guards', editor listings 'results'. */
  from: Stage;
  /**
   * The game the fixture enters the view with at `from`, when its claims do not give it: an si.com rule-2 game, a
   * game only the bracket sheet has, an editor listing the results step adds.
   */
  enters?: Game;
  /**
   * A MaxPreps contest, or an editor's listing the last run published, carried at stage `maxpreps` for a feed this
   * run did not read: it enters folded from its fixture's stored claims (lib/claims/resolve.ts resolveCarriedClaims),
   * each other source contributing what the last publication showed from it.
   */
  carried?: true;
  /** The official step's decisions, in the order it took them (lib/official/match.ts applyOfficialDecision). */
  official?: readonly OfficialDecision[];
  /** si.com's fill (lib/crosscheck/backfill.ts applyBackfillDecision) and disagreement (lib/crosscheck/crosscheck.ts applyReconcile). */
  backfill?: BackfillDecision;
  reconcile?: ReconcileDecision;
  /** The school calendars' venue and start time, this run's or carried (lib/sources/vnn-ics.ts applyVnnStageDecision). */
  vnn?: VnnStageDecision;
  /** The bracket sheet's score or time (lib/postseason/sds-sheet-results.ts applySdsSheetDecision). */
  sheet?: SdsSheetDecision;
  /** A frozen league's game: the previous snapshot's, classified with that league's previous degraded set (lib/pipeline/steps/guards.ts). */
  frozen?: Game;
  /** The results stage's evidence: the published cifss report's row, and the box scores read (undefined: none read). */
  cifss?: Pick<CifssConflictRow, 'cifss' | 'cifssUrl'>;
  box?: BoxEvidence;
}

/** One team feed's read this run, as step 05 records it (lib/pipeline/ledger.ts TeamFeedInfo). */
export interface FeedRead {
  teamId: TeamId;
  status: 'ok' | 'failed' | 'skipped' | 'not-fetched';
}

/**
 * A per-stage trace for tests: with SCVAL_STAGE_TRACE=1 (PipelineContext.trace) each stage records what it read and
 * what it published, and the run records the view it published after each stage. tests/claims/support/shadow.ts checks
 * the records against the rules the stages ran before the claims existed, which read the previous snapshot; the
 * records hold what only a step sees (the rows read, each source's read). Off in every real run.
 */
export type StageTrace =
  | {
      stage: 'primary';
      /** Step 06's input: the rows read, and each feed's read. */
      input: { rows: readonly ScheduleRow[]; feeds: readonly FeedRead[] };
      /** The view's fixture ids, in order. */
      view: readonly FixtureId[];
      games: readonly Game[];
      /** Contest ids carried from stored claims this stage (a side's feed not read). */
      carried: readonly ContestId[];
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
      /** The games the step returned, and the stage's input with the step's decisions applied (what the run publishes). */
      stepGames: readonly Game[];
      games: readonly Game[];
    }
  | {
      stage: 'sblive';
      kind: 'resolve';
      /** As the official stage's. */
      stepGames: readonly Game[];
      games: readonly Game[];
    }
  | {
      stage: 'sblive';
      kind: 'decide';
      /** Step 08's input games, and the si.com rows read (null: si.com was not read). */
      input: { games: readonly Game[]; sblive: readonly SbliveGame[] | null };
      games: readonly Game[];
    }
  | {
      stage: 'sdsSheet';
      /** Each tab of the bracket sheet as read this run (a carried tab's rows are the claims'). */
      input: { tabs: readonly SdsTabTrace[] };
      /** The rows the stage decided over, fresh and carried, in the order it took them. */
      results: readonly SdsSheetResult[];
      fixtures: readonly SdsSheetFixture[];
      games: readonly Game[];
    }
  | {
      stage: 'classify';
      /** Step 10's input (the view through the bracket sheet) and the official step's degraded divisions. */
      input: { games: readonly Game[]; degradedDivisions: ReadonlySet<DivisionId> };
      games: readonly Game[];
    }
  | {
      /** The view the run resolved through `through` (lib/pipeline/run.ts): what `state.games` is after that stage. */
      stage: 'view';
      through: Stage;
      games: readonly Game[];
    };

/** One tab of the bracket sheet as the run read it: its rows when read (with warnings, part of it), none when carried. */
export interface SdsTabTrace {
  division: string;
  read: 'read' | 'read-with-warnings' | 'carried';
  results: readonly SdsSheetResult[];
  fixtures: readonly SdsSheetFixture[];
}

