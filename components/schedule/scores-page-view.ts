/**
 * The header badges of `/scores/[date]` (app/scores/[date]/page.tsx), from the day's counts. Pure: the
 * page passes the day's summary, its regions (day-summary.ts dayRegions), the date and `getToday()`.
 */

import { gameWord, plural } from '../words/plural';
import type { RegionId } from '../../lib/types';

import type { DayRegion } from './day-summary';
import { countGames, type ScheduleCounts } from './filter-data';

/** One fact badge beside the h1; `region` scopes it to that region's view. */
interface DayBadge {
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

// ---------------------------------------------------------------- the date bar (DESIGN §33)

/** One cell of the date bar. */
export interface DateBarCell {
  date: string;
  /** The selected day. */
  current: boolean;
  today: boolean;
  /** How far from the selected day the cell ranks: the nearest two none, then 1, then 2. CSS shows 3, 5 or 7 cells. */
  far: 1 | 2 | null;
}

export interface DateBarView {
  cells: DateBarCell[];
  /** The game day before / after the selected day; null at the ends of the season. */
  previous: string | null;
  next: string | null;
}

/**
 * The selected day and the SIX game days nearest to it: three each side, sliding toward the side
 * that has days left at either end of the season, in date order. The selected day is always a cell,
 * game day or not (today on an off day). Pure: `dates` is every date with a contest, ascending.
 */
export function dateBarView(dates: readonly string[], selected: string, today: string): DateBarView {
  const before = dates.filter((d) => d < selected);
  const after = dates.filter((d) => d > selected);
  let left = Math.min(3, before.length);
  let right = Math.min(3, after.length);
  left = Math.min(before.length, left + (3 - right));
  right = Math.min(after.length, right + (3 - Math.min(3, before.length)));
  const lefts = before.slice(before.length - left);
  const rights = after.slice(0, right);
  /* Rank by distance from the selected day, alternating sides so the three shown cells of a phone are
     the day before, the day and the day after whenever both sides have one. */
  const ranked: string[] = [];
  for (let i = 0; i < Math.max(lefts.length, rights.length); i += 1) {
    const l = lefts[lefts.length - 1 - i];
    const r = rights[i];
    if (l) ranked.push(l);
    if (r) ranked.push(r);
  }
  const farOf = (date: string): 1 | 2 | null => {
    const rank = ranked.indexOf(date);
    return rank < 2 ? null : rank < 4 ? 1 : 2;
  };
  return {
    cells: [...lefts, selected, ...rights].map((date) => ({
      date,
      current: date === selected,
      today: date === today,
      far: date === selected ? null : farOf(date),
    })),
    previous: before[before.length - 1] ?? null,
    next: after[0] ?? null,
  };
}

/** "8 games" / "1 game" / "No games", or "2 live" while any of them is being played. */
export function dayCountWords(games: ReadonlyArray<{ status: string }>): { text: string; live: boolean } {
  const live = games.filter((g) => g.status === 'live').length;
  if (live > 0) return { text: `${live} live`, live: true };
  return { text: games.length === 0 ? 'No games' : `${games.length} ${gameWord(games.length)}`, live: false };
}
