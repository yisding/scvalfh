/**
 * The six SCCAL boys basketball seeds, 2026-27 (the basketball build's registry: lib/teams.ts,
 * `SCVAL_SPORT=basketball`). Added with the PAL, the WCAL and the WBAL at the owner's request (2026-11-21).
 *
 * Membership is the SCCAL's own: "SCCAL 2026-27 B & G Basketball (6 teams)", linked from sccal.org/sports-schedules/
 * (read 2026-11-21; lib/league-config/basketball/sccal.ts names it): Aptos, Harbor, San Lorenzo Valley, Santa Cruz,
 * Scotts Valley and Soquel. The CCS's League Placement and Classification by Sport 2026-27 and MaxPreps' "Santa Cruz
 * Coast" boys basketball table (standings read 2026-11-21) hold the same six.
 *
 * They are the six schools of the soccer registry (lib/registry/soccer/sccal.ts), so each seed is that school's
 * soccer seed on its basketball page (lib/registry/basketball/from-soccer.ts).
 *
 * No si.com or VNN ids: the basketball build reads neither.
 */

import { SCCAL_SOCCER_SEEDS } from '../soccer/sccal';
import type { Seed } from '../seed';
import { basketballSeedsOf } from './from-soccer';

export const SCCAL_BASKETBALL_SEEDS: readonly Seed[] = basketballSeedsOf(SCCAL_SOCCER_SEEDS, 'sccal', [
  'aptos', 'harbor', 'san-lorenzo-valley', 'santa-cruz', 'scotts-valley', 'soquel',
]);
