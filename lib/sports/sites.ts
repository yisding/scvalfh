/**
 * The five sport sites this codebase builds, one per sport (docs/MULTI-SPORT.md, "one sport per build"), and where
 * each is served, so a page of one can link to the others: the footer's "Other sports" row (components/layout/
 * Attribution.tsx) and a team page's "Other sports" block (components/teams/TeamOtherSports.tsx).
 *
 * The origins are the production domains, checked live on 2026-11-16 (each answered 200 with its own site's title;
 * the VAL's middle school soccer on 2026-11-21, the day its Worker and domain were made).
 * They are not SITE_URL: a build knows only its own origin, and a link to another sport's site must reach that
 * site wherever this one is served (a preview, localhost), so the other sports' links are always the production
 * ones.
 *
 * Server-side only by use (the footer and the team page are server components), though it imports nothing but the
 * sport definitions.
 */

import { BASKETBALL_BOYS_2026 } from './basketball';
import { SPORT_ID, SPORT_IDS, type SportId } from './current';
import { FIELD_HOCKEY_GIRLS_2026 } from './field-hockey';
import type { SportSeason } from './shape';
import { SOCCER_GIRLS_2026 } from './soccer';
import { VAL_SOCCER_GIRLS_2026 } from './val-soccer';
import { VOLLEYBALL_GIRLS_2026 } from './volleyball';

/**
 * Each sport's production origin, no trailing slash; null for a site with no production domain yet (none today),
 * which no other site links to.
 */
export const SPORT_SITE_ORIGINS: Readonly<Record<SportId, string | null>> = {
  'field-hockey': 'https://ncfh.net',
  soccer: 'https://soccer.ncfh.net',
  basketball: 'https://basketball.ncfh.net',
  volleyball: 'https://volleyball.ncfh.net',
  'val-soccer': 'https://mssoccer.ncfh.net',
};

const SEASONS: Readonly<Record<SportId, SportSeason>> = {
  'field-hockey': FIELD_HOCKEY_GIRLS_2026,
  soccer: SOCCER_GIRLS_2026,
  basketball: BASKETBALL_BOYS_2026,
  volleyball: VOLLEYBALL_GIRLS_2026,
  'val-soccer': VAL_SOCCER_GIRLS_2026,
};

/**
 * The program as a title names it: 'Field Hockey' (a girls' sport only here, so the gender goes unsaid), 'Girls
 * Soccer', 'Boys Basketball', 'Girls Volleyball' (sports with a program of each gender). The site's own name
 * (components/layout/site.ts SITE_NAME) ends with it. A league's own middle school program names its league
 * first: 'VAL Girls Soccer'.
 */
export function programTitle(id: SportId): string {
  return id === 'val-soccer' ? `VAL ${programName(id)}` : programName(id);
}

/** The program alone, with no league before it: 'Field Hockey', 'Girls Soccer' (the VAL's too). */
export function programName(id: SportId): string {
  const season = SEASONS[id];
  if (id === 'field-hockey') return season.sport.name;
  const gender = `${season.gender.charAt(0).toUpperCase()}${season.gender.slice(1)}`;
  return `${gender} ${season.sport.name}`;
}

export interface SportSite {
  id: SportId;
  /** programTitle: 'Girls Soccer'. */
  title: string;
  /** The site's home page: 'https://soccer.ncfh.net/'. */
  href: string;
}

/** A sport's site, as a link names it. Throws for a site with no production origin yet. */
export function sportSite(id: SportId): SportSite {
  const origin = SPORT_SITE_ORIGINS[id];
  if (origin === null) throw new Error(`lib/sports/sites.ts: ${id} has no production origin yet`);
  return { id, title: programTitle(id), href: `${origin}/` };
}

/** Whether a sport's site is served anywhere yet (SPORT_SITE_ORIGINS). */
export const isLive = (id: SportId): boolean => SPORT_SITE_ORIGINS[id] !== null;

/** Every sport site but this build's own that is served anywhere, in SPORT_IDS order. */
export const OTHER_SPORT_SITES: readonly SportSite[] = SPORT_IDS.filter((id) => id !== SPORT_ID && isLive(id)).map(sportSite);
