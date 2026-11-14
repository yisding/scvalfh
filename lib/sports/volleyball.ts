/**
 * Volleyball, and the girls varsity 2026 season (lib/sports/shape.ts): the fourth sport
 * (docs/MULTI-SPORT.md), chosen by `SCVAL_SPORT=volleyball` (lib/sports/current.ts). Values marked [V] were
 * read from a live MaxPreps page on 2026-11-14; each other value says where it comes from.
 *
 * An import-free leaf apart from types, so client modules may reach it through lib/sports/current.
 */

import type { Sport, SportSeason } from './shape';

export const VOLLEYBALL = {
  id: 'volleyball',
  name: 'Volleyball',
  noun: 'volleyball',
  abbr: 'VB',
  schemaOrgSport: 'Volleyball',
  /** [V] a school's team context names the sport 'Volleyball'; the girls' team pages sit under /volleyball/. */
  maxpreps: { slug: 'volleyball', sportName: 'Volleyball' },
  /**
   * si.com's girls volleyball segment, by the pattern of its girls soccer one. The volleyball build reads no
   * si.com page (`sblive.backfill` is off in both leagues, and the JV fetch runs with --no-sblive), and no page
   * links to it.
   */
  sblive: { slug: 'girls-volleyball' },
  /**
   * [V] "Volleyball, Girls" = 13 in the cifsshome.org widget's Sport select ("Volleyball, Boys" = 11, "Beach
   * Volleyball, Girls" = 232), read 2026-11-14. The SCVAL schedules allow no contest before Aug 27 (first
   * scrimmage Aug 21, sportsmanship game Aug 24), so the window opens Aug 1.
   */
  cifss: { sportId: 13, seasonFrom: '08-01' },
  /**
   * [V] The CCS calendar is cifccs.org/calendar/Girls_Volleyball (seven events read 2026-11-14). cifccs.org's
   * sport pages answer scripts with 403, so the volleyball page's code was never read: `code` is null and the
   * section link is the calendar page (lib/season.ts SOURCE_LINKS).
   */
  ccs: { code: null, calendar: 'Girls_Volleyball' },
  /**
   * Not fitted: no volleyball season has been replayed through lib/ratings/ratings.ts yet. A match's margin is
   * its margin in sets (3-0 is three, 3-2 is one; a best-of-three tournament match gives two or one), so it is
   * capped at 3, and a set of expected margin is 150 Elo points by rule of thumb: a 300-point favorite is
   * expected to win 3-1. `provisionalNote` says so on the Elo board. `adjustedScoring` is null: that model is a
   * Poisson fit of goals, which does not describe sets won, so the Elo-adjusted boards are not built.
   */
  ratings: {
    eloPerUnit: 150,
    marginCap: 3,
    startWeight: 1,
    carryover: 1,
    provisionalNote:
      'For volleyball the scale is set by rule of thumb and not yet checked against a finished season, so read a rating to the nearest 50.',
    adjustedScoring: null,
  },
  /**
   * [V] One line per player (stored in the `field` slot, lib/players/player-stats-schema.ts), from the
   * "Attacking", "Serving", "Blocking", "Digging", "Ball Handling" and "Serve Receiving" groups of MaxPreps'
   * rollup: the counts only, since every per-set figure and percentage is recomputed from them. No goalkeeper
   * group, and game notes are not read for stats (`pointsPerGoal` 0).
   */
  stats: {
    model: 'volleyball',
    fieldKeys: [
      'setsPlayed',
      'kills',
      'attackErrors',
      'attackAttempts',
      'aces',
      'serveErrors',
      'serveAttempts',
      'soloBlocks',
      'blockAssists',
      'digs',
      'assists',
      'receptions',
      'receptionErrors',
    ],
    goalieKeys: [],
    pointsPerGoal: 0,
    pointsPerAssist: 0,
  },
  /**
   * A match is the best of five sets (SCVAL Volleyball By-Laws Article IV §2.1, BVAL Girls Volleyball By-Laws
   * §3.7), so it cannot end level and there is no overtime: `overtime` 'none'. What MaxPreps records as a
   * team's score is its sets won (3-1), so the for / against / difference columns count sets. A tournament
   * may play two sets with no third (a 1-1 split, which counts as neither a win nor a loss: SCVAL By-Laws
   * Article III §1.1.2); a split a source records is printed as it stands, never hidden.
   */
  scoring: {
    allowsTies: false,
    overtime: 'none',
    tiebreak: null,
    unit: 'set',
    units: 'sets',
    forAbbr: 'SW',
    againstAbbr: 'SL',
    diffAbbr: 'SD',
    forWords: 'sets won',
    againstWords: 'sets lost',
    diffWords: 'set differential',
  },
} as const satisfies Sport;

/** Girls varsity volleyball, fall 2026. */
export const VOLLEYBALL_GIRLS_2026 = {
  sport: VOLLEYBALL,
  gender: 'girls',
  level: 'Varsity',
  /** [V] the hub's `__NEXT_DATA__.query.gendersport` */
  genderSport: 'girls,volleyball',
  /** [V] each team context's `year` */
  year: '26-27',
  /** [V] each team context's `sportSeasonName` */
  label: 'Girls Volleyball Varsity Fall 26-27',
  term: 'Fall',
  /** [V] the hub's `query.ssid`, each team context read and the six leagues' standings agree. */
  sportSeasonId: '9f2e0dd1-c299-4f3e-8e0e-744d108b6db7',
  /** [V] the hub's `query.allSeasonId` and each team context's `allSeasonId` agree. */
  allSeasonId: '2059473e-9a9c-400b-b1e2-9a119e64e597',
  /** [V] maxpreps.com/ca/volleyball/ is the girls' hub: `query.gendersport` is 'girls,volleyball'. */
  hubPath: '/ca/volleyball/',
  hubSportSeasonId: null,
  /** [V] each school's season picker: the 26-27 season whose page is `<team URL>jv/`. */
  jvSportSeasonId: 'd23401c4-759f-41af-b044-94497d049dd1',
  /** [V] the tournament page every CCS playoff team's schedule names (lib/league-config/volleyball/sections.ts). */
  ccsBracketPath: '/tournament/TPozgxV2DkGkNEbD5cAlqA/volleyball-26/2026-central-coast-section-girls-volleyball-championship.htm',
} as const satisfies SportSeason;
