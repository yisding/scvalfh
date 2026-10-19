/**
 * The CLI plumbing of `scripts/fetch-data.ts` (SPEC §7.12): argument parsing, the transport for the
 * run, the previous snapshot (through loadSnapshot, so a v1 file is migrated), the context, and
 * writing the two output files. The pipeline itself is lib/pipeline/run.ts.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { type FlagSpec, parseFlags } from '@/lib/cli/flags';
import { LEAGUE_IDS, isLeagueId } from '@/lib/config/leagues';
import type { Snapshot } from '@/lib/model/snapshot';
import { localDateKey } from '@/lib/shared/dates';
import { stableStringify } from '@/lib/shared/stable-json';
import { loadSnapshot } from '@/lib/snapshot/load';

import { CONSOLE_SINK, createPipelineContext, type LogSink, type PipelineContext } from './context';
import type { PipelineResult, RunArgs, Transport } from './contract';
import { loadCorpus, type Corpus } from './corpus';
import { FixtureTransport, LiveTransport, RecordingTransport } from './transport';

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

type ParsedRunArgs = RunArgs & { help: boolean };

/** The §7.12 flags and what each sets (--no-scval is the old spelling of --no-official). */
const RUN_FLAGS: FlagSpec<ParsedRunArgs> = [
  { flags: '--fixtures', value: 'path', set: (a, v) => { a.fixtures = v; } },
  { flags: '--variant', value: 'path', set: (a, v) => { a.variants.push(v); } },
  { flags: '--capture', value: 'path', set: (a, v) => { a.capture = v; } },
  { flags: '--out', value: 'path', set: (a, v) => { a.out = v; } },
  { flags: '--dry-run', toggle: (a) => { a.dryRun = true; } },
  { flags: '--fetched-at', value: 'iso', set: (a, v) => { a.fetchedAt = v; } },
  { flags: '--force', toggle: (a) => { a.force = true; } },
  { flags: '--leagues', value: 'leagues', set: (a, v) => { a.leagues = v; } },
  { flags: '--accept-regression', value: 'leagues', set: (a, v) => { a.acceptRegression.push(...v); } },
  { flags: '--no-sblive', toggle: (a) => { a.sblive = false; } },
  { flags: '--sblive-full', toggle: (a) => { a.sbliveFull = true; } },
  { flags: ['--no-official', '--no-scval'], toggle: (a) => { a.official = false; } },
  { flags: '--no-ccs', toggle: (a) => { a.ccs = false; } },
  { flags: '--no-vnn', toggle: (a) => { a.vnn = false; } },
  { flags: '--no-cifss', toggle: (a) => { a.cifss = false; } },
  { flags: ['--help', '-h'], toggle: (a) => { a.help = true; } },
];

/**
 * Parses the §7.12 flags. `fetchedAt` is left as '' when not given and the run is offline, so the
 * caller can default it to the corpus's stamp. Throws on an unknown flag or a bad value.
 */
export function parseRunArgs(argv: readonly string[], opts: ParseOptions): ParsedRunArgs {
  const args = parseFlags(argv, RUN_FLAGS, {
    init: () => ({
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
      cifss: true,
      help: false,
    }),
    allowEmptyValue: true,
    cwd: opts.cwd,
  });
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
