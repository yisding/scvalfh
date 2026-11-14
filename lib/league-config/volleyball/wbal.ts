/**
 * The West Bay Athletic League (CCS), girls volleyball 2026 (lib/leagues.ts, `SCVAL_SPORT=volleyball`). Its
 * teams are lib/registry/volleyball/wbal.ts. Added with the WCAL at the owner's request (2026-11-14).
 *
 * Sources, all read 2026-11-14:
 *  - WBAL By-Laws Article X – Volleyball, a Google Doc linked from hs.wbalsports.org/bylaws.html (BYLAWS below;
 *    the document carries no revision date). Sections cited as the document numbers them.
 *  - "2026-27 WBAL Volleyball Standings" (hs.wbalsports.org/vbstg.html): the two varsity divisions and their
 *    final records (Sacred Heart Prep 12-0 in Foothill, Castilleja 9-1 in Skyline).
 *  - The two division schedules, hs.wbalsports.org/vbskedgfoot.html and vbskedgsky.html (web pages the league
 *    edits in place, where it also enters the results). Foothill: a double round robin of twelve matches a team,
 *    Wed Sep 9 to Tue Oct 27, 2026. Skyline: a double round robin of ten, Tue Sep 22 to Tue Oct 27. Their headers
 *    give the CCS seeding meeting, Oct 29. The pages are not bundled: a league match is a match between two
 *    members of one division inside its league play that MaxPreps does not type as a tournament game
 *    (`classification: 'membership'`).
 *  - MaxPreps' two West Bay girls volleyball leagues (leagues/{id}/v1 and their standings): the same teams.
 *
 * §1007.4's tiebreakers are "For CCS Advancement only": the league's own table prints teams level on the record
 * as tied (T4 in both divisions in 2026). This site applies the same steps to order its table, and says so.
 */

import type { LeagueConfig } from '../shape';

const WBAL = 'https://hs.wbalsports.org/';
export const WBAL_STANDINGS = 'https://hs.wbalsports.org/vbstg.html';
const FOOTHILL_SCHEDULE = 'https://hs.wbalsports.org/vbskedgfoot.html';
const SKYLINE_SCHEDULE = 'https://hs.wbalsports.org/vbskedgsky.html';
const WBAL_VOLLEYBALL_BYLAWS = 'https://docs.google.com/document/d/1OOoL0elx2kfCvazpIZJ3czcBKM2x0IrDHZBkTFhC2_A/edit';
const BYLAWS = 'WBAL By-Laws Article X – Volleyball';
const note = (division: string, dates: string) =>
  `The WBAL keeps its ${division} girls volleyball schedule on a web page it edits through the season, so this site does not copy it. A league match here is a match between two ${division} teams ${dates}, the dates of the schedule’s double round robin, that is not a tournament match.`;

export const WBAL_VOLLEYBALL_LEAGUE: LeagueConfig = {
  id: 'wbal', sectionId: 'ccs',
  name: 'West Bay Athletic League', shortName: 'WBAL',
  cities: 'the San Francisco Peninsula and San Jose',
  alignmentSource: 'its official standings and schedules',
  officialUrl: WBAL,
  links: [
    { label: 'WBAL volleyball standings', href: WBAL_STANDINGS },
    { label: 'WBAL girls volleyball Foothill schedule', href: FOOTHILL_SCHEDULE },
    { label: 'WBAL girls volleyball Skyline schedule', href: SKYLINE_SCHEDULE },
    { label: 'WBAL By-Laws Article X – Volleyball (Google Doc)', href: WBAL_VOLLEYBALL_BYLAWS },
  ],
  // si.com is not read for volleyball: no league slugs, no backfill.
  sblive: { leagueSlugs: [], backfill: false },
  officialCodes: {},
  officialNames: {},
  withdrawnNames: [],
  membershipNote: null,
  divisions: [
    {
      id: 'foothill', leagueId: 'wbal', label: 'Foothill', searchAliases: ['West Bay Foothill'],
      maxprepsLeagueId: '8a127ac4-5429-4c23-a4da-ac6dfd604b91',
      maxprepsName: 'West Bay - Foothill', maxprepsSlug: 'west-bay--foothill',
      expectedTeams: 7, gamesPerTeam: 12,
      leaguePlay: { first: '2026-09-09', last: '2026-10-27' },
      official: { mode: 'none', scheduleUrl: FOOTHILL_SCHEDULE, note: note('Foothill', 'from September 9 to October 27, 2026') },
      maxprepsTeamCount: 7, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'full', knownCause: null,
      home: { miniRows: 4, lineAfter: 3, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 3, label: 'Automatic-berth line' },
    },
    {
      id: 'skyline', leagueId: 'wbal', label: 'Skyline', searchAliases: ['West Bay Skyline'],
      maxprepsLeagueId: 'fede0b0b-e71f-4de5-9102-0bd1ca8b184c',
      maxprepsName: 'West Bay - Skyline', maxprepsSlug: 'west-bay--skyline',
      expectedTeams: 6, gamesPerTeam: 10,
      leaguePlay: { first: '2026-09-22', last: '2026-10-27' },
      official: { mode: 'none', scheduleUrl: SKYLINE_SCHEDULE, note: note('Skyline', 'from September 22 to October 27, 2026') },
      maxprepsTeamCount: 6, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'full', knownCause: null,
      home: { miniRows: 3, lineAfter: 1, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 1, label: 'Automatic-berth line' },
    },
  ],
  rules: {
    // §1007.1: the winner of the round robin is the league champion, and the league's table prints the match
    // record and its percentage; a win is one, and `pts` is league wins.
    points: { win: 1, tie: 0, loss: 0 }, orderBy: 'win-pct', orderScope: 'table', gamesWord: 'division',
    // A match between two members of one division inside its league play counts; members also meet in
    // tournaments, which MaxPreps types 2 (tournament) and which never count.
    classification: 'membership', excludeContestTypes: [2, 4], postseasonFrom: '2026-10-28', leagueGameOverrides: [],
    matcher: 'two-phase',
    // §1007.4 steps 1-2 (`h2h-goal-diff` is the difference of sets won and lost between the tied teams: a
    // volleyball score is sets). Step 3 is the points in those sets, which no feed here carries, so a tie that
    // reaches it stays level; steps 4-6 follow it.
    tiebreaks: { default: ['head-to-head', 'h2h-goal-diff', 'set-points'] },
    multiTeam: 'partition-restart', h2hUnmet: 'skip', drawNumbers: null, leagueOvertime: 'none',
    citations: {
      points: `${BYLAWS} §1007.1 (“The winner of the round robin is determined the League Champion”; the league’s table is ordered on the match record)`,
      pointsShort: 'WBAL by-laws §1007.1',
      order: `${BYLAWS} §1007.1 (the round robin’s winner is the division’s champion)`,
      doubleRoundRobin: `${BYLAWS} §1002.1 and the 2026 schedules (double round robin: 12 matches each in Foothill, 10 in Skyline)`,
      overtime: `${BYLAWS} §1004.1 (National Federation rules: a varsity match is three out of five games, so no match ends level)`,
      coChampions: `${BYLAWS} §1007.2-3 (teams level for the title are co-champions, or tri-champions)`,
      stages: {
        'head-to-head': `${BYLAWS} §1007.4 step 1 (head-to-head among the tied teams; the by-law breaks ties for CCS advancement only, and the league’s own table prints them level)`,
        'h2h-goal-diff': `${BYLAWS} §1007.4 step 2 (games won less games lost in the matches among the tied teams)`,
        'set-points': `${BYLAWS} §1007.4 steps 3-6 (points won less points lost among the tied teams, games and points won against the teams placed above them, then a coin toss — we compute none of these, so the teams stay level)`,
      },
    },
    coChampionsLabel: 'Co-champions',
    unresolvedSuffix: '— WBAL By-Laws §1007.4 steps 3-6 settle it on points among the tied teams, then on results against the teams above, then a coin toss',
  },
  postseason: {
    kind: 'ccs-ladder', autoBerths: 4,
    citation: `${BYLAWS} §1008.1 (Foothill’s top three places receive CCS berths; the fourth automatic qualifier is the Skyline top finisher, unless Foothill’s fourth-place team, below .500 both in and out of league, needs a playoff with it to advance)`,
    ladder: [
      { divisions: ['foothill'], places: [1, 3], status: 'aq', label: 'Automatic qualifier',
        phrase: 'automatic qualifier', badge: 'AQ', legend: 'Places 1-3 — automatic CCS qualifier' },
      { divisions: ['foothill'], places: [4, 99], status: 'no-aq-route', label: 'No automatic berth',
        phrase: 'no automatic berth', badge: 'No AQ',
        legend: '4th or lower — no automatic berth; the 4th-place team plays the Skyline winner for the last one only if it is below .500 both in and out of league' },
      { divisions: ['skyline'], places: [1, 1], status: 'aq', label: 'Automatic qualifier',
        phrase: 'automatic qualifier', badge: 'AQ',
        legend: 'Division winner — the WBAL’s 4th automatic qualifier, unless a playoff with Foothill’s 4th-place team is needed' },
      { divisions: ['skyline'], places: [2, 99], status: 'no-aq-route', label: 'No automatic berth',
        phrase: 'no automatic berth', badge: 'No AQ', legend: '2nd or lower — no automatic berth (at-large is the CCS committee’s call)' },
    ],
    pairings: [],
  },
  phases: [
    { phase: 'regular', through: 'league-play' },
    { phase: 'playoffs', through: '2026-11-07' },
  ],
  keyDates: [
    { id: 'league-play-ends', date: '2026-10-27', label: 'Last WBAL league matches' },
    { id: 'ccs-seeding', date: '2026-10-29', label: 'CCS seeding meeting' },
  ],
  officialChanges: null,
};
