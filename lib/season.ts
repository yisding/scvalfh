/**
 * Verified season constants: a leaf whose only import is the sport switch (lib/sports/current.ts, itself
 * import-free). Client modules may reach it, but lib/format takes TIME_ZONE from lib/time-zone.ts so
 * that pages do not bundle the sport definition. League, division and CCS facts live in lib/league-config/; the
 * Season record is built by lib/snapshot/season-build.ts (SPEC §13.3).
 *
 * Every value below is derived from the sport definition (lib/sports/field-hockey.ts), where each one
 * read from a live response or an official PDF keeps its citation; the names and values here are
 * unchanged from when they were literals, so every importer reads them as before.
 * The bootstrap step in scripts/fetch-data.ts re-reads the season ids on every run and ABORTS
 * rather than publishing a half-migrated season if they ever change (SPEC §1.1h, §5.2).
 */

import { SPORT, SPORT_SEASON } from './sports/current';

export const MAXPREPS_API = 'https://production.api.maxpreps.com';
export const MAXPREPS_WEB = 'https://www.maxpreps.com';
/** MaxPreps' California root for the sport: maxpreps.com/ca/field-hockey. */
export const MAXPREPS_SPORT_WEB = `${MAXPREPS_WEB}/ca/${SPORT.maxpreps.slug}`;
/** si.com's California root for the sport (ex-SBLive): team, scoreboard and league pages sit under it. */
export const SBLIVE_WEB = `https://www.si.com/high-school/stats/california/${SPORT.sblive.slug}`;

/** The bootstrap page whose __NEXT_DATA__ carries ssid + allSeasonId (SPEC §1.1h, verdict 5). */
export const BOOTSTRAP_URL = `${MAXPREPS_SPORT_WEB}/`;

/** [V] leagues/{id}/v1 .year; team-context .year */
export const SEASON_YEAR: string = SPORT_SEASON.year;
/** [V] leagues/{id}/v1 .sportSeasonName */
export const SEASON_LABEL: string = SPORT_SEASON.label;
/** '2026': the calendar year the fall season is played in. Derived from SEASON_YEAR, not read. */
export const SEASON_CALENDAR_YEAR = `20${SEASON_YEAR.slice(0, 2)}`;
/** 'Fall 2026': the season as the site's own copy names it. Derived from SEASON_YEAR, not read. */
export const SEASON_DISPLAY = `${SPORT_SEASON.term} ${SEASON_CALENDAR_YEAR}`;
/** [V] verdicts 25/28/33/36/37/52 */
export const SPORT_SEASON_ID: string = SPORT_SEASON.sportSeasonId;
/** [V] verdicts 5, 33 */
export const ALL_SEASON_ID: string = SPORT_SEASON.allSeasonId;
/** [V] verdict 5 */
export const GENDER_SPORT = SPORT_SEASON.genderSport;
/** [V] only Varsity is verified end to end */
export const TEAM_LEVEL = SPORT_SEASON.level;
/**
 * [V] The JV season of the same sport: `__NEXT_DATA__.query.ssid` of maxpreps.com/ca/field-hockey/jv/
 * (teamLevel 'JV', read 2026-10-05). Each team's JV games come from the same schedule-calculated
 * call with this id; the team id stays the school's own (the registry id). scripts/fetch-jv.ts only.
 */
export const JV_SPORT_SEASON_ID: string = SPORT_SEASON.jvSportSeasonId;

/** MaxPreps' CCS tournament page — currently `<div class="not-published">` (SPEC §1.4). */
export const CCS_BRACKET_URL = `${MAXPREPS_WEB}${SPORT_SEASON.ccsBracketPath}`;

/** Section-wide deep links rendered by the Attribution component. League links live in lib/league-config/. */
export const SOURCE_LINKS = {
  maxpreps: BOOTSTRAP_URL,
  sblive: SBLIVE_WEB,
  ccs: `https://cifccs.org/sports/${SPORT.ccs.code}/index`,
  ccsCalendar: `https://cifccs.org/calendar/${SPORT.ccs.calendar}?print=ical`,
  cifss: 'https://www.cifsshome.org/widget/schedule-score',
} as const;

/** The IANA zone every date on the site is formatted in (lib/time-zone.ts, the leaf lib/format loads). */
export { TIME_ZONE } from './time-zone';
