/**
 * What the site chrome reads from the snapshot (app/layout.tsx hands it to SiteHeader, Attribution
 * and BottomTabBar): the chrome renders on every page, so it is built once per layout render here
 * and the components themselves never import the read API (tests/arch/layers.test.ts rule j).
 */

import { LEAGUE_IDS } from '@/lib/config/leagues';
import type { LeagueId } from '@/lib/model/ids';
import type { SeasonPhase } from '@/lib/model/season';
import { getScoresLandingDate } from '@/lib/queries/games';
import { getSitePhase } from '@/lib/queries/phase';

export interface ChromeView {
  /**
   * The whole site's phase (lib/queries/phase.ts `getSitePhase`). Once it is 'complete' the scheduled
   * update stops on purpose, so the header's and the footer's stamp stay a plain date instead of
   * turning into the stale warning.
   */
  sitePhase: SeasonPhase;
  /**
   * The Scores tab's landing date (lib/queries/games.ts `getScoresLandingDate`), across every
   * league (`all`) and within each one (`byLeague`, config order): BottomTabBar aims the tab and
   * its per-league targets at them.
   */
  scoresLandingDate: { all: string | null; byLeague: Readonly<Record<LeagueId, string | null>> };
}

export function buildChromeView(): ChromeView {
  return {
    sitePhase: getSitePhase(),
    scoresLandingDate: {
      all: getScoresLandingDate(),
      byLeague: Object.fromEntries(LEAGUE_IDS.map((id) => [id, getScoresLandingDate({ league: id })])),
    },
  };
}
