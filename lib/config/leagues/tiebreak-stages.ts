/**
 * A part of the league configuration package (lib/config/leagues.ts is its door; SPEC §2, DESIGN-socal §2.1).
 * This file (public): the tiebreak-stage sets the configuration rules are written in terms of. The assert
 * (./assert.ts) checks every chain against them; the standings engine and the snapshot check read the same sets and
 * the same chain listing.
 */

import type { LeagueConfig } from '@/lib/model/league-config';
import type { TiebreakStage } from '@/lib/model/standings';

/** The stages no computation can decide (a coin flip, CCS points, no rule): at most one, and it ends its chain. */
export const UNCOMPUTABLE_STAGES: ReadonlySet<TiebreakStage> = new Set<TiebreakStage>(['coin-flip', 'ccs-points', 'no-rule']);

/** The place-relative stages: allowed only in byBucketStart chains for buckets starting at 1st or 2nd. */
export const PLACE_VS_STAGES: ReadonlySet<TiebreakStage> = new Set<TiebreakStage>([
  'record-vs-higher-placed', 'record-vs-lower-placed',
]);

/** Every chain of a league with where it comes from: `null` = default, a number = byBucketStart key. */
export function tiebreakChains(league: LeagueConfig): Array<{ start: number | null; chain: readonly TiebreakStage[] }> {
  const out: Array<{ start: number | null; chain: readonly TiebreakStage[] }> = [
    { start: null, chain: league.rules.tiebreaks.default },
  ];
  for (const [key, chain] of Object.entries(league.rules.tiebreaks.byBucketStart ?? {})) {
    if (chain) out.push({ start: Number(key), chain });
  }
  return out;
}
