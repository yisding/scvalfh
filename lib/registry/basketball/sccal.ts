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
 * si.com: each school's boys basketball team (`basketballSeedsOf`'s third argument: team id, the `<id>-<slug>` of its
 * games page and the school id in `team.school`), read 2026-11-21 from si.com's SCCAL boys basketball standings and
 * each team's own games page; never guessed. No VNN site ids (the school calendars are read for field hockey only).
 */

import { SCCAL_SOCCER_SEEDS } from '../soccer/sccal';
import type { Seed } from '../seed';
import { basketballSeedsOf } from './from-soccer';

export const SCCAL_BASKETBALL_SEEDS: readonly Seed[] = basketballSeedsOf(SCCAL_SOCCER_SEEDS, 'sccal', {
  aptos: { teamId: '158915', slug: '158915-aptos-mariners', schoolId: '12438' },
  harbor: { teamId: '160364', slug: '160364-harbor-pirates', schoolId: '13093' },
  'san-lorenzo-valley': { teamId: '160195', slug: '160195-san-lorenzo-valley-cougars', schoolId: '13014' },
  'santa-cruz': { teamId: '160369', slug: '160369-santa-cruz-cardinals', schoolId: '13094' },
  'scotts-valley': { teamId: '160555', slug: '160555-scotts-valley-falcons', schoolId: '13187' },
  soquel: { teamId: '160374', slug: '160374-soquel-knights', schoolId: '13095' },
});
