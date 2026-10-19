/**
 * The ratings over the bundled data: the Elo table (lib/engine/ratings.ts, DESIGN §20) over the bundled
 * snapshot and prior season, and the Elo-adjusted scoring (lib/engine/adjusted-scoring.ts, DESIGN §27)
 * over the bundled snapshot and that Elo table. Each is computed once per process and shared, so both
 * are read-only. The engines stay pure; this module is where the snapshot meets them.
 */

import { getPriorSeason } from '@/lib/datasets/prior-season';
import { getSnapshot } from '@/lib/datasets/snapshot';
import { type AdjustedScoring, computeAdjustedScoring } from '@/lib/engine/adjusted-scoring';
import { type RatingTable, computeRatings } from '@/lib/engine/ratings';
import type { TeamId } from '@/lib/model/ids';

let bundledRatings: RatingTable | null = null;

/** The ratings over the bundled snapshot and prior season, computed once per process. */
export function getRatings(): RatingTable {
  if (!bundledRatings) {
    const snapshot = getSnapshot();
    bundledRatings = computeRatings(snapshot.teams, snapshot.games, getPriorSeason());
  }
  return bundledRatings;
}

let bundledScoring: ReadonlyMap<TeamId, AdjustedScoring> | null = null;

/** The adjusted scoring over the bundled snapshot and Elo table, computed once per process; read-only, as it is shared. */
export function getAdjustedScoring(): ReadonlyMap<TeamId, AdjustedScoring> {
  if (!bundledScoring) {
    const snapshot = getSnapshot();
    bundledScoring = computeAdjustedScoring(snapshot.teams, snapshot.games, getRatings());
  }
  return bundledScoring;
}
