/**
 * Basketball, and the boys varsity 2026-27 season (lib/sports/shape.ts): the third sport
 * (docs/MULTI-SPORT.md), chosen by `SCVAL_SPORT=basketball` (lib/sports/current.ts). Values marked [V] were
 * read from a live response on 2026-11-10; each other value says where it comes from.
 *
 * An import-free leaf apart from types, so client modules may reach it through lib/sports/current.
 */

import type { Sport, SportSeason } from './shape';

export const BASKETBALL = {
  id: 'basketball',
  name: 'Basketball',
  noun: 'basketball',
  abbr: 'BB',
  schemaOrgSport: 'Basketball',
  /** [V] a school's season list names the sport 'Basketball'; the boys' team pages sit under /basketball/. */
  maxpreps: { slug: 'basketball', sportName: 'Basketball' },
  /**
   * si.com's boys basketball segment, by the pattern of its girls soccer one. The basketball build reads no
   * si.com page (SCVAL basketball's `sblive.backfill` is off, and the JV fetch runs with --no-sblive), and no
   * page links to it.
   */
  sblive: { slug: 'boys-basketball' },
  /**
   * [V] "Basketball, Boys" = 3 in the cifsshome.org widget's Sport select ("Basketball, Girls" = 12). The SCVAL
   * boys schedules allow no contest before Nov 23 (first scrimmage Nov 16, sportsmanship games Nov 19), so the
   * window opens Nov 1.
   */
  cifss: { sportId: 3, seasonFrom: '11-01' },
  /**
   * [V] The CCS calendar is cifccs.org/calendar/Basketball (one feed for both programs, ten events read
   * 2026-11-10). cifccs.org's sport pages answer scripts with 405, so the basketball page's code was never
   * read: `code` is null and the section link is the calendar page (lib/season.ts SOURCE_LINKS).
   */
  ccs: { code: null, calendar: 'Basketball' },
  /**
   * Not fitted: no finished basketball season has been replayed through lib/ratings/ratings.ts yet. A margin
   * counts up to 20 points and a point of expected margin is 25 Elo points (docs/MULTI-SPORT.md, "Ratings"), so
   * a 100-point favorite is expected to win by about four. Refit on a finished season before trusting the
   * ratings' second digit. `adjustedScoring` is null: that model is a Poisson fit of goals, which does not
   * describe basketball scores, so the Elo-adjusted boards are not built.
   */
  ratings: {
    eloPerUnit: 25,
    marginCap: 20,
    startWeight: 1,
    carryover: 1,
    adjustedScoring: null,
  },
  /**
   * Basketball has no goalkeeper group and its own stat names (lib/players/player-stats-schema.ts
   * `basketball`): `fieldKeys` and `goalieKeys` are empty, and `basketballKeys` is what a player's line holds.
   */
  stats: {
    fieldKeys: [],
    goalieKeys: [],
    pointsPerGoal: 0,
    pointsPerAssist: 0,
  },
  scoring: {
    allowsTies: false,
    unit: 'point',
    units: 'points',
    forAbbr: 'PF',
    againstAbbr: 'PA',
    diffAbbr: 'PD',
    forWords: 'points for',
    againstWords: 'points against',
    diffWords: 'point differential',
  },
} as const satisfies Sport;

/** Boys varsity basketball, winter 2026-27. */
export const BASKETBALL_BOYS_2026 = {
  sport: BASKETBALL,
  gender: 'boys',
  level: 'Varsity',
  /** [V] the boys hub's `__NEXT_DATA__.query.gendersport` */
  genderSport: 'boys,basketball',
  /** [V] leagues/{id}/v1 .year (Santa Clara Valley - De Anza, Santa Clara Valley - El Camino) */
  year: '26-27',
  /** [V] team-context .sportSeasonName, and Gunn's and Los Altos' school season lists */
  label: 'Boys Basketball Varsity Winter 26-27',
  term: 'Winter',
  /** [V] Gunn's and Los Altos' season lists ("Boys Basketball Varsity Winter 26-27"), confirmed by team-context. */
  sportSeasonId: 'a5dadf08-21fb-4889-bd84-1d0c6816e29a',
  /** [V] the same season-list entry and team-context agree */
  allSeasonId: 'a42c7ea4-0907-491e-b56f-a2d31a45bf19',
  /** [V] maxpreps.com/ca/basketball/ is the boys' hub: `__NEXT_DATA__.query` has gendersport 'boys,basketball', this ssid and allSeasonId. */
  hubPath: '/ca/basketball/',
  hubSportSeasonId: null,
  /** [V] Gunn's and Los Altos' season lists ("Boys Basketball JV Winter 26-27") and maxpreps.com/ca/basketball/jv/ agree. */
  jvSportSeasonId: 'd0f0932b-e598-4b10-ba5a-f790f3fff4c3',
  /** MaxPreps has no 2027 CCS boys basketball tournament page yet. */
  ccsBracketPath: null,
} as const satisfies SportSeason;
