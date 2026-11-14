/**
 * The 13 WBAL girls volleyball seeds, 2026 (the volleyball build's registry: lib/teams.ts,
 * `SCVAL_SPORT=volleyball`). Added with the WCAL at the owner's request (2026-11-14).
 *
 * Division membership is the WBAL's own: the varsity tables of "2026-27 WBAL Volleyball Standings"
 * (hs.wbalsports.org/vbstg.html, read 2026-11-14) and the two division schedules beside it:
 *   Foothill: Harker, The King's Academy, Menlo, Mercy, Notre Dame Belmont, Presentation, Sacred Heart Prep
 *   Skyline : Castilleja, Crystal, Eastside College Prep, Notre Dame San Jose, Pinewood, Priory
 * These are not the soccer divisions (lib/registry/soccer/wbal.ts): the league aligns each sport on its own.
 * MaxPreps' "West Bay - Foothill" and "West Bay - Skyline" girls volleyball tables (standings read 2026-11-14)
 * hold the same teams.
 *
 * They are the 13 schools of the soccer registry, so each seed is that school's soccer seed in its volleyball
 * division and with its volleyball page (lib/registry/volleyball/wcal.ts `volleyballSeedOf`; every path agrees
 * with the team's `canonicalUrl` in MaxPreps' team-context, read 2026-11-14, and tests/volleyball.test.ts pins
 * them). The order is each division's, alphabetical by slug.
 *
 * No si.com or VNN ids: the volleyball build reads neither.
 */

import { WBAL_SOCCER_SEEDS } from '../soccer/wbal';
import type { Seed } from '../seed';
import { volleyballSeedOf } from './wcal';

const FOOTHILL = ['harker', 'kings-academy', 'menlo', 'mercy-burlingame', 'notre-dame-belmont', 'presentation', 'sacred-heart-prep'];
const SKYLINE = ['castilleja', 'crystal-springs', 'eastside', 'notre-dame-san-jose', 'pinewood', 'priory'];

function seedsOf(slugs: readonly string[], division: Seed['division']): Seed[] {
  return slugs.map((slug) => {
    const seed = WBAL_SOCCER_SEEDS.find((s) => s.slug === slug);
    if (!seed) throw new Error(`lib/registry/volleyball/wbal.ts: no WBAL school ${slug}`);
    return volleyballSeedOf(seed, division);
  });
}

export const WBAL_VOLLEYBALL_SEEDS: readonly Seed[] = [...seedsOf(FOOTHILL, 'foothill'), ...seedsOf(SKYLINE, 'skyline')];
