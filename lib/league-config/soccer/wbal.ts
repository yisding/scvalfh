/**
 * The West Bay Athletic League (CCS), girls soccer 2026-27 (lib/leagues.ts, `SCVAL_SPORT=soccer`). Its teams
 * are lib/registry/soccer/wbal.ts. Added with the WCAL at the owner's request (2026-11-14).
 *
 * Sources, all read 2026-11-14:
 *  - WBAL By-Laws Article VI – Soccer, a Google Doc linked from hs.wbalsports.org/bylaws.html (BYLAWS below; the
 *    document carries no revision date). Sections cited as the document numbers them.
 *  - "2026-27 WBAL Girls Soccer Standings" (hs.wbalsports.org/socstg.html): the two varsity divisions.
 *  - The two division schedules, hs.wbalsports.org/socskedgfoot.html and socskedgsky.html (web pages the league
 *    edits in place, where it also enters the scores). Foothill: a double round robin of twelve games a team,
 *    Castilleja at Crystal on Fri Dec 18, 2026 and the rest from Tue Jan 5 to Mon Feb 15, 2027. Skyline: a
 *    double round robin of ten games a team, Thu Jan 7 to Fri Feb 12, 2027. Their headers give the CCS seeding
 *    meeting, Feb 18. The pages are not bundled: a league game is a game between two members of one division
 *    inside its league play (`classification: 'membership'`).
 *  - MaxPreps' two West Bay girls soccer leagues (leagues/{id}/v1 and their standings).
 */

import type { LeagueConfig } from '../shape';

const WBAL = 'https://hs.wbalsports.org/';
export const WBAL_STANDINGS = 'https://hs.wbalsports.org/socstg.html';
const FOOTHILL_SCHEDULE = 'https://hs.wbalsports.org/socskedgfoot.html';
const SKYLINE_SCHEDULE = 'https://hs.wbalsports.org/socskedgsky.html';
const WBAL_SOCCER_BYLAWS = 'https://docs.google.com/document/d/1ZC6DbeNzCTIN5c9TkV9HZHwKgBr7C-ew5K0pRDdP2Q8/edit';
const BYLAWS = 'WBAL By-Laws Article VI – Soccer';
const note = (division: string, dates: string) =>
  `The WBAL keeps its ${division} girls soccer schedule on a web page it edits through the season, so this site does not copy it. A league game here is a game between two ${division} teams ${dates}, the dates of the schedule’s double round robin.`;

export const WBAL_SOCCER_LEAGUE: LeagueConfig = {
  id: 'wbal', sectionId: 'ccs',
  name: 'West Bay Athletic League', shortName: 'WBAL',
  cities: 'the San Francisco Peninsula and San Jose',
  alignmentSource: 'its official standings and schedules',
  officialUrl: WBAL,
  links: [
    { label: 'WBAL girls soccer standings', href: WBAL_STANDINGS },
    { label: 'WBAL girls soccer Foothill schedule', href: FOOTHILL_SCHEDULE },
    { label: 'WBAL girls soccer Skyline schedule', href: SKYLINE_SCHEDULE },
    { label: 'WBAL By-Laws Article VI – Soccer (Google Doc)', href: WBAL_SOCCER_BYLAWS },
  ],
  // si.com is not read for soccer: no league slugs, no backfill.
  sblive: { leagueSlugs: [], backfill: false },
  officialCodes: {},
  officialNames: {},
  withdrawnNames: [],
  membershipNote: null,
  divisions: [
    {
      id: 'foothill', leagueId: 'wbal', label: 'Foothill', searchAliases: ['West Bay Foothill'],
      maxprepsLeagueId: 'ddee84e9-44d4-4a16-934a-6e929fd46e37',
      maxprepsName: 'West Bay - Foothill', maxprepsSlug: 'west-bay--foothill',
      expectedTeams: 7, gamesPerTeam: 12,
      leaguePlay: { first: '2026-12-18', last: '2027-02-15' },
      official: { mode: 'none', note: note('Foothill', 'from December 18, 2026 to February 15, 2027') },
      // MaxPreps keeps Presentation's girls soccer team in no league (read 2026-11-14).
      maxprepsTeamCount: 6, maxprepsMissing: ['presentation'], maxprepsExtraRows: {}, reportedTrust: 'records-only',
      knownCause: 'MaxPreps lists Presentation in no league, so its West Bay Foothill table has six teams and leaves Presentation’s games out of the others’ league records. Presentation is in the WBAL’s own Foothill table and schedule.',
      home: { miniRows: 4, lineAfter: 3, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 3, label: 'Automatic-berth line' },
    },
    {
      id: 'skyline', leagueId: 'wbal', label: 'Skyline', searchAliases: ['West Bay Skyline'],
      maxprepsLeagueId: '6b936de1-3430-4ec1-942a-2799f9bb4cb6',
      maxprepsName: 'West Bay - Skyline', maxprepsSlug: 'west-bay--skyline',
      expectedTeams: 6, gamesPerTeam: 10,
      leaguePlay: { first: '2027-01-07', last: '2027-02-12' },
      official: { mode: 'none', note: note('Skyline', 'from January 7 to February 12, 2027') },
      maxprepsTeamCount: 6, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'records-only', knownCause: null,
      home: { miniRows: 3, lineAfter: 1, lineLabel: 'Berth-playoff line' },
      ladderLine: { after: 1, label: 'Berth-playoff line' },
    },
  ],
  rules: {
    points: { win: 3, tie: 1, loss: 0 }, orderBy: 'points', orderScope: 'table', gamesWord: 'division',
    // A game between two members of one division inside its league play counts.
    classification: 'membership', excludeContestTypes: [2, 4], postseasonFrom: '2027-02-16', leagueGameOverrides: [],
    matcher: 'two-phase',
    // §607.2.2 items 1-3; "second round total points" and the coin flip are not computed, so a tie that reaches
    // them stays level. The girls' section states no rule for three or more teams; the boys' (§607.1) sends the
    // teams still level back to the first tiebreaker, which is what 'partition-restart' does.
    tiebreaks: { default: ['head-to-head', 'h2h-goal-diff', 'division-goals-against', 'coin-flip'] },
    multiTeam: 'partition-restart', h2hUnmet: 'skip', drawNumbers: null, leagueOvertime: 'none',
    citations: {
      points: `${BYLAWS} §604.2 (3 points for a win, 1 for a tie, 0 for a loss)`,
      pointsShort: 'WBAL by-laws §604.2',
      order: `${BYLAWS} §604.2 (league standings are decided on points)`,
      doubleRoundRobin: `${BYLAWS} §604.3 and the 2026-27 schedules (double round robin, home and home: 12 games each in Foothill, 10 in Skyline)`,
      overtime: `${BYLAWS} §604.7 (“If the score is tied at the end of regulation it will be recorded as a tie”)`,
      coChampions: 'WBAL Athletic Directors’ Handbook, League Championships 4.4 (a tie for first place means co-champions)',
      stages: {
        'head-to-head': `${BYLAWS} §607.2.2 (1: head-to-head record)`,
        'h2h-goal-diff': `${BYLAWS} §607.2.2 (2: head-to-head goal differential)`,
        'division-goals-against': `${BYLAWS} §607.2.2 (3: fewest goals against in all league contests)`,
        'coin-flip': `${BYLAWS} §607.2.2 (4-5: second-round total points, then a coin flip — we compute neither, so the teams stay level)`,
      },
    },
    coChampionsLabel: 'Co-champions',
    unresolvedSuffix: '— WBAL By-Laws §607.2.2 settle it on second-round points, then a coin flip',
  },
  postseason: {
    kind: 'ccs-ladder', autoBerths: 4,
    citation: `${BYLAWS} §607.2 (four CCS berths for girls soccer: Foothill’s first three are automatic, and Foothill’s fourth-place team plays at the Skyline winner in a one-game playoff for the fourth)`,
    ladder: [
      { divisions: ['foothill'], places: [1, 3], status: 'aq', label: 'Automatic qualifier',
        phrase: 'automatic qualifier', badge: 'AQ', legend: 'Places 1-3 — automatic CCS qualifier' },
      { divisions: ['foothill'], places: [4, 4], status: 'play-in', label: 'Berth playoff',
        phrase: 'the berth playoff', badge: 'Playoff',
        legend: '4th place — plays at the Skyline winner in a one-game playoff for the WBAL’s 4th berth (no date is published)' },
      { divisions: ['foothill'], places: [5, 99], status: 'no-aq-route', label: 'No automatic berth',
        phrase: 'no automatic berth', badge: 'No AQ', legend: '5th or lower — no automatic berth (at-large is the CCS committee’s call)' },
      { divisions: ['skyline'], places: [1, 1], status: 'play-in', label: 'Hosts the berth playoff',
        phrase: 'hosting the berth playoff', badge: 'Playoff host',
        legend: 'Division winner — hosts Foothill’s 4th-place team in a one-game playoff for the WBAL’s 4th berth (no date is published)' },
      { divisions: ['skyline'], places: [2, 99], status: 'no-aq-route', label: 'No automatic berth',
        phrase: 'no automatic berth', badge: 'No AQ', legend: '2nd or lower — no automatic berth (at-large is the CCS committee’s call)' },
    ],
    pairings: [],
  },
  phases: [
    { phase: 'regular', through: 'league-play' },
    { phase: 'playoffs', through: '2027-02-27' },
  ],
  keyDates: [
    { id: 'league-play-ends', date: '2027-02-15', label: 'Last WBAL league games' },
    { id: 'ccs-seeding', date: '2027-02-18', label: 'CCS seeding meeting' },
  ],
  officialChanges: null,
};
