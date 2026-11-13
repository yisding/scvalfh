/**
 * Reading a snapshot: `loadSnapshot` is the one entry point for a file from disk. A v1 file (no
 * `schemaVersion`) is upgraded in memory by lib/snapshot/snapshot-migrate.ts first, and so is a v2 file
 * written before a configured league existed (the "league added" upgrade).
 */

import { formatIssues } from '../schema-primitives';
import { SnapshotSchema } from './snapshot-invariants';
import {
  addConfiguredLeagues,
  isSnapshotV1,
  lacksConfiguredLeagues,
  migrateV1ToV2,
  needsLevelFinals,
  needsPlayoffGames,
  needsReclassification,
  rebuildPlayoffGames,
  reclassify,
  settleStoredLevelFinals,
} from './snapshot-migrate';
import type { Snapshot } from '../types';

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
 * reclassify; one holding a level final in a game that must have a winner as a tie → settleStoredLevelFinals;
 * then parseSnapshot. Used by lib/data.ts and the pipeline's readPrevious.
 */
export function loadSnapshot(raw: unknown): Snapshot {
  const v2 = isSnapshotV1(raw) ? migrateV1ToV2(raw) : raw;
  const complete = lacksConfiguredLeagues(v2) ? addConfiguredLeagues(v2) : v2;
  const classified = needsReclassification(complete) ? reclassify(complete) : complete;
  // Then, with the tags current, a level postseason final marked W and L becomes the marked side's win.
  const settled = needsLevelFinals(classified) ? settleStoredLevelFinals(classified) : classified;
  // Then `playoffs.games` from the (now current) tags: lib/postseason/ccs-bracket.ts is its one derivation.
  return parseSnapshot(needsPlayoffGames(settled) ? rebuildPlayoffGames(settled) : settled);
}
