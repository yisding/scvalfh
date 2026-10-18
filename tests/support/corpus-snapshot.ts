/** The snapshot a whole corpus produces through the real cron script, cached across test files and runs. */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, renameSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, vi } from 'vitest';

import { SCRIPT_PATHS, buildFixtureSnapshot } from '@/tests/support/cli';
import { corpusDir, type CorpusName } from '@/tests/support/corpus';
import { REPO } from '@/tests/support/repo';

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
 * or the corpus rebuilds it. A test file that renders against a corpus points lib/data at it with
 * `stubCorpusSnapshot(corpus)` below (which stubs SCVAL_SNAPSHOT to this path and resets the module
 * cache) and then dynamically imports lib/data. The meta file is beside it (`*.meta.json`).
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
  for (const file of [path.join(REPO, SCRIPT_PATHS['fetch-data']), path.join(REPO, 'scripts', 'cli.ts')]) hash.update(`${file}:${statSync(file).mtimeMs}\n`);
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
