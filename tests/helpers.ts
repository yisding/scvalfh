/** Shared test helpers: the offline fixture corpora, the cron run over them, and the synthetic Game builder. */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, renameSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, vi } from 'vitest';

import { readManifest } from '../lib/pipeline/corpus';
import { PlayerStatsFileSchema, type PlayerStatsFile } from '../lib/player-stats-schema';
import { ScheduleResponseSchema, type ScheduleRow } from '../lib/sources/maxpreps';
import { TEAMS } from '../lib/teams';
import type { DivisionId, LeagueId } from '../lib/types';

export const REPO = path.resolve(import.meta.dirname, '..');
/** The original SCVAL capture directory (2026-09-29), now also the `scval` corpus (its manifest.json). */
export const FIXTURE_DIR = path.join(REPO, 'tests', 'fixtures', 'maxpreps');
export const CORPUS_ROOT = path.join(REPO, 'tests', 'fixtures', 'corpus');
export const VARIANTS_DIR = path.join(CORPUS_ROOT, 'variants');

export type CorpusName = 'scval' | 'all-2026-10-02' | 'eal-2026-10-04';

/** The EAL-only live capture (2026-10-04): the Eastern Athletic League's schedules, standings and si.com scoreboards. */
export const EAL_CORPUS: CorpusName = 'eal-2026-10-04';

/** The directory of a named corpus (SPEC §7.3, §12.1). */
export function corpusDir(corpus: CorpusName): string {
  return corpus === 'scval' ? FIXTURE_DIR : path.join(CORPUS_ROOT, corpus);
}

/** A variant overlay directory by name (`leland-feed-503`), or a path as given. */
export function variantDir(variant: string): string {
  return variant.includes('/') ? path.resolve(variant) : path.join(VARIANTS_DIR, variant);
}

/** Every captured SCVAL schedule row, exactly as the 15 live requests would return them. */
export function allScheduleRows(): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  for (const file of readdirSync(FIXTURE_DIR).filter((f) => f.startsWith('sched-')).sort()) {
    const raw = JSON.parse(readFileSync(path.join(FIXTURE_DIR, file), 'utf8')) as unknown;
    rows.push(...ScheduleResponseSchema.parse(raw).data);
  }
  return rows;
}

/**
 * Every schedule row of a corpus, feed by feed in registry order (optionally one league's teams
 * only), parsed but otherwise exactly as the live requests return them (TBA rows included).
 */
export function corpusRows(corpus: CorpusName, opts: { league?: LeagueId } = {}): ScheduleRow[] {
  const dir = corpusDir(corpus);
  const manifest = readManifest(dir);
  const rows: ScheduleRow[] = [];
  for (const team of TEAMS) {
    if (opts.league && team.league !== opts.league) continue;
    const file = manifest.files[`maxpreps/schedule/${team.slug}`];
    if (typeof file !== 'string') continue;
    const raw = JSON.parse(readFileSync(path.resolve(dir, file), 'utf8')) as unknown;
    rows.push(...ScheduleResponseSchema.parse(raw).data);
  }
  return rows;
}

/**
 * A raw MaxPreps standings response: 'da' / 'ec' are the 2026-09-29 SCVAL captures; a division id
 * reads the all-2026-10-02 corpus.
 */
export function standingsFixture(which: DivisionId | 'da' | 'ec'): unknown {
  const file =
    which === 'da' || which === 'ec'
      ? path.join(FIXTURE_DIR, `${which}.json`)
      : path.join(corpusDir('all-2026-10-02'), 'maxpreps', 'standings', `${which}.json`);
  return JSON.parse(readFileSync(file, 'utf8')) as unknown;
}

export interface BuildOptions {
  corpus?: CorpusName;
  /** Variant names under tests/fixtures/corpus/variants/, or paths. */
  variants?: readonly string[];
  /** Defaults to the corpus manifest's stamp. */
  fetchedAt?: string;
  extraArgs?: readonly string[];
  /** A snapshot file copied to `--out` before the run, so the run starts from it (readPrevious). */
  previous?: string;
}

export interface CliRun {
  /** The `--out` path (the meta file is beside it). */
  out: string;
  status: number | null;
  stdout: string;
  stderr: string;
  /** stdout + stderr (WARN lines go to stderr). */
  output: string;
}

/** The repo's tsx binary, which runs every scripts/*.ts CLI. */
export const TSX = path.join(REPO, 'node_modules', '.bin', 'tsx');

/**
 * Runs a repo script (a path relative to the repo, such as `scripts/fetch-rosters.ts`) under tsx
 * and returns what it printed. Never throws on a non-zero exit: callers assert on `status`. Only a
 * failure to spawn at all throws.
 */
export function runScript(
  script: string,
  args: readonly string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Omit<CliRun, 'out'> {
  const res = spawnSync(TSX, [path.resolve(REPO, script), ...args], {
    cwd: opts.cwd ?? REPO,
    env: opts.env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error) throw res.error;
  return { status: res.status, stdout: res.stdout, stderr: res.stderr, output: `${res.stdout}${res.stderr}` };
}

/**
 * Runs the real cron script (`scripts/fetch-data.ts --fixtures …`) over a corpus into a fresh temp
 * directory and returns what it printed. Never throws on a non-zero exit: callers assert on `status`.
 */
export function runFixtureCli(opts: BuildOptions = {}): CliRun {
  const corpus = opts.corpus ?? 'scval';
  const dir = mkdtempSync(path.join(tmpdir(), 'scvalfh-'));
  const out = path.join(dir, 'snapshot.json');
  if (opts.previous) copyFileSync(opts.previous, out);
  const fetchedAt = opts.fetchedAt ?? readManifest(corpusDir(corpus)).fetchedAt;
  const run = runScript('scripts/fetch-data.ts', [
    '--fixtures',
    corpusDir(corpus),
    ...(opts.variants ?? []).flatMap((v) => ['--variant', variantDir(v)]),
    '--out',
    out,
    '--fetched-at',
    fetchedAt,
    ...(opts.extraArgs ?? []),
  ]);
  return { out, ...run };
}

/**
 * Build a snapshot from a corpus by running the real cron script into a fresh temp directory.
 * Returns the snapshot's path (the meta file is beside it). Throws, with the script's output, when
 * the run exits non-zero. A string argument is the legacy form: the SCVAL corpus at that `fetchedAt`.
 */
export function buildFixtureSnapshot(opts: BuildOptions | string = {}): string {
  const o: BuildOptions = typeof opts === 'string' ? { fetchedAt: opts } : opts;
  const run = runFixtureCli(o);
  if (run.status !== 0) {
    throw new Error(`tests/helpers.ts: scripts/fetch-data.ts exited ${run.status}\n${run.output}`);
  }
  return run.out;
}

// ---------------------------------------------------------------- the cached corpus snapshot

/** Every file under `dir` (recursively) as `path:mtimeMs:size`, sorted. */
function treeStamp(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    const st = statSync(file);
    out.push(`${path.relative(REPO, file)}:${st.mtimeMs}:${st.size}`);
  }
  return out.sort();
}

const corpusSnapshotMemo = new Map<string, string>();

/**
 * The snapshot of a whole corpus run (the real cron script, the corpus's own `fetchedAt`), built
 * once into os.tmpdir() and reused afterwards — by later calls in this process and by later test
 * files and runs. The cache key hashes the manifest, the run's extra flags and the mtimes of
 * lib/**, scripts/fetch-data.ts, scripts/cli.ts and data/official/**, so any change to the pipeline
 * or the corpus rebuilds it. Stage C tests set `process.env.SCVAL_SNAPSHOT = corpusSnapshotPath('all-2026-10-02')`
 * and then dynamically import lib/data. The meta file is beside it (`*.meta.json`).
 */
export function corpusSnapshotPath(corpus: CorpusName, opts: { extraArgs?: readonly string[] } = {}): string {
  const extraArgs = [...(opts.extraArgs ?? [])];
  const manifest = path.join(corpusDir(corpus), 'manifest.json');
  const hash = createHash('sha256');
  hash.update(readFileSync(manifest));
  hash.update(`\0${JSON.stringify(extraArgs)}\0`);
  for (const line of [
    ...treeStamp(path.join(REPO, 'lib')),
    ...treeStamp(path.join(REPO, 'data', 'official')),
    ...treeStamp(path.join(corpusDir(corpus))),
  ]) {
    hash.update(`${line}\n`);
  }
  for (const file of [path.join(REPO, 'scripts', 'fetch-data.ts'), path.join(REPO, 'scripts', 'cli.ts')]) hash.update(`${file}:${statSync(file).mtimeMs}\n`);
  const key = `${corpus}-${hash.digest('hex').slice(0, 16)}`;

  const memo = corpusSnapshotMemo.get(key);
  if (memo && existsSync(memo)) return memo;

  const target = path.join(tmpdir(), `scvalfh-corpus-${key}.json`);
  const targetMeta = target.replace(/\.json$/, '.meta.json');
  if (!existsSync(target) || !existsSync(targetMeta)) {
    const built = buildFixtureSnapshot({ corpus, extraArgs });
    // Atomic publish: another test worker may be building the same key concurrently; both
    // results are identical, so whichever rename lands last is fine. The meta file goes first,
    // so a reader that sees the snapshot also sees its meta.
    renameSync(built.replace(/\.json$/, '.meta.json'), targetMeta);
    renameSync(built, target);
  }
  corpusSnapshotMemo.set(key, target);
  return target;
}

/**
 * Build data/player-stats.json from the 2026-10-02 stats captures (the SCVAL teams') by running the
 * real script, and return it; every other team is 'pending'. Tests that assert specific numbers
 * read this, never the committed file, which the scheduled refresh rewrites whenever a coach
 * enters a game.
 */
export function buildFixturePlayerStats(fetchedAt = '2026-10-02T14:00:00.000Z'): PlayerStatsFile {
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'scvalfh-stats-')), 'player-stats.json');
  const run = runScript('scripts/fetch-player-stats.ts', [
    '--fixtures',
    FIXTURE_DIR,
    // The captures are SCVAL's; the other leagues' teams come out as 'pending'.
    '--leagues',
    'scval',
    '--out',
    out,
    '--fetched-at',
    fetchedAt,
  ]);
  if (run.status !== 0) {
    throw new Error(`tests/helpers.ts: scripts/fetch-player-stats.ts exited ${run.status}\n${run.output}`);
  }
  return PlayerStatsFileSchema.parse(JSON.parse(readFileSync(out, 'utf8')) as unknown);
}

/**
 * Points lib/data at a corpus snapshot for the whole test file: a beforeAll stubs SCVAL_SNAPSHOT
 * with corpusSnapshotPath(corpus) (building it if no cached copy is current) and resets the module
 * registry, and an afterAll restores the variable and resets it again. Call it at the top of the
 * file, before the file's own beforeAll, which then dynamically imports lib/data and its readers.
 */
export function stubCorpusSnapshot(corpus: CorpusName): void {
  beforeAll(() => {
    vi.stubEnv('SCVAL_SNAPSHOT', corpusSnapshotPath(corpus));
    vi.resetModules();
  }, 600_000);
  afterAll(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });
}

// ---------------------------------------------------------------- synthetic games

/** The schema-valid synthetic Game builder lives in ./game-builder (SPEC §12.2). */
export { game, type GameSpec } from './game-builder';
