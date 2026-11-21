/**
 * The Valley Athletic League's girls soccer, 2026-27 (lib/sports/shape.ts): a middle school league, so the first
 * season this codebase reads from somewhere other than MaxPreps. Chosen by `SCVAL_SPORT=val-soccer`
 * (lib/sports/current.ts). The sport is soccer itself (lib/sports/soccer.ts): its words, its ties and its penalty
 * kicks are the same at 13 as at 17, and the VAL's rules are NFHS rules with the league's own modifications
 * (lib/league-config/val-soccer/val.ts).
 *
 * The season is read from the VAL's own site, valleyal.org, which runs on TeamSideline: one schedule page a level,
 * linked from the site's home page and its /schedules list (read 2026-11-21). The site's main level is 7th/8th
 * grade; 6th/7th grade is the second level, shown where a high school site shows its JV games.
 *
 * An import-free leaf apart from the soccer definition and types, so client modules may reach it through
 * lib/sports/current.
 */

import type { TeamsidelineSportSeason } from './shape';
import { SOCCER } from './soccer';

/** Girls soccer in the Valley Athletic League, winter 2026-27 (VAL Season 3, Dec 7 - Feb 4). */
export const VAL_SOCCER_GIRLS_2026 = {
  sport: SOCCER,
  gender: 'girls',
  primary: 'teamsideline',
  /** The program as MaxPreps would name it (lib/sports/shape.ts): girls soccer. */
  genderSport: 'girls,soccer',
  /** valleyal.org's own heading for each level: "7th/8th Grade". */
  level: '7th/8th Grade',
  /** valleyal.org's program heading, "Girls' Soccer 26-27", on both pages. */
  label: "Girls' Soccer 26-27",
  year: '26-27',
  /** valleyal.org: "Season 3 (December - January) Winter - Boys' Volleyball, Girls' Soccer". */
  term: 'Winter',
  origin: 'https://valleyal.org',
  pages: {
    /** valleyal.org's link "7th/8th Girls' Soccer" (Season #3). */
    main: { scheduleId: '731407', slug: '7th8th-grade', subtitle: '7th/8th Grade' },
    /** valleyal.org's link "6th/7th Girls' Soccer" (Season #3). */
    second: { scheduleId: '731408', slug: '6th7th-grade', subtitle: '6th/7th Grade' },
  },
} as const satisfies TeamsidelineSportSeason;
