/**
 * The West Catholic Athletic League (CCS), girls soccer 2026-27 (lib/leagues.ts, `SCVAL_SPORT=soccer`). Its
 * teams are lib/registry/soccer/wcal.ts. Added with the WBAL at the owner's request (2026-11-14).
 *
 * Sources, all read 2026-11-14:
 *  - WCAL By-Laws Article VII – Soccer ("Updated 2024-2025"), linked from wcalsports.org/governance/ as "Soccer"
 *    (BYLAWS below). Sections cited as the document numbers them.
 *  - The "2026-27 Composite Women's Varsity Soccer Schedule" linked from wcalsports.org/schedules/ as "WOMEN'S
 *    SOCCER" (a PDF grid of dates by six team columns: AM, AR, SHC, SF, SI, VC). Its league games are a double
 *    round robin, ten a team and thirty in all, from Wed Jan 6 to Wed Feb 17, 2027. The page says the schedules
 *    "are constantly changing", and the PDF's address changes when it is replaced, so the schedule is not
 *    bundled: a league game is a game between two of the six inside league play (`classification: 'membership'`).
 *    The grid has no other game between two members in those dates.
 *  - MaxPreps' WCAL girls soccer league (leagues/{id}/v1 and its standings): the same six teams.
 */

import type { LeagueConfig } from '../shape';

const WCAL_SCHEDULES = 'https://wcalsports.org/schedules/';
const WCAL_GOVERNANCE = 'https://wcalsports.org/governance/';
export const WCAL_STANDINGS = 'https://wcalsports.org/standings/';
const BYLAWS = 'WCAL By-Laws Article VII – Soccer (updated 2024-2025)';

export const WCAL_SOCCER_LEAGUE: LeagueConfig = {
  id: 'wcal', sectionId: 'ccs',
  name: 'West Catholic Athletic League', shortName: 'WCAL',
  cities: 'San Francisco, San Jose and Mountain View',
  alignmentSource: 'its official schedule',
  officialUrl: WCAL_SCHEDULES,
  links: [
    { label: 'WCAL schedules', href: WCAL_SCHEDULES },
    { label: 'WCAL by-laws (Article VII – Soccer)', href: WCAL_GOVERNANCE },
    { label: 'WCAL standings', href: WCAL_STANDINGS },
  ],
  // si.com is not read for soccer: no league slugs, no backfill.
  sblive: { leagueSlugs: [], backfill: false },
  officialCodes: {},
  officialNames: {},
  withdrawnNames: [],
  membershipNote: null,
  divisions: [
    {
      id: 'wcal', leagueId: 'wcal', label: 'WCAL', searchAliases: ['West Catholic Athletic League', 'West Catholic'],
      maxprepsLeagueId: 'ef5de1d8-7260-4767-9862-f0692026925f',
      maxprepsName: 'WCAL', maxprepsSlug: 'wcal',
      expectedTeams: 6, gamesPerTeam: 10,
      leaguePlay: { first: '2027-01-06', last: '2027-02-17' },
      official: {
        mode: 'none', scheduleUrl: WCAL_SCHEDULES,
        note: 'The WCAL publishes a composite girls soccer schedule on wcalsports.org and says its schedules are constantly changing, so this site does not copy it. A league game here is a game between two WCAL teams from January 6 to February 17, 2027, the dates of the schedule’s double round robin.',
      },
      maxprepsTeamCount: 6, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'records-only', knownCause: null,
      home: { miniRows: 4, lineAfter: 2, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 2, label: 'Automatic-berth line' },
    },
  ],
  rules: {
    points: { win: 3, tie: 1, loss: 0 }, orderBy: 'points', orderScope: 'table', gamesWord: 'league',
    // A game between two members inside league play counts (the composite schedule lists no other such game).
    classification: 'membership', excludeContestTypes: [2, 4], postseasonFrom: '2027-02-18', leagueGameOverrides: [],
    matcher: 'two-phase',
    // §13.B.1-2; the rest of §13.B (points against the teams above the tie, against the highest-ranked team above
    // it, against the teams below it, then chance) is not computed, so a tie that reaches it stays level.
    tiebreaks: { default: ['head-to-head', 'coin-flip'] },
    multiTeam: 'partition-restart', h2hUnmet: 'skip', drawNumbers: null, leagueOvertime: 'none',
    citations: {
      points: `${BYLAWS} §11 (3 points for a game won, 1 for a game tied, 0 for a game lost)`,
      pointsShort: 'WCAL by-laws Art. VII §11',
      order: `${BYLAWS} §11-12 (the winner of the round robin, on points, is the league champion)`,
      doubleRoundRobin: `${BYLAWS} §7.A and the 2026-27 composite schedule (double round robin: 10 league games each)`,
      overtime: `${BYLAWS} §4.H (“No overtimes shall be played in League games”, so a level game stands as a tie)`,
      coChampions: `${BYLAWS} §12.C (two teams level for the title that each beat the other are co-champions)`,
      stages: {
        'head-to-head': `${BYLAWS} §13.B.1-2 (head-to-head in league games; with more than two teams level, the most points in the games among them)`,
        'coin-flip': `${BYLAWS} §13.B.3-6 (points against the teams above the tie, against the highest-ranked team above it and against the teams below it, then a coin flip or drawing — we compute none of these, so the teams stay level)`,
      },
    },
    coChampionsLabel: 'Co-champions',
    unresolvedSuffix: '— WCAL By-Laws Article VII §13.B.3-6 settle it on points against the other teams, then by chance',
  },
  postseason: {
    kind: 'ccs-ladder', autoBerths: 2,
    citation: `${BYLAWS} §14.A (the winner and the second-place team of the round robin receive the league’s two automatic CCS berths) and §14.D (any team may apply to CCS as an at-large team, whatever its place)`,
    ladder: [
      { divisions: ['wcal'], places: [1, 2], status: 'aq', label: 'Automatic qualifier',
        phrase: 'automatic qualifier', badge: 'AQ', legend: 'Places 1-2 — automatic CCS qualifier' },
      { divisions: ['wcal'], places: [3, 99], status: 'no-aq-route', label: 'No automatic berth',
        phrase: 'no automatic berth', badge: 'No AQ', legend: '3rd or lower — no automatic berth (at-large is the CCS committee’s call)' },
    ],
    pairings: [],
  },
  phases: [
    { phase: 'regular', through: 'league-play' },
    { phase: 'playoffs', through: '2027-02-27' },
  ],
  keyDates: [
    { id: 'league-play-ends', date: '2027-02-17', label: 'Last WCAL league games' },
    { id: 'ccs-seeding', date: '2027-02-18', label: 'CCS seeding meeting' },
  ],
  officialChanges: null,
};
