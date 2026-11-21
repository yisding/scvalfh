/**
 * The Peninsula Athletic League (CCS), boys basketball 2026-27 (lib/leagues.ts, `SCVAL_SPORT=basketball`). Its teams
 * are lib/registry/basketball/pal.ts. Added with the SCCAL, and the WCAL and the WBAL in this build, at the owner's
 * request (2026-11-21).
 *
 * Sources, all read 2026-11-21:
 *  - The PAL Basketball Bylaws, a PDF linked from pal.smcoe.org/about as "Basketball Bylaws" (BYLAWS below; the
 *    document carries no revision date). Sections cited as the document numbers them. Its §1 still says the Bay
 *    has seven teams and the Ocean ten; the 2027 schedules (below) have eight in each, as the CCS's League
 *    Placement and Classification by Sport 2026-27 ("Updated: 9/29/2026") does.
 *  - "Peninsula Athletic League Boys Basketball 2027", the Bay and Ocean schedules linked from
 *    pal.smcoe.org/current/schedules as "Basketball - Boys (JV & VAR)" (a PDF on Google Drive, "Updated FR
 *    10-30-2026"): each division a double round robin, fourteen games a team, Tue Jan 5 to Fri Feb 12, 2027. The
 *    league replaces the file when it changes, so it is not bundled: a league game is a game between two members
 *    of one division inside its league play (`classification: 'membership'`).
 *  - The PAL Constitution, Article XI (teams tied for first are co-champions unless a sport's bylaws say otherwise).
 *  - MaxPreps' "Peninsula - Bay" and "Peninsula - Ocean" boys basketball leagues (leagues/{id}/v1 and their
 *    standings), which list Woodside in the Ocean: each division's `knownCause` says so.
 */

import type { LeagueConfig } from '../shape';

const PAL_SITE = 'https://pal.smcoe.org/';
const PAL_STANDINGS = 'https://pal.smcoe.org/standings';
const PAL_SCHEDULES = 'https://pal.smcoe.org/current/schedules';
const PAL_BASKETBALL_SCHEDULE = 'https://drive.google.com/file/d/1nH7_Sv3IS85PbS-UXlxIDU4X6v3KNg1b/view';
const PAL_BASKETBALL_BYLAWS = 'https://drive.google.com/file/d/1V06U_FeJoKnFaXRu2wIlvZGhHOB61wiq/view';
const BYLAWS = 'PAL Basketball Bylaws';
const note = (division: string) =>
  `The PAL publishes its ${division} boys basketball schedule as a PDF it replaces when the schedule changes, so this site does not copy it. A league game here is a game between two ${division} teams from January 5 to February 12, 2027, the dates of the schedule’s double round robin.`;

export const PAL_BASKETBALL_LEAGUE: LeagueConfig = {
  id: 'pal', sectionId: 'ccs',
  name: 'Peninsula Athletic League', shortName: 'PAL',
  cities: 'San Mateo County, from Atherton to Daly City',
  alignmentSource: 'its official schedules',
  officialUrl: PAL_SITE,
  links: [
    { label: 'PAL schedules', href: PAL_SCHEDULES },
    { label: 'PAL boys basketball schedule (PDF)', href: PAL_BASKETBALL_SCHEDULE },
    { label: 'PAL Basketball Bylaws (PDF)', href: PAL_BASKETBALL_BYLAWS },
    { label: 'PAL standings', href: PAL_STANDINGS },
  ],
  // si.com's standings slugs (read 2026-11-21): used only to harvest team ids, never for membership. si.com's PAL tables are
  // last season's (Jefferson and Terra Nova in its Bay, Aragon, Hillsdale and Woodside in its Ocean, and Oceana, which the CCS now places in the PSAL).
  // Its scores cross-check MaxPreps' and backfill under D2's rules (lib/crosscheck/backfill.ts).
  sblive: { leagueSlugs: ['2263-pal-bay', '2264-pal-ocean'], backfill: true },
  officialCodes: {},
  officialNames: {},
  withdrawnNames: [],
  membershipNote: null,
  divisions: [
    {
      id: 'bay', leagueId: 'pal', label: 'Bay', searchAliases: ['PAL Bay', 'Peninsula Bay'],
      maxprepsLeagueId: 'f6113d96-7495-41e6-9c1d-f1cd6d53be09',
      maxprepsName: 'Peninsula - Bay', maxprepsSlug: 'peninsula--bay',
      expectedTeams: 8, gamesPerTeam: 14,
      leaguePlay: { first: '2027-01-05', last: '2027-02-12' },
      official: { mode: 'none', scheduleUrl: PAL_BASKETBALL_SCHEDULE, note: note('Bay') },
      // MaxPreps lists Woodside in its Ocean table (read 2026-11-21).
      maxprepsTeamCount: 7, maxprepsMissing: ['woodside'], maxprepsExtraRows: {}, reportedTrust: 'records-only',
      knownCause: 'MaxPreps lists Woodside in its Ocean table, so its Bay table has seven teams and leaves Woodside’s games out of the others’ league records. Woodside is in the PAL’s own Bay schedule.',
      home: { miniRows: 4, lineAfter: 3, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 3, label: 'Automatic-berth line' },
    },
    {
      id: 'ocean', leagueId: 'pal', label: 'Ocean', searchAliases: ['PAL Ocean', 'Peninsula Ocean'],
      maxprepsLeagueId: 'ebcb95c2-c316-4fe6-b783-555fcfe6ffa6',
      maxprepsName: 'Peninsula - Ocean', maxprepsSlug: 'peninsula--ocean',
      expectedTeams: 8, gamesPerTeam: 14,
      leaguePlay: { first: '2027-01-05', last: '2027-02-12' },
      official: { mode: 'none', scheduleUrl: PAL_BASKETBALL_SCHEDULE, note: note('Ocean') },
      maxprepsTeamCount: 9, maxprepsMissing: [],
      maxprepsExtraRows: { 'a35649f4-23d3-4986-bf27-8b517521d021': 'Woodside, a Bay team in the PAL’s alignment (MaxPreps’ “Peninsula - Ocean”, read 2026-11-21)' },
      reportedTrust: 'records-only',
      knownCause: 'MaxPreps’ Ocean table also lists Woodside, which plays in the Bay, so its league records here can differ from ours.',
      home: { miniRows: 3, lineAfter: 1, lineLabel: 'Automatic-berth line' },
      ladderLine: { after: 1, label: 'Automatic-berth line' },
    },
  ],
  rules: {
    // "Champion(s) will be determined by the order of finish in the league schedule" (§8.1): a win is one and nothing
    // else counts, so a team's `pts` is its league wins, ordered on the share of league games won.
    points: { win: 1, tie: 0, loss: 0 }, orderBy: 'win-pct', orderScope: 'table', gamesWord: 'division',
    // A game between two members of one division inside its league play counts; members also meet in preseason
    // tournaments, which MaxPreps types 2 (tournament).
    classification: 'membership', excludeContestTypes: [2, 4], postseasonFrom: '2027-02-17', leagueGameOverrides: [],
    matcher: 'two-phase',
    // §9.1-9.3: head-to-head, then the record against each other team from the top of the standings down (the teams
    // above the tie, then those below it); §9.4-9.6 (a coin flip, the second league meeting for 4th place, a blind
    // draw) are not computed, so a tie that reaches them stays level.
    tiebreaks: { default: ['head-to-head', 'record-vs-placed', 'coin-flip'] },
    multiTeam: 'partition-restart', h2hUnmet: 'skip', drawNumbers: null, leagueOvertime: 'until-decided',
    citations: {
      points: `${BYLAWS} §8.1 (champions are “determined by the order of finish in the league schedule”)`,
      pointsShort: 'PAL basketball bylaws §8.1',
      order: `${BYLAWS} §8.1 and §9 (the order of finish in the league schedule; at the varsity level ties are broken before the CCS tournament)`,
      doubleRoundRobin: 'PAL 2027 boys basketball schedules (double round robin: 14 league games each in the Bay and the Ocean)',
      overtime: `${BYLAWS} §2.1 (National Federation rules: a game level after four quarters goes to overtime periods until one team leads, so no game ends level)`,
      coChampions: `${BYLAWS} §8.1 (teams level for the title are co-champions, and the title is not decided by a tiebreak) and PAL Constitution Article XI`,
      stages: {
        'head-to-head': `${BYLAWS} §9.1 (won-lost versus each other among the level teams)`,
        'record-vs-placed': `${BYLAWS} §9.2-9.3 (won-lost versus the teams above in the standings, then the teams below, in descending order)`,
        'coin-flip': `${BYLAWS} §9.4-9.6 (a coin flip, the second league meeting between the two for 4th place, or a blind draw — we compute none of these, so the teams stay level)`,
      },
    },
    coChampionsLabel: 'Co-champions',
    unresolvedSuffix: '— PAL Basketball Bylaws §9.4-9.6 settle it by a coin flip or a blind draw',
  },
  postseason: {
    kind: 'ccs-ladder', autoBerths: 4,
    citation: `${BYLAWS} §10.3 (“CCS Automatic Qualifiers shall be Bay #1, Bay #2, Bay #3 and Ocean #1”) and §10.2 (a team must be .500 in league or in non-league games to enter the CCS tournament)`,
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
    { id: 'league-play-ends', date: '2027-02-12', label: 'Last PAL league games' },
    { id: 'ccs-seeding', date: '2027-02-17', label: 'CCS seeding meeting' },
  ],
  officialChanges: null,
};
