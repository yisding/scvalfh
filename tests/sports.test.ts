/**
 * The sport seam (lib/sports/, docs/MULTI-SPORT.md): every value that moved out of a literal into the
 * field hockey definition, pinned to the literal it replaced, so the refactor changed nothing a source,
 * the snapshot or a page reads. A second sport adds its own pins beside these.
 */
import { describe, expect, it } from 'vitest';

import { leagueSportWords } from '../lib/leagues';
import { FIELD_STAT_KEYS, GOALIE_STAT_KEYS } from '../lib/players/player-stats-schema';
import { RIDGE_SIGMA, SHRINK_GAMES, SLOPE_SIGMA } from '../lib/ratings/adjusted-scoring';
import { CARRYOVER, ELO_PER_GOAL, MARGIN_CAP, START_WEIGHT } from '../lib/ratings/ratings';
import * as season from '../lib/season';
import { CCS_ICAL_URL } from '../lib/sources/ccs';
import { CIFSS_SEASON_FROM, CIFSS_SPORT_ID } from '../lib/sources/cifss';
import { POLITE_USER_AGENT } from '../lib/sources/http';
import { SBLIVE_GAME_PATH_PREFIX } from '../lib/sources/sblive';
import { VNN_SUMMARY_RE } from '../lib/sources/vnn-ics';
import { FIELD_HOCKEY, FIELD_HOCKEY_GIRLS_2026 } from '../lib/sports/field-hockey';
import { GENDER_NAME, PROGRAM_WORDS, SPORT, SPORT_AUDIENCE, SPORT_SEASON } from '../lib/sports/current';
import { SITE_NAME, SITE_SHORT_NAME, SITE_WORDMARK } from '../components/layout/site';

describe('the current sport', () => {
  it('is girls varsity field hockey, fall 2026', () => {
    expect(SPORT).toBe(FIELD_HOCKEY);
    expect(SPORT_SEASON).toBe(FIELD_HOCKEY_GIRLS_2026);
    expect(SPORT_SEASON.sport).toBe(SPORT);
    expect(GENDER_NAME).toBe('Girls');
    expect(PROGRAM_WORDS).toBe('girls varsity');
    expect(SPORT_AUDIENCE).toBe('girls varsity field hockey');
  });

  it("keeps MaxPreps' stored season words consistent with the sport they name", () => {
    expect(SPORT_SEASON.label).toBe(
      `${GENDER_NAME} ${SPORT_SEASON.level} ${SPORT.maxpreps.sportName} ${SPORT_SEASON.term} ${SPORT_SEASON.year}`,
    );
    expect(SPORT_SEASON.genderSport).toBe(`${SPORT_SEASON.gender},${SPORT.id.replace(/-/g, '')}`);
  });
});

describe('lib/season.ts, derived from the sport', () => {
  it('reads exactly the literals it used to spell', () => {
    expect(season.SBLIVE_WEB).toBe('https://www.si.com/high-school/stats/california/field-hockey');
    expect(season.MAXPREPS_SPORT_WEB).toBe('https://www.maxpreps.com/ca/field-hockey');
    expect(season.BOOTSTRAP_URL).toBe('https://www.maxpreps.com/ca/field-hockey/');
    expect(season.SEASON_YEAR).toBe('26-27');
    expect(season.SEASON_LABEL).toBe('Girls Varsity Field Hockey Fall 26-27');
    expect(season.SEASON_CALENDAR_YEAR).toBe('2026');
    expect(season.SEASON_DISPLAY).toBe('Fall 2026');
    expect(season.SPORT_SEASON_ID).toBe('e302eb3e-1a32-4f2d-934b-6f9d454f721e');
    expect(season.ALL_SEASON_ID).toBe('bfacc9ec-145e-4659-ba7e-0824d163d5fc');
    expect(season.GENDER_SPORT).toBe('girls,fieldhockey');
    expect(season.TEAM_LEVEL).toBe('Varsity');
    expect(season.JV_SPORT_SEASON_ID).toBe('fae4fc22-6de6-47ae-972d-e290b0ec31ef');
    expect(season.CCS_BRACKET_URL).toBe(
      'https://www.maxpreps.com/tournament/3jB4uWWtwk20vrdggAkzMA/field-hockey-26/' +
        '2026-central-coast-section-field-hockey-championship.htm',
    );
    expect(season.SOURCE_LINKS).toEqual({
      maxpreps: 'https://www.maxpreps.com/ca/field-hockey/',
      sblive: 'https://www.si.com/high-school/stats/california/field-hockey',
      ccs: 'https://cifccs.org/sports/fh/index',
      ccsCalendar: 'https://cifccs.org/calendar/Field_Hockey?print=ical',
      cifss: 'https://www.cifsshome.org/widget/schedule-score',
    });
  });
});

describe('the sources, derived from the sport', () => {
  it('build the URLs, ids and patterns they used to spell', () => {
    expect(SBLIVE_GAME_PATH_PREFIX).toBe('/california/field-hockey/games/');
    expect(CIFSS_SPORT_ID).toBe(30);
    expect(CIFSS_SEASON_FROM).toBe('2026-08-01');
    expect(CCS_ICAL_URL).toBe('https://cifccs.org/calendar/Field_Hockey?print=ical');
    expect(VNN_SUMMARY_RE.source).toBe('^(Girls (Varsity|JV) Field Hockey) (vs|at) (.+)$');
    expect(POLITE_USER_AGENT).toMatch(/^scvalfh\/1\.0 \(NorCal girls field hockey scoreboard; unofficial fan site; /);
  });
});

describe('the engines, tuned per sport', () => {
  it('keep the field hockey rating constants', () => {
    expect([ELO_PER_GOAL, MARGIN_CAP, START_WEIGHT, CARRYOVER]).toEqual([175, 5, 1, 1]);
    expect([RIDGE_SIGMA, SHRINK_GAMES, SLOPE_SIGMA]).toEqual([0.3, 1, 0.5]);
  });

  it("keep the field hockey player-stat lines, in display order", () => {
    expect(FIELD_STAT_KEYS).toEqual([
      'gamesPlayed', 'minutes', 'goals', 'assists', 'points', 'shots', 'shotsOnGoal', 'gameWinningGoals', 'steals',
    ]);
    expect(GOALIE_STAT_KEYS).toEqual([
      'gamesPlayed', 'minutes', 'overtimeMinutes', 'opponentShotsOnGoal', 'saves', 'goalsAgainst', 'shutouts', 'wins',
      'losses', 'ties',
    ]);
    expect([SPORT.stats.pointsPerGoal, SPORT.stats.pointsPerAssist]).toEqual([2, 1]);
  });
});

describe('the words, derived from the sport', () => {
  it('name the site as before', () => {
    expect(SITE_NAME).toBe('NorCal High School Field Hockey');
    expect(SITE_WORDMARK).toBe('NorCal HS Field Hockey');
    expect(SITE_SHORT_NAME).toBe('NorCal FH');
  });

  it("add the sport to a league's name unless the name already says it", () => {
    expect(leagueSportWords('scval')).toBe('Santa Clara Valley Athletic League girls varsity field hockey');
    expect(leagueSportWords('sunset')).toMatch(/field hockey league, girls varsity$/i);
  });
});
