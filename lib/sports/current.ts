/**
 * The sport this build covers: the one switch point (docs/MULTI-SPORT.md). Every module that needs a
 * sport fact reads it from SPORT or SPORT_SEASON here, or from the lib/season.ts constants derived from
 * them, never from a literal. One sport per build, so a second sport is a second build of the same code
 * with this switch (and its data files) pointed elsewhere.
 *
 * An import-free leaf apart from the sport definitions, so client modules may reach it.
 */

import { FIELD_HOCKEY_GIRLS_2026 } from './field-hockey';

export const SPORT_SEASON = FIELD_HOCKEY_GIRLS_2026;
export const SPORT = SPORT_SEASON.sport;

/** 'Girls': the program's gender as MaxPreps and the schools' calendars capitalize it. */
export const GENDER_NAME = `${SPORT_SEASON.gender.charAt(0).toUpperCase()}${SPORT_SEASON.gender.slice(1)}`;

/** 'girls varsity': the program, as a sentence names it. */
export const PROGRAM_WORDS = `${SPORT_SEASON.gender} ${SPORT_SEASON.level.toLowerCase()}`;

/** 'girls varsity field hockey': what the site covers, as a sentence names it. */
export const SPORT_AUDIENCE = `${PROGRAM_WORDS} ${SPORT.noun}`;
