/**
 * The eight WBAL boys basketball seeds, 2026-27 (the basketball build's registry: lib/teams.ts,
 * `SCVAL_SPORT=basketball`). Added with the WCAL, the PAL and the SCCAL at the owner's request (2026-11-21).
 *
 * Membership is the WBAL's own: "2026-27 WBAL Boys Basketball Standings" (hs.wbalsports.org/bbstb.html) and the
 * schedule it links (read 2026-11-21; lib/league-config/basketball/wbal.ts names them), one table of eight: Crystal
 * Springs Uplands, Eastside College Prep, Harker, The King's Academy, Menlo, Pinewood, Priory and Sacred Heart Prep.
 * The CCS's League Placement and Classification by Sport 2026-27 and MaxPreps' "West Bay" boys basketball table
 * (standings read 2026-11-21) hold the same eight.
 *
 * They are eight of the soccer registry's WBAL schools (lib/registry/soccer/wbal.ts), so each seed is that school's
 * soccer seed on its basketball page (lib/registry/basketball/from-soccer.ts).
 *
 * si.com: each school's boys basketball team (`basketballSeedsOf`'s third argument: team id, the `<id>-<slug>` of its
 * games page and the school id in `team.school`), read 2026-11-21 from si.com's WBAL boys basketball standings and
 * each team's own games page; never guessed. No VNN site ids (the school calendars are read for field hockey only).
 */

import { WBAL_SOCCER_SEEDS } from '../soccer/wbal';
import type { Seed } from '../seed';
import { basketballSeedsOf } from './from-soccer';

export const WBAL_BASKETBALL_SEEDS: readonly Seed[] = basketballSeedsOf(WBAL_SOCCER_SEEDS, 'wbal', {
  'crystal-springs': { teamId: '207226', slug: '207226-crystal-springs-uplands-gryphons', schoolId: '31791' },
  eastside: { teamId: '152014', slug: '152014-eastside-college-prep-panthers', schoolId: '8762' },
  harker: { teamId: '141192', slug: '141192-harker-eagles', schoolId: '203' },
  'kings-academy': { teamId: '207497', slug: '207497-kings-academy-knights', schoolId: '31874' },
  menlo: { teamId: '141237', slug: '141237-menlo-school-knights', schoolId: '229' },
  pinewood: { teamId: '207757', slug: '207757-pinewood-panthers', schoolId: '31964' },
  priory: { teamId: '141021', slug: '141021-woodside-priory-panthers', schoolId: '156' },
  'sacred-heart-prep': { teamId: '141058', slug: '141058-sacred-heart-prep-gators', schoolId: '165' },
});
