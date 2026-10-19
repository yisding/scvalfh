/**
 * Running the repo's CLIs (`scripts/*.ts`, and `lib/datasets/rosters.ts` for its import-time checks) from tests.
 *
 * Every spawn goes through {@link runScript}, which names the repo's tsconfig explicitly: tsx reads
 * tsconfig.json (and with it the `@/` paths every repo module imports through) from the cwd, and the
 * tests spawn scripts from temp directories. {@link SCRIPT_PATHS} is the one place a test names a
 * script file, so moving a script edits this table and nothing else.
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync } from 'node:fs';
import path from 'node:path';

import { expect } from 'vitest';

import { readManifest } from '@/lib/pipeline/corpus';
import { type PlayerStatsFile, PlayerStatsFileSchema } from '@/lib/schema/player-stats';
import { FIXTURE_DIR, corpusDir, variantDir, type CorpusName } from '@/tests/support/corpus';
import { REPO, TSX, readJson, tempDir } from '@/tests/support/repo';

/** What a finished script printed. Never thrown for a non-zero exit: callers assert on `status`. */
export interface ScriptRun {
  status: number | null;
  stdout: string;
  stderr: string;
  /** stdout + stderr (WARN lines go to stderr). */
  output: string;
}

export interface CliRun extends ScriptRun {
  /** The `--out` path (the meta file is beside it). */
  out: string;
}

/** Every script a test runs, by short name: the repo-relative path of its entry file. */
export const SCRIPT_PATHS = {
  'fetch-data': 'scripts/fetch-data.ts',
  'fetch-rosters': 'scripts/fetch-rosters.ts',
  'fetch-player-stats': 'scripts/fetch-player-stats.ts',
  'fetch-jv': 'scripts/fetch-jv.ts',
  'build-history': 'scripts/build-history.ts',
  'build-official-fixtures': 'scripts/build-official-fixtures.ts',
  'assert-prerender': 'scripts/assert-prerender.ts',
  'assert-vinext-prerender': 'scripts/assert-vinext-prerender.ts',
  // Not a CLI: a module whose import-time checks exit the process, spawned once to prove that.
  'rosters-module': 'lib/datasets/rosters.ts',
} as const;

export type ScriptName = keyof typeof SCRIPT_PATHS;

/**
 * Runs a repo script (a path relative to the repo, such as `scripts/fetch-rosters.ts`) under tsx
 * and returns what it printed. Never throws on a non-zero exit: callers assert on `status`. Only a
 * failure to spawn at all throws.
 */
export function runScript(script: string, args: readonly string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): ScriptRun {
  const res = spawnSync(TSX, ['--tsconfig', path.join(REPO, 'tsconfig.json'), path.resolve(REPO, script), ...args], {
    cwd: opts.cwd ?? REPO,
    env: opts.env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error) throw res.error;
  return { status: res.status, stdout: res.stdout, stderr: res.stderr, output: `${res.stdout}${res.stderr}` };
}

export interface RepoScriptOptions {
  /** `--fixtures <dir>`: read the captures instead of the network. */
  fixtures?: string;
  /** `--leagues <list>`. */
  leagues?: string;
  /** `--out <file>`. */
  out?: string;
  /** `--fetched-at <iso>`. */
  fetchedAt?: string;
  /** Anything after the flags above, in order. */
  extra?: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

/**
 * {@link runScript} by short name, with the flags every fetch script shares in their usual order
 * (`--fixtures`, `--leagues`, `--out`, `--fetched-at`, then `extra`). A flag whose option is left out
 * is not passed.
 */
export function runRepoScript(name: ScriptName, opts: RepoScriptOptions = {}): ScriptRun {
  const args = [
    ...(opts.fixtures === undefined ? [] : ['--fixtures', opts.fixtures]),
    ...(opts.leagues === undefined ? [] : ['--leagues', opts.leagues]),
    ...(opts.out === undefined ? [] : ['--out', opts.out]),
    ...(opts.fetchedAt === undefined ? [] : ['--fetched-at', opts.fetchedAt]),
    ...(opts.extra ?? []),
  ];
  return runScript(SCRIPT_PATHS[name], args, { cwd: opts.cwd, env: opts.env });
}

/** Asserts a run exited 0, printing everything it said when it did not. */
export function expectOk(run: Pick<ScriptRun, 'status' | 'output'>): void {
  expect(run.status, run.output).toBe(0);
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

/**
 * Runs the real cron script (`scripts/fetch-data.ts --fixtures …`) over a corpus into a fresh temp
 * directory and returns what it printed. Never throws on a non-zero exit: callers assert on `status`.
 */
export function runFixtureCli(opts: BuildOptions = {}): CliRun {
  const corpus = opts.corpus ?? 'scval';
  const out = path.join(tempDir('cli'), 'snapshot.json');
  if (opts.previous) copyFileSync(opts.previous, out);
  const fetchedAt = opts.fetchedAt ?? readManifest(corpusDir(corpus)).fetchedAt;
  const run = runRepoScript('fetch-data', {
    extra: [
      '--fixtures',
      corpusDir(corpus),
      ...(opts.variants ?? []).flatMap((v) => ['--variant', variantDir(v)]),
      '--out',
      out,
      '--fetched-at',
      fetchedAt,
      ...(opts.extraArgs ?? []),
    ],
  });
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
    throw new Error(`tests/support/cli.ts: ${SCRIPT_PATHS['fetch-data']} exited ${run.status}\n${run.output}`);
  }
  return run.out;
}

/**
 * Build data/player-stats.json from the 2026-10-02 stats captures (the SCVAL teams') by running the
 * real script, and return it; every other team is 'pending'. Tests that assert specific numbers
 * read this, never the committed file, which the scheduled refresh rewrites whenever a coach
 * enters a game.
 */
export function buildFixturePlayerStats(fetchedAt = '2026-10-02T14:00:00.000Z'): PlayerStatsFile {
  const out = path.join(tempDir('stats'), 'player-stats.json');
  const run = runRepoScript('fetch-player-stats', {
    fixtures: FIXTURE_DIR,
    // The captures are SCVAL's; the other leagues' teams come out as 'pending'.
    leagues: 'scval',
    out,
    fetchedAt,
  });
  if (run.status !== 0) {
    throw new Error(`tests/support/cli.ts: ${SCRIPT_PATHS['fetch-player-stats']} exited ${run.status}\n${run.output}`);
  }
  return PlayerStatsFileSchema.parse(readJson(out));
}
