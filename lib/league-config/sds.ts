/**
 * What the three San Diego Section leagues share (city.ts, north-county.ts, metro.ts; DESIGN-socal §2.1):
 * one official note and set of links, one rules block, the Section playoffs as each league's postseason,
 * and the same phases, key dates and last league date.
 */

import type { TeamSlug } from '../types';
import {
  SDS_ALIGNMENT_URL, SDS_BRACKET_SHEET_URL, SDS_FIELD_HOCKEY_URL, SDS_GREEN_BOOK_URL, SDS_POWER_RANKINGS_URL,
  SITE_POINTS_CITATIONS,
} from './sections';
import type { DivisionConfig, LeagueConfig, LeagueRules, PhaseStep, PostseasonConfig } from './shape';

/** Every San Diego division's official note (DESIGN-socal §2.1.6, verbatim). */
const SDS_OFFICIAL_NOTE =
  'We found no schedule or standings published by a San Diego Section league. Members come from the Section’s 2026-27 League Alignment, and this site counts every game between two members of the division as a league game whether or not MaxPreps marks it as one.';

export const SDS_LINKS: LeagueConfig['links'] = [
  { label: 'CIF San Diego Section field hockey', href: SDS_FIELD_HOCKEY_URL },
  { label: 'CIF-SDS 2026-27 League Alignment (Google Sheet)', href: SDS_ALIGNMENT_URL },
  { label: 'CIF-SDS Green Book 2026-27 (Google Doc)', href: SDS_GREEN_BOOK_URL },
];

/** The one official mode every San Diego division has (a fresh object each call, so tests can mutate one). */
export function sdsOfficial(): DivisionConfig['official'] {
  return { mode: 'none', note: SDS_OFFICIAL_NOTE };
}

/**
 * A San Diego league's rules (City, North County, Metro: one Section rule for all three). 'membership': on
 * MaxPreps' schedules (contestType 2 and 4 left out) every pair of division-mates meets twice, a double round
 * robin, except Metro Mesa's Bonita Vista and Helix, listed once (Oct 23), while MaxPreps flags as few as 0 of
 * Patrick Henry's 10 as league games (inventory read Mon Oct 5 Pacific). The overtime citation says what the
 * SDFHOA procedures cover ("Varsity Overtime (regular season)" and "(Playoffs)"): not invitational tournaments,
 * where seven SDS-v-SDS games (contestType 2: Aug 21, Aug 22, Sep 12) have ended 0-0.
 */
export function sdsRules(shortName: string): LeagueRules {
  return {
    points: { win: 3, tie: 1, loss: 0 }, orderBy: 'points', orderScope: 'site', gamesWord: 'division',
    classification: 'membership', excludeContestTypes: [2, 4],
    // The playoffs open with the play-ins on Mon Nov 2 (SDFHOA calendar); the Master Calendar's last contest is Oct 30.
    postseasonFrom: '2026-11-02', leagueGameOverrides: [],
    matcher: 'two-phase',
    tiebreaks: { default: ['no-rule'] },
    multiTeam: 'partition-restart', h2hUnmet: 'skip', drawNumbers: null, leagueOvertime: 'shootout',
    citations: {
      ...SITE_POINTS_CITATIONS,
      doubleRoundRobin: 'members play each other home and away (MaxPreps schedules and the CIF-SDS 2026-27 League Alignment; on Oct 5 one Metro Mesa pair, Bonita Vista and Helix, was listed once); the league publishes no schedule',
      overtime: 'San Diego Field Hockey Officials Association 2026 procedures: a 10-minute 7 v 7 sudden-victory period, then 1 v 1 shootouts; the shootout winner is credited one goal, so a league, non-league or playoff varsity game does not end level (the procedures do not cover invitational tournaments, and several tournament games this season have ended level). MaxPreps records such a game as a level score marked W and L with no tally, and this site counts it as the flagged team’s win',
      // Paraphrased: the Green Book's own words name the champion an "automatic qualifier", a phrase no
      // non-CCS page may print (scripts/assert-copy.ts forbidCcs).
      coChampions: 'the league designates its champion (CIF-SDS Green Book: with a tie for first place, the league designates which team goes forward); this table shows teams level on points as level',
      stages: {
        'no-rule': 'The CIF-SDS Green Book (Bylaw 2000.1, special rule 3) leaves the tiebreak procedure to the Section’s preseason minutes, which we could not read, so this tie is left as it is',
      },
    },
    coChampionsLabel: `${shortName} co-leaders`,
    unresolvedSuffix: '',
  };
}

/**
 * The San Diego Section playoffs, as one league's postseason (a fresh object per league). Green Book 2026-27
 * Bylaw 2000.1 [V]; Master Calendar 2026-27 [V]; per-round dates and the finals site [V] only on the San Diego
 * Field Hockey Officials Association's calendar (sdfhoa.weebly.com), which `citations.roundDates` says.
 */
export function sdsPostseason(playoffDivisionOf: Readonly<Record<TeamSlug, 'I' | 'II'>>): PostseasonConfig {
  return {
    kind: 'section-playoffs',
    name: 'San Diego Section playoffs',
    dates: { first: '2026-11-02', last: '2026-11-14' },
    qualificationLine: 'San Diego Section playoffs, Nov 2–14 (finals Nov 14 at La Jolla HS): Open 8, Division I 12, Division II 12, placed by the Section from its power rankings; a designated league champion gets at least a play-in.',
    divisions: [{ name: 'Open', teams: 8 }, { name: 'Division I', teams: 12 }, { name: 'Division II', teams: 12 }],
    playoffDivisionOf,
    ladder: [
      { divisions: '*', places: [1, 1], status: 'tournament', label: '1st: at least a play-in if named league champion',
        phrase: 'at least a play-in if named league champion', badge: '1st',
        legend: '1st — the league’s designated champion (not co-champions) is guaranteed at least a play-in game (Green Book 2000.1). The league names its champion; this table does not' },
      // "No league route" / "Selection only" until 2026-10-29: read on a team page as "out", which a team the Section
      // places from its power rankings is not. The legend keeps the rule's words.
      { divisions: '*', places: [2, 99], status: 'selection', label: 'Placed by the Section',
        phrase: 'placed by the Section from its power rankings', badge: 'By selection',
        legend: '2nd or lower — no league route; the Section places Division I teams in the Open or Division I bracket and picks 12 Division II teams, from its power rankings (Green Book 2000.1)' },
    ],
    citations: {
      qualification: 'CIF-SDS Green Book 2026-27, Bylaw 2000.1 (“There will be 3 competitive divisions with 8 teams in the Open Division and 12 teams in Divisions I and II qualifying for the playoffs. Designated league champions (not co-champions or tri-champions) will be guaranteed entry into a play-in game in the CIFSDS playoffs.”)',
      // Paraphrased on purpose: the bylaw's play-in sentence names a seed position, which SEED_CLAIM bans.
      seeding: 'CIF-SDS Green Book 2026-27, Bylaw 2000.1 (the Commissioner places teams from the Section’s approved power rankings, with input from the coaches’ advisory committee, and there is no appeal; a designated league champion left out of its division’s bracket hosts a play-in game) and the Green Book’s division-placement bylaw (the eight Open Division teams are drawn from Division I at the end of the regular season)',
      format: 'CIF-SDS Green Book 2026-27, Bylaw 2000.1 (Open 8, Division I 12, Division II 12) and the CIF-SDS 2026-27 Master Calendar (playoffs Nov 2–12, finals Nov 14)',
      roundDates: 'Round dates and the finals site (La Jolla HS) are from the Section’s bracket sheet; the SDFHOA calendar lists Divisions I and II the other way round for the rounds before the finals.',
    },
    // Since 2026-11-03 the rounds are the Section's own "2026 CIFSDS Field Hockey Championship Bracket" sheet
    // (bracketSheetUrl): one play-in (Division II, Mon Nov 2); Division I's first round Tue Nov 3 and Division II's
    // Wed Nov 4; quarterfinals Thu Nov 5 (Open), Fri Nov 6 (I), Sat Nov 7 (II); semifinals Tue Nov 10 (Open and I),
    // Wed Nov 11 (II). The SDFHOA calendar below had Divisions I and II the other way round on every round but the
    // final; the sheet, MaxPreps' listed games and 2025's brackets agree on this order. The finals are unchanged.
    // Before (superseded):
    // The SDFHOA calendar (https://sdfhoa.weebly.com/calendar.html, read 2026-10-29, unchanged since the preseason):
    // play-ins Mon Nov 2; first round Tue Nov 3 (Division II) and Wed Nov 4 (Division I); quarterfinals Thu Nov 5
    // (Open), Fri Nov 6 (II), Sat Nov 7 (I); semifinals Tue Nov 10 (Open and II), Wed Nov 11 (I); finals Sat Nov 14 at
    // La Jolla High School, 1:00 PM (II), 3:30 PM (I), 6:00 PM (Open). The Section's bulletin says where earlier
    // rounds are played; it is unreadable, so no row names a host (and "higher seed" would trip SEED_CLAIM).
    rounds: [
      { id: 'play-in', date: '2026-11-02', label: 'Play-in, Division II', time: null, site: null },
      { id: 'r1-i', date: '2026-11-03', label: 'First round, Division I', time: null, site: null },
      { id: 'r1-ii', date: '2026-11-04', label: 'First round, Division II', time: null, site: null },
      { id: 'qf-open', date: '2026-11-05', label: 'Quarterfinals, Open Division', time: null, site: null },
      { id: 'qf-i', date: '2026-11-06', label: 'Quarterfinals, Division I', time: null, site: null },
      { id: 'qf-ii', date: '2026-11-07', label: 'Quarterfinals, Division II', time: null, site: null },
      { id: 'sf-open-i', date: '2026-11-10', label: 'Semifinals, Open Division and Division I', time: null, site: null },
      { id: 'sf-ii', date: '2026-11-11', label: 'Semifinals, Division II', time: null, site: null },
      { id: 'final-ii', date: '2026-11-14', label: 'Final, Division II', time: '13:00', site: 'La Jolla High School' },
      { id: 'final-i', date: '2026-11-14', label: 'Final, Division I', time: '15:30', site: 'La Jolla High School' },
      { id: 'final-open', date: '2026-11-14', label: 'Final, Open Division', time: '18:00', site: 'La Jolla High School' },
    ],
    calendarUrl: 'https://sdfhoa.weebly.com/calendar.html',
    bracketsPageUrl: SDS_FIELD_HOCKEY_URL,
    // The Section's published brackets (read 2026-11-03; transcribed into data/sds-brackets-2026.json).
    bracketSheetUrl: SDS_BRACKET_SHEET_URL,
    note: 'The San Diego Section’s field hockey playoffs run Nov 2–14, with the finals on Nov 14 at La Jolla HS: Open 8, Division I 12, Division II 12. The Section placed teams from its power rankings at its Oct 31 seeding meeting and has published its brackets; this site draws them and projects no places. A designated league champion is guaranteed at least a play-in game; the league names its champion, not this table.',
    sourceLabel: 'CIF-SDS Green Book 2026-27, Bylaw 2000.1',
    sourceUrl: SDS_GREEN_BOOK_URL,
    powerRankingsUrl: SDS_POWER_RANKINGS_URL,
  };
}

/** The San Diego leagues' phases: the Section playoffs end with the Nov 14 finals. */
export function sdsPhases(): readonly PhaseStep[] {
  return [
    { phase: 'regular', through: 'league-play' },
    { phase: 'tournament', through: '2026-11-14' },
  ];
}

/**
 * The San Diego leagues' dated events. Oct 30 is the Master Calendar's last contest (the SDFHOA calendar ends
 * the regular season Oct 29; the Section's date wins, docs/LEAGUE-RULES.md records the conflict). The seeding
 * meeting is the advisory calendar's (Oct 31, 10 AM, Zoom); the play-ins and the finals site are SDFHOA's.
 */
export function sdsKeyDates(): LeagueConfig['keyDates'] {
  return [
    { id: 'league-play-ends', date: '2026-10-30', label: 'Last day of the San Diego Section regular season' },
    { id: 'seeding-meeting', date: '2026-10-31', label: 'Section seeding meeting' },
    { id: 'play-in', date: '2026-11-02', label: 'Section play-in game (Division II)' },
    { id: 'finals', date: '2026-11-14', label: 'Section finals at La Jolla HS' },
  ];
}

/** San Diego leaguePlay.last: the Master Calendar's last contest, Oct 30, for every division. */
export const SDS_LEAGUE_PLAY_LAST = '2026-10-30';

// Each division's leaguePlay.first is its earliest game between two members, neither row contestType 2 or 4,
// not deleted, on MaxPreps' 2026-27 schedules (inventory/schedules, harvested 2026-10-06 ~00:05 UTC).
