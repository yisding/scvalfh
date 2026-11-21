/**
 * The sixteen PAL boys basketball seeds, 2026-27 (the basketball build's registry: lib/teams.ts,
 * `SCVAL_SPORT=basketball`). Added with the SCCAL, the WCAL and the WBAL at the owner's request (2026-11-21).
 *
 * Division membership is the PAL's own: "Peninsula Athletic League Boys Basketball 2027", the Bay and Ocean
 * schedules linked from pal.smcoe.org/current/schedules (read 2026-11-21; lib/league-config/basketball/pal.ts names
 * them), and the CCS's League Placement and Classification by Sport 2026-27 holds the same:
 *   Bay  : Aragon, Burlingame, Carlmont, Half Moon Bay, Hillsdale, Menlo-Atherton, Sequoia, Woodside
 *   Ocean: Capuchino, El Camino, Jefferson, Mills, San Mateo, South San Francisco, Terra Nova, Westmoor
 * Half Moon Bay is in the Bay here and in the Ocean in girls soccer. MaxPreps' "Peninsula - Ocean" table (standings
 * read 2026-11-21) also lists Woodside; the league config records the difference.
 *
 * They are the sixteen schools of the soccer registry (lib/registry/soccer/pal.ts), so each seed is that school's
 * soccer seed on its basketball page (lib/registry/basketball/from-soccer.ts).
 *
 * No si.com or VNN ids: the basketball build reads neither.
 */

import { PAL_SOCCER_SEEDS } from '../soccer/pal';
import type { Seed } from '../seed';
import { basketballSeedsOf } from './from-soccer';

export const PAL_BASKETBALL_SEEDS: readonly Seed[] = [
  ...basketballSeedsOf(PAL_SOCCER_SEEDS, 'bay', [
    'aragon', 'burlingame', 'carlmont', 'half-moon-bay', 'hillsdale', 'menlo-atherton', 'sequoia', 'woodside',
  ]),
  ...basketballSeedsOf(PAL_SOCCER_SEEDS, 'ocean', [
    'capuchino', 'el-camino-ssf', 'jefferson', 'mills', 'san-mateo', 'south-san-francisco', 'terra-nova', 'westmoor',
  ]),
];
