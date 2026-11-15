/**
 * The pipeline (SPEC §7.4): `runPipeline(ctx, steps)` runs the thirteen steps in order, and the
 * small amount of CLI plumbing `scripts/fetch-data.ts` needs (§7.12): argument parsing, the
 * transport for the run, the previous snapshot (through loadSnapshot, so a v1 file is migrated),
 * and writing the two output files.
 *
 *   01 window      out of season → log, write nothing, exit 0 (unless --force)
 *   02 bootstrap   season ids ≠ config → RUN ABORT
 *   03 metas       wrong season/year/section → LEAGUE FREEZE (a)
 *   04 reported    unreadable table → SOURCE STALE (carried)
 *   05 schedules   failed feed → carried; ≥50% of a league's feeds → LEAGUE FREEZE (b)
 *   06 normalize   the MaxPreps claims: exclusions, phantom dedupe, carry-forward from stored claims
 *   07 official    the official step (steps/official.ts), injectable
 *   08 sblive      the si.com step (steps/sblive.ts), injectable
 *   09 secondary   VNN, CCS
 *   10 classify    classifyGames with the official step's degraded divisions
 *   11 guards      finals regression (c), frozen-league substitution, systemic RUN ABORT
 *   11b cifss      the cifsshome.org score cross-check (report only; never changes a game)
 *   11c results    corrections, level finals that must have a winner, tallies, and every final's GameResult
 *   12 standings   tables, cross-check, LeagueHealth
 *   13 assemble    parseSnapshot (failure → RUN ABORT), budgets, meta, summary
 *
 * The run keeps every source's rows as claims (lib/claims/) and writes the claims file beside the snapshot. Step 06
 * publishes from the MaxPreps claims: a feed this run did not read is carried from the claims the previous run
 * wrote. The evidence-only sources read their claims too: a school calendar that does not answer is carried from
 * what its games showed when last published (step 09), and step 11c weighs the cifsshome.org and box-score evidence
 * the claims hold. A bracket sheet tab not read is carried from the sheet's claims, and a game only the sheet has is a
 * fixture created from its row's claim (step 09). The other steps still work over the game list.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { CLAIMS_WARN_BYTES, claimsFileText, claimsPathOf, readClaimsFile } from '../claims/file';
import { boxEvidenceOf, recordBoxClaims } from '../claims/sources/box';
import { cifssEvidenceFrom, recordCifssClaims } from '../claims/sources/cifss';
import { decisionsFromOfficialStep, resolveOfficialStage, writeBackOfficialClaims } from '../claims/sources/official';
import { writeBackSheetClaims } from '../claims/sources/sds-sheet';
import { writeBackVnnClaims } from '../claims/sources/vnn';
import type { ClaimsFile } from '../claims/types';
import { carryCrossCheck } from '../crosscheck/crosscheck';
import { parseFetchedAtFlag, parseLeaguesFlag } from '../cli-flags';
import { localDateKey } from '../format';
import { ALL_DIVISIONS, LEAGUES, LEAGUE_IDS, isLeagueId } from '../leagues';
import { SDS_BRACKETS_FILE } from '../postseason/sds-brackets-file';
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
import { stepClassify } from './steps/classify';
import { markLeaguesNotInRun, stepGuards } from './steps/guards';
import { stepLeagueMeta } from './steps/league-meta';
import { stepNormalize } from './steps/normalize';
import { notAppliedReason } from './steps/official';
import { stepReported } from './steps/reported';
import { stepResults } from './steps/results';
import { boxEvidenceFrom, type BoxEvidence } from '../results/box-evidence';
import { stepSchedules } from './steps/schedules';
import { stepSecondary } from './steps/secondary';
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
}

/** A PipelineContext whose transport is metered and logs through the context. */
export function createPipelineContext(init: CreateContextInit): PipelineContext {
  let ctx: PipelineContext | null = null;
  const metered = new MeteredTransport(init.transport, (line) => ctx?.log(line));
  ctx = new PipelineContext({ args: init.args, transport: metered, previous: init.previous, sink: init.sink, claims: init.claims });
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

async function runSblive(
  ctx: PipelineContext,
  steps: PipelineSteps,
  games: Game[],
  unmatched: OfficialFixture[],
): Promise<SbliveStepResult> {
  try {
    return await steps.sblive(ctx, { games, unmatched });
  } catch (err) {
    if (err instanceof RunAbort) throw err;
    ctx.warn(`si.com step failed: ${(err as Error).message}`);
    // The previous report, keeping only rows still true of these games (no stale conflict rows).
    const prior = ctx.previous?.sbliveCrossCheck;
    return { games, unmatched, sbliveCrossCheck: prior ? carryCrossCheck(prior, games, []) : undefined };
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

  await stepBootstrap(ctx); // 02
  await stepLeagueMeta(ctx, state); // 03
  await stepReported(ctx, state); // 04
  await stepSchedules(ctx, state); // 05
  stepNormalize(ctx, state); // 06

  // 07 official (the injectable official step): its decisions applied to the stage's input; the rows it read are
  // kept for the official claims.
  const officialInput = state.games;
  const { games: officialGames, unmatched, decisions, fixtures: officialRows = [], readDivisions = new Set(), ...officialFlags } =
    await runOfficial(ctx, steps, officialInput);
  state.games = resolveOfficialStage(officialInput, decisions);
  state.unmatched = unmatched;
  state.official = officialFlags;
  ctx.shadow?.push({ stage: 'official', kind: 'resolve', input: officialInput, stepGames: officialGames, games: [...state.games] });

  // 08 sblive (the injectable si.com step)
  const sblive = await runSblive(ctx, steps, state.games, state.unmatched);
  state.games = sblive.games;
  state.unmatched = sblive.unmatched;
  state.sbliveCrossCheck = sblive.sbliveCrossCheck;

  // 09 secondary
  const { games: secondaryGames, ...ccs } = await stepSecondary(ctx, state.games);
  state.games = secondaryGames;
  state.secondary = ccs;

  // 10 classify
  state.games = stepClassify(ctx, state.games, state.official.degradedDivisions);

  // 11 guards (may throw RunAbort)
  stepGuards(ctx, state);

  // 11b cifsshome.org cross-check (over the games the snapshot will publish)
  state.cifssCrossCheck = await stepCifss(ctx, state);
  recordCifssClaims(ctx.claims, state.cifssCrossCheck);

  // 11c results: every final's recorded result, from everything the run now knows about it (corrections, a
  // level final that must have a winner, a tally read from a second source), before the standings count it.
  const box = ctx.args.fixtures ? undefined : boxEvidenceOnDisk();
  recordBoxClaims(ctx.claims, box, ctx.fetchedAt);
  const evidence = { cifss: cifssEvidenceFrom(ctx.claims, state.cifssCrossCheck), box: boxEvidenceOf(ctx.claims, box) };
  const resultsInput = state.games;
  state.games = stepResults(ctx, state.games, state.cifssCrossCheck, box, evidence);
  ctx.shadow?.push({
    stage: 'results',
    input: { games: resultsInput, cifssConflicts: state.cifssCrossCheck?.conflicts ?? [], box },
    games: [...state.games],
  });

  // 12 standings + health
  const table = stepStandings(ctx, state);

  // 13 assemble (may throw RunAbort)
  const { snapshot, meta } = stepAssemble(ctx, { state, table, requests: requestCounts(ctx.transport) });

  // The claims file beside the snapshot. Checked after the meta is built, so a size warning never moves meta.warnings.
  // What the bracket sheet's rows, the league schedules and each school calendar's games showed as published, for the
  // next run's carry. The sheet's go first: a `cifsds:` game's fixture is found by its sheet claim.
  writeBackSheetClaims(ctx.claims, snapshot.games, SDS_BRACKETS_FILE, sheetTabsRead(ctx), ctx.fetchedAt);
  writeBackOfficialClaims(ctx.claims, snapshot.games, snapshot.officialFixtures ?? [], { rows: officialRows, divisions: readDivisions }, ctx.fetchedAt);
  writeBackVnnClaims(ctx.claims, snapshot.games, vnnAnswered(ctx), ctx.fetchedAt);
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
  --out <path>                 snapshot path (default data/snapshot.json; the meta file goes beside it)
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
