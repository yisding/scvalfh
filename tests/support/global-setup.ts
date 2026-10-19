/**
 * Vitest `globalSetup`: runs the real cron script (`scripts/fetch-data.ts --fixtures …`) once over
 * every corpus the tests render against, before any test file starts, and hands the resulting
 * snapshot paths to the workers through `project.provide` (read back with `inject`, see
 * tests/support/corpus-snapshot.ts). Replaces the old mtime-keyed cache in os.tmpdir(): a snapshot
 * is rebuilt on EVERY `vitest run`, so it can never be stale against the code under test, and the
 * run removes its directory at the end.
 *
 * Runs in the main vitest process, outside any test file: it imports no module that registers test
 * hooks (tests/support/repo.ts registers an `afterAll` at import, tests/support/cli.ts imports
 * repo.ts), so the repo root, the fixture directories and the script path are spelled here; the
 * type-only import of CorpusName is erased.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { TestProject } from 'vitest/node';

import { readManifest } from '@/lib/pipeline/corpus';
import type { CorpusName } from './corpus';

declare module 'vitest' {
  interface ProvidedContext {
    /** Snapshot file per {@link keyOf} key of {@link SNAPSHOT_CORPORA}; its `*.meta.json` is beside it. */
    corpusSnapshots: Record<string, string>;
  }
}

/** One snapshot the setup builds: a corpus run through `fetch-data.ts`, with the run's extra flags. */
export interface SnapshotCorpus {
  corpus: CorpusName;
  extraArgs?: readonly string[];
}

/**
 * Every corpus snapshot a test reads through corpusSnapshotPath. A test asking for one that is not
 * listed here fails with the key to add.
 */
export const SNAPSHOT_CORPORA: readonly SnapshotCorpus[] = [
  { corpus: 'scval' },
  { corpus: 'all-2026-10-02' },
  { corpus: 'all-2026-10-02', extraArgs: ['--no-sblive'] },
  { corpus: 'eal-2026-10-04' },
  { corpus: 'socal-2026-10-06' },
];

/** The key a corpus run is provided under: the corpus name, then its extra flags. */
export function keyOf(corpus: CorpusName, extraArgs: readonly string[] = []): string {
  return [corpus, ...extraArgs].join(' ');
}

const REPO = path.resolve(import.meta.dirname, '..', '..');
const TSX = path.join(REPO, 'node_modules', '.bin', 'tsx');
/** SCRIPT_PATHS['fetch-data'] in tests/support/cli.ts (not importable here, see the header). */
const FETCH_DATA = path.join(REPO, 'scripts', 'fetch-data.ts');

/** The directory of a corpus; the `scval` corpus is the original capture (corpusDir in tests/support/corpus.ts). */
function dirOf(corpus: CorpusName): string {
  return corpus === 'scval' ? path.join(REPO, 'tests', 'fixtures', 'maxpreps') : path.join(REPO, 'tests', 'fixtures', 'corpus', corpus);
}

interface Finished {
  status: number | null;
  output: string;
}

function run(args: readonly string[]): Promise<Finished> {
  return new Promise((resolve, reject) => {
    const child = spawn(TSX, ['--tsconfig', path.join(REPO, 'tsconfig.json'), FETCH_DATA, ...args], { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    child.stdout.on('data', (c: Buffer) => chunks.push(c));
    child.stderr.on('data', (c: Buffer) => chunks.push(c));
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, output: Buffer.concat(chunks).toString('utf8') }));
  });
}

export default async function setup(project: TestProject): Promise<() => void> {
  const root = mkdtempSync(path.join(tmpdir(), 'scvalfh-corpora-'));
  const snapshots: Record<string, string> = {};
  try {
    await Promise.all(
      SNAPSHOT_CORPORA.map(async ({ corpus, extraArgs = [] }, i) => {
        const key = keyOf(corpus, extraArgs);
        const out = path.join(root, String(i), 'snapshot.json');
        const dir = dirOf(corpus);
        const finished = await run(['--fixtures', dir, '--out', out, '--fetched-at', readManifest(dir).fetchedAt, ...extraArgs]);
        if (finished.status !== 0) {
          throw new Error(`tests/support/global-setup.ts: scripts/fetch-data.ts exited ${finished.status} for corpus "${key}"\n${finished.output}`);
        }
        snapshots[key] = out;
      }),
    );
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
  project.provide('corpusSnapshots', snapshots);
  return () => rmSync(root, { recursive: true, force: true });
}
