/**
 * The two levels a build covers, as its copy names them. Every high school build covers varsity (its tables,
 * schedule and playoffs) and JV (the /jv pages); the VAL's middle school build covers 7th/8th grade and 6th/7th
 * grade (lib/sports/val-soccer.ts `pages`), shown in the same places. Every word the site prints about a level comes
 * from here, so a high school build's pages read exactly as they did ('JV', 'junior varsity', 'varsity').
 *
 * Read from the inlined SCVAL_SPORT (next.config.ts `env`, vite.config.ts `define`), as lib/format.ts reads it, not
 * from lib/sports/current: the top nav uses it, and the nav is in every page's first-load JS, which must not carry a
 * sport definition (docs/MULTI-SPORT.md, "Guards"). tests/val-soccer.test.ts holds the VAL's words to its season's
 * page subtitles.
 */

interface LevelWords {
  /** The short name a label, a tab or a heading uses: 'JV', '6th/7th'. */
  readonly short: string;
  /** The level in a sentence: 'junior varsity', '6th/7th grade'. */
  readonly long: string;
  /** Sentence case of `long`: 'Junior varsity', '6th/7th grade'. */
  readonly longTitle: string;
}

/** Whether this build's levels are grades (the VAL's middle schools), not varsity and JV. */
export const LEVELS_ARE_GRADES = process.env.SCVAL_SPORT === 'val-soccer';

/** The second level: the /jv pages' level ('JV', or the VAL's '6th/7th'). */
export const SECOND_LEVEL: LevelWords = LEVELS_ARE_GRADES
  ? { short: '6th/7th', long: '6th/7th grade', longTitle: '6th/7th grade' }
  : { short: 'JV', long: 'junior varsity', longTitle: 'Junior varsity' };

/**
 * The third level: a high school's freshman team (girls soccer and boys basketball, the /freshman pages; lib/freshman/).
 * The copy names it "freshman" (owner decision, 2026-11-25), never "frosh".
 */
export const FRESHMAN_LEVEL: LevelWords = { short: 'Freshman', long: 'freshman', longTitle: 'Freshman' };

/** The main level: the one the site's tables, schedule and playoffs are about ('varsity', or the VAL's '7th/8th'). */
export const MAIN_LEVEL: LevelWords = LEVELS_ARE_GRADES
  ? { short: '7th/8th', long: '7th/8th grade', longTitle: '7th/8th grade' }
  : { short: 'Varsity', long: 'varsity', longTitle: 'Varsity' };
