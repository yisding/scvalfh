/**
 * Soccer, and the girls varsity 2026-27 season (lib/sports/shape.ts): the second sport
 * (docs/MULTI-SPORT.md), chosen by `SCVAL_SPORT=soccer` (lib/sports/current.ts). Values marked [V] were
 * read from a live response on 2026-11-06; each other value says where it comes from.
 *
 * An import-free leaf apart from types, so client modules may reach it through lib/sports/current.
 */

import type { Sport, SportSeason } from './shape';

export const SOCCER = {
  id: 'soccer',
  name: 'Soccer',
  noun: 'soccer',
  abbr: 'SC',
  schemaOrgSport: 'Soccer',
  /** [V] a school's season list names the sport 'Soccer'; the state hub is maxpreps.com/ca/soccer/girls/. */
  maxpreps: { slug: 'soccer', sportName: 'Soccer' },
  /**
   * si.com's girls soccer segment, as scval.com links the SCVAL girls tables
   * (scorebooklive.com/girls-soccer/leagues/2579-scval-deanza). The soccer build reads no si.com page
   * (SCVAL soccer's `sblive.backfill` is off), so this only builds the Attribution link.
   */
  sblive: { slug: 'girls-soccer' },
  /**
   * [V] "Soccer, Girls" = 25 in the cifsshome.org widget's Sport select ("Soccer, Boys" = 24): the select
   * numbers each program, so this is the girls' value. The SCVAL girls schedule allows no contest before
   * Nov 23 (first scrimmage Nov 16), so the window opens Nov 1.
   */
  cifss: { sportId: 25, seasonFrom: '11-01' },
  /** cifccs.org/sports/soccer/index (one page for both programs); its calendar is cifccs.org/calendar/Soccer. */
  ccs: { code: 'soccer', calendar: 'Soccer' },
  /**
   * Field hockey's constants (lib/sports/field-hockey.ts), not yet refitted: soccer scores like field hockey
   * (a goal or two a game, ties allowed), so the Poisson scoring model and the goal margin cap carry over.
   * Refit on a finished soccer season before trusting the ratings' second decimal.
   */
  ratings: {
    eloPerUnit: 175,
    marginCap: 5,
    startWeight: 1,
    carryover: 1,
    // Field hockey's constants stand in (see above); the soccer pages' copy is unchanged by this.
    provisionalNote: null,
    adjustedScoring: { ridgeSigma: 0.3, shrinkGames: 1, slopeSigma: 0.5 },
  },
  stats: {
    model: 'goals',
    fieldKeys: [
      'gamesPlayed',
      'minutes',
      'goals',
      'assists',
      'points',
      'shots',
      'shotsOnGoal',
      'gameWinningGoals',
    ],
    goalieKeys: [
      'gamesPlayed',
      'minutes',
      'overtimeMinutes',
      'opponentShotsOnGoal',
      'saves',
      'goalsAgainst',
      'shutouts',
      'wins',
      'losses',
      'ties',
    ],
    /** MaxPreps' soccer points, as for field hockey: two per goal, one per assist. */
    pointsPerGoal: 2,
    pointsPerAssist: 1,
  },
  scoring: {
    allowsTies: true,
    unit: 'goal',
    units: 'goals',
    forAbbr: 'GF',
    againstAbbr: 'GA',
    diffAbbr: 'GD',
    forWords: 'goals for',
    againstWords: 'goals against',
    diffWords: 'goal differential',
  },
} as const satisfies Sport;

/** Girls varsity soccer, winter 2026-27. */
export const SOCCER_GIRLS_2026 = {
  sport: SOCCER,
  gender: 'girls',
  level: 'Varsity',
  /** [V] the girls hub's `__NEXT_DATA__.query.gendersport` */
  genderSport: 'girls,soccer',
  /** [V] leagues/{id}/v1 .year (SCVAL - De Anza, SCVAL - El Camino) */
  year: '26-27',
  /** [V] leagues/{id}/v1 .sportSeasonName */
  label: 'Girls Varsity Soccer Winter 26-27',
  term: 'Winter',
  /**
   * [V] Los Altos' school season list ("Girls Soccer Varsity Winter 26-27"), confirmed by team-context and
   * leagues/{id}/v1.
   */
  sportSeasonId: '893e6888-5e0c-48eb-b952-16ac29e0ae0a',
  /** [V] the same season-list entry and the girls hub agree */
  allSeasonId: 'eafa3987-6f30-4e48-aa24-8c665225333b',
  /** [V] maxpreps.com/ca/soccer/ is the boys' hub ('boys,soccer'); the girls' is its own page. */
  hubPath: '/ca/soccer/girls/',
  /**
   * [V] The girls hub's `query.ssid` on 2026-11-06. It is none of Los Altos' girls varsity seasons (26-27 is
   * 893e6888-…, 25-26 b56edee3-…), so it is MaxPreps' state-page id, not a team season: the bootstrap step
   * accepts it, and a change still stops the run for a human to re-read.
   */
  hubSportSeasonId: 'cf0a49ca-ee08-43c3-b26d-050cdcbd1b8e',
  /** [V] Los Altos' season list: "Girls Soccer JV Winter 26-27" */
  jvSportSeasonId: 'c586ce8b-c632-455a-8a4c-93f3da7648c6',
  /** MaxPreps has no 2027 CCS girls soccer tournament page yet. */
  ccsBracketPath: null,
} as const satisfies SportSeason;
