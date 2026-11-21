/**
 * This build's TeamSideline pages (lib/sports/shape.ts TeamsidelineSportSeason): their URLs, and the check that a page
 * read is the one configured. Only a build whose primary source is TeamSideline has them; asking for one in any other
 * build is a bug, and throws.
 */

import { SPORT_SEASON } from '../sports/current';
import type { TeamsidelineLevelPage, TeamsidelineSportSeason } from '../sports/shape';
import { teamsidelinePageUrl } from '../sports/league-site';
import type { TeamsidelinePage } from './teamsideline';

/** This build's TeamSideline season. Throws in a build whose primary source is not TeamSideline. */
export function teamsidelineSeason(): TeamsidelineSportSeason {
  const season = SPORT_SEASON;
  if (season.primary !== 'teamsideline') throw new Error('lib/sources/teamsideline-season.ts: this build is not read from TeamSideline');
  return season;
}

/** One level's page config: the main level (the site's tables) or the second (its /jv pages). */
export function teamsidelineLevel(level: 'main' | 'second'): TeamsidelineLevelPage {
  return teamsidelineSeason().pages[level];
}

/** One level's schedule page URL. */
export function teamsidelineLevelUrl(level: 'main' | 'second'): string {
  const season = teamsidelineSeason();
  return teamsidelinePageUrl(season.origin, season.pages[level]);
}

/**
 * Why a page read is not the configured level's, or null when it is: its heading must be the season's label ("Girls'
 * Soccer 26-27") and its subtitle the level's ('7th/8th Grade'). A page that is another program's or another
 * season's is never read as this one (the TeamSideline counterpart of the MaxPreps bootstrap check).
 */
export function teamsidelinePageMismatch(page: Pick<TeamsidelinePage, 'title' | 'subtitle'>, level: 'main' | 'second'): string | null {
  const season = teamsidelineSeason();
  const expected = season.pages[level];
  if (page.title !== season.label) return `the page is "${page.title}", not "${season.label}"`;
  if (page.subtitle !== expected.subtitle) return `the page's level is "${page.subtitle}", not "${expected.subtitle}"`;
  return null;
}
