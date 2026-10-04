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
 *   06 normalize   + exclusions, phantom dedupe, carry-forward
 *   07 official    B2 (stepOfficial)
 *   08 sblive      B3 (stepSblive)
 *   09 secondary   VNN, CCS
 *   10 classify    classifyGames with the official step's degraded divisions
 *   11 guards      finals regression (c), frozen-league substitution, systemic RUN ABORT
 *   12 standings   tables, cross-check, LeagueHealth
 *   13 assemble    parseSnapshot (failure → RUN ABORT), budgets, meta, summary
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { carryCrossCheck } from '../crosscheck';
import { localDateKey } from '../format';
import { ALL_DIVISIONS, LEAGUES, LEAGUE_IDS, isLeagueId } from '../leagues';
import { loadSnapshot } from '../snapshot-schema';
import { stableStringify } from '../stable-json';
import type { Game, LeagueId, OfficialFixture, Snapshot } from '../types';
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
import { stepClassify } from './steps/classify';
import { markLeaguesNotInRun, stepGuards } from './steps/guards';
import { stepLeagueMeta } from './steps/league-meta';
import { stepNormalize } from './steps/normalize';
import { stepReported } from './steps/reported';
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

// ---------------------------------------------------------------- the run context

export interface CreateContextInit {
  args: RunArgs;
  /** The raw transport; it is wrapped in a MeteredTransport (request counts, `maxpreps GET` lines). */
  transport: Transport;
  previous: Snapshot | null;
  sink?: LogSink;
}

/** A PipelineContext whose transport is metered and logs through the context. */
export function createPipelineContext(init: CreateContextInit): PipelineContext {
  let ctx: PipelineContext | null = null;
  const metered = new MeteredTransport(init.transport, (line) => ctx?.log(line));
  ctx = new PipelineContext({ args: init.args, transport: metered, previous: init.previous, sink: init.sink });
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
 */
async function runOfficial(ctx: PipelineContext, steps: PipelineSteps, games: Game[]): Promise<OfficialStepResult> {
  try {
    return await steps.official(ctx, games);
  } catch (err) {
    if (err instanceof RunAbort) throw err;
    ctx.warn(`official step failed: ${(err as Error).message}`);
    const degraded = new Set<string>();
    for (const league of LEAGUES) {
      if (league.rules.classification !== 'official-fixtures' || !ctx.leaguesInRun().includes(league.id)) continue;
      for (const d of league.divisions) degraded.add(d.id);
      ctx.leagues.degrade(
        league.id,
        'degraded',
        `The official ${league.shortName} schedule could not be applied this run; league games are identified by MaxPreps' league flag this run.`,
        'official schedule not applied',
      );
    }
    return { games, unmatched: [], degradedDivisions: degraded, revisedUpstream: new Set(), carriedDivisions: new Set() };
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
    return { games, unmatched, crossCheck: prior ? carryCrossCheck(prior, games, []) : undefined };
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

  // 07 official (B2)
  state.official = await runOfficial(ctx, steps, state.games);
  state.games = state.official.games;
  state.unmatched = state.official.unmatched;

  // 08 sblive (B3)
  const sblive = await runSblive(ctx, steps, state.games, state.unmatched);
  state.games = sblive.games;
  state.unmatched = sblive.unmatched;
  state.crossCheck = sblive.crossCheck;

  // 09 secondary
  state.secondary = await stepSecondary(ctx, state.games);
  state.games = state.secondary.games;

  // 10 classify
  state.games = stepClassify(ctx, state.games, state.official.degradedDivisions);

  // 11 guards (may throw RunAbort)
  stepGuards(ctx, state);

  // 12 standings + health
  const table = stepStandings(ctx, state);

  // 13 assemble (may throw RunAbort)
  const { snapshot, meta } = stepAssemble(ctx, { state, table, requests: requestCounts(ctx.transport) });
  return { snapshot, meta, logLines: [...ctx.logLines] };
}

// ---------------------------------------------------------------- CLI plumbing (§7.12)

export const USAGE = `Usage: pnpm fetch-data [flags]

  --fixtures <dir>             offline: read a manifest-driven corpus instead of the network
  --variant <dir>              apply a variant overlay on top of --fixtures (repeatable)
  --capture <dir>              live: also record every response into a new corpus at <dir>
  --out <path>                 snapshot path (default data/snapshot.json; the meta file goes beside it)
  --dry-run                    validate and report, write nothing
  --fetched-at <iso>           pin the run's stamp (default: now; the corpus's stamp with --fixtures)
  --force                      run even outside the season window
  --leagues <a,b>              fetch only these leagues; the others are carried forward, frozen
  --accept-regression <a,b>    skip the finals-regression guard for these leagues, this run only
  --no-sblive                  skip si.com
  --sblive-full                also read every si.com team page (manual, never the cron default)
  --no-official                skip the official schedule sources (alias: --no-scval)
  --no-ccs                     skip the CCS calendar and bracket poll
  --no-vnn                     skip the VNN school calendars`;

function leagueList(value: string, flag: string): LeagueId[] {
  const ids = value.split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) throw new Error(`${flag} needs at least one league id`);
  for (const id of ids) {
    if (!isLeagueId(id)) throw new Error(`${flag}: unknown league ${id} (known: ${LEAGUE_IDS.join(', ')})`);
  }
  return ids;
}

export interface ParseOptions {
  cwd: string;
  /** The default `fetchedAt` for a live run (the CLI passes the wall clock; tests pin it). */
  now: string;
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
    out: path.join(opts.cwd, 'data', 'snapshot.json'),
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
      case '--fetched-at': {
        const v = next();
        if (!/^\d{4}-\d{2}-\d{2}T/.test(v) || Number.isNaN(Date.parse(v))) throw new Error(`--fetched-at: not an ISO timestamp: ${v}`);
        args.fetchedAt = v;
        break;
      }
      case '--force': args.force = true; break;
      case '--leagues': args.leagues = leagueList(next(), arg); break;
      case '--accept-regression': args.acceptRegression.push(...leagueList(next(), arg)); break;
      case '--no-sblive': args.sblive = false; break;
      case '--sblive-full': args.sbliveFull = true; break;
      case '--no-official':
      case '--no-scval': args.official = false; break;
      case '--no-ccs': args.ccs = false; break;
      case '--no-vnn': args.vnn = false; break;
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
 * the run starts from it (on a dry run it is read in place and nothing is written).
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
      args.capture !== null
        ? new RecordingTransport(inner, args.capture, {
            id: `capture-${localDateKey(args.fetchedAt)}`,
            fetchedAt: args.fetchedAt,
            leagues: args.leagues ?? [...LEAGUE_IDS],
          })
        : inner;
  }

  let previousFile: string | null = args.out;
  if (corpus?.previous) {
    if (args.dryRun) {
      previousFile = corpus.previous;
    } else {
      mkdirSync(path.dirname(args.out), { recursive: true });
      copyFileSync(corpus.previous, args.out);
      sink.log(`previous: started from ${path.relative(process.cwd(), corpus.previous)} (copied to ${path.relative(process.cwd(), args.out)})`);
    }
  }
  const previous = previousFile ? readPrevious(previousFile, sink) : null;
  const ctx = createPipelineContext({ args, transport, previous, sink });
  return { args, corpus, previousFile: previous ? previousFile : null, ctx };
}

export function metaPathOf(out: string): string {
  return out.replace(/\.json$/, '') + '.meta.json';
}

/** Writes snapshot.json and snapshot.meta.json (stable, key-sorted JSON). Returns the meta path. */
export function writeOutputs(out: string, result: PipelineResult): string {
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, stableStringify(result.snapshot), 'utf8');
  const metaPath = metaPathOf(out);
  writeFileSync(metaPath, stableStringify(result.meta), 'utf8');
  return metaPath;
}
