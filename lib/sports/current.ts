/**
 * The sport this build covers: the one switch point (docs/MULTI-SPORT.md). Every module that needs a
 * sport fact reads it from SPORT or SPORT_SEASON here, or from the lib/season.ts constants derived from
 * them, never from a literal. One sport per build: `SCVAL_SPORT` picks it ('field-hockey', the default,
 * 'soccer' or 'basketball'), and next.config.ts and vite.config.ts inline the variable so the browser bundles, the
 * prerender and a Worker all read the same value. Any other value fails the build here.
 *
 * An import-free leaf apart from the sport definitions, so client modules may reach it.
 */

import { BASKETBALL_BOYS_2026 } from './basketball';
import { FIELD_HOCKEY_GIRLS_2026 } from './field-hockey';
import { SOCCER_GIRLS_2026 } from './soccer';

/** The sports a build can cover, by `Sport.id`. */
export const SPORT_IDS = ['field-hockey', 'soccer', 'basketball'] as const;
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
/** Whether this build is boys basketball's (SCVAL only): the modules with a file or a rule per sport branch on this. */
export const IS_BASKETBALL = SPORT_ID === 'basketball';

export const SPORT_SEASON = IS_BASKETBALL
  ? BASKETBALL_BOYS_2026
  : IS_FIELD_HOCKEY
    ? FIELD_HOCKEY_GIRLS_2026
    : SOCCER_GIRLS_2026;
export const SPORT = SPORT_SEASON.sport;

/**
 * The repo-relative folder of this sport's data files: field hockey's stay at data/ (docs/MULTI-SPORT.md
 * step 4: "Field hockey's files stay at data/* until the old paths are retired in one move"), soccer's are
 * under data/soccer/ and basketball's under data/basketball/. The fetchers write here; the bundled imports (lib/data.ts and the other loaders) pick
 * the same folder's file.
 */
export const DATA_DIR = IS_FIELD_HOCKEY ? 'data' : `data/${SPORT_ID}`;

/**
 * The pages only field hockey has (docs/MULTI-SPORT.md, "one sport per build"): the 2025-26 archive
 * (/history/2025-26) and the hand-researched recruiting pages (/clubs, /clubs/[slug], /commits, /recruiting).
 * A soccer or basketball build renders each as a 404 and links to none of them.
 */
export const HAS_HISTORY = IS_FIELD_HOCKEY;
export const HAS_RECRUITING = IS_FIELD_HOCKEY;

/** 'Girls': the program's gender as MaxPreps and the schools' calendars capitalize it. */
export const GENDER_NAME = `${SPORT_SEASON.gender.charAt(0).toUpperCase()}${SPORT_SEASON.gender.slice(1)}`;

/** 'girls varsity': the program, as a sentence names it. */
export const PROGRAM_WORDS = `${SPORT_SEASON.gender} ${SPORT_SEASON.level.toLowerCase()}`;

/** 'girls varsity field hockey': what the site covers, as a sentence names it. */
export const SPORT_AUDIENCE = `${PROGRAM_WORDS} ${SPORT.noun}`;
