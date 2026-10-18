/**
 * The snapshot's canonical form for the cron's "commit only if the content changed" guard: a hash
 * of the snapshot without its wall-clock stamps, published in snapshot.meta.json.
 */

import { createHash } from 'node:crypto';

import { type Snapshot } from '@/lib/model/snapshot';
import { stableStringify } from '@/lib/shared/stable-json';

/**
 * Any key that holds a run's wall-clock stamp rather than a fact about the season.
 *
 * Matched by SHAPE, not by an enumerated list, because an enumerated list is exactly how the hole
 * reopened once: the guard tested `key === 'fetchedAt'` while `sbliveCrossCheck.sbliveFetchedAt`
 * carried the same instant under a different name, so every live in-season run moved the hash and
 * the cron's "commit only if the content changed" guard never fired — a ~370-line timestamp-only
 * commit and a hosting rebuild, twice a day, for no change at all.
 */
const STAMP_KEY_RE = /fetchedat$/i;

/**
 * A SHA-256 over the snapshot with every wall-clock stamp removed.
 *
 * The snapshot stamps the run's clock in ~160 places — the top level, every game's `provenance`,
 * every `SourceStatus` row and the SBLive cross-check report — so two runs over IDENTICAL upstream
 * data never produce identical bytes. The cron's "commit the snapshot if it changed" guard
 * therefore has to compare content, not bytes; this hash is what it compares, and it is published
 * in snapshot.meta.json so the comparison needs nothing but the previous commit's meta file.
 */
export function snapshotContentHash(snapshot: Snapshot): string {
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (STAMP_KEY_RE.test(key)) continue;
        out[key] = strip(value);
      }
      return out;
    }
    return node;
  };
  return createHash('sha256').update(stableStringify(strip(snapshot))).digest('hex');
}
