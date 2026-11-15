/**
 * Fixture ids: this site's own name for a game, minted once from the claim that created the fixture and
 * never changed afterwards, even when a later run corrects the date. The id reads like a game slug,
 * `${dateKey}-${away}-at-${home}`, with each side by its registry slug or, for a school outside the registry, by
 * the name key the cross-source joins use (lib/teams.ts sideJoinKey). Two games of one pair on one day (a
 * doubleheader) are told apart by a `~2`, `~3` suffix in minting order. Never published. Pure.
 */

import { sideJoinKey } from '../teams';
import type { GameSide } from '../types';
import type { FixtureId } from './types';

/** A side's key in a fixture id: the registry slug, else `name:<letters and digits>`. */
export function fixtureSideKey(side: Pick<GameSide, 'slug' | 'name'>): string {
  return sideJoinKey(side);
}

/** `${dateKey}-${away}-at-${home}`, the id a fixture is minted from before any collision suffix. */
export function baseFixtureId(dateKey: string, away: string, home: string): FixtureId {
  return `${dateKey}-${away}-at-${home}`;
}

/** `base` when no fixture holds it, else the first of `base~2`, `base~3` … that none holds. */
export function mintFixtureId(base: FixtureId, taken: ReadonlySet<FixtureId>): FixtureId {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const id = `${base}~${n}`;
    if (!taken.has(id)) return id;
  }
}
