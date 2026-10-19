/**
 * Loading modules that read the snapshot at import time (lib/datasets/snapshot.ts and everything above it) against
 * a chosen snapshot: SCVAL_SNAPSHOT is stubbed to its file, the module registry is reset, and the
 * loaders then import a fresh module graph. {@link useCorpusModules} (a corpus's snapshot, built
 * once per run by tests/support/global-setup.ts) and {@link useSnapshotModules} (any snapshot file
 * the test writes itself) are the file-wide forms; the `with…` forms are their one-shot twins for a
 * second graph inside a test.
 */

import { afterAll, beforeAll, vi } from 'vitest';

import type { CorpusName } from './corpus';
import { corpusSnapshotPath } from './corpus-snapshot';

/** A hook budget for the first import of a heavy module graph (lib/queries/, the views, a route page) under a loaded machine. */
export const CORPUS_HOOK_TIMEOUT = 120_000;

/** Loaders by name: each `() => import('…')` of one module (or a function that builds on one). */
export type CorpusLoaders = Record<string, () => Promise<unknown>>;

/** What the loaders resolved to, keyed like the loaders. */
export type CorpusModules<L extends CorpusLoaders> = { [K in keyof L]: Awaited<ReturnType<L[K]>> };

/**
 * A snapshot file path; `null` for the committed data/snapshot.json (SCVAL_SNAPSHOT unset); or a
 * function that produces either (it runs when the modules are loaded, so it may write the file).
 */
export type SnapshotSource = string | null | (() => string | null | Promise<string | null>);

async function importAll<L extends CorpusLoaders>(source: SnapshotSource, loaders: L): Promise<CorpusModules<L>> {
  vi.stubEnv('SCVAL_SNAPSHOT', (typeof source === 'function' ? await source() : source) ?? undefined);
  vi.resetModules();
  const loaded: Record<string, unknown> = {};
  // In key order, so the first loader is the module the file imported first.
  for (const [name, load] of Object.entries(loaders)) loaded[name] = await load();
  return loaded as CorpusModules<L>;
}

function release(): void {
  vi.unstubAllEnvs();
  vi.resetModules();
}

/**
 * Points lib/datasets/snapshot.ts at `source` for the whole test file and imports `loaders` against it: a beforeAll
 * stubs SCVAL_SNAPSHOT, resets the module registry and awaits the loaders in key order; an afterAll
 * unstubs the variable and resets the registry again. Returns a holder whose properties are filled
 * in by the beforeAll, so read them inside tests and hooks, never at collection time. Call it at the
 * top of the file, before the file's own beforeAll (hooks run in registration order), which can
 * then build on the holder.
 */
export function useSnapshotModules<L extends CorpusLoaders>(source: SnapshotSource, loaders: L): CorpusModules<L> {
  const holder = {} as CorpusModules<L>;
  beforeAll(async () => {
    Object.assign(holder, await importAll(source, loaders));
  }, CORPUS_HOOK_TIMEOUT);
  afterAll(release);
  return holder;
}

/** {@link useSnapshotModules} over the snapshot of a corpus (SNAPSHOT_CORPORA in tests/support/global-setup.ts). */
export function useCorpusModules<L extends CorpusLoaders>(corpus: CorpusName, loaders: L): CorpusModules<L> {
  return useSnapshotModules(() => corpusSnapshotPath(corpus), loaders);
}

/**
 * The one-shot variant, for a second module graph inside a test or a hook: stubs SCVAL_SNAPSHOT,
 * resets the registry, awaits the loaders, and returns the modules with a `release()` that unstubs
 * the variable and resets the registry again (call it in a `finally`). The modules stay usable after
 * `release()` but no longer share a registry with later imports.
 */
export async function withSnapshotModules<L extends CorpusLoaders>(
  source: SnapshotSource,
  loaders: L,
): Promise<{ modules: CorpusModules<L>; release: () => void }> {
  return { modules: await importAll(source, loaders), release };
}

/** {@link withSnapshotModules} over the snapshot of a corpus. */
export function withCorpusModules<L extends CorpusLoaders>(corpus: CorpusName, loaders: L): Promise<{ modules: CorpusModules<L>; release: () => void }> {
  return withSnapshotModules(() => corpusSnapshotPath(corpus), loaders);
}
