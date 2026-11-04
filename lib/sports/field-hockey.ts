/**
 * Field hockey, and the girls varsity 2026 season (lib/sports/shape.ts). Every value moved here from the
 * module that used to spell it, unchanged: lib/season.ts (the season ids, slugs and source links),
 * lib/ratings/ratings.ts and lib/ratings/adjusted-scoring.ts (the rating constants and how they were
 * set), lib/players/player-stats-schema.ts (the stat lines), lib/players/note-stats.ts (points per goal),
 * lib/sources/cifss.ts, lib/sources/ccs.ts and scripts/fetch-prior-season.ts.
 *
 * An import-free leaf apart from types, so client modules reach it through lib/season and lib/format.
 */

import type { Sport, SportSeason } from './shape';

export const FIELD_HOCKEY = {
  id: 'field-hockey',
  name: 'Field Hockey',
  noun: 'field hockey',
  abbr: 'FH',
  schemaOrgSport: 'Field hockey',
  maxpreps: { slug: 'field-hockey', sportName: 'Field Hockey' },
  sblive: { slug: 'field-hockey' },
  /** "Field Hockey" = 30 in the widget's Sport select; no field hockey game is played before Aug 1. */
  cifss: { sportId: 30, seasonFrom: '08-01' },
  ccs: { code: 'fh', calendar: 'Field_Hockey' },
  /** Fitted on NorCal field hockey seasons; see lib/ratings/ratings.ts for how each was set. */
  ratings: {
    eloPerUnit: 175,
    marginCap: 5,
    startWeight: 1,
    carryover: 1,
    adjustedScoring: { ridgeSigma: 0.3, shrinkGames: 1, slopeSigma: 0.5 },
  },
  stats: {
    fieldKeys: [
      'gamesPlayed',
      'minutes',
      'goals',
      'assists',
      'points',
      'shots',
      'shotsOnGoal',
      'gameWinningGoals',
      'steals',
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
    /** MaxPreps' field hockey points: two per goal, one per assist. */
    pointsPerGoal: 2,
    pointsPerAssist: 1,
  },
} as const satisfies Sport;

/** Girls varsity field hockey, fall 2026. [V] marks a value read from a live response (lib/season.ts). */
export const FIELD_HOCKEY_GIRLS_2026 = {
  sport: FIELD_HOCKEY,
  gender: 'girls',
  /** [V] only Varsity is verified end to end */
  level: 'Varsity',
  /** [V] verdict 5 */
  genderSport: 'girls,fieldhockey',
  /** [V] leagues/{id}/v1 .year; team-context .year */
  year: '26-27',
  /** [V] leagues/{id}/v1 .sportSeasonName */
  label: 'Girls Varsity Field Hockey Fall 26-27',
  term: 'Fall',
  /** [V] verdicts 25/28/33/36/37/52 */
  sportSeasonId: 'e302eb3e-1a32-4f2d-934b-6f9d454f721e',
  /** [V] verdicts 5, 33 */
  allSeasonId: 'bfacc9ec-145e-4659-ba7e-0824d163d5fc',
  /** [V] `__NEXT_DATA__.query.ssid` of maxpreps.com/ca/field-hockey/jv/ (teamLevel 'JV', read 2026-10-05). */
  jvSportSeasonId: 'fae4fc22-6de6-47ae-972d-e290b0ec31ef',
  /** MaxPreps' CCS tournament page — currently `<div class="not-published">` (SPEC §1.4). */
  ccsBracketPath:
    '/tournament/3jB4uWWtwk20vrdggAkzMA/field-hockey-26/2026-central-coast-section-field-hockey-championship.htm',
} as const satisfies SportSeason;
