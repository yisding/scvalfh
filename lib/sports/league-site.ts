/**
 * The pages of a league's own TeamSideline site a season is read from (lib/sports/shape.ts TeamsidelineSportSeason):
 * one schedule page a level, `${origin}/schedule/${scheduleId}/0/1/${slug}`. A leaf with no runtime import, so the
 * pipeline (lib/sources/teamsideline-season.ts) and the About page (components/about/LeagueSiteAbout.tsx) build the
 * same URL from the same config.
 */

import type { TeamsidelineLevelPage } from './shape';

/** One level's schedule page on the league's site. */
export function teamsidelinePageUrl(origin: string, page: Pick<TeamsidelineLevelPage, 'scheduleId' | 'slug'>): string {
  return `${origin}/schedule/${page.scheduleId}/0/1/${page.slug}`;
}
