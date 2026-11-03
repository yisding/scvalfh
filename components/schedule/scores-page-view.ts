/**
 * The header badges of `/scores/[date]` (app/scores/[date]/page.tsx), from the day's counts. Pure: the
 * page passes the day's summary, its regions (day-summary.ts dayRegions), the date and `getToday()`.
 */

import { gameWord, plural } from '../words/plural';
import type { RegionId } from '../../lib/types';

import type { DayRegion } from './day-summary';
import { countGames, type ScheduleCounts } from './filter-data';

/** One fact badge beside the h1; `region` scopes it to that region's view. */
export interface DayBadge {
  key: string;
  text: string;
  region?: RegionId;
}

function countBadges(counts: ScheduleCounts, lead: string): string[] {
  const out = [`${lead}${counts.total} ${gameWord(counts.total)}`];
  if (counts.final > 0) out.push(plural(counts.final, 'final score'));
  if (counts.upcoming > 0) out.push(`${counts.upcoming} to come`);
  if (counts.pending > 0) out.push(`${counts.pending} not reported`);
  return out;
}

/**
 * One run of badges for the day, or, when both regions have a game, one per region, each scoped
 * to its region and led by its name ("NorCal: 6 games", "4 final scores" … "SoCal: 9 games" …). Without
 * JS both runs show, NorCal first. "Today" is the day's, unscoped.
 */
export function dayBadges(
  summary: ScheduleCounts,
  regions: readonly DayRegion[],
  twoRegions: boolean,
  date: string,
  today: string,
): DayBadge[] {
  const badges: DayBadge[] = twoRegions
    ? regions.flatMap((region) =>
        countBadges(countGames(region.withSide), `${region.shortName}: `).map((text) => ({
          key: `${region.id}:${text}`,
          text,
          region: region.id,
        })),
      )
    : countBadges(summary, '').map((text) => ({ key: text, text }));
  if (date === today) badges.push({ key: 'Today', text: 'Today' });
  return badges;
}
