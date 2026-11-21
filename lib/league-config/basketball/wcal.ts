/**
 * The West Catholic Athletic League (CCS), boys basketball 2026-27 (lib/leagues.ts, `SCVAL_SPORT=basketball`). Its
 * teams are lib/registry/basketball/wcal.ts. Added with the WBAL, the PAL and the SCCAL at the owner's request
 * (2026-11-21).
 *
 * Sources, all read 2026-11-21:
 *  - WCAL By-Laws Article II – Basketball ("Updated 2024-2025"), linked from wcalsports.org/governance/ as
 *    "Basketball" (BYLAWS below). Sections cited as the document numbers them.
 *  - The "West Catholic Athletic League 2026-27 Composite Varsity Boys Basketball Schedule" linked from
 *    wcalsports.org/schedules/ as "MEN'S BASKETBALL" (a PDF grid of dates by eight team columns: AM, AR, BCP, JS,
 *    SHC, SF, SI, VC; dated 11/18/2026). Its league games are a double round robin, fourteen a team, from Tue
 *    Jan 5 to Tue Feb 16, 2027. The page says the schedules "are constantly changing", and the PDF's address
 *    changes when it is replaced, so the schedule is not bundled: a league game is a game between two of the eight
 *    inside league play (`classification: 'membership'`). The grid has no other game between two members in
 *    those dates.
 *  - MaxPreps' "West Catholic" boys basketball league (leagues/{id}/v1 and its standings): the same eight teams.
 */

import type { LeagueConfig } from '../shape';

const WCAL_SCHEDULES = 'https://wcalsports.org/schedules/';
const WCAL_GOVERNANCE = 'https://wcalsports.org/governance/';
const WCAL_STANDINGS = 'https://wcalsports.org/standings/';
const BYLAWS = 'WCAL By-Laws Article II – Basketball (updated 2024-2025)';

export const WCAL_BASKETBALL_LEAGUE: LeagueConfig = {
  id: 'wcal', sectionId: 'ccs',
  name: 'West Catholic Athletic League', shortName: 'WCAL',
  cities: 'San Francisco, San Mateo, San Jose and Mountain View',
  alignmentSource: 'its official schedule',
  officialUrl: WCAL_SCHEDULES,
  links: [
    { label: 'WCAL schedules', href: WCAL_SCHEDULES },
    { label: 'WCAL by-laws (Article II – Basketball)', href: WCAL_GOVERNANCE },
    { label: 'WCAL standings', href: WCAL_STANDINGS },
  ],
  // si.com's standings slugs (read 2026-11-21): used only to harvest team ids, never for membership.
  // Its scores cross-check MaxPreps' and backfill under D2's rules (lib/crosscheck/backfill.ts).
  sblive: { leagueSlugs: ['2327-wcal'], backfill: true },
  officialCodes: {},
  officialNames: {},
  withdrawnNames: [],
  membershipNote: null,
  divisions: [
    {
      id: 'wcal', leagueId: 'wcal', label: 'WCAL', searchAliases: ['West Catholic Athletic League', 'West Catholic'],
      maxprepsLeagueId: '30698d7d-20bf-46b8-93c1-7450aa75a5c1',
      maxprepsName: 'West Catholic', maxprepsSlug: 'west-catholic',
      expectedTeams: 8, gamesPerTeam: 14,
      leaguePlay: { first: '2027-01-05', last: '2027-02-16' },
      official: {
        mode: 'none', scheduleUrl: WCAL_SCHEDULES,
        note: 'The WCAL publishes a composite boys basketball schedule on wcalsports.org and says its schedules are constantly changing, so this site does not copy it. A league game here is a game between two WCAL teams from January 5 to February 16, 2027, the dates of the schedule’s double round robin.',
      },
      maxprepsTeamCount: 8, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'records-only', knownCause: null,
      home: { miniRows: 4, lineAfter: 1, lineLabel: '#1 seed line' },
      ladderLine: { after: 1, label: '#1 seed line' },
    },
  ],
  rules: {
    // Two points a win and none a loss (§10), so the table is ordered on league wins: a win is one here, ordered on
    // the share of league games won while teams have played different numbers.
    points: { win: 1, tie: 0, loss: 0 }, orderBy: 'win-pct', orderScope: 'table', gamesWord: 'league',
    // A game between two members inside league play counts (the composite schedule lists no other such game);
    // members also meet in preseason tournaments, which MaxPreps types 2 (tournament).
    classification: 'membership', excludeContestTypes: [2, 4], postseasonFrom: '2027-02-17', leagueGameOverrides: [],
    matcher: 'two-phase',
    // §11.A-B.2; the rest of §11.B (wins above the tie, against the highest-placed team above it, below it, then
    // chance) is not computed, so a tie that reaches it stays level.
    tiebreaks: { default: ['head-to-head', 'coin-flip'] },
    multiTeam: 'partition-restart', h2hUnmet: 'skip', drawNumbers: null, leagueOvertime: 'until-decided',
    citations: {
      points: `${BYLAWS} §10 (two points for a game won, none for a game lost, so the table is ordered on league wins)`,
      pointsShort: 'WCAL by-laws Art. II §10',
      order: `${BYLAWS} §10 (the winner of the round robin is decided on points)`,
      doubleRoundRobin: `${BYLAWS} §7.A and the 2026-27 composite schedule (double round robin: 14 league games each)`,
      overtime: `${BYLAWS} §4.E (National Federation rules: a game level after four quarters goes to overtime periods until one team leads, so no game ends level)`,
      coChampions: `${BYLAWS} §11.A (two teams level for the title are separated on head-to-head; if neither has the better record against the other they are co-champions)`,
      stages: {
        'head-to-head': `${BYLAWS} §11.A and §11.B.1-2 (head-to-head in league games; with more than two teams level, the most wins among them)`,
        'coin-flip': `${BYLAWS} §11.B.3-6 (wins against the teams placed above the level teams, against the highest-placed of those and against the teams placed below, then a coin flip or drawing — we compute none of these, so the teams stay level)`,
      },
    },
    coChampionsLabel: 'Co-champions',
    unresolvedSuffix: '— WCAL By-Laws Article II §11.B.3-6 settle it on wins against the other teams, then by chance',
  },
  postseason: {
    kind: 'ccs-ladder', autoBerths: 1,
    citation: `${BYLAWS} §12.A (the winner of the round robin is the league’s #1 seed to the CCS) and §12.D (the other teams enter the CCS playoffs as at-large entries in the order of their league finish); no WCAL document gives a count of automatic berths`,
    ladder: [
      { divisions: ['wcal'], places: [1, 1], status: 'aq', label: 'League’s #1 CCS seed',
        phrase: 'the league’s #1 CCS seed', badge: '#1 seed', legend: 'League champion — the WCAL’s #1 seed to the CCS' },
      { divisions: ['wcal'], places: [2, 99], status: 'no-aq-route', label: 'At-large entry',
        phrase: 'an at-large entry', badge: 'At-large', legend: '2nd or lower — enters the CCS as an at-large entry, in the order of league finish' },
    ],
    pairings: [],
  },
  phases: [
    { phase: 'regular', through: 'league-play' },
    { phase: 'playoffs', through: '2027-02-27' },
  ],
  keyDates: [
    { id: 'league-play-ends', date: '2027-02-16', label: 'Last WCAL league games' },
    { id: 'ccs-seeding', date: '2027-02-17', label: 'CCS seeding meeting' },
  ],
  officialChanges: null,
};
