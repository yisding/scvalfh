/**
 * The six WCAL girls volleyball seeds, 2026 (the volleyball build's registry: lib/teams.ts,
 * `SCVAL_SPORT=volleyball`). Added with the WBAL at the owner's request (2026-11-14).
 *
 * Membership is the WCAL's own: the "2026 Composite Women's Varsity Volleyball Schedule" linked from
 * wcalsports.org/schedules/ has six columns (AM, AR, SHC, SF, SI, VC), and its final standings of October 28,
 * 2026 list the same six (read 2026-11-14; lib/league-config/volleyball/wcal.ts names them). MaxPreps' "West
 * Catholic" girls volleyball table (standings read 2026-11-14) holds the same six.
 *
 * They are the six schools of the soccer registry (lib/registry/soccer/wcal.ts), so each seed is that school's
 * soccer seed with its volleyball page: a school's id, slug, names, abbr, acronym, mascot, city, colors and
 * aliases are the school's, and soccer's file says where they come from. `maxprepsPath` is the school's MaxPreps
 * path with `/volleyball/` for `/soccer/girls/winter/`, which is each team's `canonicalUrl` on its MaxPreps
 * volleyball page (team-context, read 2026-11-14: all six agree; tests/volleyball.test.ts pins the six paths).
 *
 * No si.com or VNN ids: the volleyball build reads neither.
 */

import { WCAL_SOCCER_SEEDS } from '../soccer/wcal';
import type { Seed } from '../seed';

/** A school's soccer seed as its volleyball seed: the same school, on its MaxPreps volleyball page. */
export function volleyballSeedOf(seed: Seed, division: Seed['division']): Seed {
  if (!seed.maxprepsPath?.endsWith('/soccer/girls/winter/')) throw new Error(`${seed.slug}: not a girls soccer seed`);
  return { ...seed, division, maxprepsPath: seed.maxprepsPath.replace(/soccer\/girls\/winter\/$/, 'volleyball/') };
}

export const WCAL_VOLLEYBALL_SEEDS: readonly Seed[] = WCAL_SOCCER_SEEDS.map((seed) => volleyballSeedOf(seed, 'wcal'));
