/**
 * The sport this build covers: the one switch point (docs/MULTI-SPORT.md). Every module that needs a
 * sport fact reads it from SPORT or SPORT_SEASON here, or from the lib/season.ts constants derived from
 * them, never from a literal. One sport per build: `SCVAL_SPORT` picks it ('field-hockey', the default,
 * 'soccer', 'basketball', 'volleyball', or 'val-soccer', the Valley Athletic League's middle school girls soccer,
 * a second soccer build read from the league's own site rather than MaxPreps), and next.config.ts and vite.config.ts inline the variable so the browser bundles, the
 * prerender and a Worker all read the same value. Any other value fails the build here.
 *
 * An import-free leaf apart from the sport definitions, so client modules may reach it.
 */

import { BASKETBALL_BOYS_2026 } from './basketball';
import { FIELD_HOCKEY_GIRLS_2026 } from './field-hockey';
import { SOCCER_GIRLS_2026 } from './soccer';
import { VAL_SOCCER_GIRLS_2026 } from './val-soccer';
import { VOLLEYBALL_GIRLS_2026 } from './volleyball';

/** The sports a build can cover, by `Sport.id`. */
export const SPORT_IDS = ['field-hockey', 'soccer', 'basketball', 'volleyball', 'val-soccer'] as const;
export type SportId = (typeof SPORT_IDS)[number];

/** `SCVAL_SPORT`, else field hockey. */
export const SPORT_ID: SportId = (() => {
  const raw = process.env.SCVAL_SPORT;
  if (raw === undefined || raw === '') return 'field-hockey';
  if ((SPORT_IDS as readonly string[]).includes(raw)) return raw as SportId;
  throw new Error(`lib/sports/current.ts: SCVAL_SPORT=${raw} is not one of ${SPORT_IDS.join(', ')}`);
})();

/** Whether this build is field hockey's: the pages and files only field hockey has branch on this. */
export const IS_FIELD_HOCKEY = SPORT_ID === 'field-hockey';
/** Whether this build is boys basketball's: for a check that is about basketball alone (a choice among sports is `bySport`). */
export const IS_BASKETBALL = SPORT_ID === 'basketball';

/** Whether this build is girls volleyball's: for a check that is about volleyball alone (a choice among sports is `bySport`). */
export const IS_VOLLEYBALL = SPORT_ID === 'volleyball';

/** Whether this build is the VAL's middle school girls soccer: for a check that is about it alone (a choice among sports is `bySport`). */
export const IS_VAL_SOCCER = SPORT_ID === 'val-soccer';

/**
 * This build's value out of one value per sport: the way every per-sport choice is made (docs/MULTI-SPORT.md, "The
 * seam"). The record must name every SportId, so a sport added to SPORT_IDS is a type error at each choice that has
 * no value for it, never a silent fall into another sport's (tests/sport-choices.test.ts holds the code to this).
 * Every value is evaluated, so pass ones that are cheap and safe in any build; a choice that must stay out of a
 * bundle (a sport's data file) is a literal `process.env.SCVAL_SPORT` chain instead, which the bundler folds.
 */
export function bySport<T>(values: Readonly<Record<SportId, T>>): T {
  return values[SPORT_ID];
}

export const SPORT_SEASON = bySport<
  | typeof FIELD_HOCKEY_GIRLS_2026
  | typeof SOCCER_GIRLS_2026
  | typeof BASKETBALL_BOYS_2026
  | typeof VOLLEYBALL_GIRLS_2026
  | typeof VAL_SOCCER_GIRLS_2026
>({
  'field-hockey': FIELD_HOCKEY_GIRLS_2026,
  soccer: SOCCER_GIRLS_2026,
  basketball: BASKETBALL_BOYS_2026,
  volleyball: VOLLEYBALL_GIRLS_2026,
  'val-soccer': VAL_SOCCER_GIRLS_2026,
});
export const SPORT = SPORT_SEASON.sport;

/**
 * Where this build's games are read first (lib/sports/shape.ts PrimarySourceId): MaxPreps for every high school
 * build, the league's own TeamSideline site for the VAL. The pipeline's first stage, and every MaxPreps-only fetcher,
 * branch on it (lib/pipeline/primary.ts).
 */
export const PRIMARY_SOURCE = SPORT_SEASON.primary;

/** Whether MaxPreps carries this build's season at all: false for the VAL, whose middle schools MaxPreps does not list. */
export const HAS_MAXPREPS = PRIMARY_SOURCE === 'maxpreps';

/** The season with its MaxPreps ids (lib/sports/shape.ts MaxprepsSportSeason), or null in a build MaxPreps does not carry. */
export const MAXPREPS_SPORT_SEASON = SPORT_SEASON.primary === 'maxpreps' ? SPORT_SEASON : null;

/**
 * The repo-relative folder of this sport's data files: data/<sport>/ for every sport (field hockey's moved from data/ to data/field-hockey/ on 2026-11-18), so soccer's are
 * under data/soccer/, basketball's under data/basketball/ and volleyball's under data/volleyball/. The fetchers write here; the bundled imports (lib/data.ts and the other loaders) pick
 * the same folder's file.
 */
export const DATA_DIR = `data/${SPORT_ID}`;

/**
 * The pages and sections a sport has beyond the ones every build has (the 2025-26 archive, /jv and the rest).
 *
 * - `recruiting`: the hand-researched recruiting pages (/clubs, /clubs/[slug], /commits, /recruiting): field
 *   hockey's, volleyball's since 2026-11-13, and girls soccer's and boys basketball's since 2026-11-21
 *   (docs/MULTI-SPORT.md, "one sport per build"). Every high school build has them; the VAL's middle school build,
 *   which lists no players (SPORT_LISTS_PLAYERS), does not, and renders each as a 404 and links to none of them.
 *   A recruiting build's data files may hold nothing yet (a file with no `notes` is a placeholder no research has
 *   filled), and the pages say so rather than report a search that was not made.
 * - `clubCalendar`: /club-calendar and the club pages' "Tournaments and leagues" section.
 *   data/field-hockey/club-events.json is field hockey's research alone, so every other build renders the page as a
 *   404 and links to it from nowhere.
 */
export const SPORT_FEATURES = bySport<{ readonly recruiting: boolean; readonly clubCalendar: boolean }>({
  'field-hockey': { recruiting: true, clubCalendar: true },
  soccer: { recruiting: true, clubCalendar: false },
  basketball: { recruiting: true, clubCalendar: false },
  volleyball: { recruiting: true, clubCalendar: false },
  'val-soccer': { recruiting: false, clubCalendar: false },
});

/**
 * Whether a build lists players at all, by build: its rosters, player stats, leader boards of players, and its place
 * in the cross-sport player registry (data/players.json, lib/players/registry-file.ts). Every high school build does;
 * the VAL's middle school build never does, whatever a source publishes: its players are children.
 */
export const SPORT_LISTS_PLAYERS: Readonly<Record<SportId, boolean>> = {
  'field-hockey': true,
  soccer: true,
  basketball: true,
  volleyball: true,
  'val-soccer': false,
};

/** Whether this build lists players (SPORT_LISTS_PLAYERS). */
export const LISTS_PLAYERS = SPORT_LISTS_PLAYERS[SPORT_ID];

/** The recruiting pages (SPORT_FEATURES.recruiting). */
export const HAS_RECRUITING = SPORT_FEATURES.recruiting;

/** /club-calendar (SPORT_FEATURES.clubCalendar). */
export const HAS_CLUB_CALENDAR = SPORT_FEATURES.clubCalendar;

/** 'Girls': the program's gender as MaxPreps and the schools' calendars capitalize it. */
export const GENDER_NAME = `${SPORT_SEASON.gender.charAt(0).toUpperCase()}${SPORT_SEASON.gender.slice(1)}`;

/**
 * 'girls varsity': the program, as a sentence names it. A grade level comes first, as people say it: '7th/8th grade
 * girls'.
 */
export const PROGRAM_WORDS =
  SPORT_SEASON.level === 'Varsity'
    ? `${SPORT_SEASON.gender} ${SPORT_SEASON.level.toLowerCase()}`
    : `${SPORT_SEASON.level.toLowerCase()} ${SPORT_SEASON.gender}`;

/** 'girls varsity field hockey': what the site covers, as a sentence names it. */
export const SPORT_AUDIENCE = `${PROGRAM_WORDS} ${SPORT.noun}`;
