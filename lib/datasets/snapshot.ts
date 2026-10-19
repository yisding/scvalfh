/**
 * The snapshot dataset: data/snapshot.json, loaded through this module only. The site-facing read
 * API over it (SPEC §13.3) is lib/queries/; every page and component reads the snapshot through those
 * modules.
 *
 * The snapshot is loaded and validated ONCE at module scope: bundled into the server code at build
 * time, and a schema failure surfaces at import time rather than half-way through a render. A v1
 * file (written before the multi-league schema) is upgraded in memory by `loadSnapshot`.
 *
 * "Today" is ALWAYS derived from `snapshot.fetchedAt` in America/Los_Angeles — never from
 * Date.now() — so a build is reproducible and every "as of" label is honest (BUILD-BRIEF).
 */

import bundledSnapshot from '@/data/snapshot.json';
import type { Snapshot } from '@/lib/model/snapshot';
import { localDateKey } from '@/lib/shared/dates';
import { loadSnapshot } from '@/lib/snapshot/load';

import { readDatasetRaw } from './read';

/**
 * data/snapshot.json is IMPORTED, so every toolchain bundles it into the server code at build time:
 * Turbopack for `next build`, Vite/Rolldown for vinext's Node server and its Cloudflare Worker.
 * Nothing reads data/ from disk at run time. That is what lets the Worker start at all: workerd's
 * node:fs sees only /bundle, /tmp and /dev, and this module runs as a Worker instance starts (the
 * root layout and the dynamic metadata routes import it), so the old
 * `readFileSync(path.join(process.cwd(), 'data', 'snapshot.json'))` threw before any request was
 * served. A missing file is now a build error (the import does not resolve): run `pnpm fetch-data`
 * first.
 *
 * SCVAL_SNAPSHOT still swaps in another file (tests, a --out build), read with node:fs when this
 * module loads. It needs a real filesystem: next start, vinext start, vitest and tsx, never a
 * Worker. Both paths go through `loadSnapshot`, so a v1 file is migrated in memory (SPEC §4.3).
 */
function load(): Snapshot {
  return loadSnapshot(
    readDatasetRaw({
      env: 'SCVAL_SNAPSHOT',
      bundled: bundledSnapshot,
      owner: 'lib/datasets/snapshot.ts',
      malformedOverride: 'propagate',
    }),
  );
}

const snapshot = load();

// ---------------------------------------------------------------- basics

export function getSnapshot(): Snapshot {
  return snapshot;
}

export function getFetchedAt(): string {
  return snapshot.fetchedAt;
}

/** 'YYYY-MM-DD' in America/Los_Angeles, derived from the snapshot stamp. */
export function getToday(): string {
  return localDateKey(snapshot.fetchedAt);
}
