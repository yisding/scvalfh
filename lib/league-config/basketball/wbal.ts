/**
 * The West Bay Athletic League (CCS), boys basketball 2026-27 (lib/leagues.ts, `SCVAL_SPORT=basketball`). Its teams
 * are lib/registry/basketball/wbal.ts. Added with the WCAL, the PAL and the SCCAL at the owner's request (2026-11-21).
 *
 * Sources, all read 2026-11-21:
 *  - WBAL By-Laws Article I – Basketball, a Google Doc linked from hs.wbalsports.org/bylaws.html (BYLAWS below; the
 *    document carries no revision date). Sections cited as the document numbers them.
 *  - "2026-27 WBAL Boys Basketball Standings" (hs.wbalsports.org/bbstb.html): one varsity table of eight teams.
 *  - The schedule, hs.wbalsports.org/bbskedb.html (a web page the league edits in place, where it also enters the
 *    scores): forty varsity games, ten a team, Tue Jan 12 to Tue Feb 16, 2027 (every team meets the other seven,
 *    and three of them twice); its header gives the CCS seeding meeting, Feb 17. The page is not bundled: a league
 *    game is a game between two of the eight inside league play (`classification: 'membership'`).
 *  - The CCS's League Placement and Classification by Sport 2026-27 ("Updated: 9/29/2026"): the same eight schools.
 *  - MaxPreps' "West Bay" boys basketball league (leagues/{id}/v1 and its standings): the same eight.
 */

import type { LeagueConfig } from '../shape';

const WBAL = 'https://hs.wbalsports.org/';
const WBAL_STANDINGS = 'https://hs.wbalsports.org/bbstb.html';
const WBAL_SCHEDULE = 'https://hs.wbalsports.org/bbskedb.html';
const WBAL_BASKETBALL_BYLAWS = 'https://docs.google.com/document/d/1DpT7DX8S075x_7UxOdvcAcAVeIpfxCCd_mk9aF-Mirg/edit';
const BYLAWS = 'WBAL By-Laws Article I – Basketball';

export const WBAL_BASKETBALL_LEAGUE: LeagueConfig = {
  id: 'wbal', sectionId: 'ccs',
  name: 'West Bay Athletic League', shortName: 'WBAL',
  cities: 'the San Francisco Peninsula and San Jose',
  alignmentSource: 'its official standings and schedule',
  officialUrl: WBAL,
  links: [
    { label: 'WBAL boys basketball standings', href: WBAL_STANDINGS },
    { label: 'WBAL boys basketball schedule', href: WBAL_SCHEDULE },
    { label: 'WBAL By-Laws Article I – Basketball (Google Doc)', href: WBAL_BASKETBALL_BYLAWS },
  ],
  // si.com is not read for basketball: no league slugs, no backfill.
  sblive: { leagueSlugs: [], backfill: false },
  officialCodes: {},
  officialNames: {},
  withdrawnNames: [],
  membershipNote: null,
  divisions: [
    {
      id: 'wbal', leagueId: 'wbal', label: 'WBAL', searchAliases: ['West Bay Athletic League', 'West Bay'],
      maxprepsLeagueId: '048e1fd3-94f1-4bf2-896a-20b6fa8a9911',
      maxprepsName: 'West Bay', maxprepsSlug: 'west-bay',
      // Not a double round robin: ten games a team, so no fixed count is held (null).
      expectedTeams: 8, gamesPerTeam: null,
      leaguePlay: { first: '2027-01-12', last: '2027-02-16' },
      official: {
        mode: 'none', scheduleUrl: WBAL_SCHEDULE,
        note: 'The WBAL keeps its boys basketball schedule on a web page it edits through the season, so this site does not copy it. A league game here is a game between two WBAL teams from January 12 to February 16, 2027, the dates of the schedule’s league games.',
      },
      maxprepsTeamCount: 8, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'records-only', knownCause: null,
      home: { miniRows: 4, lineAfter: 2, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 2, label: 'Automatic-berth line' },
    },
  ],
  rules: {
    // "League Champions will be determined based on league win-loss record" (§107.1).
    points: { win: 1, tie: 0, loss: 0 }, orderBy: 'win-pct', orderScope: 'table', gamesWord: 'league',
    // A game between two of the eight inside league play counts; members also meet in preseason tournaments, which
    // MaxPreps types 2 (tournament).
    classification: 'membership', excludeContestTypes: [2, 4], postseasonFrom: '2027-02-17', leagueGameOverrides: [],
    matcher: 'two-phase',
    // §108.4.1; the second-round record, head-to-head against the next-highest finisher, the originally scheduled
    // second-round game and the coin toss (§108.4.2-5) are not computed, so a tie that reaches them stays level.
    tiebreaks: { default: ['head-to-head', 'coin-flip'] },
    multiTeam: 'partition-restart', h2hUnmet: 'skip', drawNumbers: null, leagueOvertime: 'until-decided',
    citations: {
      points: `${BYLAWS} §107.1 (champions are decided on the league win-loss record)`,
      pointsShort: 'WBAL by-laws §107.1',
      order: `${BYLAWS} §107.1 (the league win-loss record) and §108.4 (the tiebreaks for the standings)`,
      doubleRoundRobin: `${BYLAWS} §102.1 and the 2026-27 schedule (the by-laws call for a double round robin; the 2026-27 schedule has 10 league games each)`,
      overtime: 'National Federation rules (a game level after four quarters goes to overtime periods until one team leads, so no game ends level)',
      coChampions: `${BYLAWS} §107.1 (two teams level on the league record are league co-champions)`,
      stages: {
        'head-to-head': `${BYLAWS} §108.4.1 (head-to-head competition, win vs. loss)`,
        'coin-flip': `${BYLAWS} §108.4.2-5 (the second-round record, head-to-head against the next-highest finishing team, the winner of the originally scheduled second-round game, then a coin toss — we compute none of these, so the teams stay level)`,
      },
    },
    coChampionsLabel: 'Co-champions',
    unresolvedSuffix: '— WBAL By-Laws §108.4.2-5 settle it on the second-round record, then a coin toss',
  },
  postseason: {
    kind: 'ccs-ladder', autoBerths: 2,
    citation: `${BYLAWS} §108.2 (“Boys: First and second place will receive the CCS berths”) and §108.3 (an at-large team must be .500 in league, out of league or overall)`,
    ladder: [
      { divisions: ['wbal'], places: [1, 2], status: 'aq', label: 'Automatic qualifier',
        phrase: 'automatic qualifier', badge: 'AQ', legend: 'Places 1-2 — automatic CCS qualifier' },
      { divisions: ['wbal'], places: [3, 99], status: 'no-aq-route', label: 'No automatic berth',
        phrase: 'no automatic berth', badge: 'No AQ', legend: '3rd or lower — no automatic berth (at-large is the CCS committee’s call)' },
    ],
    pairings: [],
  },
  phases: [
    { phase: 'regular', through: 'league-play' },
    { phase: 'playoffs', through: '2027-02-27' },
  ],
  keyDates: [
    { id: 'league-play-ends', date: '2027-02-16', label: 'Last WBAL league games' },
    { id: 'ccs-seeding', date: '2027-02-17', label: 'CCS seeding meeting' },
  ],
  officialChanges: null,
};
