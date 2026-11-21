/**
 * The Valley Athletic League, girls soccer 2026-27 (lib/leagues.ts, `SCVAL_SPORT=val-soccer`): the after-school
 * league of eleven middle schools in the Cupertino Union, Los Altos, Mountain View Whisman and Sunnyvale school
 * districts. Its teams are lib/registry/val-soccer/val.ts. The VAL belongs to no CIF section and sends no team on to
 * a section's playoffs: its own playoffs end its season.
 *
 * Sources, all read 2026-11-21 on valleyal.org (TeamSideline):
 *  - The home page: the four districts and eleven campuses; "Season #3 (12/7 - 2/4) … 7th/8th Girls' Soccer, 6th/7th
 *    Girls' Soccer"; "Each season consists of one week of tryouts, either five or six weeks of games, and then one
 *    week of playoffs."
 *  - RULES, the league's Girls Soccer rules page (content/8308, "VAL Soccer Rules"): NFHS rules with the league's
 *    modifications, cited below by their own numbers (18 the points, 19 the overtime, 7 the halves, 20 the
 *    five-goal rule, T1-T3 the playoff seeding tiebreakers).
 *  - The 7th/8th grade schedule page (lib/sports/val-soccer.ts `pages.main`): eleven teams, one game against each
 *    other team (ten a team, 55 in all) from Mon Dec 14, 2026 to Thu Jan 28, 2027, at 4:00 PM on the home school's
 *    field; then its playoff schedule: Playoff Round 1 Mon Feb 1 (G1 4th v 5th, G2 3rd v 6th), Round 2 Tue Feb 2 (G3
 *    1st v the G1 winner, G4 2nd v the G2 winner), and Round 3, the Championship Round, Thu Feb 4 (G5, the G3 and
 *    G4 winners), every playoff game at a field still "TBD".
 *  - The League Champions pages (content/36953, 2025-2026), which list each level's "Division Champion".
 *
 * Every game between two of the eleven is a league game: the schedule page is the league's whole season
 * (`classification: 'membership'`), and the league plays no one else.
 */

import type { LeagueConfig } from '../shape';

const VAL_SITE = 'https://valleyal.org/';
const VAL_SCHEDULE = 'https://valleyal.org/schedule/731407/0/1/7th8th-grade';
const VAL_SCHEDULE_YOUNGER = 'https://valleyal.org/schedule/731408/0/1/6th7th-grade';
const VAL_RULES = 'https://valleyal.org/content/8308/Girls-Soccer';
const VAL_SCHOOLS = 'https://valleyal.org/content/8260/Schools';
const VAL_CHAMPIONS = 'https://valleyal.org/content/36953/2025-2026-League-Champions';
const RULES = 'VAL Soccer Rules';

export const VAL_SOCCER_LEAGUE: LeagueConfig = {
  id: 'val', sectionId: 'none',
  name: 'Valley Athletic League', shortName: 'VAL',
  cities: 'Cupertino, Los Altos, Mountain View, San Jose and Sunnyvale',
  alignmentSource: 'its own schedule pages',
  officialUrl: VAL_SITE,
  links: [
    { label: 'VAL 7th/8th grade girls soccer schedule and standings', href: VAL_SCHEDULE },
    { label: 'VAL 6th/7th grade girls soccer schedule and standings', href: VAL_SCHEDULE_YOUNGER },
    { label: 'VAL soccer rules', href: VAL_RULES },
    { label: 'VAL schools', href: VAL_SCHOOLS },
    { label: 'VAL league champions, 2025-26', href: VAL_CHAMPIONS },
  ],
  // si.com carries no VAL school.
  sblive: { leagueSlugs: [], backfill: false },
  officialCodes: {},
  officialNames: {},
  withdrawnNames: [],
  membershipNote: null,
  divisions: [
    {
      id: 'val', leagueId: 'val', label: 'VAL', searchAliases: ['Valley Athletic League', 'Valley'],
      // MaxPreps carries no VAL school: no table of its own, so every member is in maxprepsMissing. The league's
      // own table is read with its schedule (lib/pipeline/steps/teamsideline.ts) and compared instead.
      maxprepsLeagueId: null,
      maxprepsName: null, maxprepsSlug: null,
      expectedTeams: 11, gamesPerTeam: 10,
      leaguePlay: { first: '2026-12-14', last: '2027-01-28' },
      official: {
        mode: 'none', scheduleUrl: VAL_SCHEDULE,
        note: 'The VAL’s schedule page is where this site reads every game and score, so the league’s own schedule is the whole season here: every game between two VAL schools is a league game.',
      },
      maxprepsTeamCount: 0,
      maxprepsMissing: ['blach', 'columbia', 'crittenden', 'cupertino-ms', 'egan', 'graham', 'hyde', 'kennedy', 'lawson', 'miller', 'sunnyvale-ms'],
      maxprepsExtraRows: {}, reportedTrust: 'records-only', knownCause: null,
      home: { miniRows: 6, lineAfter: 6, lineLabel: 'Playoff line' },
      ladderLine: { after: 6, label: 'Playoff line' },
    },
  ],
  rules: {
    // RULES 18: "Regular season points: Win = 3 points, Tie = 1 point".
    points: { win: 3, tie: 1, loss: 0 }, orderBy: 'points', orderScope: 'table', gamesWord: 'league',
    classification: 'membership', excludeContestTypes: [], postseasonFrom: '2027-02-01', leagueGameOverrides: [],
    matcher: 'two-phase',
    // RULES T1-T3: head to head; with three or more, the record in the games among the tied teams, the rest
    // re-evaluated by head to head; then the goal differential in those games. The rules name nothing after that,
    // so a tie that reaches it stays level.
    tiebreaks: { default: ['head-to-head', 'h2h-goal-diff', 'no-rule'] },
    multiTeam: 'partition-restart', h2hUnmet: 'skip', drawNumbers: null, leagueOvertime: 'none',
    citations: {
      points: `${RULES} 18 (“Regular season points: Win = 3 points, Tie = 1 point”)`,
      pointsShort: 'VAL Soccer Rules 18',
      order: `${RULES} 18 and the league’s schedule page, whose table is ordered by points`,
      doubleRoundRobin: 'VAL 2026-27 girls soccer schedule (each team plays every other once: 10 league games each)',
      overtime: `${RULES} 19 (“No overtime for regular season games”)`,
      coChampions: `${RULES} T1-T3 (a tie for a playoff seed is broken; the rules name no co-champions)`,
      stages: {
        'head-to-head': `${RULES} T1 (“the winner of the head to head matchup is seeded higher”) and T2 (with three or more teams, the record in games against the tied teams; the remaining teams re-evaluated by head to head)`,
        'h2h-goal-diff': `${RULES} T3 (the goal differential in games among the involved teams)`,
        'no-rule': `${RULES} (nothing after T3: the teams stay level)`,
      },
    },
    coChampionsLabel: 'Level on points',
    unresolvedSuffix: '— the VAL’s rules name no tiebreaker after goal differential',
  },
  postseason: {
    kind: 'league-tournament', name: 'VAL playoffs', qualifiers: 6, byes: [1, 2],
    semifinals: 'fixed',
    ladder: [
      { divisions: '*', places: [1, 2], status: 'bye', label: 'Bye to Round 2',
        phrase: 'a bye to the second round', badge: 'Bye', legend: 'Places 1-2 — bye to Round 2, Tue Feb 2' },
      { divisions: '*', places: [3, 6], status: 'tournament', label: 'VAL playoffs',
        phrase: 'a VAL playoff place', badge: 'Top 6', legend: 'Places 3-6 — Round 1, Mon Feb 1 (4th hosts 5th, 3rd hosts 6th)' },
      { divisions: '*', places: [7, 99], status: 'below-line', label: 'Below the playoff line',
        phrase: 'below the playoff line', badge: 'Below line', legend: '7th or lower — outside the six-team VAL playoffs' },
    ],
    rounds: [
      { id: 'qf-1', round: 'quarterfinal', date: '2027-02-01', time: '16:00', optional: false, pairing: 'G1: 5th at 4th' },
      { id: 'qf-2', round: 'quarterfinal', date: '2027-02-01', time: '16:00', optional: false, pairing: 'G2: 6th at 3rd' },
      { id: 'sf-1', round: 'semifinal', date: '2027-02-02', time: '16:00', optional: false, pairing: 'G3: the G1 winner at 1st' },
      { id: 'sf-2', round: 'semifinal', date: '2027-02-02', time: '16:00', optional: false, pairing: 'G4: the G2 winner at 2nd' },
      { id: 'final', round: 'final', date: '2027-02-04', time: '16:00', optional: false, pairing: 'G5: the G3 and G4 winners, at a field still to be set' },
    ],
    // The schedule page puts every playoff game at "TBD Field": no fixed site is published.
    finalSite: null,
    lastSpot: null,
    citations: {
      format: 'VAL 2026-27 girls soccer playoff schedule (six teams; 1st and 2nd have byes to Round 2)',
      seeding: `${RULES} T1-T3 (seeded from the regular-season table, ties broken head to head, then by goal differential among the tied teams)`,
      semifinal: 'VAL 2026-27 girls soccer playoff schedule (a fixed bracket: 1st hosts the winner of 4th v 5th, 2nd hosts the winner of 3rd v 6th)',
      lastSpot: null,
      qualifiersConflict: null,
      pennant: 'VAL League Champions page (one “Division Champion” for each level)',
    },
    titleNote: 'The VAL’s League Champions page lists one champion for each level.',
    // RULES 19: two 5-minute overtime periods, two 5-minute sudden-death periods, a five-player shootout, then
    // sudden-death penalty kicks. How the league's page records a shootout's result is not yet known.
    shootoutNote: 'VAL playoff games level after overtime are decided by penalty kicks (VAL Soccer Rules 19); the league’s page may show such a game level.',
    resultNotes: {},
    sourceUrl: VAL_SCHEDULE,
  },
  phases: [
    { phase: 'regular', through: 'league-play' },
    { phase: 'tournament', through: '2027-02-04' },
  ],
  keyDates: [
    { id: 'league-play-ends', date: '2027-01-28', label: 'Last VAL league games' },
    { id: 'playoffs-start', date: '2027-02-01', label: 'VAL playoffs begin' },
    { id: 'final', date: '2027-02-04', label: 'VAL championship games' },
  ],
  officialChanges: null,
};
