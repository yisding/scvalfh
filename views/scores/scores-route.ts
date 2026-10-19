/**
 * The `/scores/[date]` params (contract: views/site/route-contract.ts): which dates the route
 * prerenders (every date with a contest), and whether a URL segment is one of them. The page and
 * its opengraph-image both return exactly these params.
 */

import { getGameDates } from '@/lib/queries/games';
import type { StaticParams } from '@/views/site/route-contract';

/** One param per date with a contest, oldest first. */
export function scoresStaticParams(): StaticParams<'date'> {
  return getGameDates().map((date) => ({ date }));
}

/** The date itself when it has a contest, else null: a day with no game is a 404, not a blank page. */
export function scoresParam(raw: string): string | null {
  return getGameDates().includes(raw) ? raw : null;
}
