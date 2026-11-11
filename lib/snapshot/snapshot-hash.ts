/** The snapshot's canonical content hash: what the cron compares to decide whether the data changed. */

import { createHash } from 'node:crypto';

import { stableStringify } from '../stable-json';
import type { Snapshot } from '../types';

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
/**
 * The same run-clock leak in fields that are not stamps by name, so STAMP_KEY_RE cannot see them.
 *
 * - A source row's `url` and `error` text can carry the run's DATE: cifsshome.org's request asks for
 *   `date_to=<today>`, and a season-gated source's error reads "polling opens … (today <date>)". A row
 *   whose fetch really changed still moves the hash through `status`, `httpStatus` and `rowCount`.
 * - A league's `lastFreshAt` is the run's clock on every fresh run, but whether it is set at all is a
 *   fact (lib/pipeline/ledger.ts reads null as "no data to carry"), so only that is kept.
 *
 * Without this the soccer and basketball refreshes committed (and every host rebuilt) a snapshot whose
 * only change was the date, every day of the off-season gate.
 */
function withoutRunDate(snapshot: Snapshot): unknown {
  return {
    ...snapshot,
    sources: snapshot.sources.map((row) => ({ ...row, url: undefined, error: undefined })),
    leagueHealth: snapshot.leagueHealth.map((h) => ({ ...h, lastFreshAt: h.lastFreshAt !== null })),
  };
}

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
  return createHash('sha256').update(stableStringify(strip(withoutRunDate(snapshot)))).digest('hex');
}
