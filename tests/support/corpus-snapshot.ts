/**
 * The snapshot a whole corpus produces through the real cron script. vitest's `globalSetup`
 * (tests/support/global-setup.ts) builds each corpus of SNAPSHOT_CORPORA once per `vitest run`,
 * before any test file starts; a test file reads the path here. Nothing is cached across runs.
 */

import { inject } from 'vitest';

import type { CorpusName } from '@/tests/support/corpus';
import { keyOf } from '@/tests/support/global-setup';

/**
 * The snapshot of a whole corpus run (the real cron script, the corpus's own `fetchedAt`) that
 * global-setup built for this `vitest run`; the meta file is beside it (`*.meta.json`). A test file
 * that renders against a corpus points lib/datasets/snapshot.ts at it with `useCorpusModules`
 * (tests/support/corpus-modules.ts). The corpus and flags must be listed in SNAPSHOT_CORPORA.
 */
export function corpusSnapshotPath(corpus: CorpusName, opts: { extraArgs?: readonly string[] } = {}): string {
  const key = keyOf(corpus, opts.extraArgs);
  const file = inject('corpusSnapshots')[key];
  if (file === undefined) throw new Error(`tests/support/corpus-snapshot.ts: no snapshot for "${key}"; add it to SNAPSHOT_CORPORA in tests/support/global-setup.ts`);
  return file;
}
