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
 * si.com: each school's boys basketball team (`basketballSeedsOf`'s third argument: team id, the `<id>-<slug>` of its
 * games page and the school id in `team.school`), read 2026-11-21 from si.com's PAL Bay and Ocean boys basketball standings and
 * each team's own games page; never guessed. No VNN site ids (the school calendars are read for field hockey only).
 */

import { PAL_SOCCER_SEEDS } from '../soccer/pal';
import type { Seed } from '../seed';
import { basketballSeedsOf } from './from-soccer';

export const PAL_BASKETBALL_SEEDS: readonly Seed[] = [
  ...basketballSeedsOf(PAL_SOCCER_SEEDS, 'bay', {
    aragon: { teamId: '160227', slug: '160227-aragon-dons', schoolId: '13032' },
    burlingame: { teamId: '160233', slug: '160233-burlingame-panthers', schoolId: '13033' },
    carlmont: { teamId: '160610', slug: '160610-carlmont-scots', schoolId: '13207' },
    'half-moon-bay': { teamId: '153887', slug: '153887-half-moon-bay-cougars', schoolId: '10167' },
    hillsdale: { teamId: '160245', slug: '160245-hillsdale-fighting-knights', schoolId: '13035' },
    'menlo-atherton': { teamId: '160616', slug: '160616-menloatherton-bears', schoolId: '13208' },
    sequoia: { teamId: '160622', slug: '160622-sequoia-ravens', schoolId: '13210' },
    woodside: { teamId: '160628', slug: '160628-woodside-wildcats', schoolId: '13212' },
  }),
  ...basketballSeedsOf(PAL_SOCCER_SEEDS, 'ocean', {
    capuchino: { teamId: '160239', slug: '160239-capuchino-mustangs', schoolId: '13034' },
    'el-camino-ssf': { teamId: '160843', slug: '160843-el-camino-colts', schoolId: '13315' },
    jefferson: { teamId: '156818', slug: '156818-jefferson-grizzlies', schoolId: '11412' },
    mills: { teamId: '160251', slug: '160251-mills-vikings', schoolId: '13036' },
    'san-mateo': { teamId: '160257', slug: '160257-san-mateo-bearcats', schoolId: '13038' },
    'south-san-francisco': { teamId: '160849', slug: '160849-south-san-francisco-warriors', schoolId: '13316' },
    'terra-nova': { teamId: '156828', slug: '156828-terra-nova-tigers', schoolId: '11414' },
    westmoor: { teamId: '156834', slug: '156834-westmoor-rams', schoolId: '11416' },
  }),
];
