/**
 * The Santa Cruz Coast Athletic League (CCS), girls soccer 2026-27 (lib/leagues.ts, `SCVAL_SPORT=soccer`). Its teams
 * are lib/registry/soccer/sccal.ts. Added with the PAL at the owner's request (2026-11-21).
 *
 * Sources, all read 2026-11-21:
 *  - SCCAL Article XL – Boys and Girls Soccer (BYLAWS below, cited as "Article XL – Soccer") and the SCCAL Policy Section "SCCAL Automatic Qualifiers
 *    to CCS" (POLICY below), both linked from sccal.org/constitution-and-sport-by-laws/. Sections cited as the
 *    documents number them.
 *  - "SCCAL 2026-27 Girls Soccer (6 teams)", linked from sccal.org/sports-schedules/: a double round robin of ten
 *    games a team, Tue Jan 12 to Thu Feb 11, 2027; the regular season ends Wed Feb 17 and CCS entries are due and
 *    seeded Thu Feb 18. A league game is a game between two of the six inside league play
 *    (`classification: 'membership'`).
 *  - The CCS's League Placement and Classification by Sport 2026-27 ("Updated: 9/29/2026"): the same six schools.
 *    Mount Madonna, the league's seventh member school, fields no girls soccer team.
 *  - MaxPreps' "Santa Cruz Coast" girls soccer league (leagues/{id}/v1 and its standings): the same six.
 *
 * No SCCAL document counts the league's automatic CCS berths in girls soccer: Article XL §E.2 makes the regular
 * season's champion the league's #1 seed, and POLICY §2 says how its first, second and third places are settled
 * when the CCS gives it one, two or three. So one place is marked.
 */

import type { LeagueConfig } from '../shape';

const SCCAL_SITE = 'https://sccal.org/';
const SCCAL_SCHEDULES = 'https://sccal.org/sports-schedules/';
const SCCAL_BYLAWS_PAGE = 'https://sccal.org/constitution-and-sport-by-laws/';
const SCCAL_SOCCER_SCHEDULE = 'https://sccal.org/wp-content/uploads/pdf/2026-2027-SCCAL-Girls-Soccer.pdf';
const SCCAL_SOCCER_BYLAWS = 'https://sccal.org/wp-content/uploads/pdf/ARTICLE-XL-BG-Soccer.pdf';
// The article is titled “Boys and Girls Soccer”; the site names no other program (scripts/copy-rules.ts).
const BYLAWS = 'SCCAL Article XL – Soccer';
const POLICY = 'SCCAL Policy Section, Automatic Qualifiers to CCS';

export const SCCAL_SOCCER_LEAGUE: LeagueConfig = {
  id: 'sccal', sectionId: 'ccs',
  name: 'Santa Cruz Coast Athletic League', shortName: 'SCCAL',
  cities: 'Santa Cruz County',
  alignmentSource: 'its official schedule',
  officialUrl: SCCAL_SITE,
  links: [
    { label: 'SCCAL schedules', href: SCCAL_SCHEDULES },
    { label: 'SCCAL girls soccer schedule (PDF)', href: SCCAL_SOCCER_SCHEDULE },
    { label: 'SCCAL soccer by-laws (Article XL, PDF)', href: SCCAL_SOCCER_BYLAWS },
    { label: 'SCCAL constitution, by-laws and policies', href: SCCAL_BYLAWS_PAGE },
  ],
  // si.com's standings slugs (read 2026-11-21): used only to harvest team ids, never for membership.
  // Its scores cross-check MaxPreps' and backfill under D2's rules (lib/crosscheck/backfill.ts).
  sblive: { leagueSlugs: ['3911-sccal'], backfill: true },
  officialCodes: {},
  officialNames: {},
  withdrawnNames: [],
  membershipNote: null,
  divisions: [
    {
      id: 'sccal', leagueId: 'sccal', label: 'SCCAL', searchAliases: ['Santa Cruz Coast Athletic League', 'Santa Cruz Coast'],
      maxprepsLeagueId: 'f0f76997-476b-4257-810d-84fcc5d07284',
      maxprepsName: 'Santa Cruz Coast', maxprepsSlug: 'santa-cruz-coast',
      expectedTeams: 6, gamesPerTeam: 10,
      leaguePlay: { first: '2027-01-12', last: '2027-02-11' },
      official: {
        mode: 'none', scheduleUrl: SCCAL_SOCCER_SCHEDULE,
        note: 'The SCCAL publishes its girls soccer schedule as a PDF on sccal.org, and this site does not copy it. A league game here is a game between two SCCAL teams from January 12 to February 11, 2027, the dates of the schedule’s double round robin.',
      },
      maxprepsTeamCount: 6, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'records-only', knownCause: null,
      home: { miniRows: 3, lineAfter: 1, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 1, label: 'Automatic-berth line' },
    },
  ],
  rules: {
    points: { win: 3, tie: 1, loss: 0 }, orderBy: 'points', orderScope: 'table', gamesWord: 'league',
    // A game between two of the six inside league play counts.
    classification: 'membership', excludeContestTypes: [2, 4], postseasonFrom: '2027-02-18', leagueGameOverrides: [],
    matcher: 'two-phase',
    // POLICY §2.d (ties for 2nd or 3rd: head-to-head, then against the finishers above, then against the rest in
    // descending order, then a coin toss or drawing), which with no one above is §2.a.i.2's order for a tie for
    // 1st. The coin toss is not computed, so a tie that reaches it stays level.
    tiebreaks: { default: ['head-to-head', 'record-vs-placed', 'coin-flip'] },
    multiTeam: 'partition-restart', h2hUnmet: 'skip', drawNumbers: null, leagueOvertime: 'none',
    citations: {
      points: `${BYLAWS} §E.1 (a win is 3 points, a tie 1 point, a loss 0 points)`,
      pointsShort: 'SCCAL Art. XL §E.1',
      order: `${BYLAWS} §E.1 (the league champion is the team with the most points in SCCAL play)`,
      doubleRoundRobin: 'SCCAL 2026-27 girls soccer schedule (double round robin: 10 league games each)',
      overtime: `${BYLAWS} §B.3 (“In all league contests, in the event of a tie, it will stay as a tie (ie, no overtime)”)`,
      coChampions: `${BYLAWS} §E.1.d (teams level on points are co-champions)`,
      stages: {
        'head-to-head': `${POLICY} §2.a.i.2.a and §2.d.i (head-to-head competition against each other)`,
        'record-vs-placed': `${POLICY} §2.d.ii-iii and §2.a.i.2.b (head-to-head competition against the league finishers above, then against the remaining league finishers, in descending order)`,
        'coin-flip': `${POLICY} §2.a.i.2.c and §2.d.iv (a coin toss, or a drawing for three or more teams, by the League Commissioner — we do not compute it, so the teams stay level)`,
      },
    },
    coChampionsLabel: 'Co-champions',
    unresolvedSuffix: '— the SCCAL’s Automatic Qualifiers policy settles it by a coin toss or a drawing',
  },
  postseason: {
    kind: 'ccs-ladder', autoBerths: 1,
    citation: `${BYLAWS} §E.2 (the SCCAL regular season champion is the league’s #1 seed for the CCS playoffs) and ${POLICY} §2 (how the league’s places are settled when the CCS gives it one, two or three automatic qualifiers); no SCCAL document gives the girls soccer count`,
    ladder: [
      { divisions: ['sccal'], places: [1, 1], status: 'aq', label: 'League’s #1 CCS seed',
        phrase: 'the league’s #1 CCS seed', badge: '#1 seed', legend: 'League champion — the SCCAL’s #1 seed to the CCS' },
      { divisions: ['sccal'], places: [2, 99], status: 'no-aq-route', label: 'No automatic berth named',
        phrase: 'no automatic berth named by the league', badge: 'No AQ',
        legend: '2nd or lower — the SCCAL’s documents name no automatic berth below its champion (any other is the CCS’s allocation; at-large is the CCS committee’s call)' },
    ],
    pairings: [],
  },
  phases: [
    { phase: 'regular', through: 'league-play' },
    { phase: 'playoffs', through: '2027-02-27' },
  ],
  keyDates: [
    { id: 'league-play-ends', date: '2027-02-11', label: 'Last SCCAL league games' },
    { id: 'ccs-seeding', date: '2027-02-18', label: 'CCS seeding meeting' },
  ],
  officialChanges: null,
};
