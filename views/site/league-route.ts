/**
 * The `/standings/[league]` and `/schedule/[league]` params (contract: views/site/route-contract.ts):
 * which leagues the two routes prerender, and the league one of them names. Both pages and both
 * opengraph-images return exactly these params. (`/playoffs/[league]` has its own, narrower family:
 * views/playoffs/tournament-route.ts.)
 */

import { LEAGUE_IDS } from '@/lib/config/leagues';
import { type LeagueSummary, getLeagueSummary } from '@/lib/queries/leagues';
import type { StaticParams } from '@/views/site/route-contract';

/** One param per league, in config order. */
export function leagueStaticParams(): StaticParams<'league'> {
  return LEAGUE_IDS.map((league) => ({ league }));
}

/** The league a URL segment names, or null for an id that is not one. */
export function leagueParam(raw: string): LeagueSummary | null {
  return getLeagueSummary(raw) ?? null;
}
