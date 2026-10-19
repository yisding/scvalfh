/**
 * `loadSnapshot` is the one entry point for reading a file from disk: a v1 file (no
 * `schemaVersion`) is upgraded in memory by lib/snapshot/migrate.ts first, and so is a v2 file
 * written before a configured league existed (the "league added" upgrade).
 */

import { type Snapshot } from '@/lib/model/snapshot';
import { formatIssues } from '@/lib/schema/primitives';
import { SnapshotSchema } from './check';
import {
  addConfiguredLeagues,
  isSnapshotV1,
  lacksConfiguredLeagues,
  migrateV1ToV2,
  needsReclassification,
  reclassify,
} from './migrate';

/** Parse-or-throw (v2 only), with a readable message naming the first few failures. */
export function parseSnapshot(raw: unknown): Snapshot {
  const parsed = SnapshotSchema.safeParse(raw);
  if (!parsed.success) {
    const n = parsed.error.issues.length;
    throw new Error(
      `snapshot failed validation (${n} ${n === 1 ? 'issue' : 'issues'}):\n${formatIssues(parsed.error.issues)}`,
    );
  }
  return parsed.data;
}

/**
 * v1 (no schemaVersion) → migrateV1ToV2; a v2 written before a configured league existed →
 * addConfiguredLeagues; a v2 whose games no longer classify under the current rules or registry →
 * reclassify; then parseSnapshot. Used by lib/datasets/snapshot.ts and the pipeline's readPrevious.
 */
export function loadSnapshot(raw: unknown): Snapshot {
  const v2 = isSnapshotV1(raw) ? migrateV1ToV2(raw) : raw;
  const complete = lacksConfiguredLeagues(v2) ? addConfiguredLeagues(v2) : v2;
  return parseSnapshot(needsReclassification(complete) ? reclassify(complete) : complete);
}
