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
 * No si.com or VNN ids: the basketball build reads neither.
 */

import { WBAL_SOCCER_SEEDS } from '../soccer/wbal';
import type { Seed } from '../seed';
import { basketballSeedsOf } from './from-soccer';

export const WBAL_BASKETBALL_SEEDS: readonly Seed[] = basketballSeedsOf(WBAL_SOCCER_SEEDS, 'wbal', [
  'crystal-springs', 'eastside', 'harker', 'kings-academy', 'menlo', 'pinewood', 'priory', 'sacred-heart-prep',
]);
