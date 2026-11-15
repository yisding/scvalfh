/**
 * The stages and rules as functions over a whole game list, for the tests that call them that way. The pipeline
 * decides over its view and applies each decision to one game (lib/claims/resolve.ts); each function here composes
 * the same decide and apply functions over a list, as the step did before the claims existed, so a test of the rule
 * reads as it always has.
 */

import { classifyGames } from '../../lib/classify';
import { applyBackfillDecision, decideBackfill, type BackfillInput, type BackfillResult } from '../../lib/crosscheck/backfill';
import { applyReconcile, decideReconcile, type ReconcileOptions, type ReconcileResult } from '../../lib/crosscheck/crosscheck';
import { applyOfficialDecision, type OfficialDecision } from '../../lib/official/match';
import type { PipelineContext } from '../../lib/pipeline/ledger';
import type { RunContext, SecondaryStepResult } from '../../lib/pipeline/contract';
import { logClassification } from '../../lib/pipeline/steps/classify';
import { stepCcsBrackets, stepVnn } from '../../lib/pipeline/steps/secondary';
import { stepSdsSheet } from '../../lib/pipeline/steps/sds-sheet';
import { settleLevelFinal } from '../../lib/postseason/level-final';
import {
  applySdsSheetDecision,
  decideSdsSheet,
  isCifsdsContest,
  type SdsSheetApplyInput,
} from '../../lib/postseason/sds-sheet-results';
import type { ResultCorrections } from '../../lib/fixtures/ledger';
import { finalizeResult } from '../../lib/results/result';
import type { BoxEvidence } from '../../lib/results/box-evidence';
import type { SbliveGame } from '../../lib/sources/sblive';
import {
  applyVnnCarry,
  applyVnnDecision,
  decideVnn,
  decideVnnCarry,
  vnnPublishedOf,
  type VnnEvent,
  type VnnPublished,
} from '../../lib/sources/vnn-ics';
import type { SbliveStageDecisions } from '../../lib/claims/sources/sblive';
import type { CifssConflictRow, ContestId, DivisionId, Game, TeamSlug } from '../../lib/types';

/** Each contest's official decisions, in the order the step took them. */
type OfficialDecisionMap = ReadonlyMap<ContestId, readonly OfficialDecision[]>;

/** D2 rules 2-5 and 10 over one run's games, unmatched fixtures and si.com rows. Pure. */
export function applyBackfill(input: BackfillInput): BackfillResult {
  const d = decideBackfill(input);
  return {
    games: [...input.games.map((g) => applyBackfillDecision(g, d.byContestId.get(g.contestId))), ...d.created.map((c) => c.game)],
    unmatched: d.unmatched,
    rows: d.rows,
    skipped: d.skipped,
    warnings: d.warnings,
    carried: d.carried,
  };
}

export function reconcile(
  games: readonly Game[],
  sbliveGames: readonly SbliveGame[],
  opts: ReconcileOptions,
): ReconcileResult {
  const d = decideReconcile(games, sbliveGames, opts);
  return { games: games.map((g) => applyReconcile(g, d.byContestId.get(g.contestId))), unmatched: d.unmatched, report: d.report };
}

export interface FinalizeOptions {
  /** The cifss cross-check's conflict rows of the run (or of the stored file). */
  cifssConflicts?: readonly Pick<CifssConflictRow, 'contestId' | 'cifss' | 'cifssUrl'>[];
  corrections?: ResultCorrections;
  /** The box scores of the season (lib/results/box-evidence.ts); undefined leaves each game's box evidence as stored. */
  box?: BoxEvidence;
}

/** `finalizeResult` over a list: the same array when no game changes. */
export function finalizeResults(games: readonly Game[], opts: FinalizeOptions = {}): Game[] {
  const cifss = new Map((opts.cifssConflicts ?? []).map((r) => [r.contestId, r]));
  const out = games.map((g) => finalizeResult(g, { cifss: cifss.get(g.contestId), corrections: opts.corrections, box: opts.box }));
  return out.some((g, i) => g !== games[i]) ? out : (games as Game[]);
}

/** `settleLevelFinal` over a list: the same array when no game changes. */
export function settleLevelFinals(games: readonly Game[]): Game[] {
  const out = games.map(settleLevelFinal);
  return out.some((g, i) => g !== games[i]) ? out : (games as Game[]);
}

/** The stage over a game list: every game classified and settled, and the stage's log lines. */
export function stepClassify(ctx: Pick<RunContext, 'log'>, games: readonly Game[], degradedDivisions: ReadonlySet<DivisionId>): Game[] {
  const out = settleLevelFinals(classifyGames(games, { degradedDivisions }));
  logClassification(ctx, games, out, degradedDivisions);
  return out;
}

export interface SdsSheetApplyResult {
  games: Game[];
  /** `cifsds:` games published (rule 3). */
  added: Game[];
  /** MaxPreps contests the sheet's score was written onto (rule 2). */
  filled: Game[];
  /** Results MaxPreps already has as the sheet does. */
  agreed: number;
  /** Rule 1 disagreements, as log sentences. */
  disagreements: string[];
  /** MaxPreps contests the sheet's time was written onto (rule 4). */
  timed: Game[];
  /** Scheduled `cifsds:` games published (rule 5). */
  listed: Game[];
}

/** The sheet's results and fixtures applied to this run's games (rules 1-5 above): decide, apply, then add. */
export function applySdsSheetResults(input: SdsSheetApplyInput): SdsSheetApplyResult {
  const d = decideSdsSheet(input);
  const base = input.games.filter((g) => !isCifsdsContest(g.contestId));
  // The game each step started from is the one its earlier step left, so `filled` and `timed` carry every step's game.
  const current = new Map<string, Game>();
  for (const g of base) if (!current.has(g.contestId)) current.set(g.contestId, g);
  const filled: Game[] = [];
  const timed: Game[] = [];
  for (const s of d.steps) {
    const next = applySdsSheetDecision(current.get(s.contestId)!, s.decision);
    current.set(s.contestId, next);
    (s.decision.kind === 'score' ? filled : timed).push(next);
  }
  const games = base.map((g) => {
    const decision = d.decisions.get(g.contestId);
    return decision ? applySdsSheetDecision(g, decision) : g;
  });
  games.push(...d.added, ...d.listed);
  games.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.contestId.localeCompare(b.contestId));
  return { games, added: d.added, filled, agreed: d.agreed, disagreements: d.disagreements, timed, listed: d.listed };
}

export interface ApplyVnnResult {
  games: Game[];
  /** Games that gained a venue name. */
  venuesAdded: number;
  /** Games whose MaxPreps start time the school calendar corroborates. */
  timesConfirmed: number;
  /** Varsity events that matched no MaxPreps contest. */
  unmatched: number;
  warnings: string[];
}

/** Attach `venue.name` and `timeConfirmed` where MaxPreps has neither: decide, then apply to each game. */
export function applyVnnEvents(
  games: readonly Game[],
  events: readonly VnnEvent[],
): ApplyVnnResult {
  const d = decideVnn(games, events);
  const out = games.map((game) => {
    const decision = d.decisions.get(game.contestId);
    return decision ? applyVnnDecision(game, decision) : game;
  });
  return { games: out, venuesAdded: d.venuesAdded, timesConfirmed: d.timesConfirmed, unmatched: d.unmatched, warnings: d.warnings };
}

/**
 * SPEC §5.3, PER SITE: put back the venue names and confirmed start times a school calendar
 * published before, for the schools whose feed produced nothing this run.
 *
 * There are only two verified feeds and the failure that happens is ONE of them, so a pooled
 * "did any calendar answer" flag is the wrong question: while Los Gatos answered, a failed Palo
 * Alto feed silently dropped nine venue names and five confirmed start times off published game
 * pages. Keyed on the school instead, a feed that DID answer is never second-guessed and a feed
 * that did not never takes its school's data down with it.
 *
 * Only ever FILLS A HOLE — a value this run produced always wins. `publishedOf` is what each game showed the last
 * time it was published (lib/claims/sources/vnn.ts reads it from the stored claims).
 */
export function carryVnnPublished(
  missing: readonly TeamSlug[],
  games: readonly Game[],
  publishedOf: (contestId: string) => VnnPublished | undefined,
): { games: Game[]; carried: number } {
  const decisions = decideVnnCarry(missing, games, publishedOf);
  if (missing.length === 0) return { games: [...games], carried: 0 };
  const out = games.map((game) => {
    const carried = decisions.get(game.contestId);
    return carried ? applyVnnCarry(game, carried) : game;
  });
  return { games: out, carried: out.filter((g, i) => g !== games[i]).length };
}

/** carryVnnPublished with what each game showed in `previousGames`, the previous snapshot's list. */
export function carryVnnForward(
  missing: readonly TeamSlug[],
  previousGames: readonly Game[],
  games: readonly Game[],
): { games: Game[]; carried: number } {
  if (missing.length === 0) return { games: [...games], carried: 0 };
  const prevById = new Map(previousGames.map((g) => [g.contestId, g]));
  return carryVnnPublished(missing, games, (id) => {
    const prev = prevById.get(id);
    return prev ? vnnPublishedOf(prev) : undefined;
  });
}

/**
 * Step 09 over a game list: the school calendars, CCS and the bracket sheet, each part over the games the part
 * before it left. The run calls the parts itself (lib/pipeline/run.ts), each over the view the stage before
 * resolved, in this order.
 */
export async function stepSecondary(ctx: PipelineContext, games: readonly Game[]): Promise<SecondaryStepResult> {
  const withVnn = (await stepVnn(ctx, games)).games;
  const ccs = await stepCcsBrackets(ctx, withVnn);
  const withSheet = (await stepSdsSheet(ctx, withVnn)).games;
  return { games: withSheet, ...ccs };
}

/**
 * The game list through the si.com stage: the stage's input with each game's decisions, then the rule-2 games. The
 * run resolves the same per fixture over its view (lib/claims/resolve.ts), the rule-2 games entering it at the end;
 * this is the stage over a plain list.
 */
export function resolveSbliveStage(games: readonly Game[], d: SbliveStageDecisions): Game[] {
  const decided = (g: Game) => applyReconcile(applyBackfillDecision(g, d.backfill.get(g.contestId)), d.reconcile.get(g.contestId));
  return [...games.map(decided), ...d.created.map(decided)];
}

/**
 * The game list through the official stage: the stage's input, each game with its contest's decisions. The run
 * resolves the same per fixture over its view (lib/claims/resolve.ts); this is the stage over a plain list.
 */
export function resolveOfficialStage(games: readonly Game[], decisions: OfficialDecisionMap): Game[] {
  return games.map((g) => (decisions.get(g.contestId) ?? []).reduce((x, d) => applyOfficialDecision(x, d), g));
}
