/**
 * The pipeline (SPEC §7.4): `runPipeline(ctx, steps)` runs the thirteen steps in order, and the
 * small amount of CLI plumbing `scripts/fetch-data.ts` needs (§7.12): argument parsing, the
 * transport for the run, the previous snapshot (through loadSnapshot, so a v1 file is migrated),
 * the claims file beside it, and writing the three output files.
 *
 *   01 window      out of season → log, write nothing, exit 0 (unless --force)
 *   02 bootstrap   season ids ≠ config → RUN ABORT
 *   03 metas       wrong season/year/section → LEAGUE FREEZE (a)
 *   04 reported    unreadable table → SOURCE STALE (carried)
 *   05 schedules   failed feed → carried; ≥50% of a league's feeds → LEAGUE FREEZE (b)
 *   06 normalize   the MaxPreps claims: exclusions, phantom dedupe, carry-forward from stored claims
 *   07 official    the official step (steps/official.ts), injectable
 *   08 sblive      the si.com step (steps/sblive.ts), injectable
 *   09 secondary   VNN, CCS and the brackets, the San Diego bracket sheet
 *   10 classify    classifyGames with the official step's degraded divisions, then level finals that need a winner
 *   11 guards      finals regression (c), frozen-league substitution, systemic RUN ABORT
 *   11b cifss      the cifsshome.org score cross-check (report only; never changes a game)
 *   11c results    the editor's listings, corrections, tallies, and every final's GameResult
 *   12 standings   tables, cross-check, LeagueHealth
 *   13 assemble    parseSnapshot (failure → RUN ABORT), budgets, meta, summary
 *
 * The stage driver (docs/DATA-SOURCES.md §4.2). Every source's rows are claims, kept per fixture in the claim store
 * (lib/claims/store.ts, read from the claims file the previous run wrote, else seeded from its snapshot). The run
 * publishes a view (lib/claims/view.ts): the fixtures in order and the decisions each stage takes about them. At each
 * game stage, in order (maxpreps, official, sblive, vnn, sdsSheet, classify, guards, results):
 *
 *   COLLECT  the step reads its source (a source not read this run is carried from its stored claims);
 *   MATCH    the step decides over `state.games`, the view resolved through the stage before: decisions about
 *            existing games by contest id, new games entering the view, and where the legacy list was re-sorted,
 *            the same sort;
 *   RESOLVE  the run records those decisions in the view and assigns `state.games` = the view resolved through this
 *            stage (lib/claims/resolve.ts: each fixture's claims folded with its decisions, stage by stage).
 *
 * `publish` below is the one place `state.games` is assigned. The injectable official and si.com steps keep their
 * game-list contract: their decisions come with their result, or are read off the games they return. A frozen
 * league's games are its previous snapshot's (a `frozen` decision): a publication rule, not carry-forward, so it reads
 * the previous snapshot, as do the other run-history reads (league health, carried-from stamps, the si.com and
 * cifsshome.org reports, CCS and bracket state, slugs, aliases, the superseded games carried from earlier runs,
 * content dates); which contest took over an si.com, sheet or listing game this run is read off the fixtures'
 * histories. After assembly the si.com, sheet, official and school-calendar claims are rewritten from the published
 * games, and the store is written as the claims file.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { CLAIMS_WARN_BYTES, claimsFileText, claimsPathOf, readClaimsFile } from '../claims/file';
import { boxEvidenceOf, recordBoxClaims, writeBackBoxClaims } from '../claims/sources/box';
import { cifssEvidenceFrom, recordCifssClaims } from '../claims/sources/cifss';
import { decisionsFromOfficialStep, writeBackOfficialClaims } from '../claims/sources/official';
import { writeBackSheetClaims } from '../claims/sources/sds-sheet';
import { createSbliveFixtures, decisionsFromSbliveStep, writeBackSbliveClaims, type SbliveStageDecisions } from '../claims/sources/sblive';
import { writeBackVnnClaims } from '../claims/sources/vnn';
import { fixtureOfContest } from '../claims/published';
import { joinSupersededFixtures, recordPublished, supersededFromHistory } from '../claims/supersede';
import type { ClaimsFile, Stage } from '../claims/types';
import { carryCrossCheck } from '../crosscheck/crosscheck';
import type { FixtureLedger } from '../fixtures/shape';
import { parseFetchedAtFlag, parseLeaguesFlag } from '../cli-flags';
import { localDateKey } from '../format';
import { ALL_DIVISIONS, LEAGUES, LEAGUE_IDS, isLeagueId } from '../leagues';
import { SDS_BRACKETS_FILE } from '../postseason/sds-brackets-file';
import { isCifsdsContest } from '../postseason/sds-sheet-results';
import { loadSnapshot } from '../snapshot/snapshot-load';
import { stableStringify } from '../stable-json';
import type { Game, OfficialFixture, Snapshot } from '../types';
import {
  RunAbort,
  type OfficialStepResult,
  type PipelineResult,
  type PipelineSteps,
  type RunArgs,
  type SbliveStepResult,
  type Transport,
} from './contract';
import { loadCorpus, type Corpus } from './corpus';
import { CONSOLE_SINK, PipelineContext, emptyRunState, type LogSink } from './ledger';
import { stepAssemble } from './steps/assemble';
import { stepBootstrap } from './steps/bootstrap';
import { stepCifss } from './steps/cifss';
import { logClassification } from './steps/classify';
import { applyFrozenLeagues, checkFinalsRegression, checkSystemic, fillClassification, markLeaguesNotInRun } from './steps/guards';
import { stepLeagueMeta } from './steps/league-meta';
import { stepNormalize } from './steps/normalize';
import { notAppliedReason } from './steps/official';
import { stepReported } from './steps/reported';
import { decideResults, logResults } from './steps/results';
import { boxEvidenceFrom, type BoxEvidence } from '../results/box-evidence';
import { stepSchedules } from './steps/schedules';
import { stepCcsBrackets, stepVnn } from './steps/secondary';
import { stepSdsSheet } from './steps/sds-sheet';
import { stepStandings } from './steps/standings';
import { stepWindow } from './steps/window';
import {
  FixtureTransport,
  LiveTransport,
  MeteredTransport,
  RecordingTransport,
  type RequestCounts,
} from './transport';
import { DATA_DIR, SPORT_ID } from '../sports/current';

export { claimsPathOf } from '../claims/file';

// ---------------------------------------------------------------- the run context

export interface CreateContextInit {
  args: RunArgs;
  /** The raw transport; it is wrapped in a MeteredTransport (request counts, `maxpreps GET` lines). */
  transport: Transport;
  previous: Snapshot | null;
  sink?: LogSink;
  /** The claims file beside the previous snapshot (prepareRun); undefined seeds the claims from `previous`. */
  claims?: ClaimsFile | null;
  /** The fixture ledger the editor's claims are read from; left out, this build's sport's (a test passes its own). */
  ledger?: FixtureLedger;
}

/** A PipelineContext whose transport is metered and logs through the context. */
export function createPipelineContext(init: CreateContextInit): PipelineContext {
  let ctx: PipelineContext | null = null;
  const metered = new MeteredTransport(init.transport, (line) => ctx?.log(line));
  ctx = new PipelineContext({ args: init.args, transport: metered, previous: init.previous, sink: init.sink, claims: init.claims, ledger: init.ledger });
  return ctx;
}

function requestCounts(transport: Transport): RequestCounts {
  return transport instanceof MeteredTransport
    ? { ...transport.counts }
    : { maxpreps: 0, sblive: 0, official: 0, other: 0 };
}

// ---------------------------------------------------------------- the step sequence

/**
 * Steps 07 and 08 never abort the run (§7.4). A step that THROWS (a bug, not an upstream failure:
 * the steps record those themselves) is logged, and the run goes on without its contribution:
 * every official-fixtures division falls back to contest-type classification (never membership
 * alone) and its league is degraded with a reason; si.com contributes nothing this run.
 *
 * The official step's decisions come with its result: the ones it recorded, else the ones read off the games it
 * returned (lib/claims/sources/official.ts decisionsFromOfficialStep). A step whose games cannot be read as
 * decisions broke the step contract, and is treated as one that threw.
 */
async function runOfficial(
  ctx: PipelineContext,
  steps: PipelineSteps,
  games: Game[],
): Promise<OfficialStepResult & { decisions: NonNullable<OfficialStepResult['decisions']> }> {
  try {
    const result = await steps.official(ctx, games);
    return { ...result, decisions: result.decisions ?? decisionsFromOfficialStep(games, result.games) };
  } catch (err) {
    if (err instanceof RunAbort) throw err;
    ctx.warn(`official step failed: ${(err as Error).message}`);
    const degraded = new Set<string>();
    for (const league of LEAGUES) {
      if (league.rules.classification !== 'official-fixtures' || !ctx.leaguesInRun().includes(league.id)) continue;
      for (const d of league.divisions) degraded.add(d.id);
      ctx.leagues.degrade(league.id, 'degraded', notAppliedReason(league), 'official schedule not applied');
    }
    return { games, unmatched: [], degradedDivisions: degraded, revisedUpstream: new Set(), carriedDivisions: new Set(), decisions: new Map() };
  }
}

/**
 * The si.com step's decisions come with its result likewise: the ones it recorded, else the ones read off the games
 * it returned (lib/claims/sources/sblive.ts decisionsFromSbliveStep); a step whose games cannot be read as decisions
 * is treated as one that threw.
 */
async function runSblive(
  ctx: PipelineContext,
  steps: PipelineSteps,
  games: Game[],
  unmatched: OfficialFixture[],
): Promise<SbliveStepResult & { decisions: SbliveStageDecisions }> {
  try {
    const result = await steps.sblive(ctx, { games, unmatched });
    return { ...result, decisions: result.decisions ?? decisionsFromSbliveStep(games, result.games) };
  } catch (err) {
    if (err instanceof RunAbort) throw err;
    ctx.warn(`si.com step failed: ${(err as Error).message}`);
    // The previous report, keeping only rows still true of these games (no stale conflict rows).
    const prior = ctx.previous?.sbliveCrossCheck;
    return {
      games,
      unmatched,
      sbliveCrossCheck: prior ? carryCrossCheck(prior, games, []) : undefined,
      decisions: { backfill: new Map(), reconcile: new Map(), created: [] },
    };
  }
}

/** Runs §7.4 steps 01-13. Returns null when the season-window guard stops the run (nothing to write). */
export async function runPipeline(ctx: PipelineContext, steps: PipelineSteps): Promise<PipelineResult | null> {
  // 01
  if (!stepWindow(ctx)) return null;
  ctx.log(
    `fetch-data: ${ctx.transport.mode}${ctx.args.fixtures ? ` (${ctx.args.fixtures})` : ''} · ` +
      `fetchedAt ${ctx.fetchedAt} · leagues ${ctx.leaguesInRun().join(',') || '(none)'}`,
  );

  const state = emptyRunState();
  for (const d of ALL_DIVISIONS) state.divisions.set(d.id, { meta: 'skipped', reportedTable: 'skipped', reportedRows: null });
  markLeaguesNotInRun(ctx); // §7.5 trigger d

  // The one place `state.games` is assigned: the view, every decision taken so far, resolved through `stage`.
  const view = ctx.view;
  const publish = (stage: Stage): Game[] => {
    state.games = view.games(stage);
    ctx.trace?.push({ stage: 'view', through: stage, games: [...state.games] });
    return state.games;
  };

  await stepBootstrap(ctx); // 02
  await stepLeagueMeta(ctx, state); // 03
  await stepReported(ctx, state); // 04
  await stepSchedules(ctx, state); // 05
  stepNormalize(ctx, state); // 06: the view starts from the MaxPreps claims
  publish('maxpreps');

  // 07 official (the injectable official step): its decisions, by contest, onto the view; the rows it read are kept
  // for the official claims.
  const officialInput = state.games;
  const { games: officialGames, unmatched, decisions, fixtures: officialRows = [], readDivisions = new Set(), ...officialFlags } =
    await runOfficial(ctx, steps, officialInput);
  view.decide('official', 'official', decisions);
  publish('official');
  state.unmatched = unmatched;
  state.official = officialFlags;
  ctx.trace?.push({ stage: 'official', kind: 'resolve', stepGames: officialGames, games: [...state.games] });

  // 08 sblive (the injectable si.com step): each rule-2 game enters the view on its fixture, then the fills and
  // disagreements, by contest, onto the view; the rows it read are kept for the si.com claims.
  const sbliveInput = state.games;
  const { games: sbliveGames, decisions: sbliveDecisions, rows: sbliveRows = [], read: sbliveRead = false, ...sblive } =
    await runSblive(ctx, steps, sbliveInput, state.unmatched);
  const sbliveRowsRead = new Map(sbliveRows.map((r) => [r.sbliveGameId, r]));
  createSbliveFixtures(ctx.claims, sbliveDecisions.created, sbliveRowsRead, ctx.fetchedAt);
  view.enter('sblive', sbliveDecisions.created, (g) => fixtureOfContest(ctx.claims, g.contestId));
  view.decide('sblive', 'backfill', sbliveDecisions.backfill);
  view.decide('sblive', 'reconcile', sbliveDecisions.reconcile);
  publish('sblive');
  state.unmatched = sblive.unmatched;
  state.sbliveCrossCheck = sblive.sbliveCrossCheck;
  ctx.trace?.push({ stage: 'sblive', kind: 'resolve', stepGames: sbliveGames, games: [...state.games] });

  // 09 secondary: the school calendars' venues and start times, by contest; CCS and the brackets (run-level); the
  // bracket sheet's scores and times by contest, its own games entering the view, which then takes the sheet's order.
  const vnn = await stepVnn(ctx, state.games);
  view.decide('vnn', 'vnn', vnn.decisions);
  publish('vnn');
  state.secondary = await stepCcsBrackets(ctx, state.games);
  const sheet = await stepSdsSheet(ctx, state.games);
  if (sheet.ran) {
    view.remove('vnn', (g) => isCifsdsContest(g.contestId));
    view.decide('sdsSheet', 'sheet', sheet.decisions);
    view.enter('sdsSheet', sheet.created, (g) => fixtureOfContest(ctx.claims, g.contestId));
    view.sortSheet('sdsSheet');
  }
  publish('sdsSheet');

  // 10 classify: one rule per game, with the official step's degraded divisions.
  const classifyInput = state.games;
  view.setFacts({ degradedDivisions: state.official.degradedDivisions });
  publish('classify');
  logClassification(ctx, classifyInput, state.games, state.official.degradedDivisions);
  ctx.trace?.push({ stage: 'classify', input: { games: classifyInput, degradedDivisions: state.official.degradedDivisions }, games: [...state.games] });

  // 11 guards (may throw RunAbort): the finals regression over the classified games, a frozen league's games as last
  // published, then the systemic outage over what the run would publish.
  checkFinalsRegression(ctx, state);
  applyFrozenLeagues(ctx, state, view);
  publish('guards');
  fillClassification(state);
  checkSystemic(ctx, state);

  // 11b cifsshome.org cross-check (over the games the snapshot will publish)
  state.cifssCrossCheck = await stepCifss(ctx, state);
  // With the claims file alone and no report to carry, the stored cifss claims are the last publication's evidence.
  if (state.cifssCrossCheck || !ctx.claimsAlone) recordCifssClaims(ctx.claims, state.cifssCrossCheck);

  // 11c results: the editor's listings enter the view (re-sorted when any does); each fixture gets its cifss and box
  // evidence from the claims; every final's recorded result is resolved (corrections, a level final that must have a
  // winner, a tally read from a second source), before the standings count it.
  const resultsInput = state.games;
  const listed = decideResults(ctx, resultsInput, ctx.editor);
  view.enter('results', listed, (g) => fixtureOfContest(ctx.claims, g.contestId));
  const box = ctx.args.fixtures ? undefined : boxEvidenceOnDisk();
  recordBoxClaims(ctx.claims, box, ctx.fetchedAt);
  view.decide('results', 'cifss', cifssEvidenceFrom(ctx.claims, state.cifssCrossCheck));
  view.decide('results', 'box', boxEvidenceOf(ctx.claims, box));
  if (listed.length > 0) view.sortByDateThenId('results');
  publish('results');
  logResults(ctx, resultsInput, state.games, new Set(listed.map((g) => g.contestId)));

  // 12 standings + health
  const table = stepStandings(ctx, state);

  // A contest that took over a game another source published joins that game's fixture; which contest took over
  // which game is read off the fixtures' histories, and assembly publishes it as supersededGames.
  const superseded = supersededFromHistory(ctx.claims, state.games, ctx.claimsAsRead.fetchedAt);
  joinSupersededFixtures(ctx.claims, superseded, ctx.claimsAsRead.fixtures, (from, into) => view.rename(from, into));

  // 13 assemble (may throw RunAbort)
  const { snapshot, meta } = stepAssemble(ctx, { state, table, requests: requestCounts(ctx.transport), superseded });

  // The claims file beside the snapshot. Checked after the meta is built, so a size warning never moves meta.warnings.
  // What si.com, the bracket sheet's rows, the league schedules and each school calendar's games showed as published,
  // for the next run's carry. si.com's and the sheet's go first: an `sblive:` game's fixture is found by its fill, a
  // `cifsds:` game's by its sheet claim.
  writeBackSbliveClaims(ctx.claims, snapshot.games, { rows: sbliveRowsRead, sblive: sbliveRead }, ctx.fetchedAt);
  writeBackSheetClaims(ctx.claims, snapshot.games, SDS_BRACKETS_FILE, sheetTabsRead(ctx), ctx.fetchedAt);
  writeBackOfficialClaims(ctx.claims, snapshot.games, snapshot.officialFixtures ?? [], { rows: officialRows, divisions: readDivisions }, ctx.fetchedAt);
  writeBackVnnClaims(ctx.claims, snapshot.games, vnnAnswered(ctx), ctx.fetchedAt);
  writeBackBoxClaims(ctx.claims, snapshot.games, ctx.fetchedAt);
  recordPublished(ctx.claims, snapshot.games, ctx.fetchedAt);
  ctx.claims.gc();
  const claims = ctx.claims.toFile(ctx.fetchedAt, SPORT_ID);
  const bytes = Buffer.byteLength(claimsFileText(claims), 'utf8');
  if (bytes > CLAIMS_WARN_BYTES) ctx.warn(`claims file is ${bytes} bytes, over the ${CLAIMS_WARN_BYTES}-byte budget`);
  return { snapshot, meta, claims, logLines: [...ctx.logLines] };
}

/** Whether the bracket sheet's tab of a division was read this run (its source row is ok). */
function sheetTabsRead(ctx: PipelineContext): (division: string) => boolean {
  const read = new Set(ctx.sources.all().filter((r) => r.id === 'cifsds-sheet' && r.status === 'ok').map((r) => r.label));
  return (division) => read.has(`sds bracket sheet ${division}`);
}

/** The school calendars that answered with events this run (their source row is ok with rows). */
function vnnAnswered(ctx: PipelineContext): Set<string> {
  const rows = ctx.sources.all().filter((r) => r.id === 'vnn-ics' && r.status === 'ok' && (r.rowCount ?? 0) > 0);
  return new Set(rows.flatMap((r) => (r.scope?.team ? [r.scope.team] : [])));
}

// ---------------------------------------------------------------- CLI plumbing (§7.12)

export const USAGE = `Usage: pnpm fetch-data [flags]

  --fixtures <dir>             offline: read a manifest-driven corpus instead of the network
  --variant <dir>              apply a variant overlay on top of --fixtures (repeatable)
  --capture <dir>              live: also record every response into a new corpus at <dir>
  --out <path>                 snapshot path (default data/<sport>/snapshot.json; the meta file goes beside it)
  --dry-run                    validate and report, write nothing (captures included)
  --fetched-at <iso>           pin the run's stamp (default: now; the corpus's stamp with --fixtures)
  --force                      run even outside the season window
  --leagues <a,b>              fetch only these leagues; the others are carried forward, frozen
  --accept-regression <a,b>    skip the finals-regression guard for these leagues, this run only
  --no-sblive                  skip si.com
  --sblive-full                also read every si.com team page (manual, never the cron default)
  --no-official                skip the official schedule sources (alias: --no-scval)
  --no-ccs                     skip the CCS calendar and bracket poll
  --no-vnn                     skip the VNN school calendars
  --no-cifss                   skip the cifsshome.org score cross-check`;

export interface ParseOptions {
  cwd: string;
  /** The default `fetchedAt` for a live run (the CLI passes the wall clock; tests pin it). */
  now: string;
}

/** The box-score evidence of this sport's player-stats file, or undefined when it is missing or unreadable. */
function boxEvidenceOnDisk(): BoxEvidence | undefined {
  try {
    return boxEvidenceFrom(JSON.parse(readFileSync(path.join(process.cwd(), DATA_DIR, 'player-stats.json'), 'utf8')) as unknown);
  } catch {
    return undefined;
  }
}

/**
 * Parses the §7.12 flags. `fetchedAt` is left as '' when not given and the run is offline, so the
 * caller can default it to the corpus's stamp. Throws on an unknown flag or a bad value.
 */
export function parseRunArgs(argv: readonly string[], opts: ParseOptions): RunArgs & { help: boolean } {
  const args: RunArgs & { help: boolean } = {
    fixtures: null,
    variants: [],
    capture: null,
    out: path.join(opts.cwd, DATA_DIR, 'snapshot.json'),
    dryRun: false,
    fetchedAt: '',
    force: false,
    leagues: null,
    acceptRegression: [],
    sblive: true,
    sbliveFull: false,
    official: true,
    ccs: true,
    vnn: true,
    cifss: true,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = (): string => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error(`${arg} needs a value`);
      i += 1;
      return v;
    };
    switch (arg) {
      case '--fixtures': args.fixtures = path.resolve(opts.cwd, next()); break;
      case '--variant': args.variants.push(path.resolve(opts.cwd, next())); break;
      case '--capture': args.capture = path.resolve(opts.cwd, next()); break;
      case '--out': args.out = path.resolve(opts.cwd, next()); break;
      case '--dry-run': args.dryRun = true; break;
      case '--fetched-at': args.fetchedAt = parseFetchedAtFlag(next(), arg); break;
      case '--force': args.force = true; break;
      case '--leagues': args.leagues = parseLeaguesFlag(next(), arg); break;
      case '--accept-regression': args.acceptRegression.push(...parseLeaguesFlag(next(), arg)); break;
      case '--no-sblive': args.sblive = false; break;
      case '--sblive-full': args.sbliveFull = true; break;
      case '--no-official':
      case '--no-scval': args.official = false; break;
      case '--no-ccs': args.ccs = false; break;
      case '--no-vnn': args.vnn = false; break;
      case '--no-cifss': args.cifss = false; break;
      case '--help':
      case '-h': args.help = true; break;
      default: throw new Error(`unknown flag: ${arg}`);
    }
  }
  if (args.variants.length > 0 && args.fixtures === null) throw new Error('--variant needs --fixtures');
  if (args.capture !== null && args.fixtures !== null) throw new Error('--capture records a live run; it cannot be combined with --fixtures');
  if (args.fetchedAt === '' && args.fixtures === null) args.fetchedAt = opts.now;
  return args;
}

/** The previous snapshot at `file` through loadSnapshot (v1 migrated), or null when absent or unreadable. */
export function readPrevious(file: string, sink: LogSink = CONSOLE_SINK): Snapshot | null {
  if (!existsSync(file)) return null;
  try {
    return loadSnapshot(JSON.parse(readFileSync(file, 'utf8')) as unknown);
  } catch (err) {
    sink.warn(`WARN previous snapshot ${file} could not be loaded, so nothing is carried: ${(err as Error).message.split('\n')[0]}`);
    return null;
  }
}

export interface PreparedRun {
  args: RunArgs;
  corpus: Corpus | null;
  /** The file the previous snapshot was read from (null: none). */
  previousFile: string | null;
  ctx: PipelineContext;
}

/**
 * Resolves the transport, the previous snapshot and the defaults that depend on the corpus, and
 * builds the context. A corpus's (or variant's) `previous` snapshot is copied to `--out` first so
 * the run starts from it (on a dry run it is read in place and nothing is written). A dry run
 * records no --capture corpus either, as fetch-rosters and fetch-player-stats do.
 */
export function prepareRun(raw: RunArgs, sink: LogSink = CONSOLE_SINK, live?: () => Transport): PreparedRun {
  const args: RunArgs = { ...raw, variants: [...raw.variants], acceptRegression: [...raw.acceptRegression] };
  let corpus: Corpus | null = null;
  let transport: Transport;
  if (args.fixtures !== null) {
    corpus = loadCorpus(args.fixtures, args.variants);
    if (args.fetchedAt === '') args.fetchedAt = corpus.fetchedAt;
    if (args.leagues === null) args.leagues = corpus.leagues.filter((id) => isLeagueId(id));
    transport = new FixtureTransport(corpus);
  } else {
    const inner = live ? live() : new LiveTransport({ onLog: (line) => sink.log(line) });
    transport =
      args.capture !== null && !args.dryRun
        ? new RecordingTransport(inner, args.capture, {
            id: `capture-${localDateKey(args.fetchedAt)}`,
            fetchedAt: args.fetchedAt,
            leagues: args.leagues ?? [...LEAGUE_IDS],
          })
        : inner;
  }

  let previousFile: string | null = args.out;
  // The claims file written beside the previous snapshot; null: none goes with it.
  let claimsFile: string | null = claimsPathOf(args.out);
  if (corpus?.previous) {
    if (args.dryRun) {
      previousFile = corpus.previous;
      claimsFile = corpus.previousClaims;
    } else {
      mkdirSync(path.dirname(args.out), { recursive: true });
      copyFileSync(corpus.previous, args.out);
      sink.log(`previous: started from ${path.relative(process.cwd(), corpus.previous)} (copied to ${path.relative(process.cwd(), args.out)})`);
      // A claims file already beside --out was written beside another snapshot: it goes, or the corpus's own replaces it.
      if (corpus.previousClaims) copyFileSync(corpus.previousClaims, claimsFile);
      else rmSync(claimsFile, { force: true });
    }
  }
  const previous = previousFile ? readPrevious(previousFile, sink) : null;
  const claims = previous ? previousClaims(claimsFile, previous, sink) : null;
  const ctx = createPipelineContext({ args, transport, previous, sink, claims });
  return { args, corpus, previousFile: previous ? previousFile : null, ctx };
}

/**
 * The claims file beside the previous snapshot when it was written by the same run for the same sport (its
 * fetchedAt and sport match), else undefined: the context then seeds the claims from the snapshot.
 */
function previousClaims(file: string | null, previous: Snapshot, sink: LogSink): ClaimsFile | undefined {
  const rel = (p: string) => path.relative(process.cwd(), p);
  const claims = file ? readClaimsFile(file, (line) => sink.warn(line)) : null;
  if (claims && claims.fetchedAt === previous.fetchedAt && claims.sport === SPORT_ID) return claims;
  if (file && claims) sink.log(`claims: ${rel(file)} does not match the previous snapshot; seeded from it`);
  else sink.log(`claims: no claims file beside the previous snapshot; seeded from it`);
  return undefined;
}

export function metaPathOf(out: string): string {
  return out.replace(/\.json$/, '') + '.meta.json';
}

/**
 * Writes snapshot.json, snapshot.meta.json and the claims file beside them (stable, key-sorted JSON), in that
 * order. Returns the meta path.
 */
export function writeOutputs(out: string, result: PipelineResult): string {
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, stableStringify(result.snapshot), 'utf8');
  const metaPath = metaPathOf(out);
  writeFileSync(metaPath, stableStringify(result.meta), 'utf8');
  writeFileSync(claimsPathOf(out), claimsFileText(result.claims), 'utf8');
  return metaPath;
}
