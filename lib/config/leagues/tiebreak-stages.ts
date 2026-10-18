/**
 * A part of the league configuration package (lib/config/leagues.ts is its door; SPEC §2, DESIGN-socal §2.1).
 * This file (public): the tiebreak-stage sets the configuration rules are written in terms of. The assert
 * (./assert.ts) checks every chain against them.
 */

import type { TiebreakStage } from '@/lib/model/standings';

/** The stages no computation can decide (a coin flip, CCS points, no rule): at most one, and it ends its chain. */
export const UNCOMPUTABLE_STAGES: ReadonlySet<TiebreakStage> = new Set<TiebreakStage>(['coin-flip', 'ccs-points', 'no-rule']);

/** The place-relative stages: allowed only in byBucketStart chains for buckets starting at 1st or 2nd. */
export const PLACE_VS_STAGES: ReadonlySet<TiebreakStage> = new Set<TiebreakStage>([
  'record-vs-higher-placed', 'record-vs-lower-placed',
]);
