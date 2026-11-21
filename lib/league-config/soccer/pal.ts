/**
 * The Peninsula Athletic League (CCS), girls soccer 2026-27 (lib/leagues.ts, `SCVAL_SPORT=soccer`). Its teams are
 * lib/registry/soccer/pal.ts. Added with the SCCAL at the owner's request (2026-11-21).
 *
 * Sources, all read 2026-11-21:
 *  - The PAL Soccer Bylaws, a PDF linked from pal.smcoe.org/about as "Soccer Bylaws" (BYLAWS below; the document
 *    carries no revision date). Sections cited as the document numbers them.
 *  - "Peninsula Athletic League Girls Soccer 2027", the Bay and Ocean schedules linked from
 *    pal.smcoe.org/current/schedules as "Soccer - Girls" (a PDF on Google Drive, "updated 11-13-2026"). Bay: seven
 *    teams, a double round robin of twelve games a team, Tue Dec 8, 2026 to Thu Feb 11, 2027. Ocean: nine teams
 *    (El Camino, Jefferson and Westmoor varsity only), a double round robin of sixteen games a team, Tue Dec 1,
 *    2026 to Thu Feb 11, 2027. The league replaces the file when it changes, so it is not bundled: a league game is
 *    a game between two members of one division inside its league play (`classification: 'membership'`).
 *  - The CCS's League Placement and Classification by Sport 2026-27 ("Updated: 9/29/2026"): the same two divisions.
 *  - The PAL Constitution, Article XI (teams tied for first are co-champions unless a sport's bylaws say otherwise).
 *  - MaxPreps' "PAL - Bay" and "PAL - Ocean" girls soccer leagues (leagues/{id}/v1 and their standings): the same
 *    sixteen teams.
 */

import type { LeagueConfig } from '../shape';

const PAL_SITE = 'https://pal.smcoe.org/';
const PAL_STANDINGS = 'https://pal.smcoe.org/standings';
const PAL_SCHEDULES = 'https://pal.smcoe.org/current/schedules';
const PAL_SOCCER_SCHEDULE = 'https://drive.google.com/file/d/1_tEauIp-4kL83Zciy1NRUW-ATSMWp8-O/view';
const PAL_SOCCER_BYLAWS = 'https://drive.google.com/file/d/18IXHxf-Tj7zJrwMAdthqM_MlIvZC2Eq4/view';
const BYLAWS = 'PAL Soccer Bylaws';
const note = (division: string, dates: string) =>
  `The PAL publishes its ${division} girls soccer schedule as a PDF it replaces when the schedule changes, so this site does not copy it. A league game here is a game between two ${division} teams ${dates}, the dates of the schedule’s double round robin.`;

export const PAL_SOCCER_LEAGUE: LeagueConfig = {
  id: 'pal', sectionId: 'ccs',
  name: 'Peninsula Athletic League', shortName: 'PAL',
  cities: 'San Mateo County, from Atherton to Daly City',
  alignmentSource: 'its official schedules',
  officialUrl: PAL_SITE,
  links: [
    { label: 'PAL schedules', href: PAL_SCHEDULES },
    { label: 'PAL girls soccer schedule (PDF)', href: PAL_SOCCER_SCHEDULE },
    { label: 'PAL Soccer Bylaws (PDF)', href: PAL_SOCCER_BYLAWS },
    { label: 'PAL standings', href: PAL_STANDINGS },
  ],
  // si.com is not read for soccer: no league slugs, no backfill.
  sblive: { leagueSlugs: [], backfill: false },
  officialCodes: {},
  officialNames: {},
  withdrawnNames: [],
  membershipNote: null,
  divisions: [
    {
      id: 'bay', leagueId: 'pal', label: 'Bay', searchAliases: ['PAL Bay', 'Peninsula Bay'],
      maxprepsLeagueId: '14bdae55-45b3-46f2-9af8-f566486ec188',
      maxprepsName: 'PAL - Bay', maxprepsSlug: 'pal--bay',
      expectedTeams: 7, gamesPerTeam: 12,
      leaguePlay: { first: '2026-12-08', last: '2027-02-11' },
      official: { mode: 'none', scheduleUrl: PAL_SOCCER_SCHEDULE, note: note('Bay', 'from December 8, 2026 to February 11, 2027') },
      maxprepsTeamCount: 7, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'records-only', knownCause: null,
      home: { miniRows: 4, lineAfter: 3, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 3, label: 'Automatic-berth line' },
    },
    {
      id: 'ocean', leagueId: 'pal', label: 'Ocean', searchAliases: ['PAL Ocean', 'Peninsula Ocean'],
      maxprepsLeagueId: '0470033f-2086-4b06-87d1-aefa8afd3578',
      maxprepsName: 'PAL - Ocean', maxprepsSlug: 'pal--ocean',
      expectedTeams: 9, gamesPerTeam: 16,
      leaguePlay: { first: '2026-12-01', last: '2027-02-11' },
      official: { mode: 'none', scheduleUrl: PAL_SOCCER_SCHEDULE, note: note('Ocean', 'from December 1, 2026 to February 11, 2027') },
      maxprepsTeamCount: 9, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'records-only', knownCause: null,
      home: { miniRows: 3, lineAfter: 1, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 1, label: 'Automatic-berth line' },
    },
  ],
  rules: {
    points: { win: 3, tie: 1, loss: 0 }, orderBy: 'points', orderScope: 'table', gamesWord: 'division',
    // A game between two members of one division inside its league play counts.
    classification: 'membership', excludeContestTypes: [2, 4], postseasonFrom: '2027-02-18', leagueGameOverrides: [],
    matcher: 'two-phase',
    // §9.1.1-9.1.3: head-to-head, then the record against each other team from the top of the standings down (the
    // teams above the tie, then those below it); §9.1.4 (CCS power points) and §9.1.5 (a coin flip) are not
    // computed, so a tie that reaches them stays level.
    tiebreaks: { default: ['head-to-head', 'record-vs-placed', 'ccs-points'] },
    multiTeam: 'partition-restart', h2hUnmet: 'skip', drawNumbers: null, leagueOvertime: 'none',
    citations: {
      points: `${BYLAWS} §8.2.1 (a win is 3 points, a tie 1 point, a loss 0 points)`,
      pointsShort: 'PAL soccer bylaws §8.2.1',
      order: `${BYLAWS} §8.2 (championships are decided by the league standings and the championship point system) and §9.1 (every tie is broken before the CCS playoffs)`,
      doubleRoundRobin: 'PAL 2027 girls soccer schedules (double round robin: 12 league games each in the Bay, 16 in the Ocean)',
      overtime: `${BYLAWS} §13.5 (“There will be no overtime periods in round-robin league play”, so a level game stands as a tie)`,
      coChampions: 'PAL Constitution Article XI (all teams tying for first place are declared co-champions)',
      stages: {
        'head-to-head': `${BYLAWS} §9.1.1 (won-lost versus each other)`,
        'record-vs-placed': `${BYLAWS} §9.1.2-9.1.3 (won-lost versus the teams above in the standing, then the teams below, in order of finish)`,
        'ccs-points': `${BYLAWS} §9.1.4-9.1.5 (CCS power points, then a coin flip by the commissioner — we compute neither, so the teams stay level)`,
      },
    },
    coChampionsLabel: 'Co-champions',
    unresolvedSuffix: '— PAL Soccer Bylaws §9.1.4-9.1.5 settle it on CCS power points, then a coin flip',
  },
  postseason: {
    kind: 'ccs-ladder', autoBerths: 4,
    citation: `${BYLAWS} §8.1 (“Both boys and girls will send Bay #1, Bay #2, Bay #3, and Ocean #1 as automatic qualifiers to CCS”)`,
    ladder: [
      { divisions: ['bay'], places: [1, 3], status: 'aq', label: 'Automatic qualifier',
        phrase: 'automatic qualifier', badge: 'AQ', legend: 'Places 1-3 — automatic CCS qualifier' },
      { divisions: ['bay'], places: [4, 99], status: 'no-aq-route', label: 'No automatic berth',
        phrase: 'no automatic berth', badge: 'No AQ', legend: '4th or lower — no automatic berth (at-large is the CCS committee’s call)' },
      { divisions: ['ocean'], places: [1, 1], status: 'aq', label: 'Automatic qualifier',
        phrase: 'automatic qualifier', badge: 'AQ', legend: 'Division champion — automatic CCS qualifier' },
      { divisions: ['ocean'], places: [2, 99], status: 'no-aq-route', label: 'No automatic berth',
        phrase: 'no automatic berth', badge: 'No AQ', legend: '2nd or lower — no automatic berth (at-large is the CCS committee’s call)' },
    ],
    pairings: [],
  },
  phases: [
    { phase: 'regular', through: 'league-play' },
    { phase: 'playoffs', through: '2027-02-27' },
  ],
  keyDates: [
    { id: 'league-play-ends', date: '2027-02-11', label: 'Last PAL league games' },
    { id: 'ccs-seeding', date: '2027-02-18', label: 'CCS seeding meeting' },
  ],
  officialChanges: null,
};
