/**
 * Verified season constants.
 *
 * Every value below was read from a live response or an official PDF and carries its citation.
 * The bootstrap step in scripts/fetch-data.ts re-reads the season ids on every run and ABORTS
 * rather than publishing a half-migrated season if they ever change (SPEC §1.1h, §5.2).
 */

import type { Division, PlayoffKeyDates, Season, SeasonWindow } from './types';

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
/** [V] Central Coast Section, verdict 33 */
export const SECTION_ID = 'd9a9ef9c-db12-4669-888b-40ac8462a575';
export const SECTION_NAME = 'Central Coast Section';

/** [V] verdicts 25 (De Anza, 7 MaxPreps rows) and 52 (El Camino, 8 rows). */
export const LEAGUE_IDS: Record<Division, string> = {
  'de-anza': 'ea062dfe-9fb9-45c7-9839-0801993d6ac6',
  'el-camino': '7bdfb2a7-8dde-4a21-88c9-832f1593554d',
};

/** [V] leagues/{id}/v1 .name */
export const LEAGUE_NAMES: Record<Division, string> = {
  'de-anza': 'Santa Clara Valley - De Anza',
  'el-camino': 'Santa Clara Valley - El Camino',
};

/** Human labels for our own UI. */
export const DIVISION_LABELS: Record<Division, string> = {
  'de-anza': 'De Anza',
  'el-camino': 'El Camino',
};

export const DIVISIONS: readonly Division[] = ['de-anza', 'el-camino'];

/** MaxPreps league standings page — the deep link on every standings table (SPEC §1.1i). */
export function leagueStandingsUrl(division: Division): string {
  const slug =
    division === 'de-anza'
      ? 'santa-clara-valley--de-anza'
      : 'santa-clara-valley--el-camino';
  // The double hyphen is the league name's " - " joiner; dropping ?leagueid= hard-404s.
  return `${MAXPREPS_WEB}/ca/field-hockey/${SEASON_YEAR}/league/${slug}/?leagueid=${LEAGUE_IDS[division]}`;
}

/**
 * Playoff and crossover key dates.
 *
 * CCS dates [V] from `2026-27_CCS_Playoff_Dates.pdf` + `field_hockey_bylaws_2026-27.pdf`
 * (resolved through cifccs.org's CloudFront indirection) and cross-confirmed by the 5 all-day
 * VEVENTs in https://cifccs.org/calendar/Field_Hockey?print=ical — 20261102, 20261107,
 * 20261111, 20261114, 20261119 (SPEC §1.4).
 *
 * The crossover / 4-vs-4 play-in date [V] comes from the official SCVAL schedule PDFs:
 * Friday, October 30 2026 (BYLAWS-ADDENDUM, Article VII §2).
 */
export const PLAYOFF_KEY_DATES: PlayoffKeyDates = {
  entriesDue: '2026-11-02T12:00:00',
  seedingMeeting: '2026-11-02T13:00:00',
  quarterfinals: '2026-11-07',
  semifinals: '2026-11-11',
  finals: '2026-11-14',
  evaluationMeeting: '2026-11-19T16:00:00',
  crossover: '2026-10-30',
};

/** Article VII §1: 16-team field — SCVAL 7, BVAL 4, PCAL 2, at-large 3. */
export const PLAYOFF_FORMAT = {
  elimination: 'single',
  divisions: [
    { name: 'Division 1', seeds: [1, 8] },
    { name: 'Division 2', seeds: [9, 16] },
  ],
  autoQualifiers: { scval: 7, bval: 4, pcal: '2', atLarge: 3, total: 16 },
  highSeedHostsThrough: 'semifinals',
} as const;

/** MaxPreps' CCS tournament page — currently `<div class="not-published">` (SPEC §1.4). */
export const CCS_BRACKET_URL =
  `${MAXPREPS_WEB}/tournament/3jB4uWWtwk20vrdggAkzMA/field-hockey-26/` +
  '2026-central-coast-section-field-hockey-championship.htm';

/** Deep links rendered by the Attribution component (SPEC §6). */
export const SOURCE_LINKS = {
  maxpreps: `${MAXPREPS_WEB}/ca/field-hockey/`,
  sblive: 'https://www.si.com/high-school/stats/california/field-hockey',
  scval: 'https://scval.com/fallSports/Fall_index.html',
  scvalBylaws:
    'https://scval.com/fallSports/1%2026-27%20SCVAL%20Field%20Hockey%20By-Laws.pdf',
  scvalDeAnzaSchedule: 'https://scval.com/fallSports/26-27%20SCVAL%20FH%20DA%20Final.pdf',
  scvalElCaminoSchedule: 'https://scval.com/fallSports/26-27%20SCVAL%20FH%20EC%20Final.pdf',
  ccs: 'https://cifccs.org/sports/fh/index',
  ccsCalendar: 'https://cifccs.org/calendar/Field_Hockey?print=ical',
} as const;

/** By-law citations, so the UI can print the rule beside the number. */
export const BYLAW_CITATIONS = {
  points: 'SCVAL Field Hockey By-Laws 2026-27, Article VI §2 (3 points for a win, 1 for a tie)',
  order: 'SCVAL Field Hockey By-Laws 2026-27, Article VI §2 (standings are the order of points)',
  headToHead: 'Article VI §3 (better head-to-head record among the tied teams)',
  divisionWins: 'Article VI §4 (greater number of wins in division play)',
  h2hGoalsAgainst: 'Article VI §5 (least goals given up between the tied teams)',
  h2hGoalDiff: 'Article VI §6 (goal differential between the tied teams)',
  coinFlip: 'Article VI §7 (coin flip — we cannot compute it, so the teams stay tied)',
  doubleRoundRobin: 'Article VI §1 (double round robin; division games only count to the division record)',
  overtime: 'Article IV (one 7-minute sudden-victory period; still tied ⇒ the game ends in a tie)',
  qualifiers:
    'Article VII §2 (first three in each division are automatic qualifiers; fourth place plays in for the SCVAL 7th AQ; the play-in loser and both fifth-place teams go to CCS for at-large consideration)',
} as const;

export const EMPTY_WINDOW: SeasonWindow = {
  firstGame: null,
  lastLeagueGame: null,
  lastGame: null,
};

/** The Season record written into every snapshot. */
export function buildSeason(window: SeasonWindow = EMPTY_WINDOW): Season {
  return {
    year: SEASON_YEAR,
    label: SEASON_LABEL,
    sportSeasonId: SPORT_SEASON_ID,
    allSeasonId: ALL_SEASON_ID,
    genderSport: GENDER_SPORT,
    teamLevel: TEAM_LEVEL,
    sectionId: SECTION_ID,
    sectionName: SECTION_NAME,
    leagues: {
      'de-anza': { leagueId: LEAGUE_IDS['de-anza'], name: LEAGUE_NAMES['de-anza'] },
      'el-camino': { leagueId: LEAGUE_IDS['el-camino'], name: LEAGUE_NAMES['el-camino'] },
    },
    window,
  };
}

/** The IANA zone every date on the site is formatted in. */
export const TIME_ZONE = 'America/Los_Angeles';
