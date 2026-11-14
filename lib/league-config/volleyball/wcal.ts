/**
 * The West Catholic Athletic League (CCS), girls volleyball 2026 (lib/leagues.ts, `SCVAL_SPORT=volleyball`). Its
 * teams are lib/registry/volleyball/wcal.ts. Added with the WBAL at the owner's request (2026-11-14).
 *
 * Sources, all read 2026-11-14:
 *  - WCAL By-Laws Article XII – Volleyball and Article III – General Rulings (both "Updated 2024-2025"), linked
 *    from wcalsports.org/governance/ (BYLAWS and GENERAL below). Sections cited as the documents number them.
 *  - The "2026 Composite Women's Varsity Volleyball Schedule" linked from wcalsports.org/schedules/ as "WOMEN'S
 *    VOLLEYBALL" (a PDF grid of dates by six team columns: AM, AR, SHC, SF, SI, VC; stamped 9/1/26). Its league
 *    matches are a double round robin, ten a team and thirty in all, from Tue Sep 22 to Wed Oct 28, 2026. The
 *    PDF's address changes when it is replaced, so the schedule is not bundled: a league match is a match between
 *    two of the six inside league play that MaxPreps does not type as a tournament game
 *    (`classification: 'membership'`).
 *  - The league's weekly standings PDFs on wcalsports.org/standings/, the last "WCAL Women's Volleyball Final
 *    Standings", October 28, 2026 (Archbishop Mitty 10-0, champion).
 *  - MaxPreps' "West Catholic" girls volleyball league (leagues/{id}/v1 and its standings): the same six teams.
 *
 * The league has no girls' playoff (Article III §16.B lists none for girls volleyball; Article XII §14 and §16
 * are the boys'). No WCAL document states how many automatic CCS berths the league has in girls volleyball:
 * Article XII §17.A names the round robin's winner the league's #1 seed to the CCS, and Article III §17.D enters
 * the other teams as at-large entries in the order of their league finish. So one place is marked.
 */

import type { LeagueConfig } from '../shape';

const WCAL_SCHEDULES = 'https://wcalsports.org/schedules/';
const WCAL_GOVERNANCE = 'https://wcalsports.org/governance/';
export const WCAL_STANDINGS = 'https://wcalsports.org/standings/';
const BYLAWS = 'WCAL By-Laws Article XII – Volleyball (updated 2024-2025)';
const GENERAL = 'WCAL By-Laws Article III – General Rulings (updated 2024-2025)';

export const WCAL_VOLLEYBALL_LEAGUE: LeagueConfig = {
  id: 'wcal', sectionId: 'ccs',
  name: 'West Catholic Athletic League', shortName: 'WCAL',
  cities: 'San Francisco, San Jose and Mountain View',
  alignmentSource: 'its official schedule',
  officialUrl: WCAL_SCHEDULES,
  links: [
    { label: 'WCAL schedules', href: WCAL_SCHEDULES },
    { label: 'WCAL by-laws (Article XII – Volleyball)', href: WCAL_GOVERNANCE },
    { label: 'WCAL standings', href: WCAL_STANDINGS },
  ],
  // si.com is not read for volleyball: no league slugs, no backfill.
  sblive: { leagueSlugs: [], backfill: false },
  officialCodes: {},
  officialNames: {},
  withdrawnNames: [],
  membershipNote: null,
  divisions: [
    {
      id: 'wcal', leagueId: 'wcal', label: 'WCAL', searchAliases: ['West Catholic Athletic League', 'West Catholic'],
      maxprepsLeagueId: '08b9d499-8331-4a70-8521-ff096b4626b9',
      maxprepsName: 'West Catholic', maxprepsSlug: 'west-catholic',
      expectedTeams: 6, gamesPerTeam: 10,
      leaguePlay: { first: '2026-09-22', last: '2026-10-28' },
      official: {
        mode: 'none', scheduleUrl: WCAL_SCHEDULES,
        note: 'The WCAL publishes a composite girls volleyball schedule on wcalsports.org, a PDF it replaces when the schedule changes, so this site does not copy it. A league match here is a match between two WCAL teams from September 22 to October 28, 2026, the dates of the schedule’s double round robin, that is not a tournament match.',
      },
      maxprepsTeamCount: 6, maxprepsMissing: [], maxprepsExtraRows: {}, reportedTrust: 'full', knownCause: null,
      home: { miniRows: 4, lineAfter: 1, lineLabel: 'Champion line' },
      ladderLine: { after: 1, label: 'Champion line' },
    },
  ],
  rules: {
    // §13.A: two points for a match won and none for one lost, so the order is the order of league wins; the
    // league's own standings print wins and losses and no points. A win is one, and `pts` is league wins.
    points: { win: 1, tie: 0, loss: 0 }, orderBy: 'win-pct', orderScope: 'table', gamesWord: 'league',
    // A match between two members inside league play counts; members also meet in tournaments, which MaxPreps
    // types 2 (tournament) and which never count.
    classification: 'membership', excludeContestTypes: [2, 4], postseasonFrom: '2026-10-29', leagueGameOverrides: [],
    matcher: 'two-phase',
    // §15.B.1-2; the rest of §15.B (wins against the teams above the tie, against the highest-placed team above
    // it, against the teams below it, then chance) is not computed, so a tie that reaches it stays level.
    tiebreaks: { default: ['head-to-head', 'coin-flip'] },
    multiTeam: 'partition-restart', h2hUnmet: 'skip', drawNumbers: null, leagueOvertime: 'none',
    citations: {
      points: `${BYLAWS} §13.A (two points for a match won, none for a match lost, so the table is ordered on league wins)`,
      pointsShort: 'WCAL by-laws Art. XII §13.A',
      order: `${BYLAWS} §13.A and ${GENERAL} §15.A (the winner of the round robin is the league champion)`,
      doubleRoundRobin: `${BYLAWS} §10.B and the 2026 composite schedule (double round robin: 10 league matches each)`,
      overtime: `${BYLAWS} §4.E (a varsity match is three out of five games, so no match ends level)`,
      coChampions: `${BYLAWS} §14.C (two teams level for the title that each beat the other are co-champions)`,
      stages: {
        'head-to-head': `${BYLAWS} §15.B.1-2 (head-to-head in league matches; with more than two teams level, the most wins in the matches among them)`,
        'coin-flip': `${BYLAWS} §15.B.3-6 (wins against the teams placed above the level teams, against the highest-placed of those and against the teams placed below, then a coin flip or drawing — we compute none of these, so the teams stay level)`,
      },
    },
    coChampionsLabel: 'Co-champions',
    unresolvedSuffix: '— WCAL By-Laws Article XII §15.B.3-6 settle it on wins against the other teams, then by chance',
  },
  postseason: {
    kind: 'ccs-ladder', autoBerths: 1,
    citation: `${BYLAWS} §17.A (the winner of the round robin is the league’s #1 seed to the CCS) and ${GENERAL} §17.D (the other teams enter the CCS playoffs as at-large entries in the order of their league finish); no WCAL document gives a count of automatic berths`,
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
    { phase: 'playoffs', through: '2026-11-07' },
  ],
  keyDates: [
    { id: 'league-play-ends', date: '2026-10-28', label: 'Last WCAL league matches' },
    { id: 'ccs-seeding', date: '2026-10-29', label: 'CCS seeding meeting' },
  ],
  officialChanges: null,
};
