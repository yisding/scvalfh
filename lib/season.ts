/**
 * Verified season constants: a dependency-free constants leaf (type-only imports), because client
 * modules reach it through lib/format. League, division and CCS facts live in lib/leagues.ts; the
 * Season record is built by lib/season-build.ts (SPEC §13.3).
 *
 * Every value below was read from a live response or an official PDF and carries its citation.
 * The bootstrap step in scripts/fetch-data.ts re-reads the season ids on every run and ABORTS
 * rather than publishing a half-migrated season if they ever change (SPEC §1.1h, §5.2).
 */

import type { SeasonWindow } from './types';

export const MAXPREPS_API = 'https://production.api.maxpreps.com';
export const MAXPREPS_WEB = 'https://www.maxpreps.com';

/** The bootstrap page whose __NEXT_DATA__ carries ssid + allSeasonId (SPEC §1.1h, verdict 5). */
export const BOOTSTRAP_URL = `${MAXPREPS_WEB}/ca/field-hockey/`;

/** [V] leagues/{id}/v1 .year; team-context .year */
export const SEASON_YEAR = '26-27';
/** [V] leagues/{id}/v1 .sportSeasonName */
export const SEASON_LABEL = 'Girls Varsity Field Hockey Fall 26-27';
/** [V] verdicts 25/28/33/36/37/52 */
export const SPORT_SEASON_ID = 'e302eb3e-1a32-4f2d-934b-6f9d454f721e';
/** [V] verdicts 5, 33 */
export const ALL_SEASON_ID = 'bfacc9ec-145e-4659-ba7e-0824d163d5fc';
/** [V] verdict 5 */
export const GENDER_SPORT = 'girls,fieldhockey' as const;
/** [V] only Varsity is verified end to end */
export const TEAM_LEVEL = 'Varsity' as const;

/** MaxPreps' CCS tournament page — currently `<div class="not-published">` (SPEC §1.4). */
export const CCS_BRACKET_URL =
  `${MAXPREPS_WEB}/tournament/3jB4uWWtwk20vrdggAkzMA/field-hockey-26/` +
  '2026-central-coast-section-field-hockey-championship.htm';

/** Section-wide deep links rendered by the Attribution component. League links live in lib/leagues.ts. */
export const SOURCE_LINKS = {
  maxpreps: `${MAXPREPS_WEB}/ca/field-hockey/`,
  sblive: 'https://www.si.com/high-school/stats/california/field-hockey',
  ccs: 'https://cifccs.org/sports/fh/index',
  ccsCalendar: 'https://cifccs.org/calendar/Field_Hockey?print=ical',
} as const;

export const EMPTY_WINDOW: SeasonWindow = {
  firstGame: null,
  lastLeagueGame: null,
  lastGame: null,
};

/** The IANA zone every date on the site is formatted in. */
export const TIME_ZONE = 'America/Los_Angeles';
